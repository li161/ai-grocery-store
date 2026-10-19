# AI 杂货铺 · Agent Harness / DeepSeek API

当前服务仍由 Render 独立部署，代码位于现有仓库的 `services/agent-chat`。本次把任务生命周期和 Agent 执行协调从 HTTP 入口中拆出；没有另建部署服务，也没有改变现有 `POST /api/chat` 的基本响应契约。

## 已实现

- `src/harness/runtime.mjs`：并行 fan-out、单 Agent 异常隔离、任务状态事件日志。
- `src/task-store.mjs`：统一任务存储接口；支持 PostgreSQL 持久化与本地内存开发模式。
- `POST /api/chat`：保留原接口，新增 `taskId`、`task`，支持可选 `Idempotency-Key` 请求幂等键。
- `GET /api/tasks/:id`：读取任务/各 Agent 子任务状态与结果。
- PostgreSQL 初始化建表；进程重启时把仍处于运行态的任务标记为 `interrupted`，不会假装自动恢复执行。
- 单测覆盖并行结果、单 Agent 失败隔离和任务状态更新。

## 运行与验证

需要 Node.js 22+。

```bash
npm install
npm test
npm run check
npm start
```

`GET /health` 会返回 `taskStorage: "postgres" | "memory"`，方便确认当前存储模式。

## 配置持久化

要在 Render 重启和重新部署后保留任务记录，需要为服务配置 PostgreSQL，并把连接串设为环境变量 `DATABASE_URL`。服务启动时会自动创建 `harness_runs` 表。建议数据库与 API 服务部署在同一地区，并只向后端注入连接串。

未配置 `DATABASE_URL` 时会使用内存存储：适合本地开发，但重启后任务记录会丢失。仅仅合并代码不会自动创建数据库，也不会自动为 Render 服务设置 `DATABASE_URL`。

## API 约定

### POST /api/chat

请求体与旧版本兼容：

```json
{
  "message": "检查库存并给出采购建议",
  "agents": [{"id":"inventory","name":"库存专员","role":"库存管理"}],
  "history": []
}
```

可选请求头：`Idempotency-Key: <客户端生成的唯一键>`。同一键重复提交不会再次触发模型调用，而是返回现有任务和已完成回复。调用方应为每次新的用户发送生成新键；不要将同一键复用于不同消息。

响应新增 `taskId` 和 `task`，原有 `replies`、`failed`、`errors` 字段继续保留。

### GET /api/tasks/:id

返回任务状态，包括每个 Agent 子任务的 `queued/running/succeeded/failed/interrupted` 状态、开始/完成时间以及结果/错误。当前接口没有用户级鉴权；不要将任务 ID 当作访问控制。面向公开生产流量前应增加身份认证、配额和访问隔离。

## 当前边界

- 已有的 Agent 执行是并行 fan-out；本次没有实现由 LLM 自动规划的依赖 DAG、SSE token 流式输出或自动重放中断任务。
- 重启时对运行中任务做可见的 `interrupted` 标记，避免无声挂起；不自动重放是为了避免模型调用重复计费。
- CORS 不是身份认证；内存限流器仍非跨实例共享。
- 不连接 POS、库存、订单或支付系统；模型输出不是实际执行凭证。
