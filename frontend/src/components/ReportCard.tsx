import type { ExperimentResult } from '../api'

function scoreTone(score: number) {
  if (score >= 85) return 'good'
  if (score >= 60) return 'warn'
  return 'bad'
}

export function ReportCard({ result }: { result: ExperimentResult }) {
  const { report } = result

  return (
    <section className={`report report--${scoreTone(report.score)}`} aria-label="Resilience report">
      <header className="report__header">
        <div className="report__score">
          <span className="report__value">{report.score}</span>
          <span className="report__max">/ 100</span>
        </div>
        <div>
          <h3 className="report__verdict">{report.verdict}</h3>
          <p className="report__summary">{report.summary}</p>
          <p className="report__model">
            Judged by {report.evaluatorModel}
            {report.usedLlm ? '' : ' (deterministic rules)'}
          </p>
        </div>
      </header>

      {report.findings.length > 0 && (
        <div className="report__block">
          <h4>Findings</h4>
          <ul className="findings">
            {report.findings.map((finding, index) => (
              <li key={index} className={`finding finding--${finding.severity.toLowerCase()}`}>
                <span className="finding__severity">{finding.severity}</span>
                <span>
                  <strong>{finding.title}</strong>
                  <span className="finding__detail">{finding.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.recommendedFixes.length > 0 && (
        <div className="report__block">
          <h4>Recommended fixes</h4>
          <ul className="bullets">
            {report.recommendedFixes.map((fix, index) => (
              <li key={index}>{fix}</li>
            ))}
          </ul>
        </div>
      )}

      {report.generatedRegressionTests.length > 0 && (
        <div className="report__block">
          <h4>Generated regression evals</h4>
          <ul className="bullets bullets--code">
            {report.generatedRegressionTests.map((test, index) => (
              <li key={index}>{test}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="report__raw">
        <summary>Raw agent response</summary>
        <pre>{result.agent.responseBody || '(empty)'}</pre>
      </details>
    </section>
  )
}
