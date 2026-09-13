using System.Text.Json;
using System.Text.Json.Serialization;

namespace ChaosMonkey.Api.Lab;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ExperimentDefinition
{
    public int SchemaVersion { get; init; }
    public string Name { get; init; } = "";
    public string Scenario { get; init; } = "";
    public string Connector { get; init; } = "";
    public string Operation { get; init; } = "";
    public string ExecutionMode { get; init; } = "single";
    public string Transport { get; init; } = "simulation";
    public FaultStep[] Faults { get; init; } = [];
    public int LatencyMs { get; init; } = 100;
    public int ToolTimeoutMs { get; init; } = 5000;
    public int MaxRetries { get; init; } = 2;
    public int RetryDelayMs { get; init; } = 100;
    public LabTurn[] Turns { get; init; } = [];
    public LabAssertion[] Assertions { get; init; } = [];
    public string? AgentEndpoint { get; init; }
    public string? AgentVersion { get; init; }
    public LabEvaluator Evaluator { get; init; } = new();
}

public sealed record LabEvaluator(string Kind = "evidence", int Version = 1);
public sealed record FaultStep(int Invocation, string Mode, string? Connector = null, string? Operation = null);
public sealed record LabTurn(string Message, bool Reauthenticate = false);
public sealed record LabAssertion(string Id, string Kind, JsonElement? Expected = null, string Severity = "critical");
public sealed record LabRequest(ExperimentDefinition Definition, string? AgentApiKey = null);
public sealed record SavedTest(ExperimentDefinition Definition);
public sealed record LabSuiteRequest(SavedTest[] Tests);
public sealed record LabSuiteResult(LabResult[] Results, string Outcome);
public sealed record LabResult(string Id, DateTimeOffset StartedAt, ExperimentDefinition Definition,
    string Outcome, LabRun[] Runs);
public sealed record FaultEvidence(int Invocation, string Mode, string State, string Detail)
{
    public string Connector { get; init; } = "";
    public string Operation { get; init; } = "";
}
public sealed record ToolCall(int Invocation, string Connector, string Operation, int? StatusCode,
    DateTimeOffset StartedAt, long DurationMs, long InjectedDelayMs, long RetryDelayMs,
    string? SideEffectId, string Detail)
{
    public bool Succeeded { get; init; }
    public bool SideEffectsObservable { get; init; }
    public string SessionId { get; init; } = "";
    public string LogicalOperationId { get; init; } = "";
    public string EvidenceSource { get; init; } = "";
    public bool? ContextRetained { get; init; }
    public int TargetInvocation { get; init; }
}
public sealed record AssertionResult(string Id, string Outcome, string Severity, string Detail, string[] Evidence);
public sealed record LabFinding(string Severity, string Title, string Detail, string[] Evidence);
public sealed record TurnResult(string Message, string Response, string SessionId)
{
    public int ObservedInvocations { get; init; }
}
public sealed record LabDimension(string Name, string Outcome, string Detail);
public sealed record LabRun(string Id, string Label, bool Simulation, string Outcome, int? Score,
    string AgentResponse, long AgentDurationMs, long InjectedDelayMs, FaultEvidence[] Faults,
    ToolCall[] Trace, AssertionResult[] Assertions, LabFinding[] Findings, TurnResult[] Turns,
    LabDimension[] Dimensions, int? RetryCount);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record GatewayCall(string SessionId, string Connector, string Operation, JsonElement Arguments);
public sealed record BoundaryResponse(int StatusCode, string Body, bool Succeeded);

public sealed class LabGatewayOptions
{
    public bool Enabled { get; set; }
    public string? PublicBaseUrl { get; set; }
    public string[] AgentEndpoints { get; set; } = [];
    public UpstreamOperation[] Operations { get; set; } = [];
}

public sealed class UpstreamOperation
{
    public string Connector { get; set; } = "";
    public string Operation { get; set; } = "";
    public string Url { get; set; } = "";
    public string Method { get; set; } = "POST";
    public string? BearerToken { get; set; }
    public string? SideEffectIdProperty { get; set; }
}

