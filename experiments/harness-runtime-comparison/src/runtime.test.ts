import assert from "node:assert/strict";
import test from "node:test";
import { HarnessRuntime, validateGraph, type TaskDefinition } from "./runtime.js";
import { buildTasks, demoInput } from "./workflow.js";

test("rejects duplicate IDs, missing dependencies, and cycles", () => {
  assert.throws(() => validateGraph([{ id: "x", run: () => 1 }, { id: "x", run: () => 2 }]), /unique/);
  assert.throws(() => validateGraph([{ id: "x", dependsOn: ["missing"], run: () => 1 }]), /Unknown dependency/);
  assert.throws(() => validateGraph([
    { id: "x", dependsOn: ["y"], run: () => 1 },
    { id: "y", dependsOn: ["x"], run: () => 2 }
  ]), /cycle/);
});

test("runs independent tasks before their dependent summary", async () => {
  const result = await new HarnessRuntime().execute("success", buildTasks(demoInput), { concurrency: 2 });
  assert.equal(result.status, "succeeded");
  assert.deepEqual(result.tasks.map(task => task.status), ["succeeded", "succeeded", "succeeded"]);
  assert.equal((result.tasks[2].output as { date: string }).date, demoInput.date);
});

test("skips dependent tasks after a dependency fails", async () => {
  const tasks: TaskDefinition[] = [
    { id: "broken", run: () => { throw new Error("boom"); } },
    { id: "dependent", dependsOn: ["broken"], run: () => "should not run" }
  ];
  const result = await new HarnessRuntime().execute("failure", tasks);
  assert.equal(result.tasks[0].status, "failed");
  assert.equal(result.tasks[1].status, "skipped");
  assert.equal(result.status, "failed");
});

test("enforces a timeout and supports process-local idempotency", async () => {
  let calls = 0;
  const runtime = new HarnessRuntime();
  const task: TaskDefinition[] = [{ id: "slow", timeoutMs: 10, run: () => new Promise(resolve => setTimeout(() => resolve(++calls), 50)) }];
  const first = await runtime.execute("same-key", task);
  const second = await runtime.execute("same-key", task);
  assert.equal(first.tasks[0].status, "timed_out");
  assert.deepEqual(second, first);
  assert.equal(calls, 0);
});
