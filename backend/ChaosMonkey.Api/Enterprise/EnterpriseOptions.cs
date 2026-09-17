namespace ChaosMonkey.Api.Enterprise;

/// <summary>
/// Controls the operational guardrails an enterprise deployment needs: an optional shared key in
/// front of the API, a per-caller request budget and the correlation header used for tracing.
/// Defaults keep the local demo usable, so the key gate is opt-in through configuration.
/// </summary>
public sealed class EnterpriseOptions
{
    public const string SectionName = "Enterprise";

    /// <summary>Shared key required in the <c>X-Api-Key</c> header. Null or blank disables the gate.</summary>
    public string? ApiKey { get; set; }

    /// <summary>Requests allowed per caller within <see cref="RateLimitWindowSeconds"/>. Zero disables limiting.</summary>
    public int RateLimitPermitsPerWindow { get; set; } = 600;

    /// <summary>Length of the fixed rate limiting window, in seconds.</summary>
    public int RateLimitWindowSeconds { get; set; } = 60;

    /// <summary>Header carrying a caller supplied correlation identifier, echoed on every response.</summary>
    public string CorrelationHeader { get; set; } = "X-Correlation-Id";

    /// <summary>Configuration wins over the ambient variable; a blank value in either place means no gate.</summary>
    public static string? ResolveApiKey(string? configured, string? ambient) =>
        !string.IsNullOrWhiteSpace(configured) ? configured
        : string.IsNullOrWhiteSpace(ambient) ? null
        : ambient;

    public bool RequiresApiKey => !string.IsNullOrWhiteSpace(ApiKey);

    public bool RateLimitEnabled => RateLimitPermitsPerWindow > 0 && RateLimitWindowSeconds > 0;
}
