<script setup>
import { computed, ref } from 'vue'
const orbitIndex = ref(0)
const orbitItems = [
  { label: 'AI 工具', icon: '✳', note: '工具与能力', target: 'tools' },
  { label: '零售情报', icon: '◉', note: '实时行业信号', target: 'retail-news' },
  { label: '经营结果', icon: '↗', note: '可验证的业务价值', target: 'outcomes' },
  { label: 'AI × 行业', icon: '▦', note: '落地场景', target: 'industry' }
]
const activeOrbit = computed(() => orbitItems[orbitIndex.value])
function rotateOrbit(step) {
  orbitIndex.value = (orbitIndex.value + step + orbitItems.length) % orbitItems.length
}
const baseUrl = import.meta.env.BASE_URL
defineProps({
  onNavigate: { type: Function, required: true },
  onOpenTool: { type: Function, required: true },
  onOpenIndustry: { type: Function, required: true },
  onOpenBundle: { type: Function, required: true },
  onOpenNews: { type: Function, required: true },
  tools: { type: Array, required: true },
  industries: { type: Array, required: true },
  bundles: { type: Array, required: true },
  news: { type: Array, required: true }
})
</script>

<template>
  <section id="home" class="store-hero">
    <img class="store-backdrop" :src="baseUrl + 'store-bg.webp'" alt="" aria-hidden="true" decoding="async" fetchpriority="high" />

    <div class="hero-sign">
      <span class="sign-kicker">WELCOME TO</span>
      <h1>AI 杂货铺</h1>
      <p>工具有人卖，玩法有人教，行业里也能用。</p>
    </div>

    <div class="scene-note">
      <span>✦</span>
      <strong>老板说：</strong>
      <span>“今天刚进了一批 AI，要不要看看？”</span>
    </div>

    <div class="supply-orbit" aria-label="可交互的 3D 供给星环">
      <div class="orbit-caption"><span class="orbit-live"></span> SUPPLY NETWORK <small>互动式 3D 导览</small></div>
      <div class="orbit-stage" :class="'orbit-focus-' + orbitIndex">
        <div class="orbit-ring orbit-ring-a"></div>
        <div class="orbit-ring orbit-ring-b"></div>
        <div class="orbit-ring orbit-ring-c"></div>
        <button class="orbit-core" @click="onNavigate(activeOrbit.target)" :aria-label="'打开' + activeOrbit.label">
          <span class="core-glow"></span><strong>{{ activeOrbit.icon }}</strong><small>{{ activeOrbit.label }}</small>
        </button>
        <button v-for="(item, index) in orbitItems" :key="item.label" class="orbit-node" :class="'orbit-node-' + index" :aria-pressed="orbitIndex === index" @click="orbitIndex = index; onNavigate(item.target)">
          <span>{{ item.icon }}</span><small>{{ item.label }}</small>
        </button>
      </div>
      <div class="orbit-controls">
        <button aria-label="上一个供给节点" @click="rotateOrbit(-1)">↶</button>
        <div><strong>{{ activeOrbit.label }}</strong><small>{{ activeOrbit.note }}</small></div>
        <button aria-label="下一个供给节点" @click="rotateOrbit(1)">↷</button>
      </div>
    </div>

    <div class="spatial-store" aria-label="首页空间货架">
      <div class="spatial-header">
        <div><span>AI RETAIL FLOOR</span><strong>今日上架</strong></div>
        <button @click="onNavigate('retail-platform-actions')">查看今日情报 ↗</button>
      </div>

      <div class="spatial-shelves">
        <button
          v-for="(tool,index) in tools.slice(0,4)"
          :key="tool.name"
          class="spatial-product"
          :class="'p' + index"
          @click="onOpenTool(tool)"
        >
          <span class="product-price">{{ tool.note }}</span>
          <span class="spatial-pack" :class="tool.accent">{{ tool.icon }}</span>
          <strong>{{ tool.name }}</strong>
          <small>{{ tool.desc }}</small>
          <i>查看商品 ↗</i>
        </button>
      </div>

      <div class="spatial-bottom">
        <button class="spatial-bin industry-bin" @click="onOpenIndustry(industries[0])">
          <span>AI × 行业</span><strong>{{ industries[0]?.name }} · {{ industries[0]?.headline }}</strong><i>打开行业货架 →</i>
        </button>
        <button class="spatial-bin bundle-bin" @click="onOpenBundle(bundles[0])">
          <span>READY-MADE KIT</span><strong>{{ bundles[0]?.title }}</strong><i>打开套装 →</i>
        </button>
        <button v-if="news[0]" class="spatial-bin news-bin" @click="onOpenNews(news[0])">
          <span>LIVE SIGNAL · {{ news[0].date }}</span><strong>{{ news[0].title }}</strong><i>打开最新情报 →</i>
        </button>
      </div>
    </div>

    <div class="hero-cta">
      <button class="cta-primary" @click="onNavigate('tools')">逛工具货架 →</button>
      <button class="cta-secondary" @click="onNavigate('industry')">看看 AI 能干什么</button>
    </div>

    <div class="hero-counter" aria-label="AI 杂货铺统计">
      <div><strong>{{ tools.length }}<span>+</span></strong><small>工具货物</small></div>
      <div><strong>{{ industries.length }}</strong><small>行业货架</small></div>
      <div><strong>{{ bundles.length }}</strong><small>现成套装</small></div>
    </div>
  </section>
</template>
