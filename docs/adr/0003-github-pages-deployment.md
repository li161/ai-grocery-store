# ADR 0003: 使用 GitHub Pages 部署

- Status: Accepted
- Date: 2026-09-29

## Context

项目需要低成本、可持续部署，并且当前是纯前端目录型产品，不需要服务端运行时。

## Decision

使用 GitHub Actions：

1. push 到 `main`
2. Node 20 安装依赖
3. 执行 `npm run build`
4. 上传 `dist`
5. 使用 GitHub Pages 部署

Vite 的 `base` 固定为 `/ai-grocery-store/`，适配仓库 Pages 子路径。

## Consequences

优点：无需额外平台、部署链路简单、每次提交自动发布。

限制：当前不能直接承载需要服务端密钥或数据库的功能；后续如加入动态数据，可保持前端部署不变，增加独立 API。
