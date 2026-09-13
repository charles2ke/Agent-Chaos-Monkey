using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace ChaosMonkey.Api.Lab;

public sealed class LabRedactor(IEnumerable<string?> secrets)
{
    private readonly string[] _secrets = secrets.Where(s => !string.IsNullOrEmpty(s)).Cast<string>()
        .OrderByDescending(s => s.Length).ToArray();
    public string Clean(string? text)
    {
        var value = text ?? "";
        foreach (var secret in _secrets) value = value.Replace(secret, "[REDACTED]", StringComparison.Ordinal);
        value = Regex.Replace(value, @"(?i)(bearer\s+)[^\s""\\,;]+", "$1[REDACTED]");
        return Regex.Replace(value, """(?i)("(?:apiKey|api_key|authorization|password|access_token|refresh_token|secret|capability)"\s*:\s*")[^"]*""",
            "$1[REDACTED]");
    }
}

public sealed class LabGateway(IHttpClientFactory clients, IOptions<LabGatewayOptions> options)
{
    public const string HttpClientName = "lab-boundary";
    private readonly ConcurrentDictionary<string, BoundarySession> _sessions = new();
    public LabGatewayOptions Options => options.Value;

    public string[] ConfigurationErrors(ExperimentDefinition definition)
    {
        if (string.IsNullOrEmpty(definition.AgentEndpoint)) return [];
        if (!Options.AgentEndpoints.Contains(definition.AgentEndpoint, StringComparer.Ordinal) ||
            !LabValidation.SafeUrl(definition.AgentEndpoint)) return ["Agent endpoint is not exactly allowlisted in LabGateway:AgentEndpoints."];
        if (definition.Transport != "gateway") return [];
        if (!Options.Enabled) return ["External gateway transport is disabled."];
        if (!LabValidation.SafeUrl(Options.PublicBaseUrl)) return ["A trusted LabGateway:PublicBaseUrl is required."];
        var targets = Options.Operations.Where(o => o.Connector == definition.Connector && o.Operation == definition.Operation).ToArray();
        if (targets.Length != 1 || !LabValidation.SafeUrl(targets[0].Url) ||
            targets[0].Method is not ("POST" or "GET" or "PUT" or "PATCH" or "DELETE"))
            return ["Exactly one valid server-side connector/operation mapping is required."];
        return [];
    }

    public BoundarySession Open(ExperimentDefinition definition, FaultStep[] active, FaultStep[] skipped,
        string? apiKey, CancellationToken cancellationToken)
    {
        if (_sessions.Count >= 64) throw new InvalidOperationException("Too many active laboratory runs.");
        var session = new BoundarySession(definition, active, skipped, apiKey, Options, clients, cancellationToken);
        if (!_sessions.TryAdd(session.Id, session)) throw new InvalidOperationException("Unable to create run.");
        return session;
    }

    public BoundarySession? Authenticate(string id, string? token)
    {
        if (!_sessions.TryGetValue(id, out var session) || !session.IsActive || token is null) return null;
        return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(token), Encoding.UTF8.GetBytes(session.Capability))
            ? session : null;
    }

    public async Task CloseAsync(BoundarySession session)
    {
        _sessions.TryRemove(session.Id, out _);
        await session.CloseAsync();
    }
}

public sealed class BoundarySession
{
    private readonly ExperimentDefinition _definition;
    private readonly FaultStep[] _active;
    private readonly IHttpClientFactory _clients;
    private readonly UpstreamOperation? _upstream;
    private readonly CancellationTokenSource _lifetime;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly List<ToolCall> _trace = [];
    private readonly List<FaultEvidence> _faults = [];
    private readonly Dictionary<string, string> _effects = [];
    private long? _lastCompleted;
    private volatile bool _closed;
    private int _invocation;
    public string Id { get; } = Guid.NewGuid().ToString("n");
    public string SessionId { get; } = Guid.NewGuid().ToString("n");
    public string Capability { get; } = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    public string LogicalOperationId { get; } = Guid.NewGuid().ToString("n");
    public bool IsActive => !_closed && !_lifetime.IsCancellationRequested;
    public bool IsDemo => string.IsNullOrEmpty(_definition.AgentEndpoint);
    public bool Simulation => IsDemo || _definition.Transport == "simulation";
    public LabRedactor Redactor { get; }
    public CancellationToken Token => _lifetime.Token;
    public bool Reauthenticated { get; set; }
    public int CompletedCallCount => _trace.Count;

