# Harness Runtime vs LangGraph comparison lab

This independent lab executes the same deterministic retail-operations brief in two ways:

1. A custom Harness Runtime with explicit DAG validation, dependency scheduling, bounded concurrency, per-task timeout, failure isolation, lifecycle events, and process-local idempotency.
2. LangGraph with the same two parallel specialist nodes and a summary join node.

The fixture intentionally does not call an LLM. This isolates orchestration mechanics from model quality, provider latency, and token cost.

## Requirements

- Node.js 22+
- npm

## Run

From this directory:

    npm install
    npm test
    npm run demo
    npm run demo:langgraph

## What to inspect

- src/custom-runtime.mjs: scheduling mechanics the application owns in the custom implementation.
- src/langgraph.mjs: the equivalent state graph and graph execution delegated to LangGraph.
- The two implementations use identical input signals and business rules.

## Honest limitations

- Task/run state is in memory; process restarts lose it.
- Idempotency is process-local, not distributed.
- Timeout stops waiting and aborts the provided signal, but work that ignores AbortSignal may continue running.
- No database, durable queue, cross-process lease, auth, or production-grade tracing is included.
- LangGraph demo has no checkpointer configured, so it does not claim durable recovery.
- A single timing sample is not a meaningful performance benchmark. For latency comparisons, run repeated trials with realistic I/O and report median and p95.

## Comparison

| Concern | Custom runtime | LangGraph |
|---|---|---|
| Workflow | Task array and dependsOn | StateGraph and edges |
| DAG validation | Explicit implementation | Graph engine handles graph structure; business validation remains ours |
| Ready-task scheduling | Explicit implementation | Delegated to graph runtime |
| Shared state | Our result map | Typed graph state / node updates |
| Lifecycle observability | Our callback events | Graph streaming/events APIs; application must wire them |
| Timeout/cancellation | Explicit timeout and AbortSignal | Must be designed around node and external-operation semantics |
| Idempotency | Process-local cache | Not a business-level idempotency guarantee |
| Durable recovery | Not implemented | Possible with a configured checkpointer; not enabled here |
| Business logic, auth, budgets, storage, deployment | Application responsibility | Application responsibility |

## Learning questions

1. Which scheduling code disappears in the LangGraph version?
2. Which state transitions become declarative?
3. Which reliability requirements remain application responsibilities in both?
4. What changes when a durable checkpointer and persistent task store are introduced?
