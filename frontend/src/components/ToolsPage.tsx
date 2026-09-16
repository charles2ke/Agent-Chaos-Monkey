import { connectorCatalogue } from '../connectors'
import { runSectionDescriptions } from '../tabs'
import { InfoTip } from './Tooltip'

interface ToolsPageProps {
  connectorName: string
  onConnectorNameChange: (value: string) => void
}

export function ToolsPage({ connectorName, onConnectorNameChange }: ToolsPageProps) {
  return (
    <section className="page" aria-label="Run · Tools">
      <header className="page__header">
        <div className="tipHeading">
          <h2 className="page__title">Tools</h2>
          <InfoTip label="Tools" text={runSectionDescriptions.Tools} />
        </div>
        <p className="page__lead">
          Pick the tool boundary chaos is injected at. The selected connector is the one that fails
          during the next experiment.
        </p>
      </header>

      <ul className="cards">
        {connectorCatalogue.map((connector) => {
          const selected = connector.name === connectorName
          return (
            <li key={connector.name}>
              <label
                className={`card card--selectable ${selected ? 'card--on' : ''}`}
                title={`${connector.description} Select it to make ${connector.name} the tool that fails.`}
              >
                <input
                  type="radio"
                  name="chaos-target"
                  checked={selected}
                  onChange={() => onConnectorNameChange(connector.name)}
                />
                <span>
                  <span className="card__badge">{connector.kind}</span>
                  <strong className="card__title">{connector.name}</strong>
                  <span className="card__detail">{connector.description}</span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      <label
        className="field field--wide"
        title="Type the exact name of your own connector or tool to aim chaos at it."
      >
        <span className="field__label">Custom connector / tool</span>
        <input
          className="field__input"
          value={connectorName}
          onChange={(event) => onConnectorNameChange(event.target.value)}
        />
      </label>
    </section>
  )
}
