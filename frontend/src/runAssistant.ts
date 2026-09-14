import type { ChaosModeId, ChaosModeInfo, ExperimentResult } from './api'

export interface AssistantStep {
  label: string
  modes: ChaosModeId[]
  status: 'queued' | 'running' | 'completed' | 'failed' | 'skipped'
  result?: ExperimentResult
}

export interface AssistantRun {
  scenario: string
  connectorName: string
  targetLabel: string
  status: 'running' | 'completed' | 'stopped' | 'failed'
  steps: AssistantStep[]
}

export function buildAssistantPlan(
  selectedModes: ChaosModeId[],
  modes: ChaosModeInfo[],
): AssistantStep[] {
  return [
    { label: 'Baseline · no faults', modes: [], status: 'queued' },
    ...selectedModes.map((id): AssistantStep => ({
      label: modes.find((mode) => mode.id === id)?.name ?? id,
      modes: [id],
      status: 'queued',
    })),
  ]
}
