# ADR 0004 — Retail Intelligence Auto Sync

## Status
Accepted

## Decision
- 使用 scripts/sync-retail-news.mjs 作为无依赖 Node 同步器。
- GitHub Actions 每 6 小时触发一次同步。
- 自动结果写入 src/data/retailNews.generated.js。
- 保留人工精选种子资讯，保证外部源暂时不可用时页面仍有内容。
- 前端按 AI 导购、Agentic Commerce、零售运营、中国零售等维度过滤。
- 每条情报保留原始来源链接；自动抓取内容不伪装成 AI 总结。
- 后续可以替换为获得授权的新闻 API / RSS / 自建爬虫，而无需修改前端数据契约。

## Consequences
无需数据库和常驻服务器即可自动更新；Git 历史保留每次情报变化；页面构建结果稳定、可回滚。
商业化前应确认新闻源的版权、robots、服务条款和数据授权。
