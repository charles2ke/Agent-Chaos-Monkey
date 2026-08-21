using System.Text.Json.Serialization;
using ChaosMonkey.Api.Agents;
using ChaosMonkey.Api.Chaos;
using ChaosMonkey.Api.Evaluation;
using ChaosMonkey.Api.Experiments;
using ChaosMonkey.Api.Models;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<LlmOptions>(builder.Configuration.GetSection(LlmOptions.SectionName));
builder.Services.PostConfigure<LlmOptions>(options =>
{
    options.ApiKey ??= Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY")
                       ?? Environment.GetEnvironmentVariable("OPENAI_API_KEY");
});

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.AddHttpClient(AgentInvoker.HttpClientName,
    client => client.Timeout = TimeSpan.FromMinutes(3));
builder.Services.AddHttpClient(LlmEvaluator.HttpClientName);

builder.Services.AddSingleton<ChaosEngine>();
builder.Services.AddSingleton<DemoAgent>();
builder.Services.AddSingleton<AgentInvoker>();
builder.Services.AddSingleton<HeuristicEvaluator>();
builder.Services.AddSingleton<IResilienceEvaluator, LlmEvaluator>();
builder.Services.AddSingleton<ExperimentRunner>();

const string corsPolicy = "chaos-ui";
builder.Services.AddCors(options => options.AddPolicy(corsPolicy, policy => policy
    .WithOrigins(builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
                 ?? ["http://localhost:5173", "http://127.0.0.1:5173"])
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

app.UseCors(corsPolicy);

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/api/chaos-modes", () => Results.Ok(ChaosModeCatalog.All));

app.MapGet("/api/evaluator", (IOptions<LlmOptions> options) => Results.Ok(new
{
    provider = options.Value.Provider,
    model = options.Value.Model,
    configured = options.Value.IsConfigured
}));

app.MapPost("/api/demo-agent", (AgentPayload payload, DemoAgent agent) =>
    Results.Content(agent.Respond(payload), "application/json"));

app.MapPost("/api/experiments", async (
    ExperimentRequest request,
    ExperimentRunner runner,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Scenario))
    {
        return Results.BadRequest(new { error = "A scenario is required." });
    }

    try
    {
        AgentInvoker.TryParseEndpoint(request.AgentEndpoint, out _);
    }
    catch (ArgumentException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }

    var result = await runner.RunAsync(request, cancellationToken).ConfigureAwait(false);
    return Results.Ok(result);
});

app.Run();

/// <summary>Exposed so tests can bootstrap the API host.</summary>
public partial class Program;
