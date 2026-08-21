using System.Diagnostics;
using System.Text;
using System.Text.Json;
using ChaosMonkey.Api.Chaos;
using ChaosMonkey.Api.Models;

namespace ChaosMonkey.Api.Agents;

/// <summary>Invokes the agent under test with the chaos-affected connector result.</summary>
public sealed class AgentInvoker
{
    public const string HttpClientName = "agent";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly DemoAgent _demoAgent;
    private readonly ILogger<AgentInvoker> _logger;

    public AgentInvoker(IHttpClientFactory httpClientFactory, DemoAgent demoAgent, ILogger<AgentInvoker> logger)
    {
        _httpClientFactory = httpClientFactory;
        _demoAgent = demoAgent;
        _logger = logger;
    }

    public static bool TryParseEndpoint(string? endpoint, out Uri? uri)
    {
        uri = null;
        if (string.IsNullOrWhiteSpace(endpoint))
        {
            return false;
        }

        if (!Uri.TryCreate(endpoint.Trim(), UriKind.Absolute, out var parsed))
        {
            throw new ArgumentException("The agent endpoint must be an absolute URL.", nameof(endpoint));
        }

        if (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps)
        {
            throw new ArgumentException("The agent endpoint must use http or https.", nameof(endpoint));
        }

        uri = parsed;
        return true;
    }

    public async Task<AgentInteraction> InvokeAsync(
        ExperimentRequest request,
        ChaosPlan plan,
        CancellationToken cancellationToken)
    {
        var payload = BuildPayload(request, plan);
        var stopwatch = Stopwatch.StartNew();

        if (plan.LatencyMs > 0)
        {
            await Task.Delay(plan.LatencyMs, cancellationToken).ConfigureAwait(false);
        }

        if (!TryParseEndpoint(request.AgentEndpoint, out var uri) || uri is null)
        {
            var demo = _demoAgent.Respond(payload);
            stopwatch.Stop();
            return new AgentInteraction(true, 200, stopwatch.ElapsedMilliseconds, demo, null);
        }

        try
        {
            using var client = _httpClientFactory.CreateClient(HttpClientName);
            using var message = new HttpRequestMessage(HttpMethod.Post, uri)
            {
                Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
            };

            if (!string.IsNullOrWhiteSpace(request.AgentApiKey))
            {
                message.Headers.TryAddWithoutValidation("Authorization", "Bearer " + request.AgentApiKey.Trim());
            }

            using var response = await client.SendAsync(message, cancellationToken).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            stopwatch.Stop();

            return new AgentInteraction(
                response.IsSuccessStatusCode,
                (int)response.StatusCode,
                stopwatch.ElapsedMilliseconds,
                body,
                null);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            stopwatch.Stop();
            _logger.LogWarning(ex, "Agent under test could not be reached.");
            return new AgentInteraction(false, null, stopwatch.ElapsedMilliseconds, string.Empty,
                "The agent under test could not be reached or timed out.");
        }
    }

    private static AgentPayload BuildPayload(ExperimentRequest request, ChaosPlan plan) => new(
        request.Scenario,
        new ConnectorResult(
            string.IsNullOrWhiteSpace(request.ConnectorName) ? "connector" : request.ConnectorName.Trim(),
            plan.ConnectorStatusCode,
            plan.ConnectorBody,
            plan.ConnectorError));
}

public sealed record ConnectorResult(string Name, int StatusCode, string Body, string? Error);

public sealed record AgentPayload(string Scenario, ConnectorResult Connector);
