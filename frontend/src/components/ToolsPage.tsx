import { connectorCatalogue } from '../connectors'

interface ToolsPageProps {
  connectorName: string
  onConnectorNameChange: (value: string) => void
}

export function ToolsPage({ connectorName, onConnectorNameChange }: ToolsPageProps) {
  return (
    <section className="page" aria-label="Tools">
      <header className="page__header">
        <h2 className="page__title">Tools</h2>
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
              <label className={`card card--selectable ${selected ? 'card--on' : ''}`}>
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

      <label className="field field--wide">
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
