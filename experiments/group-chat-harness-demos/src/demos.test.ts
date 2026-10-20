import test from "node:test";
import assert from "node:assert/strict";

type Agent = { id: string; role: string; skills: string[] };
const agents: Agent[] = [
  { id: "coordinator", role: "协调员", skills: ["planning", "summary"] },
  { id: "researcher", role: "研究员", skills: ["research", "sources"] },
  { id: "coder", role: "开发者", skills: ["code", "debug"] },
  { id: "reviewer", role: "审查员", skills: ["review", "risk"] },
];
function route(text: string, mentions: string[] = [], from = "user"): string[] {
  const ids = new Set(agents.map((a) => a.id));
  if (mentions.length) return [...new Set(mentions)].filter((id) => ids.has(id));
  if (/review|审查|风险|检查/i.test(text)) return agents.filter((a) => a.skills.includes("review")).map((a) => a.id);
  if (/code|代码|bug|实现|调试/i.test(text)) return agents.filter((a) => a.skills.includes("code")).map((a) => a.id);
  if (/research|搜索|调研|资料/i.test(text)) return agents.filter((a) => a.skills.includes("research")).map((a) => a.id);
  return agents.filter((a) => a.id !== from).map((a) => a.id);
}
test("@mention overrides intent routing", () => {
  assert.deepEqual(route("请审查代码", ["coder"]), ["coder"]);
});
test("intent routes to a matching specialist", () => {
  assert.deepEqual(route("请审查这个设计的风险"), ["reviewer"]);
});
test("default route broadcasts to everyone except sender", () => {
  assert.deepEqual(route("大家讨论一下"), ["coordinator", "researcher", "coder", "reviewer"]);
});
test("unknown mentions are ignored", () => {
  assert.deepEqual(route("hello", ["missing-agent"]), []);
});
