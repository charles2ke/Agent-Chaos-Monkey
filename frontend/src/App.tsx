import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractReply } from './api'
import type { ChaosModeId, ChaosModeInfo, EvaluatorInfo, ExperimentRequest, ExperimentResult } from './api'
import { ActivityPage } from './components/ActivityPage'
import { ChaosPanel } from './components/ChaosPanel'
import { InstructionsPage } from './components/InstructionsPage'
import { KnowledgePage } from './components/KnowledgePage'
import { PreviewPane } from './components/PreviewPane'
import type { PreviewTurn } from './components/PreviewPane'
import { SettingsPage } from './components/SettingsPage'
import { SideNav } from './components/SideNav'
import { ToolsPage } from './components/ToolsPage'
import { TopBar } from './components/TopBar'
import { LaboratoryPage } from './components/LaboratoryPage'
import { RunAssistant } from './components/RunAssistant'
import { buildAssistantPlan } from './runAssistant'
import type { AssistantRun } from './runAssistant'
import type { TabId } from './tabs'

const defaultScenario = 'Create a support ticket for my broken laptop'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('Preview')
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
  const [history, setHistory] = useState<ExperimentResult[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assistantRun, setAssistantRun] = useState<AssistantRun | null>(null)
  const [stopRequested, setStopRequested] = useState(false)
  const executionLocked = useRef(false)
  const stopAfterCurrent = useRef(false)

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

  function currentRequest(): ExperimentRequest {
    return {
      agentEndpoint: agentEndpoint.trim() || undefined,
      agentApiKey: agentApiKey.trim() || undefined,
      scenario: scenario.trim(),
      connectorName,
      modes: [...selectedModes],
      latencyMs,
      evaluatorModel: evaluatorModel.trim() || undefined,
    }
  }

  async function executeExperiment(request: ExperimentRequest) {
    setTurns((current) => [...current, { kind: 'user', text: request.scenario }])
    try {
      const result = await api.runExperiment(request)
      setTurns((current) => [
        ...current,
        {
          kind: 'agent',
          text: result.agent.transportError ?? extractReply(result.agent.responseBody),
          result,
        },
      ])
      setHistory((current) => [result, ...current])
      return result
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The experiment failed.'
      setError(message)
      setTurns((current) => [...current, { kind: 'error', text: message }])
      throw caught
    }
  }

  async function runExperiment() {
    if (!scenario.trim() || executionLocked.current) return
    executionLocked.current = true
    setRunning(true)
    setError(null)
    try {
      await executeExperiment(currentRequest())
    } catch {
      // executeExperiment records errors in the transcript.
    } finally {
      executionLocked.current = false
      setRunning(false)
    }
  }

  async function runAssistant() {
    if (!scenario.trim() || selectedModes.length === 0 || executionLocked.current) return
    executionLocked.current = true
    stopAfterCurrent.current = false
    setStopRequested(false)
    setRunning(true)
    setError(null)
    const request = currentRequest()
    const steps = buildAssistantPlan(selectedModes, modes)
    setAssistantRun({
      scenario: request.scenario,
      connectorName: request.connectorName,
      targetLabel,
      status: 'running',
      steps,
    })
    let status: AssistantRun['status'] = 'completed'

    try {
      for (let index = 0; index < steps.length; index++) {
        if (stopAfterCurrent.current) {
          status = 'stopped'
          break
        }
        setAssistantRun((current) => current && ({
          ...current,
          steps: current.steps.map((step, i) => i === index ? { ...step, status: 'running' } : step),
        }))
        try {
          const result = await executeExperiment({ ...request, modes: steps[index].modes })
          setAssistantRun((current) => current && ({
            ...current,
            steps: current.steps.map((step, i) =>
              i === index ? { ...step, status: result.agent.transportError ? 'failed' : 'completed', result } : step),
          }))
          if (result.agent.transportError) {
            status = 'failed'
            break
          }
        } catch {
          status = 'failed'
          setAssistantRun((current) => current && ({
            ...current,
            steps: current.steps.map((step, i) => i === index ? { ...step, status: 'failed' } : step),
          }))
          break
        }
      }
    } finally {
      setAssistantRun((current) => current && ({
        ...current,
        status,
        steps: current.steps.map((step) =>
          step.status === 'queued' ? { ...step, status: 'skipped' } : step),
      }))
      executionLocked.current = false
      setRunning(false)
    }
  }

  return (
    <div className="app">
      <SideNav evaluator={evaluator} activeTab={activeTab} onSelectTab={setActiveTab} />
      <div className="shell">
        <TopBar evaluator={evaluator} activeTab={activeTab} targetLabel={targetLabel} />
        {activeTab === 'Preview' ? (
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
                setAssistantRun(null)
              }}
              error={error}
              connectorName={connectorName}
              selectedModes={selectedModes}
              assistant={
                <RunAssistant
                  modes={modes}
                  selectedModes={selectedModes}
                  running={running}
                  canRun={Boolean(scenario.trim())}
                  run={assistantRun}
                  stopRequested={stopRequested}
                  onRun={runAssistant}
                  onStop={() => {
                    stopAfterCurrent.current = true
                    setStopRequested(true)
                  }}
                  onPrepareMode={(mode) => setSelectedModes([mode])}
                />
              }
            />
          </main>
        ) : activeTab !== 'Laboratory' ? (
          <main className="workspace workspace--single">
            {activeTab === 'Instructions' && <InstructionsPage />}
            {activeTab === 'Knowledge' && <KnowledgePage modes={modes} evaluator={evaluator} />}
            {activeTab === 'Tools' && (
              <ToolsPage connectorName={connectorName} onConnectorNameChange={setConnectorName} />
            )}
            {activeTab === 'Activity' && (
              <ActivityPage history={history} onClear={() => setHistory([])} />
            )}
            {activeTab === 'Settings' && (
              <SettingsPage
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
            )}
          </main>
        ) : null}
        <main className="workspace workspace--single" hidden={activeTab !== 'Laboratory'}>
          <LaboratoryPage />
        </main>
      </div>
    </div>
  )
}
