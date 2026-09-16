import type { ChaosModeId, ChaosModeInfo, ExperimentResult } from '../api'
import { buildAssistantPlan } from '../runAssistant'
import type { AssistantRun } from '../runAssistant'
import './run-assistant.css'

interface RunAssistantProps {
  modes: ChaosModeInfo[]
  selectedModes: ChaosModeId[]
  running: boolean
  canRun: boolean
  run: AssistantRun | null
  stopRequested: boolean
  onRun: () => void
  onStop: () => void
  onPrepareMode: (mode: ChaosModeId) => void
}

export function RunAssistant(props: RunAssistantProps) {
  const plan = buildAssistantPlan(props.selectedModes, props.modes)
  const run = props.run
  const baseline = run?.steps[0].result
  const completed = run?.steps.filter((step) => step.status === 'completed') ?? []
  const weakest = completed.reduce<ExperimentResult | undefined>((worst, step) => {
    const result = step.result
    return result && (!worst || result.report.score < worst.report.score) ? result : worst
  }, undefined)
  const nextMode = props.modes.find(
    (mode) => !run?.steps.some((step) => step.modes.includes(mode.id)),
  )

  return (
    <section className="run-assistant" aria-labelledby="run-assistant-title">
      <div className="run-assistant__heading">
        <div>
          <span className="run-assistant__eyebrow">Plan → act → learn</span>
          <h3 id="run-assistant-title">Run assistant</h3>
        </div>
        <span className="badge">Rule-based guidance</span>
      </div>
      <p>
        Establish a baseline, then test each selected fault separately so one failure cannot mask
        another. Nothing runs until you approve.
      </p>
      <p>Run uses simulated connector results. Use Laboratory for tool-call evidence.</p>
      <details open={!run}>
        <summary>Review next plan · {plan.length} checks</summary>
        <ol className="run-assistant__plan">
          {plan.map((step) => <li key={step.label}>{step.label}</li>)}
        </ol>
        <p>
          Each check sends your current scenario to the configured target and may trigger real
          actions or incur costs. Use a sandbox. Settings are captured at approval; later edits
          apply only to the next run.
        </p>
      </details>
      <div className="run-assistant__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={props.running || !props.canRun || props.selectedModes.length === 0}
          onClick={props.onRun}
        >
          Approve & run {plan.length} checks
        </button>
        {run?.status === 'running' && (
          <button
            type="button"
            className="button button--ghost"
            disabled={props.stopRequested}
            onClick={props.onStop}
          >
            {props.stopRequested ? 'Stopping after current check…' : 'Stop after current check'}
          </button>
        )}
      </div>
      {props.selectedModes.length === 0 && <p>Select a fault to build a guided plan.</p>}
      {run && (
        <div className="run-assistant__results">
          <p className="run-assistant__status" role="status">
            {run.status === 'running' ? 'In progress' : `Plan ${run.status}`} · {completed.length}
            /{run.steps.length} checks completed
          </p>
          <p className="run-assistant__context">
            {run.connectorName} · {run.targetLabel}<br />{run.scenario}
          </p>
          <ol className="run-assistant__plan">
            {run.steps.map((step, index) => {
              const delta = baseline && step.result
                ? step.result.report.score - baseline.report.score
                : null
              return (
                <li key={step.label}>
                  <span>{step.label}</span>
                  <strong>
                    {step.status === 'failed' ? 'failed' : step.result ? `${step.result.report.score}/100` : step.status}
                  </strong>
                  {index > 0 && delta !== null && (
                    <span className={delta < 0 ? 'run-assistant__regression' : ''}>
                      {delta > 0 ? '+' : ''}{delta} vs baseline
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
          {run.status === 'stopped' && <p>Remaining checks were skipped. The active request was not cancelled.</p>}
          {run.status === 'failed' && <p>Stopped on an error. Review the error below and your target settings before retrying.</p>}
          {run.status === 'completed' && weakest && (
            <div className="run-assistant__insight">
              <h4>Recommended next step</h4>
              <p>
                Lowest score: {weakest.report.score}/100 · {weakest.report.verdict}.
                {' '}{weakest.report.recommendedFixes[0] ?? weakest.report.summary}
              </p>
              {nextMode && (
                <>
                  <p>Coverage gap in this plan: {nextMode.name}. {nextMode.description}</p>
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={props.running}
                    onClick={() => props.onPrepareMode(nextMode.id)}
                  >
                    Prepare {nextMode.name}
                  </button>
                  <p>Updates the selected fault only. Review and approve to run again.</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
