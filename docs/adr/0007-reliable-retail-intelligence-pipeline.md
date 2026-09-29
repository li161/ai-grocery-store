# ADR-0007: 可靠的零售情报采集与事件证据链

## 状态
Accepted

## 决策

零售情报不再把“新闻列表”作为事实数据库，而采用四层结构：

1. Discovery：Google News 多窗口检索负责广覆盖发现候选。
2. First-party：OpenAI、Google、Target 等可用官方 RSS 直接采集；官方站点没有 RSS 时仍通过定向发现源进入候选池。
3. Evidence：对入选候选回源抓取原文，保存 canonical URL、域名、摘录和抓取时间。
4. Event：以 eventId 持续聚合报道，保存多来源报告、生命周期、核验状态和下一步验证项。

## 时间语义

同时保存 publishedAt 和 discoveredAt。

时间轴采用 AIHOT 类似的规则：原文发布后 72 小时内被发现，以发现时间作为实时位置；超过 72 小时才被发现的历史回填，按原文发布时间归位。首页只展示滚动 7 天窗口，历史事件进入事件档案。

## 可靠性

- 单个信源失败不得清空上一份有效快照。
- 新一轮候选少于最低阈值时保留上一份有效快照。
- 每轮记录 source health。
- 每天生成不可覆盖的 public/retail-history/YYYY-MM-DD.json。
- 事件核验只允许使用已抓取的原始报道证据。
- “意向、计划、预计”不得自动升级为“已交付、已实现、已产生经营结果”。

## 与 AIHOT 的关系

借鉴 AIHOT 已公开的时间窗口、publishedAt/discoveredAt、事件故事、快照/增量和失败降级思想，但零售情报增加经营结果核验与项目生命周期，且不直接镜像 AIHOT 数据。

## 后续

当数据量进一步增长，再将 GitHub JSON 持久化迁移到 SQLite/Postgres 或对象存储；前端协议保持不变。