# AI 杂货铺 · DeepSeek 多 Agent 群聊 API

独立 Node.js API 服务，供六个零售岗位数字人并行调用 DeepSeek。服务使用 Node.js 内置 HTTP 与 fetch，无需 Pi CLI 或第三方运行时依赖。

## API

- `GET /health`：健康检查，返回 provider 和模型名称。
- `POST /api/chat`：并行调用选中的岗位 Agent。模型密钥仅由服务端读取。

默认 DeepSeek 模型为 `deepseek-flash`，接口地址为 `https://api.deepseek.com/chat/completions`。模型名称可通过 `DEEPSEEK_MODEL` 环境变量调整。

## 本地运行

```bash
cd services/agent-chat
cp .env.example .env
# 编辑 .env，只需填写 DEEPSEEK_API_KEY
set -a; source .env; set +a
npm start
```

健康检查：`curl http://localhost:8787/health`

## 部署成独立 API 服务

仓库根目录的 `render.yaml` 已配置 Render Blueprint：

1. 在 Render 选择 **New + → Blueprint**，连接本 GitHub 仓库。
2. Render 会读取 `render.yaml`，并把 `services/agent-chat` 部署成独立 Web Service。
3. 在服务环境变量中只需填写 `DEEPSEEK_API_KEY`。不要把密钥提交到 GitHub，也不要放入 `VITE_*` 前端变量。
4. 保证 `ALLOWED_ORIGINS` 包含前端的准确来源（例如 `https://airetail.store`）。
5. 部署成功后访问 `https://你的服务.onrender.com/health`，应返回 `ok: true`。
6. 打开数字人群聊即可直接发送消息；前端默认指向 `https://ai-grocery-store-agent-api.onrender.com`。若 Render 实际分配的域名不同，只需在构建时设置 `VITE_AGENT_API`。

Render 的服务与前端是分开的部署单元，但源代码暂时仍位于现有 GitHub 仓库。当前 GitHub 连接没有创建新仓库的权限；若必须独立成另一个 GitHub 仓库，需要先在 GitHub 创建空仓库，再把本目录内容复制到新仓库根目录。

## 请求格式

```json
{
  "message": "帮我梳理今天的门店经营优先级",
  "agents": [
    {"id":"manager","name":"店长","role":"经营负责人","instructions":"统筹经营目标并拆分任务"}
  ],
  "history": [{"role":"user","text":"我希望降低损耗"}]
}
```

响应包含 `replies: [{agentId, text, traceId}]` 与 `failed` 标记。所有岗位并行调用；单个失败不会丢弃其他成功回复。

## 安全与 MVP 边界

- DeepSeek 密钥仅存在于后端环境变量。
- 公开 API 不要求用户再填写访问 Token；通过 CORS 来源白名单、每 IP 限流和请求大小限制降低滥用风险。CORS 不是身份认证，若面向公开高流量使用，应增加验证码、配额或网关认证。
- 提供 CORS 来源白名单、访问 Token、请求体大小限制、每 IP 限流、模型调用超时。
- 当前限流器存于内存，进程重启后清零；高流量生产环境应改用共享限流存储/API 网关。
- 当前不持久化群聊，也未接入真实 POS、支付、商品目录或库存系统。数字人不能宣称这些系统动作已执行。
- Render 免费实例可能休眠，首次请求可能较慢；真实商业使用需评估服务可用性和 DeepSeek API 费用。
