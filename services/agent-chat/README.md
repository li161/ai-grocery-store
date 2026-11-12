# AI 杂货铺 · Agent Harness / DeepSeek API

当前服务仍由 Render 独立部署，代码位于现有仓库的 `services/agent-chat`。本次把任务生命周期和 Agent 执行协调从 HTTP 入口中拆出；没有另建部署服务，也没有改变现有 `POST /api/chat` 的基本响应契约。

## 已实现

- `src/harness/runtime.mjs`：依赖 DAG 校验与调度；无依赖任务并行运行，依赖任务等待前置任务成功后执行，前置失败时下游任务标记为 `skipped`；单 Agent 异常隔离、任务状态事件日志。
- `src/task-store.mjs`：统一任务存储接口；支持 PostgreSQL 持久化与本地内存开发模式。
- `POST /api/chat`：保留原接口，新增 `taskId`、`task`，支持可选 `Idempotency-Key` 请求幂等键。
- `GET /api/tasks/:id`：读取任务/各 Agent 子任务状态与结果。
- `GET /api/conversations`、`PUT /api/conversations/:id`、`DELETE /api/conversations/:id`：按浏览器匿名客户端 ID 隔离的群聊记录云端同步接口。
- PostgreSQL 初始化建表；进程重启时把仍处于运行态的任务标记为 `interrupted`，不会假装自动恢复执行。
- Agent 请求可为每个岗位传入可选 `dependsOn: ["inventory"]`，服务端会校验未知依赖与循环依赖，并把已完成依赖的结果注入下游 Agent 上下文。
- 单测覆盖并行结果、依赖顺序、依赖失败跳过、循环依赖校验、幂等与任务状态更新。

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

要在 Render 重启和重新部署后保留任务记录，需要为服务配置 PostgreSQL，并把连接串设为环境变量 `DATABASE_URL`。服务启动时会自动创建 `harness_runs` 与 `chat_conversations` 表。群聊 UI 会优先同步 PostgreSQL，并保留 `localStorage` 作为离线缓存；`/health` 会暴露 `conversationStorage`。建议数据库与 API 服务部署在同一地区，并只向后端注入连接串。

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

返回任务状态，包括每个 Agent 子任务的 `queued/running/succeeded/failed/interrupted` 状态、开始/完成时间以及结果/错误。任务与会话 API 当前没有真正的用户账号认证。会话使用浏览器本地生成的 `X-Client-Id` 做数据分区，这只是匿名客户端标识，不是安全身份验证；清除浏览器数据会丢失该标识，其他设备也不会自动找回。面向公开生产流量前必须接入登录/身份认证，并在服务端从可信身份中推导 owner ID，不能把匿名客户端 ID 当作访问控制。

## 当前边界

- 依赖 DAG 目前由请求显式提供 `dependsOn`，尚未接入 LLM 自动规划；SSE token 流式输出与自动重放中断任务尚未实现。
- 重启时对运行中任务做可见的 `interrupted` 标记，避免无声挂起；不自动重放是为了避免模型调用重复计费。
- CORS 不是身份认证；内存限流器仍非跨实例共享。
- 不连接 POS、库存、订单或支付系统；模型输出不是实际执行凭证。


## 群聊会话云端持久化

群聊记录保存在 `chat_conversations` PostgreSQL 表中，字段包含会话 ID、匿名客户端分区 ID、标题、消息 JSONB、创建时间和更新时间。前端仍先写本地缓存，随后异步同步后端；后端不可用时会显示“仅本地保存”，不会清空本地记录。API 需要 `X-Client-Id` 请求头，消息数据上限为每会话最近 500 条。

**部署前置条件：** 在 Render 的 Agent API 服务配置有效的 `DATABASE_URL`（建议使用同地区托管 PostgreSQL），并重新部署。代码合并本身不会自动创建托管数据库，也不能替你配置 Render 环境变量。部署后检查 `/health` 的 `database.connected: true` 和 `conversationStorage: "postgres"`，再从浏览器开发者工具确认 `/api/conversations` 请求成功。当前匿名客户端 ID 不提供账号级安全或跨设备身份恢复，正式多用户上线前需要认证层。
