using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ChaosMonkey.Api.Enterprise;
using ChaosMonkey.Api.Lab;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace ChaosMonkey.Tests;

/// <summary>
/// The deployment guardrails are exercised against the real host, so the evidence is the running
/// pipeline rather than a description of it: headers, correlation, the key gate and the budget.
/// </summary>
public class EnterpriseTests
{
    private sealed class ApiHost(params (string Key, string Value)[] settings) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            foreach (var (key, value) in settings) builder.UseSetting(key, value);
        }
    }

    [Fact]
    public async Task Every_response_carries_security_headers_and_the_caller_correlation_id()
    {
        using var host = new ApiHost();
        using var client = host.CreateClient();

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/chaos-modes");
        request.Headers.Add("X-Correlation-Id", "trace-42");
        var response = await client.SendAsync(request);

        Assert.Equal("trace-42", response.Headers.GetValues("X-Correlation-Id").Single());
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("no-referrer", response.Headers.GetValues("Referrer-Policy").Single());
        Assert.Equal("cross-origin", response.Headers.GetValues("Cross-Origin-Resource-Policy").Single());
        Assert.Equal("default-src 'none'; frame-ancestors 'none'",
            response.Headers.GetValues("Content-Security-Policy").Single());
    }

    [Fact]
    public async Task Cors_preflights_receive_enterprise_headers_before_short_circuiting()
    {
        using var host = new ApiHost(("Enterprise:ApiKey", "operator-key"));
        using var client = host.CreateClient();

        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/chaos-modes");
        request.Headers.Add("Origin", "http://localhost:5173");
        request.Headers.Add("Access-Control-Request-Method", "GET");
        request.Headers.Add("X-Correlation-Id", "preflight-42");
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal("preflight-42", response.Headers.GetValues("X-Correlation-Id").Single());
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("http://localhost:5173", response.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }

    [Fact]
    public async Task A_blank_correlation_header_configuration_keeps_the_default_header()
    {
        using var host = new ApiHost(("Enterprise:CorrelationHeader", "  "));
        using var client = host.CreateClient();

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/health");
        request.Headers.Add(EnterpriseOptions.DefaultCorrelationHeader, "trace-42");
        var response = await client.SendAsync(request);

        Assert.Equal("trace-42", response.Headers.GetValues(EnterpriseOptions.DefaultCorrelationHeader).Single());
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task An_absent_or_oversized_correlation_id_is_replaced_with_the_trace_identifier(string supplied)
    {
        using var host = new ApiHost();
        using var client = host.CreateClient();

        using var blank = new HttpRequestMessage(HttpMethod.Get, "/api/health");
        blank.Headers.TryAddWithoutValidation("X-Correlation-Id", supplied);
        using var oversized = new HttpRequestMessage(HttpMethod.Get, "/api/health");
        oversized.Headers.TryAddWithoutValidation("X-Correlation-Id", new string('a', 129));

        var blankResponse = await client.SendAsync(blank);
        var oversizedResponse = await client.SendAsync(oversized);

        Assert.NotEqual(supplied, blankResponse.Headers.GetValues("X-Correlation-Id").Single());
        Assert.NotEqual(new string('a', 129), oversizedResponse.Headers.GetValues("X-Correlation-Id").Single());
    }

    [Fact]
    public async Task Readiness_reports_the_configuration_an_operator_needs_before_routing_traffic()
    {
        using var host = new ApiHost(("Llm:ApiKey", ""), ("Enterprise:ApiKey", "operator-key"));
        using var client = host.CreateClient();

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/health/ready");
        var response = await client.SendAsync(request);
        var ready = await response.Content.ReadFromJsonAsync<JsonElement>();

        response.EnsureSuccessStatusCode();
        Assert.Equal("ready", ready.GetProperty("status").GetString());
        Assert.Equal("heuristic-only", ready.GetProperty("evaluator").GetString());
        Assert.False(ready.GetProperty("gatewayEnabled").GetBoolean());
        Assert.True(ready.GetProperty("apiKeyRequired").GetBoolean());
        Assert.True(ready.GetProperty("rateLimited").GetBoolean());
    }

    [Fact]
    public async Task A_configured_api_key_is_required_everywhere_except_the_probes()
    {
        using var host = new ApiHost(("Enterprise:ApiKey", "operator-key"));
        using var client = host.CreateClient();

        var anonymous = await client.GetAsync("/api/chaos-modes");
        using var wrong = new HttpRequestMessage(HttpMethod.Get, "/api/chaos-modes");
        wrong.Headers.Add(EnterpriseExtensions.ApiKeyHeader, "guessed-key");
        var rejected = await client.SendAsync(wrong);
        using var correct = new HttpRequestMessage(HttpMethod.Get, "/api/chaos-modes");
        correct.Headers.Add(EnterpriseExtensions.ApiKeyHeader, "operator-key");
        var accepted = await client.SendAsync(correct);
        var probe = await client.GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        Assert.Contains(EnterpriseExtensions.ApiKeyHeader, await anonymous.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        Assert.Equal(HttpStatusCode.OK, probe.StatusCode);
    }

    [Fact]
    public async Task Rejected_api_key_attempts_consume_the_request_budget()
    {
        using var host = new ApiHost(
            ("Enterprise:ApiKey", "operator-key"),
            ("Enterprise:RateLimitPermitsPerWindow", "1"),
            ("Enterprise:RateLimitWindowSeconds", "60"));
        using var client = host.CreateClient();

        var anonymous = await client.GetAsync("/api/chaos-modes");
        using var wrong = new HttpRequestMessage(HttpMethod.Get, "/api/chaos-modes");
        wrong.Headers.Add(EnterpriseExtensions.ApiKeyHeader, "guessed-key");
        var throttled = await client.SendAsync(wrong);

        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
        Assert.Equal("60", throttled.Headers.GetValues("Retry-After").Single());
    }

    [Fact]
    public async Task Callers_that_exceed_the_request_budget_are_throttled_while_probes_and_authenticated_callbacks_stay_reachable()
    {
        using var host = new ApiHost(
            ("Enterprise:RateLimitPermitsPerWindow", "1"), ("Enterprise:RateLimitWindowSeconds", "60"));
        using var client = host.CreateClient();
        var gateway = host.Services.GetRequiredService<LabGateway>();
        var session = gateway.Open(new ExperimentDefinition
        {
            SchemaVersion = 1, Name = "Ticket resilience", Scenario = "Create a ticket",
            Connector = "ServiceNow", Operation = "CreateIncident"
        }, [], [], null, CancellationToken.None);

        try
        {
            var first = await client.GetAsync("/api/chaos-modes");
            var second = await client.GetAsync("/api/chaos-modes");
            using var callback = new HttpRequestMessage(HttpMethod.Post, $"/api/lab/gateway/{session.Id}")
            {
                Content = JsonContent.Create(new GatewayCall(session.SessionId, "ServiceNow", "CreateIncident",
                    JsonSerializer.SerializeToElement(new { scenario = "Create a ticket" })))
            };
            callback.Headers.Authorization = new("Bearer", session.Capability);
            var authenticatedGateway = await client.SendAsync(callback);
            var rejectedGateway = await client.PostAsJsonAsync("/api/lab/gateway/unknown-run", new { });
            var probe = await client.GetAsync("/api/health");

            Assert.Equal(HttpStatusCode.OK, first.StatusCode);
            Assert.Equal(HttpStatusCode.TooManyRequests, second.StatusCode);
            Assert.Equal("60", second.Headers.GetValues("Retry-After").Single());
            Assert.Equal(HttpStatusCode.OK, authenticatedGateway.StatusCode);
            Assert.Equal(HttpStatusCode.TooManyRequests, rejectedGateway.StatusCode);
            Assert.Equal(HttpStatusCode.OK, probe.StatusCode);
        }
        finally
        {
            await gateway.CloseAsync(session);
        }
    }

    [Theory]
    [InlineData("/api/lab/gateway")]
    [InlineData("/api/lab/gateway/run-42/extra")]
    public async Task Gateway_callbacks_without_a_single_run_segment_stay_rate_limited(string path)
    {
        using var host = new ApiHost(
            ("Enterprise:RateLimitPermitsPerWindow", "1"), ("Enterprise:RateLimitWindowSeconds", "60"));
        using var client = host.CreateClient();

        var first = await client.GetAsync("/api/chaos-modes");
        using var malformed = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(new { })
        };
        malformed.Headers.Authorization = new("Bearer", "any-capability");
        var throttled = await client.SendAsync(malformed);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
    }

    [Theory]
    [InlineData("Enterprise:RateLimitPermitsPerWindow", "-1")]
    [InlineData("Enterprise:RateLimitWindowSeconds", "0")]
    [InlineData("Enterprise:RateLimitWindowSeconds", "-1")]
    [InlineData("Enterprise:RateLimitWindowSeconds", "86401")]
    [InlineData("Enterprise:CorrelationHeader", "X-Api-Key")]
    [InlineData("Enterprise:CorrelationHeader", "Bad Header")]
    public void Invalid_enterprise_options_are_rejected_by_options_validation(string key, string value)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection([new KeyValuePair<string, string?>(key, value)])
            .Build();
        var services = new ServiceCollection();
        services.AddEnterprise(configuration);
        using var provider = services.BuildServiceProvider();

        Assert.Throws<OptionsValidationException>(() =>
            provider.GetRequiredService<IOptions<EnterpriseOptions>>().Value);
    }

    [Fact]
    public async Task The_request_budget_can_be_disabled_for_trusted_networks()
    {
        using var host = new ApiHost(("Enterprise:RateLimitPermitsPerWindow", "0"));
        using var client = host.CreateClient();

        var first = await client.GetAsync("/api/chaos-modes");
        var second = await client.GetAsync("/api/chaos-modes");
        var ready = await client.GetFromJsonAsync<JsonElement>("/api/health/ready");

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.False(ready.GetProperty("rateLimited").GetBoolean());
    }

    [Theory]
    [InlineData("configured-key", "ambient-key", "configured-key")]
    [InlineData("", "ambient-key", "ambient-key")]
    [InlineData(null, null, null)]
    [InlineData("  ", "  ", null)]
    public void An_ambient_key_keeps_the_shared_secret_out_of_configuration_files(
        string? configured, string? ambient, string? expected)
    {
        Assert.Equal(expected, EnterpriseOptions.ResolveApiKey(configured, ambient));
    }
}
