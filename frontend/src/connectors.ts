export interface ConnectorInfo {
  name: string
  kind: string
  description: string
}

/** Connector / tool boundary catalogue that chaos can be injected at. */
export const connectorCatalogue: ConnectorInfo[] = [
  {
    name: 'ServiceNow.CreateIncident',
    kind: 'Connector',
    description: 'Opens a support ticket. Fabricated success here is the classic failure mode.',
  },
  {
    name: 'Salesforce.GetAccount',
    kind: 'Connector',
    description: 'Reads CRM account data used to personalise the answer.',
  },
  {
    name: 'Dataverse.Query',
    kind: 'Connector',
    description: 'Queries Dataverse tables backing the agent knowledge.',
  },
  {
    name: 'GraphAPI.SendMail',
    kind: 'Custom API',
    description: 'Side-effecting action: the agent must never claim an unsent mail was sent.',
  },
  {
    name: 'MCP.FileSearch',
    kind: 'MCP server',
    description: 'Retrieval tool exposed over MCP.',
  },
]
