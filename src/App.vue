<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import StoreNav from './components/StoreNav.vue'
import StoreHero from './components/StoreHero.vue'
import ToolShelf from './components/ToolShelf.vue'
import OutcomeShelf from './components/OutcomeShelf.vue'
import CaseTracker from './components/CaseTracker.vue'
import RetailNewsShelf from './components/RetailNewsShelf.vue'
import HotRank from './components/HotRank.vue'
import ContentDetail from './components/ContentDetail.vue'
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
const selectedCase = ref(null)

const sections = [
  { id:'home', label:'店铺首页', icon:'⌂', group:'内容' },
  { id:'outcomes', label:'经营结果', icon:'◎', group:'内容' },
  { id:'tools', label:'AI 工具', icon:'⌘', group:'内容' },
  { id:'industry', label:'AI × 行业', icon:'▦', group:'内容' },
  { id:'bundles', label:'AI 套装', icon:'◈', group:'内容' },
  { id:'retail-news', label:'零售情报', icon:'◌', group:'情报' },
  { id:'hot-rank', label:'热点榜', icon:'↗', group:'情报' },
  { id:'lab', label:'后院实验室', icon:'⚗', group:'实验' }
]

function navigate(id, { syncHash = true } = {}) {
  activeSection.value = id
  selectedNews.value = null
  detail.value = null
  selectedCase.value = null
  if (syncHash) history.replaceState(null, '', '#' + id)
  window.scrollTo({ top: 0, behavior: 'auto' })
}
function openTool(tool) { drawerTool.value = tool }
function openToolByName(name) {
  const tool = tools.find(item => item.name === name)
  if (tool) openTool(tool)
}
function closeOverlays() {
  drawerTool.value = null
  detail.value = null
  selectedNews.value = null
  showSearch.value = false
}
function handleKeydown(event) {
  if (event.key === 'Escape') return closeOverlays()
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    event.preventDefault()
    showSearch.value = true
  }
}
function restoreSectionFromHash() {
  const id = location.hash.slice(1)
  if (sections.some(section => section.id === id)) navigate(id, { syncHash: false })
}
function openIndustry(item) {
  activeSection.value = 'industry'
  detail.value = { type:'industry', ...item }
  window.scrollTo({top:0,behavior:'auto'})
}
function openBundle(item) {
  activeSection.value = 'bundles'
  detail.value = { type:'bundle', ...item }
  window.scrollTo({top:0,behavior:'auto'})
}
function openNews(item) {
  activeSection.value = 'retail-news'
  selectedNews.value = item
  detail.value = null
  window.scrollTo({top:0,behavior:'auto'})
}
function closeDetail() { detail.value = null }
function openCase(item) {
  selectedCase.value = item
  activeSection.value = 'case-tracker'
  window.scrollTo({top:0,behavior:'auto'})
}
function closeCase() {
  selectedCase.value = null
  navigate('outcomes')
}
function goSearch() { showSearch.value = true }
function toggleTheme() {
  darkMode.value = !darkMode.value
  document.documentElement.dataset.theme = darkMode.value ? 'dark' : 'light'
  localStorage.setItem('ai-grocery-theme', darkMode.value ? 'dark' : 'light')
}
onMounted(() => {
  darkMode.value = localStorage.getItem('ai-grocery-theme') === 'dark'
  document.documentElement.dataset.theme = darkMode.value ? 'dark' : 'light'
  restoreSectionFromHash()
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('hashchange', restoreSectionFromHash)
})

</script>

