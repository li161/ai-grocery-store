import type { TaskDefinition } from "./runtime.js";

export type RetailBriefInput = { date: string; inventorySignal: string; platformSignal: string };
export type RetailBrief = { date: string; inventoryFinding: string; platformRisk: string; recommendedAction: string };

export function buildTasks(input: RetailBriefInput): TaskDefinition[] {
  return [
    { id: "inventory", timeoutMs: 2_000, run: async () => input.inventorySignal.toLowerCase().includes("high")
      ? "Inventory risk is elevated; review replenishment and stock accuracy."
      : "No high inventory risk detected in the supplied signal." },
    { id: "platform", timeoutMs: 2_000, run: async () => input.platformSignal.toLowerCase().includes("change")
      ? "A platform rule change is reported; verify the official notice before acting."
      : "No platform change detected in the supplied signal." },
    { id: "summary", dependsOn: ["inventory", "platform"], run: async ({ dependencies }) => {
      const inventoryFinding = String(dependencies.get("inventory"));
      const platformRisk = String(dependencies.get("platform"));
      return { date: input.date, inventoryFinding, platformRisk,
        recommendedAction: "Verify primary sources, then assign an owner and due date for each confirmed risk." } satisfies RetailBrief;
    } }
  ];
}

export const demoInput: RetailBriefInput = {
  date: "2026-10-20",
  inventorySignal: "high stock variance",
  platformSignal: "change reported in merchant rules"
};
