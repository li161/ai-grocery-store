<script setup>
import { computed, ref } from 'vue'
const orbitIndex = ref(0)
const sceneTilt = ref({ x: 0, y: 0 })
const orbitItems = [
  { label: 'AI 工具', icon: '✳', note: '工具与能力', target: 'tools' },
  { label: '零售情报', icon: '◉', note: '追踪行业信号', target: 'retail-news' },
  { label: '经营结果', icon: '↗', note: '可验证的业务价值', target: 'outcomes' },
  { label: 'AI × 行业', icon: '▦', note: '真实落地场景', target: 'industry' },
]
const activeOrbit = computed(() => orbitItems[orbitIndex.value])
const sceneStyle = computed(() => ({
  '--tilt-x': sceneTilt.value.x + 'deg',
  '--tilt-y': sceneTilt.value.y + 'deg',
  '--tilt-x-soft': sceneTilt.value.x * 0.1 + 'deg',
  '--tilt-y-soft': sceneTilt.value.y * -0.12 + 'deg',
  '--tilt-x-orbit': sceneTilt.value.x * 0.12 + 'deg',
  '--tilt-y-orbit': sceneTilt.value.y * 0.16 + 'deg',
  '--tilt-x-floor': sceneTilt.value.x * -0.04 + 'deg',
  '--tilt-y-floor': sceneTilt.value.y * 0.07 + 'deg',
}))
function selectOrbit(index, item) {
  orbitIndex.value = index
  props.onNavigate(item.target)
}
function rotateOrbit(step) {
  orbitIndex.value = (orbitIndex.value + step + orbitItems.length) % orbitItems.length
}
function handleSceneMove(event) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const rect = event.currentTarget.getBoundingClientRect()
  const nx = (event.clientX - rect.left) / rect.width - 0.5
  const ny = (event.clientY - rect.top) / rect.height - 0.5
  sceneTilt.value = { x: Number((-ny * 12).toFixed(2)), y: Number((nx * 14).toFixed(2)) }
}
function resetScene() {
  sceneTilt.value = { x: 0, y: 0 }
}
const baseUrl = import.meta.env.BASE_URL
const props = defineProps({
  onNavigate: { type: Function, required: true },
  onOpenTool: { type: Function, required: true },
  onOpenIndustry: { type: Function, required: true },
  onOpenBundle: { type: Function, required: true },
  onOpenNews: { type: Function, required: true },
  tools: { type: Array, required: true },
  industries: { type: Array, required: true },
  bundles: { type: Array, required: true },
  news: { type: Array, required: true },
})
</script>
<template>
  <section
    id="home"
    class="store-hero immersive-store"
    :style="sceneStyle"
    @pointermove="handleSceneMove"
    @pointerleave="resetScene"
  >
    <img
      class="store-backdrop"
      :src="baseUrl + 'store-bg.webp'"
      alt=""
      aria-hidden="true"
      decoding="async"
      fetchpriority="high"
    />
    <div class="hero-sign">
      <span class="sign-kicker">A NEW KIND OF AI MARKET</span>
      <h1>AI 杂货铺</h1>
      <p>把 AI 能力、真实案例与经营机会，放进同一间数字商店。</p>
    </div>
    <div class="scene-note">
      <span>✦</span><strong>今日店讯</strong><span>转动 3D 星环，探索工具、情报与业务机会。</span>
    </div>
    <div class="supply-orbit" aria-label="可交互的 3D 供给星环">
      <div class="orbit-caption">
        <span class="orbit-live"></span> SUPPLY NETWORK <small>3D INTERACTIVE MAP</small>
      </div>
      <div class="orbit-stage">
        <div class="orbit-ring orbit-ring-a"></div>
        <div class="orbit-ring orbit-ring-b"></div>
        <div class="orbit-ring orbit-ring-c"></div>
        <button
          class="orbit-core"
          @click="onNavigate(activeOrbit.target)"
          :aria-label="'打开' + activeOrbit.label"
        >
          <span class="core-glow"></span><strong>{{ activeOrbit.icon }}</strong
          ><small>{{ activeOrbit.label }}</small>
        </button>
        <button
          v-for="(item, index) in orbitItems"
          :key="item.label"
          class="orbit-node"
          :class="'orbit-node-' + index"
          :aria-pressed="orbitIndex === index"
          @click="selectOrbit(index, item)"
        >
          <span>{{ item.icon }}</span
          ><small>{{ item.label }}</small>
        </button>
      </div>
      <div class="orbit-controls">
        <button aria-label="上一个供给节点" @click="rotateOrbit(-1)">↶</button>
        <div>
          <strong>{{ activeOrbit.label }}</strong
          ><small>{{ activeOrbit.note }}</small>
        </div>
        <button aria-label="下一个供给节点" @click="rotateOrbit(1)">↷</button>
      </div>
    </div>
    <div class="spatial-store" aria-label="3D 空间货架">
      <div class="spatial-header">
        <div><span>AI RETAIL FLOOR / 01</span><strong>正在上架 · 可直接探索</strong></div>
        <button @click="onNavigate('retail-platform-actions')">今日平台动作 ↗</button>
      </div>
      <div class="spatial-shelves">
        <button
          v-for="(tool, index) in tools.slice(0, 4)"
          :key="tool.name"
          class="spatial-product"
          :class="'p' + index"
          @click="onOpenTool(tool)"
        >
          <span class="product-price">{{ tool.note }}</span
          ><span class="spatial-pack" :class="tool.accent">{{ tool.icon }}</span
          ><strong>{{ tool.name }}</strong
          ><small>{{ tool.desc }}</small
          ><i>打开能力档案 ↗</i>
        </button>
      </div>
      <div class="spatial-bottom">
        <button
          class="spatial-bin industry-bin"
          @click="industries[0] && onOpenIndustry(industries[0])"
        >
          <span>AI × INDUSTRY</span
          ><strong>{{ industries[0]?.name }} · {{ industries[0]?.headline }}</strong
          ><i>进入行业场景 →</i>
        </button>
        <button class="spatial-bin bundle-bin" @click="bundles[0] && onOpenBundle(bundles[0])">
          <span>READY-MADE KIT</span><strong>{{ bundles[0]?.title }}</strong
          ><i>打开工作流套装 →</i>
        </button>
        <button v-if="news[0]" class="spatial-bin news-bin" @click="onOpenNews(news[0])">
          <span>LIVE SIGNAL · {{ news[0].date }}</span
          ><strong>{{ news[0].title }}</strong
          ><i>查看信源与影响 →</i>
        </button>
      </div>
    </div>
    <div class="hero-cta">
      <button class="cta-primary" @click="onNavigate('tools')">进入 3D 工具货架 →</button
      ><button class="cta-secondary" @click="onNavigate('industry')">探索行业落地</button>
    </div>
    <div class="hero-counter" aria-label="AI 杂货铺统计">
      <div>
        <strong>{{ tools.length }}<span>+</span></strong
        ><small>AI 工具</small>
      </div>
      <div>
        <strong>{{ industries.length }}</strong
        ><small>行业场景</small>
      </div>
      <div>
        <strong>{{ bundles.length }}</strong
        ><small>工作流套装</small>
      </div>
    </div>
  </section>
</template>
