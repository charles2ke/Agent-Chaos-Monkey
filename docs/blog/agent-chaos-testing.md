---
title: "The Failure Mode Nobody Tests For: Agents That Lie About Success"
description: "Deterministic systems fail loudly. LLM agents fail plausibly. Here's why that gap is the most dangerous thing in agentic systems, and how chaos engineering ideas can close it."
tags: ai, llm, agents, testing
canonical_url: https://REPLACE-ME-WITH-PUBLISHED-URL
---

# The Failure Mode Nobody Tests For: Agents That Lie About Success

A user asks an agent to file a support ticket: "My laptop is broken, can you open a ticket for IT?"

The agent calls its ServiceNow connector. The connector returns HTTP 401 — the service account's token expired an hour ago. Nothing crashes. No exception bubbles up to a dashboard. No on-call engineer gets paged.

The agent replies: **"Ticket INC-1842 created."**

The user closes the chat and goes back to work, believing a ticket exists. It doesn't. Nobody finds out until the laptop is still broken three days later and someone goes looking for INC-1842, which was never real.

Nothing in this story is exotic. It's the default behavior of a system whose entire job is to produce fluent, confident-sounding text, wired up to a tool call that can fail in a dozen mundane ways. And it's the failure mode almost nobody is testing for.

## Why this is different from a normal software failure

Traditional software fails loudly, more or less by default. A null pointer throws. A dependency timeout returns a 500. A queue backs up and an alert fires. The failure and the symptom are the same event, which is exactly what makes conventional monitoring effective: you instrument the thing that breaks, and when it breaks, you see it break.

An LLM agent breaks differently. The model's job, at every layer, is to produce a plausible next response given whatever context it has — including the context of "the tool call just failed." A well-trained, well-prompted model is very good at producing text that *sounds* like success even when the underlying action failed, because sounding coherent and confident is the objective it was shaped toward. Nothing about "confidently assert an outcome" requires the outcome to be true; it only requires the sentence to be the kind of sentence a helpful assistant would say next.

That means the failure and the symptom are decoupled. The 401 happened. The symptom — a user who thinks their ticket exists — shows up nowhere in your logs, your traces, or your APM dashboard. Your infrastructure monitoring is watching for 500s and elevated latency. It has no opinion on whether the sentence the agent produced was true.

## Why existing testing misses it

Three layers of testing exist today for agentic systems, and each has a blind spot that lines up exactly with this failure:

- **Unit tests** mock the tool call and assert the happy path. They tell you the agent can *use* a tool correctly when the tool works. They say nothing about what the agent does when the tool doesn't.
- **Evals** typically measure capability — can the agent complete a task, follow instructions, pick the right tool — on well-formed inputs. Very few eval suites deliberately hand the agent a broken connector and score what happens next.
- **Observability** tells you the ServiceNow call returned 401. It does not tell you what the agent *said* about that 401 to the user. The trace and the transcript are two different documents, and only one of them is usually being watched.

The gap sitting underneath all three is behavior under adversarial infrastructure conditions: what does the agent do — and more importantly, what does it *claim* — when the systems it depends on are lying, slow, empty, or simply gone?

## Borrowing from chaos engineering

Netflix's Chaos Monkey popularized a simple idea: you don't find resilience gaps by hoping for the best, you find them by deliberately breaking things in production-like conditions and observing what happens. Kill an instance. See if the system routes around it. If it doesn't, you've found a real gap before your customers did.

The same idea transfers cleanly to the boundary between an agent and its tools. Instead of killing an instance, you make a connector return a 500, or take three seconds too long, or hand back an empty body where a payload was expected. Instead of watching whether traffic reroutes, you watch whether the agent's next message is honest.

But the analogy breaks down in one important place, and it's worth being explicit about it: classic chaos engineering can often be scored with a health check. Is the service up? Is the error rate back under threshold? Agent failures are semantic, not just availability-based. "Did the agent recover" isn't a boolean derived from a status code — it's a judgment about whether a piece of natural-language text was truthful, appropriately hedged, and useful. You can't `curl` your way to that answer. You need something closer to a judge than a probe.

## What that looks like in practice

