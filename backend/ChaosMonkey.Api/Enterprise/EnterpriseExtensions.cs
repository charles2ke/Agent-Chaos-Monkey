using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using ChaosMonkey.Api.Lab;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace ChaosMonkey.Api.Enterprise;

/// <summary>
/// Wires the deployment guardrails onto the host: every response carries a correlation identifier
/// and conservative security headers, callers are held to a request budget, and an optional shared
/// key protects everything except the probes used by orchestrators.
/// </summary>
public static class EnterpriseExtensions
{
    public const string ApiKeyHeader = "X-Api-Key";
    public const string ApiKeyVariable = "CHAOS_MONKEY_API_KEY";
    private const string GatewayCallbackPrefix = "/api/lab/gateway";
    private const string BearerPrefix = "Bearer ";

    /// <summary>Probes stay reachable so a load balancer never needs the shared key or a request budget.</summary>
    public static bool IsProbe(PathString path) =>
        path.StartsWithSegments("/api/health", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Identifies gateway callback paths so the shared key gate can defer to run-scoped bearer
    /// authentication at the tool boundary.
    /// </summary>
    public static bool IsGatewayCallback(PathString path) =>
        TryMatchGatewayCallback(path, out _);

    public static void AddEnterprise(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<EnterpriseOptions>()
            .Bind(configuration.GetSection(EnterpriseOptions.SectionName))
            .PostConfigure(options =>
            {
                // An ambient key keeps the shared secret out of configuration files and container images.
                options.ApiKey = EnterpriseOptions.ResolveApiKey(options.ApiKey,
                    Environment.GetEnvironmentVariable(ApiKeyVariable));
                var correlationHeader = options.CorrelationHeader?.Trim();
                options.CorrelationHeader = string.IsNullOrEmpty(correlationHeader)
                    ? EnterpriseOptions.DefaultCorrelationHeader
                    : correlationHeader;
            })
            .Validate(EnterpriseOptions.IsValid,
                $"Enterprise options require non-negative rate limit permits, a 1..{EnterpriseOptions.MaxRateLimitWindowSeconds} second window, and a safe non-reserved correlation header name.")
            .ValidateOnStart();

        services.AddRateLimiter(limiter =>
        {
            limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            limiter.OnRejected = (context, _) =>
            {
                context.HttpContext.Response.Headers.RetryAfter =
                    Options(context.HttpContext).RateLimitWindowSeconds.ToString();
                return ValueTask.CompletedTask;
            };
            limiter.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
            {
                var options = Options(context);
                if (!options.RateLimitEnabled || IsProbe(context.Request.Path) ||
                    IsAuthenticatedGatewayCallback(context))
                {
                    return RateLimitPartition.GetNoLimiter("unlimited");
                }

                // Partitioning by caller keeps one noisy client from exhausting the shared budget.
                var caller = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return RateLimitPartition.GetFixedWindowLimiter(caller, _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = options.RateLimitPermitsPerWindow,
                    Window = TimeSpan.FromSeconds(options.RateLimitWindowSeconds),
                    QueueLimit = 0
                });
            });
        });
    }

    public static void UseEnterpriseHeaders(this WebApplication app)
    {
        app.Use(async (context, next) =>
        {
            var options = Options(context);
            var correlationId = context.Request.Headers[options.CorrelationHeader].ToString();
            if (string.IsNullOrWhiteSpace(correlationId) || correlationId.Length > 128)
            {
                correlationId = context.TraceIdentifier;
            }

            context.Response.Headers[options.CorrelationHeader] = correlationId;
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";
            context.Response.Headers["X-Frame-Options"] = "DENY";
            context.Response.Headers["Referrer-Policy"] = "no-referrer";
            context.Response.Headers["Cross-Origin-Resource-Policy"] = "cross-origin";
            context.Response.Headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";

            await next(context).ConfigureAwait(false);
        });
    }

    public static void UseEnterpriseKeyGate(this WebApplication app)
    {
        app.Use(async (context, next) =>
        {
            var options = Options(context);
            if (options.RequiresApiKey && !IsProbe(context.Request.Path) &&
                !IsGatewayCallback(context.Request.Path) && !HasValidKey(context, options.ApiKey!))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(new { error = $"A valid {ApiKeyHeader} header is required." })
                    .ConfigureAwait(false);
                return;
            }

            await next(context).ConfigureAwait(false);
        });
    }

    private static bool HasValidKey(HttpContext context, string expected)
    {
        var presented = context.Request.Headers[ApiKeyHeader].ToString();
        // Fixed-time comparison so a rejected key leaks nothing about the configured one.
        return CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(presented)),
            SHA256.HashData(Encoding.UTF8.GetBytes(expected)));
    }

    /// <summary>
    /// Authenticated gateway callbacks already have per-run call caps, so only they bypass the shared
    /// request budget; rejected callbacks stay rate limited by caller.
    /// </summary>
    private static bool IsAuthenticatedGatewayCallback(HttpContext context)
    {
        if (!TryMatchGatewayCallback(context.Request.Path, out var remaining))
        {
            return false;
        }

        var runId = remaining.Value?.Trim('/');
        if (string.IsNullOrEmpty(runId) || runId.Contains('/'))
        {
            return false;
        }

        var auth = context.Request.Headers.Authorization.ToString();
        if (!auth.StartsWith(BearerPrefix, StringComparison.Ordinal))
        {
            return false;
        }

        var token = auth[BearerPrefix.Length..];
        return context.RequestServices.GetRequiredService<LabGateway>().Authenticate(runId, token) is not null;
    }

    private static bool TryMatchGatewayCallback(PathString path, out PathString remaining) =>
        path.StartsWithSegments(GatewayCallbackPrefix, StringComparison.OrdinalIgnoreCase, out remaining);

    private static EnterpriseOptions Options(HttpContext context) =>
        context.RequestServices.GetRequiredService<IOptions<EnterpriseOptions>>().Value;
}
