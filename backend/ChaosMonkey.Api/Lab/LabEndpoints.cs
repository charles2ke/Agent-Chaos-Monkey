using Microsoft.AspNetCore.Mvc;

namespace ChaosMonkey.Api.Lab;

public static class LabEndpoints
{
    public static void AddLab(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<LabGatewayOptions>(configuration.GetSection("LabGateway"));
        foreach (var name in new[] { LabGateway.HttpClientName, LabRunner.AgentClientName })
        {
            services.AddHttpClient(name, client => client.Timeout = TimeSpan.FromSeconds(90))
                .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
                {
                    AllowAutoRedirect = false, UseCookies = false, UseDefaultCredentials = false, UseProxy = false
                });
        }
        services.AddSingleton<LabGateway>();
        services.AddSingleton<LabRunner>();
    }

    public static void MapLab(this WebApplication app)
    {
        app.MapGet("/api/lab/capabilities", (LabGateway gateway) => Results.Ok(new
        {
            schemaVersion = 1,
            evaluator = new LabEvaluator(),
            executionModes = new[] { "single", "matrix", "sequence" },
            faultModes = LabValidation.Modes,
            assertionKinds = LabValidation.AssertionKinds,
            gatewayEnabled = gateway.Options.Enabled,
            transports = new
            {
                simulation = true,
                gateway = gateway.Options.Enabled,
                directLine = gateway.Options.Enabled && DirectLineAdapter.ConfigurationErrors(gateway.Options.DirectLine).Length == 0
            },
            controlledDemoAvailable = true,
            agentEndpoints = gateway.Options.AgentEndpoints.Where(LabValidation.SafeUrl),
            operations = gateway.Options.Operations.Select(o => new { o.Connector, o.Operation }),
            limits = new { maxCallsPerRun = 32, maxRunSeconds = 90, maxFaults = 20, maxTurns = 10, maxSuiteTests = 20 },
            gatewayProtocol = new
            {
                method = "POST",
                authorizationScheme = "Bearer",
                authorizationHeader = "Authorization",
                body = new { sessionId = "<provided session>", connector = "<provided connector>", operation = "<provided operation>", arguments = new { } },
                notes = "Callback URL and capability are supplied only to an allowlisted agent. No caller URLs or credentials are accepted. Completion evidence stops when the agent response ends."
            }
        }));

        app.MapPost("/api/lab/run", async (LabRequest request, LabRunner runner, CancellationToken token) =>
        {
            var errors = runner.Validate(request);
            if (errors.Length > 0) return Results.BadRequest(new { errors });
            try { return Results.Ok(await runner.RunAsync(request, token)); }
            catch (InvalidOperationException) { return Results.Problem("Laboratory run capacity exceeded or run ended.", statusCode: 409); }
        }).WithMetadata(new RequestSizeLimitAttribute(262144));

        app.MapPost("/api/lab/suite", async (LabSuiteRequest request, LabRunner runner, CancellationToken token) =>
        {
            if (request.Tests is null || request.Tests.Length is < 1 or > 20 || request.Tests.Any(t => t is null))
                return Results.BadRequest(new { errors = new[] { "A suite requires 1..20 saved tests." } });
            var errors = request.Tests.SelectMany((t, i) => runner.Validate(new(t.Definition)).Select(e => $"tests[{i}]: {e}")).ToArray();
            if (errors.Length > 0) return Results.BadRequest(new { errors });
            var results = new List<LabResult>();
            foreach (var test in request.Tests) results.Add(await runner.RunAsync(new(test.Definition), token));
            return Results.Ok(new LabSuiteResult(results.ToArray(), EvidenceEvaluator.Aggregate(results.Select(r => r.Outcome))));
        }).WithMetadata(new RequestSizeLimitAttribute(1048576));

        app.MapPost("/api/lab/gateway/{runId}", async (string runId, GatewayCall call, HttpRequest request,
            LabGateway gateway, CancellationToken token) =>
        {
            var auth = request.Headers.Authorization.ToString();
            var session = gateway.Authenticate(runId, auth.StartsWith("Bearer ", StringComparison.Ordinal) ? auth[7..] : null);
            if (session is null) return Results.Unauthorized();
            try
            {
                var response = await session.CallAsync(call, token);
                // The envelope is stable even when the injected body is empty or malformed.
                return Results.Json(new
                {
                    statusCode = response.StatusCode,
                    body = response.Body,
                    succeeded = response.Succeeded,
                    simulation = session.Simulation,
                    sessionId = session.SessionId
                }, statusCode: response.StatusCode);
            }
            catch (ArgumentException) { return Results.BadRequest(new { error = "Invalid session, target or arguments." }); }
            catch (InvalidOperationException) { return Results.Conflict(new { error = "Run ended or tool call limit reached." }); }
            catch (OperationCanceledException) { return Results.StatusCode(408); }
        }).WithMetadata(new RequestSizeLimitAttribute(32768));
    }
}
