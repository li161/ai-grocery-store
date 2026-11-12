# Harness Runtime vs LangGraph — TypeScript comparison lab

This independent lab executes the same deterministic retail-operations brief in two ways:

1. **Custom Harness Runtime** — explicit DAG validation, dependency scheduling, bounded concurrency, task timeouts, dependency-failure propagation, lifecycle events, and process-local idempotency.
2. **LangGraph** — the equivalent state graph with two parallel specialist nodes and a summary join.

The fixture intentionally does not call an LLM. This isolates orchestration mechanics from model quality, provider latency, and token cost.

## Requirements

- Node.js 22+
- npm

## Run

From this directory:

```bash
npm install
npm run typecheck
npm test
npm run demo
npm run demo:langgraph
```

## Files

- `src/runtime.ts`: custom runtime and DAG validation.
- `src/workflow.ts`: shared typed input and deterministic task definitions.
- `src/demo.ts`: custom runtime demo with lifecycle events.
- `src/langgraph-demo.ts`: LangGraph equivalent using the same fixture.
- `src/runtime.test.ts`: tests for graph validation, dependency order/failure, timeout and idempotency.

## What this comparison demonstrates

| Concern | Custom runtime | LangGraph |
|---|---|---|
| Graph declaration | Task definitions + `dependsOn` | StateGraph nodes and edges |
| DAG validation | Explicitly implemented | Graph construction/compile |
| Dependency scheduling | Application code | Framework executor |
| Timeout policy | Per-task timeout in this lab | Must be added around node execution/configured separately |
| Failure propagation | Explicit failed/timed-out/skipped states | Framework execution/error semantics |
| Idempotency | Process-local completed-run cache | Not provided by this example; durable checkpointing is a separate concern |
| Observability | Callback lifecycle events | Can be integrated with LangSmith or custom callbacks |

## Honest limitations

This is an executable comparison scaffold, not a production orchestration service. State and idempotency are in memory and are lost on restart; the idempotency cache is process-local and has no concurrent duplicate-run lock; there is no database, durable queue, cross-process lease, authentication, retry policy, rate limiter, or production tracing. An AbortSignal can notify work to stop, but cannot forcibly terminate a task that ignores it. The timeout test intentionally checks the timeout result; the underlying example promise is not forcibly cancelled.

The LangGraph example has no checkpointer configured and no LLM/tool calls. Do not interpret this as a benchmark of framework speed or model quality. Run the commands locally/CI and compare the code paths before choosing an implementation.
