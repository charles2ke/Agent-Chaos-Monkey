#!/usr/bin/env node
// Agent Chaos Monkey MCP server.
//
// Exposes the Chaos API (chaos catalogue, Preview experiments and the resilience
// Laboratory) to MCP clients over stdio, so an assistant can inject connector
// failures into an agent and read back the resilience report.
//
// Configuration (environment only, never tool arguments):
//   CHAOS_API_URL        Base URL of the Chaos API (default http://localhost:5249)
//   CHAOS_AGENT_API_KEY  Credential forwarded to the agent under test (optional)
//   CHAOS_TIMEOUT_MS     Per-request timeout in ms (default 120000, max 600000)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { callApi, containsCredentials, parseApiUrl, redact } from './api.mjs'

const CHAOS_MODES = [
  'Latency',
  'ConnectorFailure',
  'Throttling',
  'ExpiredAuth',
  'EmptyResponse',
  'MalformedData',
]
const FAULT_MODES = [...CHAOS_MODES, 'None']
const ASSERTION_KINDS = [
  'noUnsupportedSuccess',
  'maxRetries',
  'noDuplicateSideEffects',
  'eventualSuccess',
  'contextRetained',
  'minBackoffMs',
]

let baseUrl
let timeoutMs
try {
  baseUrl = parseApiUrl(process.env.CHAOS_API_URL || 'http://localhost:5249').toString()
  timeoutMs = Number(process.env.CHAOS_TIMEOUT_MS ?? 120_000)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) {
    throw new Error('CHAOS_TIMEOUT_MS must be an integer between 1 and 600000.')
  }
} catch (error) {
  console.error(error.message)
  process.exit(2)
}
const agentApiKey = process.env.CHAOS_AGENT_API_KEY || undefined

const definitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1).max(200),
    scenario: z.string().min(1).max(8000),
    connector: z.string().min(1).max(100),
    operation: z.string().min(1).max(100),
    executionMode: z.enum(['single', 'matrix', 'sequence']).default('single'),
    transport: z.enum(['simulation', 'gateway']).default('simulation'),
    faults: z
      .array(
        z
          .object({
            invocation: z.number().int().min(1).max(32),
            mode: z.enum(FAULT_MODES),
            connector: z.string().max(100).optional(),
            operation: z.string().max(100).optional(),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    latencyMs: z.number().int().min(0).max(30_000).optional(),
    toolTimeoutMs: z.number().int().min(1).max(30_000).optional(),
    maxRetries: z.number().int().min(0).max(10).optional(),
    retryDelayMs: z.number().int().min(0).max(5000).optional(),
    turns: z
      .array(z.object({ message: z.string().min(1).max(8000), reauthenticate: z.boolean().optional() }).strict())
      .max(10)
      .default([]),
    assertions: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            kind: z.enum(ASSERTION_KINDS),
            expected: z.union([z.number(), z.string(), z.boolean()]).optional(),
            severity: z.enum(['critical', 'warning']).default('critical'),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    agentEndpoint: z.string().url().optional(),
    agentVersion: z.string().max(200).optional(),
    evaluator: z.object({ kind: z.literal('evidence'), version: z.literal(1) }).strict().optional(),
  })
  .strict()
  .describe('Version 1 laboratory experiment definition.')

function json(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(redact(payload, agentApiKey), null, 2) }] }
}

function failure(message) {
  return { isError: true, content: [{ type: 'text', text: redact(message, agentApiKey) }] }
}

/** Runs an API call and converts any failure into a tool error the model can act on. */
async function tool(path, options) {
  try {
    return json(await callApi(baseUrl, path, { timeoutMs, ...options }))
  } catch (error) {
    return failure(error.message)
  }
}

/** Agent endpoints are caller supplied, so hold them to the same transport rules as the API URL. */
function checkAgentEndpoint(endpoint) {
  if (!endpoint) return null
  try {
    parseApiUrl(endpoint)
    return null
  } catch (error) {
    return failure(`agentEndpoint rejected: ${error.message}`)
  }
}

/** Mirrors the backend aggregation: any failure fails the suite, any gap leaves it inconclusive. */
function aggregateOutcome(outcomes) {
  if (outcomes.includes('fail')) return 'fail'
  return outcomes.length === 0 || outcomes.some((outcome) => outcome !== 'pass') ? 'inconclusive' : 'pass'
}

const server = new McpServer(
  { name: 'agent-chaos-monkey', version: '0.1.0' },
  {
    instructions:
      'Resilience testing for AI agents. Inject connector failures (latency, 500, 429, 401, empty and malformed responses) ' +
      'and read back an evidence-backed resilience report. Use run_experiment for a quick single-shot Preview experiment and ' +
      'run_lab_experiment for versioned experiments with assertions. Credentials are supplied through the CHAOS_AGENT_API_KEY ' +
      'environment variable and must never be passed as tool arguments.',
  },
)

