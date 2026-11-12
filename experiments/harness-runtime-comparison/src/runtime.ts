export type TaskStatus = "succeeded" | "failed" | "timed_out" | "skipped";
export type TaskContext = { runId: string; signal: AbortSignal; dependencies: ReadonlyMap<string, unknown> };
export type TaskDefinition = { id: string; dependsOn?: string[]; timeoutMs?: number; run: (context: TaskContext) => Promise<unknown> | unknown };
export type TaskRecord = { id: string; status: TaskStatus; output?: unknown; error?: string; durationMs: number };
export type RuntimeEvent = { type: "task_started" | "task_finished" | "run_finished"; runId: string; taskId?: string; status?: TaskStatus | "succeeded" | "failed"; at: string };
export type RuntimeResult = { runId: string; status: "succeeded" | "failed"; tasks: TaskRecord[] };
export type RuntimeOptions = { concurrency?: number; onEvent?: (event: RuntimeEvent) => void };

export function validateGraph(tasks: TaskDefinition[]): true {
  const byId = new Map<string, TaskDefinition>();
  for (const task of tasks) {
    if (!task.id?.trim() || byId.has(task.id)) throw new Error("Task IDs must be non-empty and unique");
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
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error("Dependency cycle at " + id);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) visit(dep);
    visiting.delete(id); visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
  return true;
}

export class HarnessRuntime {
  private readonly completed = new Map<string, RuntimeResult>();

  async execute(runId: string, tasks: TaskDefinition[], options: RuntimeOptions = {}): Promise<RuntimeResult> {
    const cached = this.completed.get(runId);
    if (cached) return structuredClone(cached);
    validateGraph(tasks);
    const concurrency = Math.max(1, Math.floor(options.concurrency ?? 4));
    const pending = new Map(tasks.map(task => [task.id, task]));
    const records = new Map<string, TaskRecord>();
    const outputs = new Map<string, unknown>();
    const emit = (event: RuntimeEvent) => options.onEvent?.(event);
    const finishSkipped = (task: TaskDefinition, reason: string) => {
      records.set(task.id, { id: task.id, status: "skipped", error: reason, durationMs: 0 });
      pending.delete(task.id);
      emit({ type: "task_finished", runId, taskId: task.id, status: "skipped", at: new Date().toISOString() });
    };

    while (pending.size) {
      let changed = false;
      for (const task of [...pending.values()]) {
        const deps = task.dependsOn ?? [];
        const failedDep = deps.find(dep => ["failed", "timed_out", "skipped"].includes(records.get(dep)?.status ?? ""));
        if (failedDep) { finishSkipped(task, `Dependency ${failedDep} did not succeed`); changed = true; }
      }
      const ready = [...pending.values()].filter(task => (task.dependsOn ?? []).every(dep => records.get(dep)?.status === "succeeded"));
      if (!ready.length) {
        if (pending.size && !changed) throw new Error("Scheduler deadlock: no runnable tasks remain");
        continue;
      }
      for (let i = 0; i < ready.length; i += concurrency) {
        const batch = ready.slice(i, i + concurrency);
        await Promise.all(batch.map(async task => {
          pending.delete(task.id);
          const started = Date.now();
          const controller = new AbortController();
          emit({ type: "task_started", runId, taskId: task.id, at: new Date().toISOString() });
          let timeout: ReturnType<typeof setTimeout> | undefined;
          try {
            const work = Promise.resolve(task.run({ runId, signal: controller.signal, dependencies: new Map((task.dependsOn ?? []).map(dep => [dep, outputs.get(dep)])) }));
            const output = task.timeoutMs && task.timeoutMs > 0
              ? await Promise.race([work, new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error(`Task timed out after ${task.timeoutMs}ms`)); }, task.timeoutMs); })])
              : await work;
            outputs.set(task.id, output);
            records.set(task.id, { id: task.id, status: "succeeded", output, durationMs: Date.now() - started });
            emit({ type: "task_finished", runId, taskId: task.id, status: "succeeded", at: new Date().toISOString() });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const status: TaskStatus = message.startsWith("Task timed out") ? "timed_out" : "failed";
            records.set(task.id, { id: task.id, status, error: message, durationMs: Date.now() - started });
            emit({ type: "task_finished", runId, taskId: task.id, status, at: new Date().toISOString() });
          } finally { if (timeout) clearTimeout(timeout); }
        }));
      }
    }
    const taskRecords = tasks.map(task => records.get(task.id)!);
    const result: RuntimeResult = { runId, status: taskRecords.every(task => task.status === "succeeded") ? "succeeded" : "failed", tasks: taskRecords };
    emit({ type: "run_finished", runId, status: result.status, at: new Date().toISOString() });
    this.completed.set(runId, structuredClone(result));
    return result;
  }
}
