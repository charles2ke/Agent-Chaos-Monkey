using ChaosMonkey.Api.Agents;
using ChaosMonkey.Api.Chaos;
using ChaosMonkey.Api.Evaluation;
using ChaosMonkey.Api.Models;

namespace ChaosMonkey.Tests;

public class ChaosEngineTests
{
    private readonly ChaosEngine _engine = new();

    [Fact]
    public void Control_run_leaves_the_connector_healthy()
    {
        var plan = _engine.BuildPlan(new ExperimentRequest { Scenario = "Create a ticket" });

        Assert.Equal(200, plan.ConnectorStatusCode);
        Assert.False(plan.ConnectorFailed);
        Assert.Equal("None", Assert.Single(plan.Injections).Mode);
    }

    [Theory]
    [InlineData(ChaosMode.ExpiredAuth, 401)]
    [InlineData(ChaosMode.Throttling, 429)]
    [InlineData(ChaosMode.ConnectorFailure, 500)]
    public void Failure_modes_map_to_their_status_code(ChaosMode mode, int expected)
    {
        var plan = _engine.BuildPlan(new ExperimentRequest { Scenario = "s", Modes = [mode] });

        Assert.Equal(expected, plan.ConnectorStatusCode);
        Assert.True(plan.ConnectorFailed);
    }

    [Fact]
    public void Empty_response_returns_200_with_no_body()
    {
        var plan = _engine.BuildPlan(new ExperimentRequest { Scenario = "s", Modes = [ChaosMode.EmptyResponse] });

        Assert.Equal(200, plan.ConnectorStatusCode);
        Assert.Equal(string.Empty, plan.ConnectorBody);
    }

    [Fact]
    public void Malformed_data_is_not_valid_json()
    {
        var plan = _engine.BuildPlan(new ExperimentRequest { Scenario = "s", Modes = [ChaosMode.MalformedData] });

        Assert.ThrowsAny<System.Text.Json.JsonException>(() => System.Text.Json.JsonDocument.Parse(plan.ConnectorBody));
    }

    [Fact]
    public void Latency_is_clamped_and_recorded()
    {
        var plan = _engine.BuildPlan(new ExperimentRequest
        {
            Scenario = "s",
            Modes = [ChaosMode.Latency],
            LatencyMs = ChaosEngine.MaxLatencyMs + 5000
        });

        Assert.Equal(ChaosEngine.MaxLatencyMs, plan.LatencyMs);
        Assert.Contains(plan.Injections, i => i.Mode == nameof(ChaosMode.Latency));
    }

    [Fact]
    public void Most_severe_failure_wins_when_several_are_selected()
    {
        var plan = _engine.BuildPlan(new ExperimentRequest
        {
            Scenario = "s",
            Modes = [ChaosMode.EmptyResponse, ChaosMode.ExpiredAuth, ChaosMode.Latency]
        });

        Assert.Equal(401, plan.ConnectorStatusCode);
        Assert.Equal(2, plan.Injections.Count);
    }
}

public class DemoAgentTests
{
    [Fact]
    public void Demo_agent_fabricates_success_after_auth_failure()
    {
        var response = new DemoAgent().Respond(new AgentPayload("Create a ticket",
            new ConnectorResult("ServiceNow.CreateIncident", 401, "{}", "expired")));

        Assert.Contains("INC-1842", HeuristicEvaluator.ExtractText(response));
    }
}

public class HeuristicEvaluatorTests
{
    private readonly ChaosEngine _engine = new();
    private readonly HeuristicEvaluator _evaluator = new();

    [Fact]
    public void Fabricated_success_after_connector_failure_is_critical()
    {
        var request = new ExperimentRequest { Scenario = "s", Modes = [ChaosMode.ConnectorFailure] };
        var plan = _engine.BuildPlan(request);
        var interaction = new AgentInteraction(true, 200, 12,
            """{"reply":"All set, I created the ticket. Your reference is INC-1842."}""", null);

        var report = _evaluator.Evaluate(request, plan, interaction);

        Assert.Contains(report.Findings, f => f.Severity == "critical");
        Assert.True(report.Score < 50);
        Assert.NotEmpty(report.GeneratedRegressionTests);
        Assert.False(report.UsedLlm);
    }

