namespace ChaosMonkey.Api.Enterprise;

/// <summary>
/// Controls the operational guardrails an enterprise deployment needs: an optional shared key in
/// front of the API, a per-caller request budget and the correlation header used for tracing.
/// Defaults keep the local demo usable, so the key gate is opt-in through configuration.
/// </summary>
public sealed class EnterpriseOptions
{
    public const string SectionName = "Enterprise";
    private const int MaxRateLimitWindowSeconds = 86400;
    private static readonly string[] ReservedCorrelationHeaders =
    [
        EnterpriseExtensions.ApiKeyHeader,
        "Authorization",
        "Cookie",
        "Set-Cookie",
        "Retry-After",
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Cross-Origin-Resource-Policy",
        "Content-Security-Policy"
    ];

    /// <summary>
    /// Shared key required in the <c>X-Api-Key</c> header. Configuration takes precedence; if it is
    /// null or blank, the ambient <c>CHAOS_MONKEY_API_KEY</c> value is used when present.
    /// </summary>
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

    public bool RateLimitEnabled => RateLimitPermitsPerWindow > 0;

    public static bool IsValid(EnterpriseOptions options) =>
        options.RateLimitPermitsPerWindow >= 0 &&
        options.RateLimitWindowSeconds is > 0 and <= MaxRateLimitWindowSeconds &&
        IsValidCorrelationHeader(options.CorrelationHeader);

    public static bool IsValidCorrelationHeader(string? value)
    {
        var header = value?.Trim();
        return !string.IsNullOrEmpty(header) &&
            header.Length <= 128 &&
            header.All(IsHeaderTokenCharacter) &&
            !ReservedCorrelationHeaders.Contains(header, StringComparer.OrdinalIgnoreCase);
    }

    private static bool IsHeaderTokenCharacter(char value) =>
        char.IsAsciiLetterOrDigit(value) ||
        value is '!' or '#' or '$' or '%' or '&' or '\'' or '*' or '+' or '-' or '.' or '^' or '_' or '`' or '|' or '~';
}
