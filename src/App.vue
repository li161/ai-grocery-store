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
          <article v-for="item in industries" :key="item.name" class="industry-card">
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
          <article v-for="bundle in bundles" :key="bundle.title" class="bundle-card" :class="bundle.tone">
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
      <div v-if="showSearch" class="search-overlay" @click.self="showSearch=false">
        <div class="global-search">⌕<input v-model="keyword" autofocus placeholder="搜索 AI 工具，例如 Cursor、论文、设计..." @keyup.enter="showSearch=false;scrollTo('tools')"><button @click="showSearch=false;scrollTo('tools')">进入货架 →</button></div>
      </div>
    </transition>
  </div>
</template>
