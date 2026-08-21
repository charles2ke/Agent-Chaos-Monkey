import type { ExperimentResult } from '../api'

interface ActivityPageProps {
  history: ExperimentResult[]
  onClear: () => void
}

function scoreTone(score: number) {
  if (score >= 85) return 'good'
  if (score >= 60) return 'warn'
  return 'bad'
}

export function ActivityPage({ history, onClear }: ActivityPageProps) {
  return (
    <section className="page" aria-label="Activity">
      <header className="page__header page__header--row">
        <div>
          <h2 className="page__title">Activity</h2>
          <p className="page__lead">Every experiment run in this session, newest first.</p>
        </div>
        {history.length > 0 && (
          <button type="button" className="button button--ghost" onClick={onClear}>
            Clear history
          </button>
        )}
      </header>

      {history.length === 0 ? (
        <p className="page__empty">
          No runs yet. Go to the Preview tab and run chaos to populate the activity log.
        </p>
      ) : (
        <table className="activity">
          <thead>
            <tr>
              <th scope="col">Score</th>
              <th scope="col">Scenario</th>
              <th scope="col">Connector</th>
              <th scope="col">Injections</th>
              <th scope="col">Latency</th>
              <th scope="col">Started</th>
            </tr>
          </thead>
          <tbody>
            {history.map((run) => (
              <tr key={run.experimentId}>
                <td>
                  <span className={`activity__score activity__score--${scoreTone(run.report.score)}`}>
                    {run.report.score}
                  </span>
                  <span className="activity__verdict">{run.report.verdict}</span>
                </td>
                <td>{run.scenario}</td>
                <td className="activity__mono">{run.connectorName}</td>
                <td>
                  {run.injections.length === 0
                    ? 'control run'
                    : run.injections.map((injection) => injection.mode).join(', ')}
                </td>
                <td>{run.agent.durationMs} ms</td>
                <td>{new Date(run.startedAt).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
