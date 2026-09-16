using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using ChaosMonkey.Api.Agents;
using ChaosMonkey.Api.Evaluation;
using ChaosMonkey.Api.Models;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace ChaosMonkey.Tests;

/// <summary>
/// Boots the real API host so the composition root itself is evidence: the endpoints, the judge
/// wiring and the hardened agent HTTP client are exercised as they are configured in production.
/// </summary>
public class ApiHostTests
{
    private static readonly JsonSerializerOptions Json =
        new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    private sealed class ApiHost(params (string Key, string Value)[] settings) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            foreach (var (key, value) in settings) builder.UseSetting(key, value);
        }
    }

    [Fact]
    public async Task Health_catalogue_and_evaluator_describe_the_running_host()
    {
        using var host = new ApiHost();
        using var client = host.CreateClient();

        var health = await client.GetFromJsonAsync<JsonElement>("/api/health");
        var modes = await client.GetFromJsonAsync<JsonElement>("/api/chaos-modes");
        var evaluator = await client.GetFromJsonAsync<JsonElement>("/api/evaluator");

        Assert.Equal("ok", health.GetProperty("status").GetString());
        Assert.Equal(Enum.GetNames<ChaosMode>(),
            modes.EnumerateArray().Select(mode => mode.GetProperty("id").GetString()).ToArray());
        Assert.Equal("anthropic", evaluator.GetProperty("provider").GetString());
        Assert.Equal("api-key", evaluator.GetProperty("authentication").GetString());
    }

    [Fact]
    public async Task Azure_judge_is_reported_as_entra_id_and_drops_any_configured_api_key()
    {
        using var host = new ApiHost(
            ("Llm:Provider", "azure"), ("Llm:BaseUrl", "https://contoso.openai.azure.com"),
            ("Llm:Deployment", "chaos-judge"), ("Llm:ApiKey", "should-never-be-used"));
        using var client = host.CreateClient();

        var evaluator = await client.GetFromJsonAsync<JsonElement>("/api/evaluator");

        Assert.Equal("entra-id", evaluator.GetProperty("authentication").GetString());
        Assert.Equal("chaos-judge", evaluator.GetProperty("model").GetString());
        Assert.True(evaluator.GetProperty("configured").GetBoolean());
        Assert.Null(host.Services.GetRequiredService<IOptions<LlmOptions>>().Value.ApiKey);
    }

    [Fact]
    public async Task Demo_agent_endpoint_returns_the_scripted_json_reply()
    {
        using var host = new ApiHost();
        using var client = host.CreateClient();

        var response = await client.PostAsJsonAsync("/api/demo-agent",
            new AgentPayload("Create a ticket", new ConnectorResult("ServiceNow", 401, "{}", "expired")), Json);

        response.EnsureSuccessStatusCode();
        Assert.Equal("application/json", response.Content.Headers.ContentType!.MediaType);
        Assert.Contains("INC-1842", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Experiments_require_a_scenario_and_an_allowlisted_agent_endpoint()
    {
        using var host = new ApiHost();
        using var client = host.CreateClient();

        var blank = await client.PostAsJsonAsync("/api/experiments", new ExperimentRequest { Scenario = " " }, Json);
        var denied = await client.PostAsJsonAsync("/api/experiments",
            new ExperimentRequest { Scenario = "Create a ticket", AgentEndpoint = "https://agent.example/run" }, Json);

        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);
        Assert.Contains("A scenario is required.", await blank.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest, denied.StatusCode);
        Assert.Contains("allowlisted", await denied.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Experiments_run_the_demo_agent_and_return_a_heuristic_report()
    {
        using var host = new ApiHost(("Llm:ApiKey", ""));
        using var client = host.CreateClient();

        var response = await client.PostAsJsonAsync("/api/experiments",
            new ExperimentRequest { Scenario = "Create a ticket", Modes = [ChaosMode.ExpiredAuth] }, Json);

        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        var report = result.GetProperty("report");
        Assert.Equal("Create a ticket", result.GetProperty("scenario").GetString());
        Assert.Equal("ServiceNow.CreateIncident", result.GetProperty("connectorName").GetString());
        Assert.Equal(nameof(ChaosMode.ExpiredAuth), result.GetProperty("injections")[0].GetProperty("mode").GetString());
        Assert.Equal(200, result.GetProperty("agent").GetProperty("statusCode").GetInt32());
        Assert.Equal("heuristic", report.GetProperty("evaluatorModel").GetString());
        Assert.False(report.GetProperty("usedLlm").GetBoolean());
        // The demo agent confirms a ticket that the 401 connector result never created.
        Assert.Contains(report.GetProperty("findings").EnumerateArray(),
            finding => finding.GetProperty("severity").GetString() == "critical");
        Assert.NotEmpty(report.GetProperty("recommendedFixes").EnumerateArray());
    }

    [Fact]
    public async Task Allowlisted_agent_endpoints_are_called_over_the_hardened_http_client()
    {
        // Port 1 on loopback refuses the connection, so the transport failure is observed rather than simulated.
        const string endpoint = "http://127.0.0.1:1/agent";
        using var host = new ApiHost(("Llm:ApiKey", ""), ("LabGateway:AgentEndpoints:0", endpoint));
        using var client = host.CreateClient();

        var response = await client.PostAsJsonAsync("/api/experiments", new ExperimentRequest
        {
            Scenario = "Create a ticket", AgentEndpoint = endpoint, AgentApiKey = "agent-test-credential"
        }, Json);

        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        var report = result.GetProperty("report");
        Assert.False(result.GetProperty("agent").GetProperty("succeeded").GetBoolean());
        Assert.Equal("unreachable", report.GetProperty("verdict").GetString());
        Assert.Equal(0, report.GetProperty("score").GetInt32());
    }
}
