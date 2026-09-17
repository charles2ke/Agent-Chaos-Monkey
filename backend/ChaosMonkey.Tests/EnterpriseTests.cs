using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ChaosMonkey.Api.Enterprise;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

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
        Assert.Equal("same-origin", response.Headers.GetValues("Cross-Origin-Resource-Policy").Single());
        Assert.Equal("default-src 'none'; frame-ancestors 'none'",
            response.Headers.GetValues("Content-Security-Policy").Single());
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
    public async Task Callers_that_exceed_the_request_budget_are_throttled_while_probes_stay_reachable()
    {
        using var host = new ApiHost(
            ("Enterprise:RateLimitPermitsPerWindow", "1"), ("Enterprise:RateLimitWindowSeconds", "60"));
        using var client = host.CreateClient();

        var first = await client.GetAsync("/api/chaos-modes");
        var second = await client.GetAsync("/api/chaos-modes");
        var probe = await client.GetAsync("/api/health");
        var gateway = await client.PostAsJsonAsync("/api/lab/gateway/unknown-run", new { });

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, second.StatusCode);
        Assert.Equal("60", second.Headers.GetValues("Retry-After").Single());
        Assert.Equal(HttpStatusCode.OK, probe.StatusCode);
        // The gateway callback is exempt: it is the surface under test and carries its own per-run limits.
        Assert.Equal(HttpStatusCode.Unauthorized, gateway.StatusCode);
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