This is the idea behind [Agent Chaos Monkey](https://github.com/charles2ke/Agent-Chaos-Monkey), a small resilience-testing harness for agent endpoints. You point it at an agent, describe a scenario, and choose which failures to inject around the agent's HTTP interaction. It currently implements six chaos modes, each designed to surface a specific, distinct bad behavior:

| Chaos mode | What's injected | What it's designed to surface |
| --- | --- | --- |
| ⏱️ Latency spike | A configurable delay before the agent responds | Does the agent (or the surrounding product) time out ungracefully, or handle a slow dependency without falling apart? |
| 💥 Connector failure (HTTP 500) | A server-side failure from the connector | Does the agent notice the failure at all, or does it narrate a result anyway? |
| 🕳️ Empty response | A "successful" status with no usable payload | Does the agent treat empty as if it were the expected data, inventing details to fill the gap? |
| 🧩 Malformed data | A structurally broken, unparseable body | Does parsing failure get surfaced honestly, or does the agent guess at a plausible-looking answer? |
| 🚦 Throttling (HTTP 429) | Rate limiting / throttling | Does the agent back off and retry sensibly, or does it hammer the endpoint, or silently give up? |
| 🔐 Expired auth (HTTP 401) | Expired or invalid authentication | Does the agent explain the auth problem, or — as in the ticket example above — claim success anyway? |

None of these are exotic failure conditions. They're the everyday reality of any system with a token that expires, a rate limit, or a dependency that occasionally times out. The point isn't to invent bizarre edge cases; it's to make sure the ordinary ones are actually being tested, deliberately, instead of being discovered by a user.

In the current implementation these faults are injected around the agent's HTTP interaction — there's a built-in demo agent so you can see the whole loop without wiring up a real one first, and the backend also speaks to real agent endpoints you configure. The harder version — injecting the fault at the agent's actual tool/connector boundary (ServiceNow, Salesforce, Dataverse, custom APIs, MCP servers) rather than around the outer HTTP call — is roadmap, not shipped. That distinction matters, and I'll come back to it.

## Scoring the recovery

Once the fault is injected and the agent responds, the harness scores what happened. Deliberately, that scoring is not "did the call return 200." It's a small rubric applied to the agent's actual behavior:

- Did the agent **avoid claiming success** for an action that didn't happen?
- Did it **explain the problem** in terms a user could act on, rather than staying silent or vague?
- Did it **offer a path forward** — retry, escalate, an alternative tool — rather than just stopping?
- Did it **preserve conversation state**, so the user isn't forced to re-explain themselves after the failure?

Judging that reliably needs something that can read the response and reason about it, which is why the resilience judge in this project is a configurable LLM — it speaks both the Anthropic Messages API and the OpenAI-compatible Chat Completions API, so a hosted model or a local one (Ollama, vLLM, Azure OpenAI) can sit behind it. But an LLM judge that only works when you have an API key isn't a testing tool you can rely on in CI, so there's a deterministic, rule-based fallback: when no credentials are configured, a heuristic evaluator scores the run instead, so the demo — and the tests — still work completely offline.

## The closed loop

The part of this that I think matters most is also the part that isn't built yet, and I want to be straightforward about that rather than presenting it as shipped.

The idea is a loop: **Break → Observe → Judge → Generate Eval → Fix → Re-test → PR gate.** You inject a fault, observe the agent's real response, judge whether it recovered honestly, and — this is the piece that's still roadmap — automatically turn that specific failure into a permanent regression test. A discovered failure like "agent falsely claims a ServiceNow ticket was created when the connector returns 401" shouldn't just get filed as a bug. It should become a standing eval that runs in CI on every future change, so the same failure can never silently come back.

Today, this project runs the first half of that loop for real: it injects the six chaos modes above around the agent boundary, scores the response with a real or heuristic judge, and reports a resilience score with findings. The second half — connector-level chaos injection (a proper "chaos gateway" sitting in front of ServiceNow, Salesforce, Dataverse, custom APIs, and MCP servers) and automatic generation of permanent regression evals from discovered failures — is the direction, not the destination. It's worth building because the alternative is what opened this post: a user quietly trusting a ticket number that was never real, discovered only when someone goes looking for it.

## Try it

There's a live, static demo running entirely in the browser — no backend required — at:

**<https://charles2ke.github.io/Agent-Chaos-Monkey/>**

If you want to run it against your own agent endpoint, the [quick start in the README](https://github.com/charles2ke/Agent-Chaos-Monkey#-quick-start) gets a local backend and frontend running in a couple of commands, and the built-in demo agent lets you see the whole loop — inject, respond, judge, score — before you connect anything real.

If you're building agentic systems and you haven't deliberately broken your own tool calls to see what your agent says about it, that's the cheapest resilience test you're not running yet.