<template>
  <div class="site">
    <StoreNav :sections="sections" :activeSection="activeSection" :darkMode="darkMode" :onNavigate="navigate" :onSearch="goSearch" :onToggleTheme="toggleTheme" />
    <main class="app-main">
      <StoreHero v-if="activeSection === 'home'" :onNavigate="navigate" :onOpenTool="openTool" :onOpenIndustry="openIndustry" :onOpenBundle="openBundle" :onOpenNews="openNews" :tools="tools" :industries="industries" :bundles="bundles" :news="filteredNews" />

      <OutcomeShelf v-else-if="activeSection === 'outcomes'" :onOpenCase="openCase" />

      <ToolShelf v-else-if="activeSection === 'tools'" :categories="categories" :activeCategory="activeCategory" :keyword="keyword" :tools="filteredTools" :onOpenTool="openTool" @update:activeCategory="activeCategory = $event" @update:keyword="keyword = $event" />

      <section v-else-if="activeSection === 'industry'" class="section module-section industry-section">
        <div class="module-kicker"><span>02</span> AI × INDUSTRY <small>行业货架</small></div>
        <div class="section-head compact"><div><h2>AI × 行业</h2><p>不讲“AI 是什么”，直接看它在具体工作里能承担什么。</p></div><div class="module-note">8 个行业场景<br><small>点击进入完整方案</small></div></div>
        <div class="industry-store">
          <button v-for="item in industries" :key="item.name" class="industry-card" @click="detail = { type:'industry', ...item }">
            <div class="industry-shelf-label">{{ item.name }}</div><div class="industry-body"><span class="industry-icon">{{ item.icon }}</span><div><strong>{{ item.name }}</strong><small>{{ item.text }}</small></div><span class="industry-arrow">↗</span></div><div class="industry-beam"></div>
          </button>
        </div>
      </section>

      <section v-else-if="activeSection === 'bundles'" class="section module-section bundle-section">
        <div class="module-kicker"><span>03</span> READY-MADE <small>AI 套装</small></div>
        <div class="section-head compact"><div><h2>老板配好的 AI 套装</h2><p>按一件事情组织工具，不再让你自己拼工作流。</p></div></div>
        <div class="bundle-grid">
          <button v-for="bundle in bundles" :key="bundle.title" class="bundle-card" :class="bundle.tone" @click="detail = { type:'bundle', ...bundle }">
            <div class="bundle-head"><span>{{ bundle.label }}</span><span>READY</span></div><div class="bundle-body"><div class="bundle-bag">AI</div><div><h3>{{ bundle.title }}</h3><p>{{ bundle.flow }}</p></div></div><div class="bundle-foot">打开套装 <span>→</span></div>
          </button>
        </div>
      </section>

      <RetailNewsShelf v-else-if="activeSection === 'retail-news'" :lanes="newsLanes" :activeLane="activeNewsLane" :keyword="newsKeyword" :news="filteredNews" :syncLabel="syncLabel" :selected="selectedNews" :onOpen="openNews" @update:activeLane="activeNewsLane = $event" @update:keyword="newsKeyword = $event" @closeDetail="selectedNews = null" />

      <HotRank v-else-if="activeSection === 'hot-rank'" :news="filteredNews" :onOpen="openNews" />

      <CaseTracker v-else-if="activeSection === 'case-tracker'" :caseData="selectedCase" @back="closeCase" />

      <section v-else-if="activeSection === 'lab'" class="lab-section module-section">
        <div class="lab-copy"><span class="eyebrow">BACK ROOM · EXPERIMENTS</span><h2>后院实验室</h2><p>这里不卖单个工具，专门研究 Prompt、Agent、Workflow 和 MCP 怎么串成真正能工作的东西。</p><button @click="navigate('tools')">去工具货架 <span>→</span></button></div>
        <div class="lab-shelf"><button v-for="item in [['⌘','Prompt','提示词配方'],['✦','Agent','自动干活'],['↯','Workflow','工作流'],['∞','MCP','工具连接']]" :key="item[1]" class="lab-item" @click="navigate('tools')"><b>{{item[0]}}</b><strong>{{item[1]}}</strong><small>{{item[2]}}</small><i>进入实验 →</i></button></div>
      </section>
    </main>

    <footer><strong>AI 杂货铺</strong><span>不是什么都懂，但尽量让你少走几步。</span><small>AI Grocery Store · Tools, workflows & real use cases.</small></footer>

    <transition name="fade">
      <div v-if="drawerTool" class="drawer-mask" @click.self="drawerTool=null"><aside class="drawer"><button class="drawer-close" @click="drawerTool=null">×</button><div class="drawer-photo" :class="drawerTool.accent">{{ drawerTool.icon }}</div><span class="drawer-kicker">{{ drawerTool.category }} · {{ drawerTool.note }}</span><h2>{{ drawerTool.name }}</h2><p>{{ drawerTool.desc }}。打开官网了解最新能力、价格和使用方式。</p><div class="drawer-meta"><span>AI TOOL</span><span>OFFICIAL</span></div><a :href="drawerTool.url" target="_blank" rel="noopener" class="drawer-cta">去官网看看 <span>↗</span></a></aside></div>
    </transition>

    <transition name="fade">
      <ContentDetail v-if="detail" :detail="detail" :onClose="closeDetail" :onOpenTool="openToolByName" />
    </transition>

    <transition name="fade">
      <div v-if="showSearch" class="search-overlay" @click.self="showSearch=false"><div class="global-search">⌕<input v-model="keyword" autofocus placeholder="搜索 AI 工具，例如 Cursor、论文、设计..." @keyup.enter="showSearch=false;navigate('tools')"><button @click="showSearch=false;navigate('tools')">进入货架 →</button></div></div>
    </transition>
  </div>
</template>