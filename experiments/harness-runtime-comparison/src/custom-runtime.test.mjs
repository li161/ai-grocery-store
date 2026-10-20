import test from "node:test";
import assert from "node:assert/strict";
import { HarnessRuntime, buildTasks, validateGraph } from "./custom-runtime.mjs";

test("rejects duplicate IDs, missing dependencies and cycles", () => {
  assert.throws(() => validateGraph([{ id: "x", run: () => 1 }, { id: "x", run: () => 2 }]), /unique/);
  assert.throws(() => validateGraph([{ id: "x", dependsOn: ["missing"], run: () => 1 }]), /Unknown dependency/);
  assert.throws(() => validateGraph([
    { id: "x", dependsOn: ["y"], run: () => 1 },
    { id: "y", dependsOn: ["x"], run: () => 2 }
  ]), /cycle/);
});

test("runs two independent tasks before their dependent summary", async () => {
  const runtime = new HarnessRuntime();
  const result = await runtime.execute("test-run", buildTasks({
    date: "2026-10-20",
    inventorySignal: "high variance",
    platformSignal: "change reported"
  }), { concurrency: 2 });
  assert.equal(result.status, "succeeded");
  assert.deepEqual(result.tasks.map(t => t.status), ["succeeded", "succeeded", "succeeded"]);
  assert.match(result.tasks[2].result.inventoryFinding, /elevated/);
  assert.match(result.tasks[2].result.platformRisk, /verify the official notice/);
});

test("skips dependent work after failure while allowing unrelated work", async () => {
  const runtime = new HarnessRuntime();
  let unrelatedRan = false;
  const result = await runtime.execute("failure-run", [
    { id: "failure", run: () => { throw new Error("expected failure"); } },
    { id: "dependent", dependsOn: ["failure"], run: () => "should not run" },
    { id: "unrelated", run: () => { unrelatedRan = true; return "ok"; } }
  ]);
  assert.equal(result.status, "failed");
  assert.equal(result.tasks.find(t => t.id === "dependent").status, "skipped");
  assert.equal(unrelatedRan, true);
});

test("caches completed runs by process-local idempotency key", async () => {
  const runtime = new HarnessRuntime();
  let count = 0;
  const tasks = [{ id: "once", run: () => ++count }];
  const first = await runtime.execute("one", tasks, { idempotencyKey: "same-key" });
  const second = await runtime.execute("two", tasks, { idempotencyKey: "same-key" });
  assert.equal(count, 1);
  assert.equal(second, first);
});

test("marks a timed-out task as failed", async () => {
  const runtime = new HarnessRuntime();
  const result = await runtime.execute("timeout-run", [{
    id: "slow",
    timeoutMs: 5,
    run: () => new Promise(resolve => setTimeout(() => resolve("late"), 40))
  }]);
  assert.equal(result.tasks[0].status, "failed");
  assert.match(result.tasks[0].error, /timed out/);
});
