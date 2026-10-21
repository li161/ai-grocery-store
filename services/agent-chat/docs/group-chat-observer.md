# Group Chat Observer: implementation and verification

## Scope in this change

This change adds the first backend slice for full group-chat monitoring:

- Append-only event log with per-conversation sequence numbers and event-ID deduplication.
- PostgreSQL persistence when `DATABASE_URL` is configured; volatile in-memory mode for local development.
- Server-Sent Events (SSE) stream with replay cursor, reconnect support through `Last-Event-ID`, and heartbeat comments.
- Deterministic `@mention` routing, `@all` broadcast, and prerequisite closure for selected agents.
- Observer rule: task/agent failure or skipped task creates a `conversation.alert` event.
- Existing Harness DAG scheduler remains the owner of dependency execution and failure isolation.

## Event envelope

```json
{
  "eventId": "unique-id",
  "conversationId": "room-001",
  "sequence": 17,
  "type": "agent.completed",
  "timestamp": "2026-10-21T05:00:00.000Z",
  "source": { "type": "agent", "id": "buyer" },
  "correlationId": "run-id",
  "causationId": null,
  "payload": { "agentId": "buyer" }
}
```

`sequence` is monotonically increasing within a conversation. Use `eventId` for deduplication and `correlationId` to group events caused by the same user request. Do not treat an event stream as the authoritative task state; query the task endpoint for the current run snapshot.

## HTTP interfaces

### Start a run

Existing endpoint remains `POST /api/chat`. Optional fields:

- `conversationId` (or legacy `roomId`) identifies the room; defaults to `default`.
- `message` supports `@AgentName` or `@all`.
- `Idempotency-Key` continues to deduplicate run creation.

An unmatched explicit mention returns HTTP 422 rather than silently routing to every agent. A matched mention routes to that agent and any declared prerequisites. Without a mention, existing default routing is unchanged.

### Subscribe to monitoring events

`GET /api/conversations/:conversationId/events?after=0`

Response is `text/event-stream`. Each event has:

```text
id: 17
event: agent.completed
data: {"eventId":"...","conversationId":"room-001","sequence":17,...}
```

The client can reconnect with `Last-Event-ID` or supply `after`. The endpoint replays at most 500 events per connection; pagination / bounded retention should be added before event volumes grow significantly.

### Existing task snapshot

`GET /api/tasks/:taskId` remains the snapshot endpoint for current task/run state.

## Current rule behavior

- `task.failed` / `agent.failed` / `task.skipped` / `agent.timeout` produce `conversation.alert`.
- Failure alert creation is deterministic and does not invoke DeepSeek.
- DAG dependency scheduling stays inside `executeAgentRun`; the observer does not duplicate the scheduler.
- `@all` broadcasts to the provided Agent set.
- An explicit unknown mention returns 422 for a visible, correctable failure.

## Verification

The new test file covers sequence ordering, duplicate event IDs, replay filtering, failure alerts, mention routing, dependency closure, broadcast and unresolved mentions. The package `check` script now syntax-checks both new modules.

Run in `services/agent-chat`:

```bash
npm install
npm run check
npm test
```

The repository CI workflow is configured to run these commands for changes under `services/agent-chat/**`. A successful GitHub Actions run is the acceptance evidence; until it completes, CI status is not claimed.

## Known limits / follow-up

1. The in-process subscriber fan-out is per service process. For multiple API instances, add a cross-instance fan-out mechanism (e.g. PostgreSQL LISTEN/NOTIFY or Redis Streams) while retaining the durable event log.
2. The in-memory fallback is not durable and must not be used for production monitoring.
3. The initial SSE endpoint replays at most 500 events per connection; add paginated replay / retention policy for long-lived rooms.
4. Authentication and per-conversation authorization must be enforced at the gateway or added to this service before exposing private rooms to untrusted clients.
5. Agent internal chain-of-thought is intentionally not emitted. Events should expose lifecycle metadata, tool names and safe summaries only.
6. Existing Agent timeout is currently surfaced through the failure lifecycle; a dedicated timeout event and configurable retry/backoff policy can be added as a separate change.
7. Automatic side effects beyond routing/scheduling (e.g. changing inventory or placing orders) must require explicit authorization and idempotency protection.
