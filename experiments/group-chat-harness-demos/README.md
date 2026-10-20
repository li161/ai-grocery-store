# Group Chat Harness: Two Hands-on Demos

Two deterministic, dependency-light demos to learn the difference between **message routing** and **collaborative task execution**. They do not call an LLM API; outputs are predictable so you can inspect the Harness mechanics first.

## Run

Requires Node.js 22+.

```bash
npm install
npm run typecheck
npm test
npm run demo
npm run demo:team
```

## Demo 1 — Message Router

File: `src/demo-router.ts`

Routing precedence:
1. Explicit `@mention`
2. Intent/role/skill match
3. Room broadcast (excluding sender)

Learn: recipient selection, role capability registry, and why routing alone is not a task orchestration system.

## Demo 2 — Agent Team DAG

File: `src/demo-team.ts`

Three specialists (research, engineering, risk) run concurrently; the coordinator waits for all three and synthesizes the result.

Learn: task DAG, dependency barriers, parallel scheduling, result aggregation, and the distinction between failed and skipped work.

## What is intentionally not implemented

These are teaching demos, not production group chat: no LLM calls, persistence, streaming UI, durable queue, cross-process idempotency, permission approval, retry policy, or restart recovery. The second demo demonstrates the DAG concept with a small in-memory scheduler; it is not a replacement for the existing Harness Runtime comparison experiment.

## Suggested 20-minute exercise

1. Change the message in Demo 1 and predict recipients before running.
2. Add a `tester` agent to the router and give it a `test` skill.
3. In Demo 2, make `risk` fail and observe why the synthesis step should not silently run with missing inputs. Then add an explicit fallback policy.
4. Change specialist delays and compare total time with serial execution.
5. Add a `@reviewer` mention to the router, then sketch how the routed message would create a task in the DAG.

The core mental model: **Router answers “who receives this?”; Harness answers “what runs, in what order, under which constraints, and how do we know it finished?”**