server.registerTool(
  'get_health',
  {
    title: 'Chaos API health',
    description: 'Check that the Chaos API backing this MCP server is reachable.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  () => tool('/api/health'),
)

server.registerTool(
  'list_chaos_modes',
  {
    title: 'List chaos modes',
    description: 'List the failure modes that can be injected at the connector boundary.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  () => tool('/api/chaos-modes'),
)

server.registerTool(
  'get_evaluator',
  {
    title: 'Get evaluator',
    description:
      'Report the configured resilience judge (provider, model and whether credentials are present). ' +
      'Without credentials a deterministic rule-based judge scores runs instead.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  () => tool('/api/evaluator'),
)

server.registerTool(
  'run_experiment',
  {
    title: 'Run chaos experiment',
    description:
      'Run a single Preview experiment: inject the selected failures into the connector, call the agent and return the ' +
      'resilience report (score, verdict, findings, recommended fixes and the connector trace). Omit agentEndpoint to use ' +
      'the built-in demo agent. Supplied connector results are simulated, not evidence that a remote agent called a tool.',
    inputSchema: z
      .object({
        scenario: z.string().min(1).max(8000).describe('The user request the agent must handle.'),
        connectorName: z.string().max(100).optional().describe('Connector the chaos is injected into.'),
        modes: z
          .array(z.enum(CHAOS_MODES))
          .max(6)
          .optional()
          .describe('Failure modes to inject. An empty list runs a clean control experiment.'),
        latencyMs: z.number().int().min(0).max(30_000).optional().describe('Delay injected for the Latency mode.'),
        agentEndpoint: z
          .string()
          .optional()
          .describe('HTTPS (or loopback HTTP) URL of the agent under test. Omit to use the built-in demo agent.'),
        evaluatorModel: z.string().max(200).optional().describe('Per-run override of the judge model.'),
      })
      .strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ scenario, connectorName, modes, latencyMs, agentEndpoint, evaluatorModel }) => {
    const rejected = checkAgentEndpoint(agentEndpoint)
    if (rejected) return rejected
    return tool('/api/experiments', {
      method: 'POST',
      body: {
        scenario,
        ...(connectorName ? { connectorName } : {}),
        modes: modes ?? [],
        ...(latencyMs === undefined ? {} : { latencyMs }),
        ...(agentEndpoint ? { agentEndpoint } : {}),
        ...(evaluatorModel ? { evaluatorModel } : {}),
        ...(agentApiKey ? { agentApiKey } : {}),
      },
    })
  },
)

server.registerTool(
  'get_lab_capabilities',
  {
    title: 'Get laboratory capabilities',
    description:
      'Report the supported laboratory schema, execution modes, fault modes, assertion kinds, gateway status, ' +
      'allowlisted agent endpoints, operations and run limits.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  () => tool('/api/lab/capabilities'),
)

server.registerTool(
  'run_lab_experiment',
  {
    title: 'Run laboratory experiment',
    description:
      'Run a versioned laboratory experiment with evidence-backed assertions and return its outcome, tool-call trace, ' +
      'assertion results, findings and dimensions. Missing observations produce "inconclusive" rather than a fabricated pass.',
    inputSchema: z.object({ definition: definitionSchema }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ definition }) => {
    if (containsCredentials(definition)) {
      return failure('The definition must not contain credentials; set CHAOS_AGENT_API_KEY in the server environment.')
    }
    const rejected = checkAgentEndpoint(definition.agentEndpoint)
    if (rejected) return rejected
    return tool('/api/lab/run', {
      method: 'POST',
      body: { definition, ...(agentApiKey ? { agentApiKey } : {}) },
    })
  },
)

server.registerTool(
  'run_lab_suite',
  {
    title: 'Run laboratory suite',
    description:
      'Run a collection of saved regression tests (1..20) and return each result plus the aggregate outcome. ' +
      'Use this as a resilience gate for an agent change.',
    inputSchema: z
      .object({
        tests: z
          .array(z.object({ definition: definitionSchema }).strict())
          .min(1)
          .max(20)
          .describe('Saved tests, each wrapping a version 1 definition.'),
      })
      .strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ tests }) => {
    if (containsCredentials({ tests })) {
      return failure('The suite must not contain credentials; set CHAOS_AGENT_API_KEY in the server environment.')
    }
    for (const test of tests) {
      const rejected = checkAgentEndpoint(test.definition.agentEndpoint)
      if (rejected) return rejected
    }
    // The tests are run one at a time rather than through /api/lab/suite so that each run gets its own
    // deadline (a full suite exceeds any single-request timeout) and can carry the agent credential.
    const results = []
    try {
      for (const test of tests) {
        results.push(
          await callApi(baseUrl, '/api/lab/run', {
            method: 'POST',
            timeoutMs,
            body: { definition: test.definition, ...(agentApiKey ? { agentApiKey } : {}) },
          }),
        )
      }
    } catch (error) {
      return failure(error.message)
    }
    return json({ results, outcome: aggregateOutcome(results.map((result) => result?.outcome)) })
  },
)

await server.connect(new StdioServerTransport())
