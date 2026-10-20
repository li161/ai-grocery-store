import assert from "node:assert/strict";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

const input = {
  date: "2026-10-20",
  inventorySignal: "high stock variance",
  platformSignal: "change reported in merchant rules"
};

const State = Annotation.Root({
  input: Annotation(),
  inventoryFinding: Annotation(),
  platformRisk: Annotation(),
  brief: Annotation()
});

const graph = new StateGraph(State)
  .addNode("inventory", async state => ({
    inventoryFinding: state.input.inventorySignal.includes("high")
      ? "Inventory risk is elevated; review replenishment and stock accuracy."
      : "No high inventory risk detected in the supplied signal."
  }))
  .addNode("platform", async state => ({
    platformRisk: state.input.platformSignal.includes("change")
      ? "A platform rule change is reported; verify the official notice before acting."
      : "No platform change detected in the supplied signal."
  }))
  .addNode("summary", async state => ({
    brief: {
      date: state.input.date,
      inventoryFinding: state.inventoryFinding,
      platformRisk: state.platformRisk,
      action: "Assign an owner to verify both signals, record the evidence URL, and set a follow-up time."
    }
  }))
  .addEdge(START, "inventory")
  .addEdge(START, "platform")
  .addEdge("inventory", "summary")
  .addEdge("platform", "summary")
  .addEdge("summary", END)
  .compile();

const started = Date.now();
const result = await graph.invoke({ input });
assert.ok(result.brief, "LangGraph should produce a brief");
console.log("=== LangGraph result ===");
console.log(JSON.stringify({
  brief: result.brief,
  durationMs: Date.now() - started,
  graphNodes: ["inventory", "platform", "summary"],
  persistence: "No checkpointer configured in this demo"
}, null, 2));
