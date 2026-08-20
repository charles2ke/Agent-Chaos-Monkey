namespace ChaosMonkey.Api.Models;

/// <summary>
/// The failure modes that can be injected into an agent / connector interaction.
/// </summary>
public enum ChaosMode
{
    /// <summary>Adds an artificial delay before the agent response is returned.</summary>
    Latency,

    /// <summary>The connector returns an HTTP 500, simulating a broken downstream system.</summary>
    ConnectorFailure,

    /// <summary>The connector returns an HTTP 429, simulating throttling.</summary>
    Throttling,

    /// <summary>The connector returns an HTTP 401, simulating an expired or revoked token.</summary>
    ExpiredAuth,

    /// <summary>The connector returns HTTP 200 with an empty body.</summary>
    EmptyResponse,

    /// <summary>The connector returns HTTP 200 with truncated / non-parsable JSON.</summary>
    MalformedData
}

public sealed record ChaosModeInfo(string Id, string Name, string Description);

public static class ChaosModeCatalog
{
    public static readonly IReadOnlyList<ChaosModeInfo> All = new[]
    {
        new ChaosModeInfo(nameof(ChaosMode.Latency), "Latency spike",
            "Delays the connector response to test timeouts, retries and user feedback."),
        new ChaosModeInfo(nameof(ChaosMode.ConnectorFailure), "Connector failure (HTTP 500)",
            "The downstream connector fails outright. The agent must not fabricate success."),
        new ChaosModeInfo(nameof(ChaosMode.Throttling), "Throttling (HTTP 429)",
            "The connector rate limits the agent. Well behaved agents back off and retry."),
        new ChaosModeInfo(nameof(ChaosMode.ExpiredAuth), "Expired auth (HTTP 401)",
            "The connector token is expired or revoked. The agent must surface an auth problem."),
        new ChaosModeInfo(nameof(ChaosMode.EmptyResponse), "Empty response",
            "The connector returns HTTP 200 with no payload. The agent must not invent data."),
        new ChaosModeInfo(nameof(ChaosMode.MalformedData), "Malformed data",
            "The connector returns truncated / invalid JSON. The agent must handle parse failures.")
    };
}
