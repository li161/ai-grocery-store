<script setup>
import { ref } from 'vue'
import StoreNav from './components/StoreNav.vue'
import StoreHero from './components/StoreHero.vue'
import ToolShelf from './components/ToolShelf.vue'
import { categories, tools, industries, bundles } from './data/catalog'
import { useCatalog } from './composables/useCatalog'

const { activeCategory, keyword, filteredTools } = useCatalog()
const drawerTool = ref(null)
const showSearch = ref(false)
const detail = ref(null)

function openIndustry(item) { detail.value = { type: 'industry', ...item } }
function openBundle(item) { detail.value = { type: 'bundle', ...item } }
function closeDetail() { detail.value = null }

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function openTool(tool) {
  drawerTool.value = tool
}
function goSearch() {
  showSearch.value = true
}
</script>

<template>
  <div class="site">
    <StoreNav :onNavigate="scrollTo" :onSearch="goSearch" />
    <main>
      <StoreHero :onNavigate="scrollTo" />

      <ToolShelf
        :categories="categories"
        :activeCategory="activeCategory"
        :keyword="keyword"
        :tools="filteredTools"
        :onOpenTool="openTool"
        @update:activeCategory="activeCategory = $event"
        @update:keyword="keyword = $event"
      />

      <section id="industry" class="section industry-section">
        <div class="section-head compact">
          <div><span class="eyebrow">AISLE 02 · AI × INDUSTRY</span><h2>行业货架</h2></div>
          <p>不讲“AI 是什么”，直接摆出来：在你的工作里，它能拿来干什么。</p>
        </div>
        <div class="industry-store">
          <button v-for="item in industries" :key="item.name" class="industry-card" @click="openIndustry(item)">
            <div class="industry-shelf-label">{{ item.name }}</div>
            <div class="industry-body"><span class="industry-icon">{{ item.icon }}</span><div><strong>{{ item.name }}</strong><small>{{ item.text }}</small></div><span class="industry-arrow">↗</span></div>
            <div class="industry-beam"></div>
          </article>
        </div>
      </section>

      <section id="bundles" class="section bundle-section">
        <div class="section-head compact">
          <div><span class="eyebrow">AISLE 03 · READY-MADE</span><h2>老板配好的 AI 套装</h2></div>
          <p>不想一件件挑？按一件事情，把需要的工具直接装进购物篮。</p>
        </div>
        <div class="bundle-grid">
          <button v-for="bundle in bundles" :key="bundle.title" class="bundle-card" :class="bundle.tone" @click="openBundle(bundle)">
            <div class="bundle-head"><span>{{ bundle.label }}</span><span>READY</span></div>
            <div class="bundle-body"><div class="bundle-bag">AI</div><div><h3>{{ bundle.title }}</h3><p>{{ bundle.flow }}</p></div></div>
            <div class="bundle-foot">打开套装 <span>→</span></div>
          </article>
        </div>
      </section>

      <section id="lab" class="lab-section">
        <div class="lab-copy"><span class="eyebrow">BACK ROOM · EXPERIMENTS</span><h2>后院实验室</h2><p>这里不卖单个工具，专门研究怎么把 Prompt、Agent、Workflow 和 MCP 串成真正能工作的东西。</p><button @click="scrollTo('tools')">去看看货架里的工具 <span>→</span></button></div>
        <div class="lab-shelf">
          <div v-for="item in [['⌘','Prompt','提示词配方'],['✦','Agent','自动干活'],['↯','Workflow','工作流'],['∞','MCP','工具连接']]" :key="item[1]" class="lab-item"><b>{{item[0]}}</b><strong>{{item[1]}}</strong><small>{{item[2]}}</small></div>
        </div>
      </section>
    </main>

    <footer><strong>AI 杂货铺</strong><span>不是什么都懂，但尽量让你少走几步。</span><small>AI Grocery Store · Tools, workflows & real use cases.</small></footer>

    <transition name="fade">
      <div v-if="drawerTool" class="drawer-mask" @click.self="drawerTool=null">
        <aside class="drawer">
          <button class="drawer-close" @click="drawerTool=null">×</button>
          <div class="drawer-photo" :class="drawerTool.accent">{{ drawerTool.icon }}</div>
          <span class="drawer-kicker">{{ drawerTool.category }} · {{ drawerTool.note }}</span>
          <h2>{{ drawerTool.name }}</h2>
          <p>{{ drawerTool.desc }}。打开官网了解最新能力、价格和使用方式。</p>
          <div class="drawer-meta"><span>AI TOOL</span><span>OFFICIAL</span></div>
          <a :href="drawerTool.url" target="_blank" rel="noopener" class="drawer-cta">去官网看看 <span>↗</span></a>
        </aside>
      </div>
    </transition>


    <transition name="fade">
      <div v-if="detail" class="detail-mask" @click.self="closeDetail">
        <article class="detail-page">
          <button class="detail-close" @click="closeDetail">×</button>

          <header class="detail-hero">
            <span class="eyebrow">{{ detail.type === 'industry' ? 'INDUSTRY INTELLIGENCE' : 'READY-MADE AI KIT' }}</span>
            <div class="detail-title-row">
              <span class="detail-icon">{{ detail.icon || 'AI' }}</span>
              <div>
                <h2>{{ detail.name || detail.title }}</h2>
                <p>{{ detail.text || detail.flow }}</p>
              </div>
            </div>
            <p class="detail-headline">{{ detail.headline || detail.trigger }}</p>
          </header>

          <div class="detail-grid">
            <section class="detail-main">
              <div class="detail-block">
                <span class="detail-label">为什么现在值得看</span>
                <p>{{ detail.summary || detail.trigger }}</p>
              </div>

              <div class="detail-block">
                <span class="detail-label">{{ detail.type === 'industry' ? '可以直接拿来做什么' : '执行流程' }}</span>
                <div class="action-list">
                  <div v-for="(item,index) in (detail.actions || detail.steps)" :key="item">
                    <b>0{{ index + 1 }}</b><span>{{ item }}</span>
                  </div>
                </div>
              </div>
            </section>

            <aside class="detail-side">
              <div class="detail-block">
                <span class="detail-label">推荐工具</span>
                <div class="tool-chips"><span v-for="tool in detail.tools" :key="tool">{{ tool }}</span></div>
              </div>

              <div class="detail-block">
                <span class="detail-label">最新资讯依据</span>
                <a v-for="source in detail.sources" :key="source.url" class="source-item" :href="source.url" target="_blank" rel="noopener">
                  <strong>{{ source.title }}</strong>
                  <small>{{ source.name }} · {{ source.date }} ↗</small>
                </a>
              </div>
            </aside>
          </div>
        </article>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="showSearch" class="search-overlay" @click.self="showSearch=false">
        <div class="global-search">⌕<input v-model="keyword" autofocus placeholder="搜索 AI 工具，例如 Cursor、论文、设计..." @keyup.enter="showSearch=false;scrollTo('tools')"><button @click="showSearch=false;scrollTo('tools')">进入货架 →</button></div>
      </div>
    </transition>
  </div>
</template>
