using System.ComponentModel.DataAnnotations;

namespace ChaosMonkey.Api.Models;

/// <summary>Request sent by the UI to run a chaos experiment against an agent.</summary>
public sealed class ExperimentRequest
{
    /// <summary>Absolute URL of the agent under test. Empty means "use the built-in demo agent".</summary>
    public string? AgentEndpoint { get; init; }

    /// <summary>Optional bearer token forwarded to the agent under test.</summary>
    public string? AgentApiKey { get; init; }

    /// <summary>The user scenario the agent must handle, e.g. "Create a ticket for my broken laptop".</summary>
    [Required]
    public string Scenario { get; init; } = string.Empty;

    /// <summary>Name of the connector / tool the chaos is injected into.</summary>
    public string ConnectorName { get; init; } = "ServiceNow.CreateIncident";

    /// <summary>Failure modes to inject. An empty list runs a clean control experiment.</summary>
    public IReadOnlyList<ChaosMode> Modes { get; init; } = Array.Empty<ChaosMode>();

    /// <summary>Delay injected when <see cref="ChaosMode.Latency"/> is selected.</summary>
    public int LatencyMs { get; init; } = 3000;

    /// <summary>Optional per-run override of the evaluator model.</summary>
    public string? EvaluatorModel { get; init; }
}

/// <summary>What actually happened at the connector boundary.</summary>
public sealed record InjectionRecord(
    string Connector,
    string Mode,
    int? StatusCode,
    int InjectedLatencyMs,
    string Detail);

public sealed record AgentInteraction(
    bool Succeeded,
    int? StatusCode,
    long DurationMs,
    string ResponseBody,
    string? TransportError);

public sealed record ResilienceFinding(string Severity, string Title, string Detail);

public sealed record ResilienceReport(
    int Score,
    string Verdict,
    string Summary,
    IReadOnlyList<ResilienceFinding> Findings,
    IReadOnlyList<string> RecommendedFixes,
    IReadOnlyList<string> GeneratedRegressionTests,
    string EvaluatorModel,
    bool UsedLlm);

public sealed record ExperimentResult(
    string ExperimentId,
    DateTimeOffset StartedAt,
    string Scenario,
    string ConnectorName,
    IReadOnlyList<InjectionRecord> Injections,
    AgentInteraction Agent,
    ResilienceReport Report);
