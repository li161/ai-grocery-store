<script setup>
defineProps({
  tools: { type: Array, required: true },
  onNavigate: { type: Function, required: true },
  onOpenTool: { type: Function, required: true }
})
</script>

<template>
  <section id="home" class="store-hero">
    <div class="store-backdrop"></div>
    <div class="scene-light"></div>
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

    <div class="back-lab">
      <div class="back-lab-title">⚗ 后院实验室 <small>换来更多可能</small></div>
      <div class="lab-grid">
        <span>Prompt<small>提示词配方</small></span>
        <span>Agent<small>智能体应用</small></span>
        <span>Workflow<small>工作流混合</small></span>
        <span>MCP<small>模型上下文协议</small></span>
      </div>
    </div>

    <div class="tool-island">
      <div class="island-header"><strong>🛒 AI 工具</strong><small>挑一件趁手的</small></div>
      <div class="hero-products">
        <button v-for="tool in tools.slice(0, 8)" :key="tool.name" class="hero-product" @click="onOpenTool(tool)">
          <span class="hero-pack" :class="tool.accent">{{ tool.icon }}</span>
          <strong>{{ tool.name }}</strong>
          <small>{{ tool.category }} · {{ tool.note }}</small>
        </button>
      </div>
      <div class="wood-shelf"></div>
    </div>

    <aside class="industry-island">
      <div class="industry-island-title">▦ <strong>AI × 行业</strong><small>让 AI 走进你的行业</small></div>
      <div class="industry-mini-grid">
        <button v-for="item in ['电商','程序员','新媒体','设计','教育','企业办公','医疗','金融','制造业']" :key="item" @click="onNavigate('industry')">
          <span>{{ item === '程序员' ? '</>' : item === '电商' ? '🛒' : item === '新媒体' ? '▶' : '✦' }}</span>{{ item }}
        </button>
      </div>
      <div class="industry-beam"></div>
    </aside>

    <div class="floor-bench">
      <span>AI 杂货铺</span>
      <small>让好工具成为你的生产力</small>
    </div>

    <div class="hero-cta">
      <button class="cta-primary" @click="onNavigate('tools')">逛工具货架 →</button>
      <button class="cta-secondary" @click="onNavigate('industry')">看看 AI 能干什么</button>
    </div>

    <div class="hero-counter">
      <div><strong>80<span>+</span></strong><small>工具货物</small></div>
      <div><strong>12</strong><small>行业货架</small></div>
      <div><strong>24</strong><small>现成套装</small></div>
    </div>
  </section>
</template>
