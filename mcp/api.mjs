// Shared helpers for the Agent Chaos Monkey MCP server: URL validation, redaction
// and API calls. Kept separate from the server wiring so they can be unit tested.

const SENSITIVE_KEY =
  /^(?:agentApiKey|api[-_]?key|authorization|password|secret|token|access[-_]?token|refresh[-_]?token|cookie|credential|gatewayToken)$/i

/** Rejects URLs that carry credentials or that would send a token over plaintext HTTP. */
export function parseApiUrl(value) {
  const url = new URL(value)
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  ) {
    throw new Error('API URL must use HTTPS (or loopback HTTP), without credentials, query, or fragment.')
  }
  return url
}

/** Strips credentials, bearer tokens and URL secrets from anything returned to the model. */
export function redact(value, token) {
  if (typeof value === 'string') {
    let safe = token ? value.split(token).join('[REDACTED]') : value
    safe = safe.replace(/https?:\/\/[^\s"'<>]+/gi, (text) => {
      try {
        const url = new URL(text)
        url.username = ''
        url.password = ''
        url.search = ''
        url.hash = ''
        return url.toString()
      } catch {
        return '[REDACTED URL]'
      }
    })
    return safe
      .replace(/\b(?:Bearer|Basic)\s+[^\s"',;]+/gi, '[REDACTED]')
      .replace(
        /((?:api[-_]?key|password|secret|token|authorization)\s*["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi,
        '$1[REDACTED]',
      )
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, token))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(item, token)]),
    )
  }
  return value
}

/** True when the payload carries a credential the caller should supply through the environment instead. */
export function containsCredentials(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, item]) => SENSITIVE_KEY.test(key) || containsCredentials(item))
}

/** Calls the Chaos API and returns the parsed JSON body, or throws a message safe to show a model. */
export async function callApi(baseUrl, path, { method = 'GET', body, timeoutMs = 120_000 } = {}) {
  let response
  try {
    response = await fetch(new URL(path, baseUrl), {
      method,
      redirect: 'error',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new Error(
      ['TimeoutError', 'AbortError'].includes(error?.name)
        ? `The Chaos API did not answer within ${timeoutMs} ms; no resilience conclusion was made.`
        : `The Chaos API at ${baseUrl} is unreachable. Start it with "cd backend/ChaosMonkey.Api && dotnet run".`,
    )
  }
  const text = await response.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`The Chaos API returned a non-JSON body (HTTP ${response.status}).`)
  }
  if (!response.ok) {
    const detail = parsed?.errors ?? parsed?.error ?? parsed?.detail
    throw new Error(
      `The Chaos API returned HTTP ${response.status}: ${JSON.stringify(redact(detail ?? parsed ?? ''))}`,
    )
  }
  return parsed
}
