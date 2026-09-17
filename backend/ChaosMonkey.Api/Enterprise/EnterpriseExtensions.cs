using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
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

    /// <summary>Probes stay reachable so a load balancer never needs the shared key or a request budget.</summary>
    public static bool IsProbe(PathString path) =>
        path.StartsWithSegments("/api/health", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Gateway callbacks come from the agent under test and already carry a per-run bearer token and
    /// call cap, so a shared request budget here would distort the experiment rather than protect it.
    /// </summary>
    public static bool IsGatewayCallback(PathString path) =>
        path.StartsWithSegments("/api/lab/gateway", StringComparison.OrdinalIgnoreCase);

    public static void AddEnterprise(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<EnterpriseOptions>(configuration.GetSection(EnterpriseOptions.SectionName));
        // An ambient key keeps the shared secret out of configuration files and container images.
        services.PostConfigure<EnterpriseOptions>(options => options.ApiKey =
            EnterpriseOptions.ResolveApiKey(options.ApiKey, Environment.GetEnvironmentVariable(ApiKeyVariable)));

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
                if (!options.RateLimitEnabled || IsProbe(context.Request.Path) || IsGatewayCallback(context.Request.Path))
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

    public static void UseEnterprise(this WebApplication app)
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
            context.Response.Headers["Cross-Origin-Resource-Policy"] = "same-origin";
            context.Response.Headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";

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

        app.UseRateLimiter();
    }

    private static bool HasValidKey(HttpContext context, string expected)
    {
        var presented = context.Request.Headers[ApiKeyHeader].ToString();
        // Fixed-time comparison so a rejected key leaks nothing about the configured one.
        return CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(presented)),
            SHA256.HashData(Encoding.UTF8.GetBytes(expected)));
    }

    private static EnterpriseOptions Options(HttpContext context) =>
        context.RequestServices.GetRequiredService<IOptions<EnterpriseOptions>>().Value;
}