public static class LabValidation
{
    public static readonly string[] Modes =
        ["Latency", "ConnectorFailure", "Throttling", "ExpiredAuth", "EmptyResponse", "MalformedData", "None"];
    public static readonly string[] AssertionKinds =
        ["noUnsupportedSuccess", "maxRetries", "noDuplicateSideEffects", "eventualSuccess", "contextRetained", "minBackoffMs"];

    public static string[] Errors(ExperimentDefinition? d)
    {
        if (d is null) return ["A definition is required."];
        var errors = new List<string>();
        if (d.SchemaVersion != 1) errors.Add("schemaVersion must be 1.");
        if (string.IsNullOrWhiteSpace(d.Name) || d.Name.Length > 200) errors.Add("name is required (max 200).");
        if (string.IsNullOrWhiteSpace(d.Scenario) || d.Scenario.Length > 8000) errors.Add("scenario is required (max 8000).");
        if (!Identifier(d.Connector) || !Identifier(d.Operation)) errors.Add("connector and operation must be identifiers (max 100).");
        if (d.ExecutionMode is not ("single" or "matrix" or "sequence")) errors.Add("Invalid executionMode.");
        if (d.Transport is not ("simulation" or "gateway")) errors.Add("Invalid transport.");
        if (d.LatencyMs is < 0 or > 30000 || d.ToolTimeoutMs is < 1 or > 30000 ||
            d.MaxRetries is < 0 or > 10 || d.RetryDelayMs is < 0 or > 5000) errors.Add("Timing or retry limit out of range.");
        if (d.Faults is null || d.Faults.Length > 20 || d.Faults.Any(f => f is null ||
            f.Invocation is < 1 or > 32 || !Modes.Contains(f.Mode) ||
            (f.Connector is not null && !Identifier(f.Connector)) || (f.Operation is not null && !Identifier(f.Operation))))
            errors.Add("Invalid faults (max 20, invocation 1..32).");
        if (d.ExecutionMode == "sequence" && d.Faults is not null &&
            d.Faults.Where(f => f is not null).GroupBy(f => (f.Invocation, f.Connector ?? d.Connector, f.Operation ?? d.Operation))
                .Any(g => g.Count() > 1)) errors.Add("Sequence faults must have unique connector/operation/invocation targets.");
        if (d.Turns is null || d.Turns.Length > 10 || d.Turns.Any(t => t is null ||
            string.IsNullOrWhiteSpace(t.Message) || t.Message.Length > 8000)) errors.Add("Invalid turns (max 10).");
        if (d.Assertions is null || d.Assertions.Length > 30 || d.Assertions.Any(a => a is null ||
            !Identifier(a.Id) || !AssertionKinds.Contains(a.Kind) || a.Severity is not ("critical" or "warning") ||
            !ValidExpected(a))) errors.Add("Invalid assertions.");
        else if (d.Assertions.Select(a => a.Id).Distinct().Count() != d.Assertions.Length) errors.Add("Assertion IDs must be unique.");
        if (d.Evaluator is null || d.Evaluator.Kind != "evidence" || d.Evaluator.Version != 1) errors.Add("Only evidence evaluator version 1 is supported.");
        if (d.AgentVersion?.Length > 200) errors.Add("agentVersion exceeds 200 characters.");
        if (!string.IsNullOrEmpty(d.AgentEndpoint) && !SafeUrl(d.AgentEndpoint)) errors.Add("agentEndpoint must be an HTTP(S) URL without credentials, query or fragment.");
        return errors.ToArray();
    }

    public static bool SafeUrl(string? value) => Uri.TryCreate(value, UriKind.Absolute, out var u) &&
        (u.Scheme == "https" || (u.Scheme == "http" && u.IsLoopback)) && string.IsNullOrEmpty(u.UserInfo) &&
        string.IsNullOrEmpty(u.Query) && string.IsNullOrEmpty(u.Fragment);
    private static bool Identifier(string? value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 100 &&
        value.All(c => char.IsLetterOrDigit(c) || c is '_' or '-' or '.');
    private static bool ValidExpected(LabAssertion a)
    {
        if (a.Expected is null) return true;
        var e = a.Expected.Value;
        return a.Kind is "maxRetries" or "minBackoffMs"
            ? e.ValueKind == JsonValueKind.Number && e.TryGetInt32(out var n) && n is >= 0 and <= 30000
            : e.ValueKind is JsonValueKind.True or JsonValueKind.False;
    }
}
