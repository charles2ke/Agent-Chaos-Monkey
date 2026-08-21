using ChaosMonkey.Api.Models;

namespace ChaosMonkey.Api.Chaos;

/// <summary>The simulated connector result that the agent under test will observe.</summary>
public sealed record ChaosPlan(
    int LatencyMs,
    int ConnectorStatusCode,
    string ConnectorBody,
    string? ConnectorError,
    IReadOnlyList<InjectionRecord> Injections)
{
    public bool ConnectorFailed => ConnectorStatusCode >= 400;
}

/// <summary>
/// Translates the requested chaos modes into a concrete, deterministic connector fault.
/// The plan is handed to the agent under test so that it observes a real connector failure
/// rather than a synthetic one produced after the fact.
/// </summary>
public sealed class ChaosEngine
{
    public const int MaxLatencyMs = 120_000;

    private const string HealthyBody =
        """{"status":"ok","incident":{"id":"INC-1842","state":"new"}}""";

    public ChaosPlan BuildPlan(ExperimentRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var connector = string.IsNullOrWhiteSpace(request.ConnectorName)
            ? "connector"
            : request.ConnectorName.Trim();

        var modes = (request.Modes ?? Array.Empty<ChaosMode>()).Distinct().ToList();
        var injections = new List<InjectionRecord>();

        var latencyMs = 0;
        if (modes.Contains(ChaosMode.Latency))
        {
            latencyMs = Math.Clamp(request.LatencyMs, 0, MaxLatencyMs);
            injections.Add(new InjectionRecord(connector, nameof(ChaosMode.Latency), null, latencyMs,
                $"Delayed the {connector} response by {latencyMs} ms."));
        }

        var status = 200;
        var body = HealthyBody;
        string? error = null;

        // Failure modes are applied in severity order so that the most disruptive one wins
        // when several are selected at once.
        foreach (var mode in new[]
                 {
                     ChaosMode.ExpiredAuth, ChaosMode.Throttling, ChaosMode.ConnectorFailure,
                     ChaosMode.MalformedData, ChaosMode.EmptyResponse
                 })
        {
            if (!modes.Contains(mode))
            {
                continue;
            }

            (status, body, error) = mode switch
            {
                ChaosMode.ExpiredAuth => (401,
                    """{"error":"invalid_token","error_description":"The access token expired."}""",
                    "Connector credential expired (HTTP 401)."),
                ChaosMode.Throttling => (429,
                    """{"error":"rate_limited","retry_after":30}""",
                    "Connector throttled the request (HTTP 429)."),
                ChaosMode.ConnectorFailure => (500,
                    """{"error":"internal_error","message":"Upstream system unavailable."}""",
                    "Connector returned an unhandled server error (HTTP 500)."),
                ChaosMode.MalformedData => (200,
                    """{"status":"ok","incident":{"id":"INC-18""",
                    "Connector returned truncated / invalid JSON."),
                _ => (200, string.Empty, "Connector returned HTTP 200 with an empty body.")
            };

            injections.Add(new InjectionRecord(connector, mode.ToString(), status, 0, error!));
            break;
        }

        if (injections.Count == 0)
        {
            injections.Add(new InjectionRecord(connector, "None", 200, 0,
                "Control run: the connector behaved normally."));
        }

        return new ChaosPlan(latencyMs, status, body, error, injections);
    }
}
