<script setup>
defineProps({ onNavigate: { type: Function, required: true }, onSearch: { type: Function, required: true } })
</script>

<template>
  <header class="store-nav">
    <button class="store-sign" @click="onNavigate('home')">
      <span class="sign-title">AI 杂货铺</span>
      <span class="sign-subtitle">什么 AI 都有，进来逛逛。</span>
    </button>
    <nav class="hanging-nav" aria-label="主导航">
      <button @click="onNavigate('tools')"><span>⚒</span>工具</button>
      <button @click="onNavigate('industry')"><span>▦</span>行业</button>
      <button @click="onNavigate('bundles')"><span>◈</span>套装</button>
      <button @click="onNavigate('lab')"><span>⚗</span>后院实验室</button>
    </nav>
    <button class="nav-search-trigger" @click="onSearch()">⌕ <span>找点什么</span></button>
  </header>
</template>
