# ADR 0002: 目录采用数据驱动

- Status: Accepted
- Date: 2026-09-29

## Context

工具数量会从当前示例持续扩展。若每个商品都直接写在模板中，增加商品、分类、标签和官网地址都会导致模板频繁修改。

## Decision

工具、行业、套装统一放在 `src/data/catalog.js`，每个工具至少包含：

- `name`
- `category`
- `desc`
- `note`
- `accent`
- `url`

页面通过 `v-for` 渲染目录，筛选逻辑通过 `useCatalog()` 处理。

未来接入后端时，保持字段契约，替换数据来源即可。

## Consequences

优点：内容扩展成本低、模板稳定、便于后续 CMS/API 化。

限制：当前仍是构建时静态数据；如果未来需要用户收藏、评分、实时价格等动态数据，再增加 API/domain 层。
