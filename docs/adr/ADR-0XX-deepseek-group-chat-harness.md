# ADR: DeepSeek Harness-inspired group chat runtime

- Status: Proposed implementation baseline
- Date: 2026-10-20

## Context

The existing `services/agent-chat` already has a DeepSeek API call path, DAG validation/scheduling, task persistence, idempotency, and per-agent task status. It is not yet a full conversational Harness: model calls do not execute a bounded multi-step tool loop, group mentions/broadcast are not a first-class routing contract, and durable session events are not a shared abstraction.

DeepSeek Harness is a developer-preview project built around Cordis plugins, an Agent Loop, Tool Registry, and append-only session events. Its API is evolving quickly, so the grocery-store project should adopt the architectural seams first rather than tightly coupling business code to an unstable upstream runtime.

## Decision

1. Keep the existing Node.js service, task scheduler, and TaskStore.
2. Add a vendor-neutral AgentLoop contract; isolate DeepSeek-specific API details behind a model adapter.
3. Add a guarded ToolRegistry. Model-generated tool calls are untrusted input; unknown tools and denied calls fail closed.
4. Add an append-only SessionLog interface. The first in-memory adapter is for local development and tests only; production must use a durable adapter.
5. Add deterministic routing for explicit mentions, broadcast, and team-planning modes. Explicit mentions take precedence over automatic routing.
6. Keep task DAG scheduling separate from per-agent model/tool execution.
7. Ship in small PRs with tests and avoid claiming production readiness until HTTP integration, persistent event storage, cancellation, and recovery tests are complete.

## Consequences

- Agent loop and routing can be tested without live DeepSeek credentials.
- Model vendors can be swapped without rewriting scheduling or business tools.
- The first slice is not yet a complete production group-chat feature: it does not add HTTP/SSE endpoints, PostgreSQL-backed session events, frontend integration, or automatic task-plan generation.
- Tool schemas are passed to the model, but this initial registry does not implement a complete JSON Schema validator. Individual tools must validate arguments before side effects.
