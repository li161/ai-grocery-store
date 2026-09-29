<script setup>
defineProps({
  onNavigate: { type: Function, required: true }
})
</script>

<template>
  <section id="home" class="store-hero">
    <div class="store-backdrop" aria-hidden="true"></div>

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

    <div class="hero-cta">
      <button class="cta-primary" @click="onNavigate('tools')">逛工具货架 →</button>
      <button class="cta-secondary" @click="onNavigate('industry')">看看 AI 能干什么</button>
    </div>

    <div class="hero-counter" aria-label="AI 杂货铺统计">
      <div><strong>80<span>+</span></strong><small>工具货物</small></div>
      <div><strong>12</strong><small>行业货架</small></div>
      <div><strong>24</strong><small>现成套装</small></div>
    </div>
  </section>
</template>
