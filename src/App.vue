<script setup>
import { onMounted, ref } from 'vue'
import StoreNav from './components/StoreNav.vue'
import StoreHero from './components/StoreHero.vue'
import ToolShelf from './components/ToolShelf.vue'
import RetailNewsShelf from './components/RetailNewsShelf.vue'
import HotRank from './components/HotRank.vue'
import { categories, tools, industries, bundles } from './data/catalog'
import { useCatalog } from './composables/useCatalog'
import { useRetailNews } from './composables/useRetailNews'

const { activeCategory, keyword, filteredTools } = useCatalog()
const { lanes: newsLanes, activeLane: activeNewsLane, keyword: newsKeyword, filteredNews, syncLabel } = useRetailNews()

const activeSection = ref('home')
const drawerTool = ref(null)
const selectedNews = ref(null)
const showSearch = ref(false)
const darkMode = ref(false)
const detail = ref(null)

const sections = [
  { id:'home', label:'店铺首页', icon:'⌂', group:'内容' },
  { id:'tools', label:'AI 工具', icon:'⌘', group:'内容' },
  { id:'industry', label:'AI × 行业', icon:'▦', group:'内容' },
  { id:'bundles', label:'AI 套装', icon:'◈', group:'内容' },
  { id:'retail-news', label:'零售情报', icon:'◌', group:'情报' },
  { id:'hot-rank', label:'热点榜', icon:'↗', group:'情报' },
  { id:'lab', label:'后院实验室', icon:'⚗', group:'实验' }
]

function navigate(id) {
  activeSection.value = id
  selectedNews.value = null
  detail.value = null
  window.scrollTo({ top:0, behavior:'instant' })
}
function openTool(tool) { drawerTool.value = tool }
function openToolByName(name) {
  const tool = tools.find(item => item.name === name)
  if (tool) openTool(tool)
}
function openIndustry(item) {
  activeSection.value = 'industry'
  detail.value = { type:'industry', ...item }
  window.scrollTo({top:0,behavior:'instant'})
}
function openBundle(item) {
  activeSection.value = 'bundles'
  detail.value = { type:'bundle', ...item }
  window.scrollTo({top:0,behavior:'instant'})
}
function openNews(item) {
  activeSection.value = 'retail-news'
  selectedNews.value = item
  detail.value = null
  window.scrollTo({top:0,behavior:'instant'})
}
function closeDetail() { detail.value = null }
function goSearch() { showSearch.value = true }
function toggleTheme() {
  darkMode.value = !darkMode.value
  document.documentElement.dataset.theme = darkMode.value ? 'dark' : 'light'
  localStorage.setItem('ai-grocery-theme', darkMode.value ? 'dark' : 'light')
}
onMounted(() => {
  darkMode.value = localStorage.getItem('ai-grocery-theme') === 'dark'
  document.documentElement.dataset.theme = darkMode.value ? 'dark' : 'light'
})
</script>

<template>
  <div class="site">
    <StoreNav :onNavigate="scrollTo" :onSearch="goSearch" />
    <main>
      <StoreHero :onNavigate="scrollTo" :onOpenTool="openTool" :onOpenIndustry="openIndustry" :onOpenBundle="openBundle" :onOpenNews="openNews" :tools="tools" :industries="industries" :bundles="bundles" :news="filteredNews" />

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
          </button>
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
          </button>
        </div>
      </section>

      <RetailNewsShelf
        :lanes="newsLanes"
        :activeLane="activeNewsLane"
        :keyword="newsKeyword"
        :news="filteredNews"
        :syncLabel="syncLabel"
        :onOpen="openNews"
        @update:activeLane="activeNewsLane = $event"
        @update:keyword="newsKeyword = $event"
      />

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
            <span class="eyebrow">{{ detail.type === 'industry' ? 'INDUSTRY INTELLIGENCE' : detail.type === 'bundle' ? 'READY-MADE AI KIT' : 'RETAIL INTELLIGENCE' }}</span>
            <div class="detail-title-row">
              <span class="detail-icon">{{ detail.icon || 'AI' }}</span>
              <div><h2>{{ detail.name || detail.title }}</h2><p>{{ detail.text || detail.flow || detail.source }}</p></div>
            </div>
            <p class="detail-headline">{{ detail.headline || detail.trigger || detail.impact }}</p>
          </header>

          <div class="detail-grid">
            <section class="detail-main">
              <div class="detail-block">
                <span class="detail-label">为什么现在值得看</span>
                <p>{{ detail.summary || detail.trigger || detail.impact }}</p>
              </div>
              <div class="detail-block">
                <span class="detail-label">{{ detail.type === 'industry' ? '可以直接拿来做什么' : detail.type === 'bundle' ? '执行流程' : '下一步可以做什么' }}</span>
                <div class="action-list">
                  <div v-for="(item,index) in (detail.actions || detail.steps || [detail.impact, detail.action])" :key="item"><b>0{{ index + 1 }}</b><span>{{ item }}</span></div>
                </div>
              </div>
            </section>

            <aside class="detail-side">
              <div v-if="detail.tools" class="detail-block">
                <span class="detail-label">推荐工具</span>
                <div class="tool-chips"><button v-for="tool in detail.tools" :key="tool" @click="openToolByName(tool)">{{ tool }} ↗</button></div>
              </div>
              <div v-if="detail.tags" class="detail-block">
                <span class="detail-label">情报标签</span>
                <div class="tool-chips"><span v-for="tag in detail.tags" :key="tag">{{ tag }}</span></div>
              </div>
              <div v-if="detail.sources || detail.url" class="detail-block">
                <span class="detail-label">{{ detail.type === 'news' ? '原始来源' : '最新资讯依据' }}</span>
                <a v-if="detail.url" class="source-item" :href="detail.url" target="_blank" rel="noopener"><strong>{{ detail.title }}</strong><small>{{ detail.source }} · {{ detail.date }} ↗</small></a>
                <a v-for="source in detail.sources" :key="source.url" class="source-item" :href="source.url" target="_blank" rel="noopener"><strong>{{ source.title }}</strong><small>{{ source.name }} · {{ source.date }} ↗</small></a>
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
