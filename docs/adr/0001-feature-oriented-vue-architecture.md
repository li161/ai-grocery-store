# ADR 0001: 采用 Feature-Oriented Vue 结构

- Status: Accepted
- Date: 2026-09-29

## Context

AI 杂货铺会持续增加工具、行业、套装和实验室能力。此前所有页面结构、数据和交互都集中在 `App.vue`，视觉迭代快，但组件边界不清晰，后续接 API、CMS 或更多页面时维护成本会快速上升。

## Decision

采用 Vue 3 + Vite，并按职责拆分：

```
src/
├── components/      # 可复用的店铺视觉组件
├── composables/     # 交互状态与业务逻辑
├── data/            # 当前静态目录数据，未来可替换为 API
├── App.vue          # 页面编排，不承载具体视觉细节
└── styles.css       # 全局 design tokens + 场景样式
```

组件负责展示和事件；composable 负责筛选、搜索等状态；data 负责目录内容。

## Consequences

- 新增 AI 工具优先修改 `src/data/catalog.js`，无需改页面结构。
- 新增货架视觉优先新增/修改组件，而不是继续扩大 `App.vue`。
- 后续可将 data 层替换成 API/CMS，组件接口基本保持稳定。
- 当前规模下不引入 Pinia，避免为局部状态增加全局状态复杂度。
