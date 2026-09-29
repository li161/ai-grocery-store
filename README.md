# AI 杂货铺

Vue 3 + Vite 打造的沉浸式 AI 工具商店。

核心目标不是做一个“AI 工具列表”，而是让用户像进入一家真实的店：看到空间、货架、商品和行业区域，再决定拿什么。

## 当前结构

```
src/
├── components/
│   ├── StoreNav.vue       # 木质悬挂导航
│   ├── StoreHero.vue      # 沉浸式店铺场景
│   └── ToolShelf.vue      # AI 工具货架
├── composables/
│   ├── useCatalog.js      # 搜索与分类状态
│   └── useRetailNews.js   # 零售情报筛选与同步状态
├── data/
│   ├── catalog.js         # 工具 / 行业 / 套装目录
│   └── retailNews.generated.js # 自动生成的零售情报数据
├── App.vue                # 页面编排与轻量 UI 状态
└── styles.css             # design tokens + 空间场景样式
```

### 为什么这样拆

- **视觉组件独立**：店铺空间和货架可以独立迭代，不继续堆大 `App.vue`。
- **数据驱动**：新增工具主要修改 `catalog.js`，而不是改模板。
- **状态就地管理**：当前筛选、搜索、抽屉属于局部 UI 状态，不引入 Pinia。
- **未来可 API 化**：`data/catalog.js` 是当前数据适配层，未来可以替换成 API/CMS。
- **GitHub Pages 原生部署**：构建产物直接部署 `dist`。

## ADR

架构决策记录位于：

- `docs/adr/0001-feature-oriented-vue-architecture.md`
- `docs/adr/0002-data-driven-catalog.md`
- `docs/adr/0003-github-pages-deployment.md`
- `docs/adr/0004-retail-intelligence-auto-sync.md`

## 零售情报自动同步

`scripts/sync-retail-news.mjs` 会抓取公开 RSS 搜索源，并与人工精选的零售 / AI 导购情报合并。GitHub Actions 每 6 小时自动运行一次；有变化时提交 `retailNews.generated.js`，随后 Pages 部署工作流会自动重新构建。

本地可手动执行：

```bash
npm run sync:retail
```

当前覆盖 AI 导购、Agentic Commerce、Amazon、Google、OpenAI、Claude、Qwen/淘宝、Walmart、JD 等平台与零售主题。自动抓取条目只展示原始标题和来源，不伪造 AI 摘要；人工精选条目提供业务影响与行动建议。

> 注意：Google News RSS 更适合原型和低频监测。若项目进入商业化阶段，应替换为获得授权的新闻数据源，并确认各源的版权、robots 与服务条款。

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
npm run preview
```

## 部署

GitHub Actions 自动执行 Vue 构建并发布到 GitHub Pages。

线上地址：

https://li161.github.io/ai-grocery-store/
