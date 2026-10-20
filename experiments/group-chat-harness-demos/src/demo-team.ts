type AgentTask = { id: string; role: string; dependsOn: string[]; run: (deps: Record<string, string>) => Promise<string> };
type Result = { id: string; status: "succeeded" | "failed" | "skipped"; output?: string; error?: string };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const tasks: AgentTask[] = [
  { id: "research", role: "研究员", dependsOn: [], run: async () => { await sleep(350); return "找到 3 个候选方案；证据完整度中等"; } },
  { id: "engineering", role: "开发者", dependsOn: [], run: async () => { await sleep(250); return "实现成本低；需要增加超时与幂等测试"; } },
  { id: "risk", role: "审查员", dependsOn: [], run: async () => { await sleep(180); return "主要风险：任务重复执行和上下文丢失"; } },
  { id: "synthesis", role: "协调员", dependsOn: ["research", "engineering", "risk"], run: async (deps) => {
    return ["团队结论：先做可靠执行闭环，再扩展多 Agent 能力。", ...Object.entries(deps).map(([id, output]) => `- ${id}: ${output}`)].join("\n");
  } },
];

async function runTeam(): Promise<Result[]> {
  const results = new Map<string, Result>();
  const pending = new Map(tasks.map((task) => [task.id, task]));
  while (pending.size) {
    const ready = [...pending.values()].filter((task) => task.dependsOn.every((id) => results.has(id)));
    if (!ready.length) throw new Error("DAG deadlock: unknown dependency or cycle");
    // A batch is launched concurrently. Aggregation waits for all dependencies.
    await Promise.all(ready.map(async (task) => {
      const failedDep = task.dependsOn.map((id) => results.get(id)!).find((r) => r.status !== "succeeded");
      if (failedDep) {
        results.set(task.id, { id: task.id, status: "skipped", error: `dependency ${failedDep.id} did not succeed` });
      } else {
        try {
          const deps = Object.fromEntries(task.dependsOn.map((id) => [id, results.get(id)!.output ?? ""]));
          results.set(task.id, { id: task.id, status: "succeeded", output: await task.run(deps) });
        } catch (error) {
          results.set(task.id, { id: task.id, status: "failed", error: error instanceof Error ? error.message : String(error) });
        }
      }
      pending.delete(task.id);
    }));
  }
  return tasks.map((task) => results.get(task.id)!);
}

console.log("\n=== Demo 2: Collaborative Team DAG ===");
const started = Date.now();
const results = await runTeam();
for (const result of results) {
  console.log(`\n[${result.status.toUpperCase()}] ${result.id}`);
  if (result.output) console.log(result.output);
  if (result.error) console.log("reason:", result.error);
}
console.log(`\nTotal elapsed: ${Date.now() - started}ms (three specialist tasks run in parallel)`);
console.log("观察点：消息路由解决“谁来回答”；DAG Harness 解决“谁先做、哪些可并行、何时汇总”。\n");
