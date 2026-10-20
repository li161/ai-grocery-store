import assert from "node:assert/strict";

export function validateGraph(tasks) {
  const byId = new Map();
  for (const task of tasks) {
    if (!task.id || byId.has(task.id)) throw new Error("Task IDs must be non-empty and unique");
    byId.set(task.id, task);
  }
  for (const task of tasks) {
    const deps = task.dependsOn ?? [];
    if (new Set(deps).size !== deps.length) throw new Error("Duplicate dependencies: " + task.id);
    for (const dep of deps) {
      if (!byId.has(dep)) throw new Error("Unknown dependency " + dep);
      if (dep === task.id) throw new Error("Self dependency: " + dep);
    }
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error("Dependency cycle at " + id);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of byId.get(id).dependsOn ?? []) visit(dep);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
  return true;
}

export class HarnessRuntime {
  constructor() { this.idempotency = new Map(); }

  async execute(runId, tasks, options = {}) {
    if (options.idempotencyKey && this.idempotency.has(options.idempotencyKey)) {
      return this.idempotency.get(options.idempotencyKey);
    }
    validateGraph(tasks);
    const started = Date.now();
    const concurrency = Math.max(1, options.concurrency ?? 2);
    const byId = new Map(tasks.map(t => [t.id, t]));
    const records = new Map(tasks.map(t => [t.id, { id: t.id, status: "pending" }]));
    const values = new Map(), pending = new Set(byId.keys()), events = [];
    const emit = (type, taskId, detail) => {
      const event = { type, runId, taskId, at: new Date().toISOString(), detail };
      events.push(event);
      options.onEvent?.(event);
    };
    emit("run.started");

    async function runTask(task) {
      const record = records.get(task.id);
      record.status = "running";
      record.startedAt = new Date().toISOString();
      emit("task.started", task.id);
      const controller = new AbortController();
      let timer;
      try {
        const work = Promise.resolve().then(() => task.run({
          runId, taskId: task.id, signal: controller.signal,
          dependencyResults: Object.fromEntries((task.dependsOn ?? []).map(id => [id, values.get(id)]))
        }));
        const result = task.timeoutMs
          ? await Promise.race([work, new Promise((_, reject) => {
              timer = setTimeout(() => {
                controller.abort();
                reject(new Error("Task timed out after " + task.timeoutMs + "ms"));
              }, task.timeoutMs);
            })])
          : await work;
        values.set(task.id, result);
        record.result = result;
        record.status = "succeeded";
        record.completedAt = new Date().toISOString();
        emit("task.succeeded", task.id);
      } catch (error) {
        record.status = "failed";
        record.error = error instanceof Error ? error.message : String(error);
        record.completedAt = new Date().toISOString();
        emit("task.failed", task.id, record.error);
      } finally {
        clearTimeout(timer);
      }
    }

    while (pending.size) {
      let progressed = false;
      for (const id of [...pending]) {
        const task = byId.get(id);
        if ((task.dependsOn ?? []).some(dep => ["failed", "skipped"].includes(records.get(dep).status))) {
          pending.delete(id);
          const rec = records.get(id);
          rec.status = "skipped";
          rec.error = "A dependency did not succeed";
          rec.completedAt = new Date().toISOString();
          emit("task.skipped", id, rec.error);
          progressed = true;
        }
      }
      const ready = [...pending].filter(id =>
        (byId.get(id).dependsOn ?? []).every(dep => records.get(dep).status === "succeeded"));
      if (!ready.length) {
        if (!pending.size) break;
        if (!progressed) throw new Error("Scheduler stalled");
        continue;
      }
      for (let i = 0; i < ready.length; i += concurrency) {
        const batch = ready.slice(i, i + concurrency);
        batch.forEach(id => pending.delete(id));
        await Promise.all(batch.map(id => runTask(byId.get(id))));
      }
    }
    const taskRecords = tasks.map(t => records.get(t.id));
    const result = {
      runId,
      status: taskRecords.every(t => t.status === "succeeded") ? "succeeded" : "failed",
      tasks: taskRecords,
      events,
      durationMs: Date.now() - started
    };
    emit("run.completed", undefined, result.status);
    if (options.idempotencyKey) this.idempotency.set(options.idempotencyKey, result);
    return result;
  }
}

export function buildTasks(input) {
  return [
    { id: "inventory", run: async () => ({
      finding: input.inventorySignal.includes("high")
        ? "Inventory risk is elevated; review replenishment and stock accuracy."
        : "No high inventory risk detected in the supplied signal."
    }) },
    { id: "platform", run: async () => ({
      risk: input.platformSignal.includes("change")
        ? "A platform rule change is reported; verify the official notice before acting."
        : "No platform change detected in the supplied signal."
    }) },
    { id: "summary", dependsOn: ["inventory", "platform"], run: ({ dependencyResults }) => ({
      date: input.date,
      inventoryFinding: dependencyResults.inventory.finding,
      platformRisk: dependencyResults.platform.risk,
      action: "Assign an owner to verify both signals, record the evidence URL, and set a follow-up time."
    }) }
  ];
}

const input = {
  date: "2026-10-20",
  inventorySignal: "high stock variance",
  platformSignal: "change reported in merchant rules"
};

if (process.argv[1]?.endsWith("custom-runtime.mjs")) {
  const runtime = new HarnessRuntime();
  const result = await runtime.execute("retail-brief-custom", buildTasks(input), {
    concurrency: 2,
    idempotencyKey: "retail-brief:2026-10-20",
    onEvent: event => console.log("[" + event.type + "]", event.taskId ?? event.runId, event.detail ?? "")
  });
  console.log("\n=== Custom Harness Runtime result ===\n" + JSON.stringify(result, null, 2));
  assert.equal(result.status, "succeeded");
}
