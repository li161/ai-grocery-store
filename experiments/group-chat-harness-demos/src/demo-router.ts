type Agent = { id: string; role: string; skills: string[] };
type Message = { id: string; from: string; text: string; mentions?: string[]; room: string };
const agents: Agent[] = [
  { id: "coordinator", role: "协调员", skills: ["planning", "summary"] },
  { id: "researcher", role: "研究员", skills: ["research", "sources"] },
  { id: "coder", role: "开发者", skills: ["code", "debug"] },
  { id: "reviewer", role: "审查员", skills: ["review", "risk"] },
];

function route(message: Message): string[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  // 1. Explicit @mention wins.
  if (message.mentions?.length) return [...new Set(message.mentions)].filter((id) => byId.has(id));
  // 2. Role/intent routing.
  const text = message.text.toLowerCase();
  if (/review|审查|风险|检查/.test(text)) return agents.filter((a) => a.skills.includes("review")).map((a) => a.id);
  if (/code|代码|bug|实现|调试/.test(text)) return agents.filter((a) => a.skills.includes("code")).map((a) => a.id);
  if (/research|搜索|调研|资料/.test(text)) return agents.filter((a) => a.skills.includes("research")).map((a) => a.id);
  // 3. Default room broadcast excluding sender.
  return agents.filter((a) => a.id !== message.from).map((a) => a.id);
}

const messages: Message[] = [
  { id: "m1", from: "user", room: "demo", text: "@coder 帮我实现任务状态机", mentions: ["coder"] },
  { id: "m2", from: "user", room: "demo", text: "请审查这个设计的风险" },
  { id: "m3", from: "user", room: "demo", text: "大家讨论一下群聊 Harness 的边界" },
];

console.log("\n=== Demo 1: Group Message Router ===");
for (const message of messages) {
  const targets = route(message);
  console.log("\nUSER:", message.text);
  console.log("ROUTE:", targets.length ? targets.join(", ") : "(no recipient)");
  for (const id of targets) {
    const agent = agents.find((a) => a.id === id)!;
    console.log(`  [${agent.role}/${agent.id}] 收到消息`);
  }
}
console.log("\n观察点：@提及优先 > 意图/角色路由 > 默认广播。路由只决定谁收到，不负责任务依赖和最终结果。\n");
