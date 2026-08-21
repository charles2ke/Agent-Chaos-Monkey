import { useEffect, useMemo, useState } from 'react'
import { api, extractReply } from './api'
import type { ChaosModeId, ChaosModeInfo, EvaluatorInfo, ExperimentResult } from './api'
import { ChaosPanel } from './components/ChaosPanel'
import { PreviewPane } from './components/PreviewPane'
import type { PreviewTurn } from './components/PreviewPane'
import { TopBar } from './components/TopBar'

const defaultScenario = 'Create a support ticket for my broken laptop'

export default function App() {
  const [modes, setModes] = useState<ChaosModeInfo[]>([])
  const [evaluator, setEvaluator] = useState<EvaluatorInfo | null>(null)
  const [selectedModes, setSelectedModes] = useState<ChaosModeId[]>(['ExpiredAuth'])
  const [connectorName, setConnectorName] = useState('ServiceNow.CreateIncident')
  const [agentEndpoint, setAgentEndpoint] = useState('')
  const [agentApiKey, setAgentApiKey] = useState('')
  const [latencyMs, setLatencyMs] = useState(3000)
  const [evaluatorModel, setEvaluatorModel] = useState('')
  const [scenario, setScenario] = useState(defaultScenario)
  const [turns, setTurns] = useState<PreviewTurn[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.chaosModes().then(setModes).catch(() => setModes([]))
    api
      .evaluator()
      .then((info) => {
        setEvaluator(info)
        setEvaluatorModel((current) => current || info.model)
      })
      .catch(() => setEvaluator(null))
  }, [])

  const targetLabel = useMemo(
    () => (agentEndpoint.trim() ? agentEndpoint.trim() : 'Built-in demo agent'),
    [agentEndpoint],
  )

  function toggleMode(id: ChaosModeId) {
    setSelectedModes((current) =>
      current.includes(id) ? current.filter((mode) => mode !== id) : [...current, id],
    )
  }

  async function runExperiment() {
    const prompt = scenario.trim()
    if (!prompt || running) return

    setRunning(true)
    setError(null)
    setTurns((current) => [...current, { kind: 'user', text: prompt }])

    try {
      const result: ExperimentResult = await api.runExperiment({
        agentEndpoint: agentEndpoint.trim() || undefined,
        agentApiKey: agentApiKey.trim() || undefined,
        scenario: prompt,
        connectorName,
        modes: selectedModes,
        latencyMs,
        evaluatorModel: evaluatorModel.trim() || undefined,
      })

      setTurns((current) => [
        ...current,
        {
          kind: 'agent',
          text: result.agent.transportError ?? extractReply(result.agent.responseBody),
          result,
        },
      ])
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The experiment failed.'
      setError(message)
      setTurns((current) => [...current, { kind: 'error', text: message }])
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="app">
      <TopBar evaluator={evaluator} />
      <main className="workspace">
        <ChaosPanel
          modes={modes}
          selectedModes={selectedModes}
          onToggleMode={toggleMode}
          connectorName={connectorName}
          onConnectorNameChange={setConnectorName}
          agentEndpoint={agentEndpoint}
          onAgentEndpointChange={setAgentEndpoint}
          agentApiKey={agentApiKey}
          onAgentApiKeyChange={setAgentApiKey}
          latencyMs={latencyMs}
          onLatencyChange={setLatencyMs}
          evaluatorModel={evaluatorModel}
          onEvaluatorModelChange={setEvaluatorModel}
          evaluator={evaluator}
        />
        <PreviewPane
          targetLabel={targetLabel}
          turns={turns}
          running={running}
          scenario={scenario}
          onScenarioChange={setScenario}
          onRun={runExperiment}
          onClear={() => {
            setTurns([])
            setError(null)
          }}
          error={error}
        />
      </main>
    </div>
  )
}
