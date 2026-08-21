using ChaosMonkey.Api.Agents;
using ChaosMonkey.Api.Chaos;
using ChaosMonkey.Api.Evaluation;
using ChaosMonkey.Api.Models;

namespace ChaosMonkey.Api.Experiments;

/// <summary>Orchestrates a single chaos experiment: inject → invoke → judge → report.</summary>
public sealed class ExperimentRunner
{
    private readonly ChaosEngine _chaosEngine;
    private readonly AgentInvoker _agentInvoker;
    private readonly IResilienceEvaluator _evaluator;

    public ExperimentRunner(ChaosEngine chaosEngine, AgentInvoker agentInvoker, IResilienceEvaluator evaluator)
    {
        _chaosEngine = chaosEngine;
        _agentInvoker = agentInvoker;
        _evaluator = evaluator;
    }

    public async Task<ExperimentResult> RunAsync(ExperimentRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var startedAt = DateTimeOffset.UtcNow;
        var plan = _chaosEngine.BuildPlan(request);
        var interaction = await _agentInvoker.InvokeAsync(request, plan, cancellationToken).ConfigureAwait(false);
        var report = await _evaluator.EvaluateAsync(request, plan, interaction, cancellationToken).ConfigureAwait(false);

        return new ExperimentResult(
            Guid.NewGuid().ToString("n"),
            startedAt,
            request.Scenario,
            string.IsNullOrWhiteSpace(request.ConnectorName) ? "connector" : request.ConnectorName.Trim(),
            plan.Injections,
            interaction,
            report);
    }
}
