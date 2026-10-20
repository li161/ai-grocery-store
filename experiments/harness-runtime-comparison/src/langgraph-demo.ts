import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { demoInput, type RetailBrief, type RetailBriefInput } from "./workflow.js";

const State = Annotation.Root({
  input: Annotation<RetailBriefInput>(),
  inventoryFinding: Annotation<string>(),
  platformRisk: Annotation<string>(),
  brief: Annotation<RetailBrief | undefined>()
});

const graph = new StateGraph(State)
  .addNode("inventory", async state => ({
    inventoryFinding: state.input.inventorySignal.toLowerCase().includes("high")
      ? "Inventory risk is elevated; review replenishment and stock accuracy."
      : "No high inventory risk detected in the supplied signal."
  }))
  .addNode("platform", async state => ({
    platformRisk: state.input.platformSignal.toLowerCase().includes("change")
      ? "A platform rule change is reported; verify the official notice before acting."
      : "No platform change detected in the supplied signal."
  }))
  .addNode("summary", async state => ({
    brief: {
      date: state.input.date,
      inventoryFinding: state.inventoryFinding,
      platformRisk: state.platformRisk,
      recommendedAction: "Verify primary sources, then assign an owner and due date for each confirmed risk."
    }
  }))
  .addEdge(START, "inventory")
  .addEdge(START, "platform")
  .addEdge(["inventory", "platform"], "summary")
  .addEdge("summary", END)
  .compile();

const result = await graph.invoke({ input: demoInput });
console.log(JSON.stringify(result.brief, null, 2));
