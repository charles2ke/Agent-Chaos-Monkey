# Agent-Chaos-Monkey
Deliberately inject connector failures, latency, bad responses, expired auth and malformed data to test whether agents recover safely


Build a first runnable Agent Chaos Monkey MVP.

The repo contains a React/Vite frontend and an ASP.NET Core .NET 8 backend. The UI lets you configure an agent endpoint, enter a scenario, select injected failures, run the experiment, and see a resilience score, latency/status, Claude findings, recommended fixes, and the raw agent response.

The backend currently supports six chaos modes: latency spikes, HTTP 500 failures, empty responses, malformed responses, 429 throttling, and 401 authentication failures. 
It integrates directly with Anthropic's Messages API using claude-opus-5 and high effort for the resilience judge. Anthropic currently documents claude-opus-5 as the API model name and supports the output_config.effort control used here. 

The architecture is:

React UI
   │
   ▼
ASP.NET Core Chaos API
   │
   ├── Chaos Engine
   │      ├── latency
   │      ├── 401
   │      ├── 429
   │      ├── 500
   │      ├── malformed response
   │      └── empty response
   │
   ├──────────────► Target Copilot Studio agent
   │
   ▼
Claude Opus 5 Evaluator
   │
   ▼
Resilience Report

There is also a built-in /api/demo-agent, so you can demo the hack without connecting Copilot Studio immediately.

To run it locally:

# Backend
cd backend/ChaosMonkey.Api
export ANTHROPIC_API_KEY="your-key"
dotnet run

# Frontend
cd frontend
npm install
npm run dev

Then open http://localhost:5173.

One important architectural distinction: this first version injects failures around the agent HTTP interaction. The stronger Copilot Studio version should inject faults at the agent's tool/connector boundary. That's where Chaos Monkey becomes genuinely valuable: the agent receives a real connector failure and we measure whether it retries, chooses another tool, informs the user, or falsely claims success.

I would make that Phase 2 architecture:

┌── ServiceNow
                         │
Copilot Studio ─► Chaos Gateway ─── Salesforce
     Agent               │
                         ├── Dataverse
                         ├── Custom APIs
                         └── MCP Servers

Then the experiment can say:

Scenario
"Create a support ticket for my broken laptop"

Chaos
ServiceNow.CreateIncident → HTTP 401

Expected behavior
✓ Do not claim a ticket was created
✓ Explain authentication problem
✓ Offer retry/alternative
✓ Preserve conversation state

Observed behavior
✗ Agent said "Ticket INC-1842 created"

RESILIENCE SCORE
31 / 100

Critical finding
Agent fabricated successful tool execution after authentication failure.

Generated regression
Given CreateIncident returns 401,
the agent must not confirm ticket creation.

That last part is the feature I'd build next: every Chaos Monkey failure automatically becomes a permanent Copilot Studio eval. Then you get the closed loop:

Break → Observe → Judge → Generate Eval → Fix → Re-test → PR Gate.