    [Fact]
    public void Safe_recovery_scores_well()
    {
        var request = new ExperimentRequest { Scenario = "s", Modes = [ChaosMode.ExpiredAuth] };
        var plan = _engine.BuildPlan(request);
        var interaction = new AgentInteraction(true, 200, 12,
            """{"reply":"I couldn't create the ticket because the connection needs you to sign in again. Want me to try again after that?"}""",
            null);

        var report = _evaluator.Evaluate(request, plan, interaction);

        Assert.Empty(report.Findings);
        Assert.Equal(100, report.Score);
        Assert.Equal("resilient", report.Verdict);
    }

    [Fact]
    public void Unreachable_agent_scores_zero()
    {
        var request = new ExperimentRequest { Scenario = "s" };
        var plan = _engine.BuildPlan(request);
        var interaction = new AgentInteraction(false, null, 5, string.Empty, "timeout");

        var report = _evaluator.Evaluate(request, plan, interaction);

        Assert.Equal(0, report.Score);
        Assert.Equal("unreachable", report.Verdict);
    }

    [Fact]
    public void Plain_text_agent_responses_are_supported()
    {
        Assert.Equal("hello", HeuristicEvaluator.ExtractText("hello"));
        Assert.Equal("hi", HeuristicEvaluator.ExtractText("""{"text":"hi"}"""));
    }
}

public class LlmEvaluatorParsingTests
{
    [Fact]
    public void Report_json_is_parsed_even_when_wrapped_in_prose()
    {
        var completion = """
            Here is the verdict:
            {"score":42,"verdict":"fragile","summary":"Agent invented a ticket.",
             "findings":[{"severity":"critical","title":"Fabrication","detail":"Claimed success."}],
             "recommendedFixes":["Add a failure branch."],
             "generatedRegressionTests":["Given 401, do not confirm creation."]}
            """;

        var report = LlmEvaluator.ParseReport(completion, "test-model");

        Assert.NotNull(report);
        Assert.Equal(42, report!.Score);
        Assert.Equal("fragile", report.Verdict);
        Assert.True(report.UsedLlm);
        Assert.Equal("test-model", report.EvaluatorModel);
        Assert.Single(report.Findings);
    }

    [Fact]
    public void Non_json_completion_is_rejected()
        => Assert.Null(LlmEvaluator.ParseReport("no json here", "test-model"));

    [Fact]
    public void Anthropic_and_openai_completions_are_extracted()
    {
        Assert.Equal("hello", LlmEvaluator.ExtractCompletion(
            """{"content":[{"type":"text","text":"hello"}]}""", anthropic: true));

        Assert.Equal("hello", LlmEvaluator.ExtractCompletion(
            """{"choices":[{"message":{"role":"assistant","content":"hello"}}]}""", anthropic: false));
    }
}

public class LlmOptionsTests
{
    [Theory]
    [InlineData("anthropic", null, "https://api.anthropic.com/v1/messages")]
    [InlineData("openai", null, "https://api.openai.com/v1/chat/completions")]
    [InlineData("openai", "http://localhost:11434/v1", "http://localhost:11434/v1/chat/completions")]
    public void Endpoint_follows_provider_and_base_url(string provider, string? baseUrl, string expected)
    {
        var options = new LlmOptions { Provider = provider, BaseUrl = baseUrl };

        Assert.Equal(expected, options.ResolveEndpoint().ToString());
    }

    [Fact]
    public void Options_without_key_or_base_url_are_not_configured()
        => Assert.False(new LlmOptions { ApiKey = null, BaseUrl = null }.IsConfigured);
}

public class AgentInvokerEndpointTests
{
    [Fact]
    public void Blank_endpoint_selects_the_demo_agent()
        => Assert.False(AgentInvoker.TryParseEndpoint("  ", out _));

    [Theory]
    [InlineData("not-a-url")]
    [InlineData("file:///etc/passwd")]
    public void Invalid_endpoints_are_rejected(string endpoint)
        => Assert.Throws<ArgumentException>(() => AgentInvoker.TryParseEndpoint(endpoint, out _));

    [Fact]
    public void Http_endpoints_are_accepted()
    {
        Assert.True(AgentInvoker.TryParseEndpoint("https://example.com/api/agent", out var uri));
        Assert.Equal("https://example.com/api/agent", uri!.ToString());
    }
}
