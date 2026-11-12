import { HarnessRuntime } from "./runtime.js";
import { buildTasks, demoInput } from "./workflow.js";

const events: string[] = [];
const result = await new HarnessRuntime().execute("retail-brief-demo", buildTasks(demoInput), {
  concurrency: 2,
  onEvent: event => events.push(`${event.type}: ${event.taskId ?? event.runId} ${event.status ?? ""}`.trim())
});
console.log(JSON.stringify({ events, result }, null, 2));
if (result.status !== "succeeded") process.exitCode = 1;