    public BoundarySession(ExperimentDefinition definition, FaultStep[] active, FaultStep[] skipped,
        string? apiKey, LabGatewayOptions options, IHttpClientFactory clients, CancellationToken cancellationToken)
    {
        _definition = definition;
        _active = active;
        _clients = clients;
        _upstream = options.Operations.FirstOrDefault(o => o.Connector == definition.Connector && o.Operation == definition.Operation);
        _lifetime = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _lifetime.CancelAfter(TimeSpan.FromSeconds(90));
        Redactor = new LabRedactor(options.Operations.Select(o => o.BearerToken).Append(apiKey).Append(Capability));
        _faults.AddRange(active.Select(f => new FaultEvidence(f.Invocation, f.Mode, "planned",
            $"Scheduled for {f.Connector ?? definition.Connector}.{f.Operation ?? definition.Operation} invocation {f.Invocation}.")));
        _faults.AddRange(skipped.Select(f => new FaultEvidence(f.Invocation, f.Mode, "skipped",
            "Not selected: single execution applies only the first fault.")));
    }

    public async Task<BoundaryResponse> CallAsync(GatewayCall call, CancellationToken cancellationToken)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(Token, cancellationToken);
        await _gate.WaitAsync(linked.Token);
        try
        {
            if (!IsActive) throw new InvalidOperationException("Run has ended.");
            if (call.SessionId != SessionId || call.Connector != _definition.Connector || call.Operation != _definition.Operation)
                throw new ArgumentException("Session or connector/operation does not match this capability.");
            if (_invocation >= 32) throw new InvalidOperationException("Run call limit reached.");
            if (call.Arguments.ValueKind != JsonValueKind.Object || call.Arguments.GetRawText().Length > 16384)
                throw new ArgumentException("Arguments must be a JSON object of at most 16384 characters.");
            var invocation = ++_invocation;
            var start = DateTimeOffset.UtcNow;
            var clock = Stopwatch.StartNew();
            var retryDelay = _lastCompleted.HasValue ? (long)Stopwatch.GetElapsedTime(_lastCompleted.Value).TotalMilliseconds : 0;
            long delay = 0;
            int? status = null;
            string? effect = null;
            var succeeded = false;
            var observable = Simulation || _upstream?.SideEffectIdProperty is not null;
            var detail = "";
            var fault = _active.FirstOrDefault(f => f.Invocation == invocation &&
                (f.Connector ?? _definition.Connector) == call.Connector &&
                (f.Operation ?? _definition.Operation) == call.Operation);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(linked.Token);
            timeout.CancelAfter(_definition.ToolTimeoutMs);
            var delivered = false;
            try
            {
                if (fault is not null)
                    _faults.Add(new(invocation, fault.Mode, "injected", "Applied at the tool-call boundary."));
                if (fault?.Mode == "Latency")
                {
                    var wait = Stopwatch.StartNew();
                    try { await Task.Delay(_definition.LatencyMs, timeout.Token); }
                    finally { delay = wait.ElapsedMilliseconds; }
                }
                BoundaryResponse response;
                if (fault is not null && fault.Mode is not ("None" or "Latency"))
                    response = FaultResponse(fault.Mode);
                else if (Simulation)
                {
                    if (!_effects.TryGetValue(LogicalOperationId, out effect))
                        _effects[LogicalOperationId] = effect = "DEMO-" + Id[..8];
                    response = new(200, JsonSerializer.Serialize(new { status = "ok", id = effect }), true);
                }
                else
                {
                    response = await ForwardAsync(call.Arguments, timeout.Token);
                    if (response.Succeeded && _upstream?.SideEffectIdProperty is { } property)
                    {
                        using var body = JsonDocument.Parse(response.Body);
                        if (body.RootElement.ValueKind == JsonValueKind.Object &&
                            body.RootElement.TryGetProperty(property, out var id) && id.ValueKind == JsonValueKind.String)
                            effect = Redactor.Clean(id.GetString());
                    }
                    observable = response.Succeeded && effect is not null;
                }
                timeout.Token.ThrowIfCancellationRequested();
                status = response.StatusCode;
                succeeded = response.Succeeded;
                detail = succeeded ? "Valid successful tool response." : $"Tool returned HTTP {status}; success not confirmed.";
                delivered = true;
                return response with { Body = Redactor.Clean(response.Body) };
            }
            catch (OperationCanceledException)
            {
                detail = linked.IsCancellationRequested ? "Tool call cancelled; no completion observed." : "Tool timeout at boundary; no completion observed.";
                if (linked.IsCancellationRequested) throw;
                return new(504, """{"error":"tool_timeout"}""", false);
            }
            catch (HttpRequestException)
            {
                detail = "Upstream transport failed; completion and side effects unknown.";
                return new(502, """{"error":"upstream_transport_failure"}""", false);
            }
            finally
            {
                if (fault is not null && delivered)
                    _faults.Add(new(invocation, fault.Mode, "observed", "Fault-affected response delivered to tool caller."));
                _trace.Add(new(invocation, call.Connector, call.Operation, status, start, clock.ElapsedMilliseconds,
                    delay, retryDelay, effect, detail)
                {
                    Succeeded = succeeded, SideEffectsObservable = observable && delivered,
                    SessionId = SessionId, LogicalOperationId = LogicalOperationId,
                    EvidenceSource = Simulation ? "controlled-simulation" : "gateway",
                    ContextRetained = IsDemo && call.Arguments.TryGetProperty("scenario", out var scenario)
                        ? scenario.GetString() == _definition.Scenario : null
                });
                _lastCompleted = Stopwatch.GetTimestamp();
            }
        }
        finally { _gate.Release(); }
    }

    private async Task<BoundaryResponse> ForwardAsync(JsonElement arguments, CancellationToken token)
    {
        if (_upstream is null) throw new InvalidOperationException("No upstream mapping.");
        using var request = new HttpRequestMessage(new HttpMethod(_upstream.Method), _upstream.Url);
        if (_upstream.Method != "GET")
            request.Content = new StringContent(Redactor.Clean(arguments.GetRawText()), Encoding.UTF8, "application/json");
        request.Headers.TryAddWithoutValidation("Idempotency-Key", LogicalOperationId);
        if (!string.IsNullOrEmpty(_upstream.BearerToken))
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _upstream.BearerToken);
        using var client = _clients.CreateClient(LabGateway.HttpClientName);
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token);
        var body = await ReadBoundedAsync(response.Content, token);
        var success = response.IsSuccessStatusCode && ValidJson(body);
        return new((int)response.StatusCode, body, success);
    }

    public static async Task<string> ReadBoundedAsync(HttpContent content, CancellationToken token)
    {
        await using var stream = await content.ReadAsStreamAsync(token);
        var buffer = new byte[65537];
        var total = 0;
        while (total < buffer.Length)
        {
            var count = await stream.ReadAsync(buffer.AsMemory(total), token);
            if (count == 0) break;
            total += count;
        }
        if (total > 65536) throw new HttpRequestException("Response exceeds 64 KiB.");
        return Encoding.UTF8.GetString(buffer, 0, total);
    }

    private static bool ValidJson(string value)
    {
        try
        {
            using var doc = JsonDocument.Parse(value);
            return doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.EnumerateObject().Any() &&
                !doc.RootElement.TryGetProperty("error", out _) &&
                (!doc.RootElement.TryGetProperty("success", out var success) || success.ValueKind != JsonValueKind.False) &&
                (!doc.RootElement.TryGetProperty("status", out var status) || status.ValueKind != JsonValueKind.String ||
                    status.GetString() is not ("failed" or "error"));
        }
        catch (JsonException) { return false; }
    }

    private static BoundaryResponse FaultResponse(string mode) => mode switch
    {
        "ConnectorFailure" => new(500, """{"error":"upstream_unavailable"}""", false),
        "Throttling" => new(429, """{"error":"rate_limited"}""", false),
        "ExpiredAuth" => new(401, """{"error":"expired_authentication"}""", false),
        "EmptyResponse" => new(200, "", false),
        "MalformedData" => new(200, """{"status":""", false),
        _ => throw new ArgumentException("Unknown fault.")
    };

    public async Task CloseAsync()
    {
        _closed = true;
        await _lifetime.CancelAsync();
        await _gate.WaitAsync();
        try
        {
            foreach (var fault in _active.Where(f => !_faults.Any(e => e.Invocation == f.Invocation &&
                e.Mode == f.Mode && e.State == "injected")))
                _faults.Add(new(fault.Invocation, fault.Mode, "skipped", "Target invocation was not reached or target did not match."));
        }
        finally { _gate.Release(); }
    }

    public ToolCall[] Trace => _closed ? _trace.ToArray() : throw new InvalidOperationException("Close before reading evidence.");
    public FaultEvidence[] Faults => _closed ? _faults.ToArray() : throw new InvalidOperationException("Close before reading evidence.");
}
