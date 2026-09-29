<script setup>
defineProps({
  sections: { type:Array, required:true },
  activeSection: { type:String, required:true },
  darkMode: { type:Boolean, required:true },
  onNavigate: { type:Function, required:true },
  onSearch: { type:Function, required:true },
  onToggleTheme: { type:Function, required:true }
})
</script>

<template>
  <aside class="store-sidebar">
    <button class="sidebar-brand" @click="onNavigate('home')">
      <span class="brand-mark">AI</span>
      <span><strong>AI 杂货铺</strong><small>AI GROCERY STORE</small></span>
    </button>

    <div v-for="group in [...new Set(sections.map(s => s.group))]" :key="group" class="sidebar-group">
      <span class="sidebar-group-title">{{ group }}</span>
      <button v-for="item in sections.filter(s => s.group === group)" :key="item.id" class="sidebar-item" :class="{active:activeSection===item.id}" @click="onNavigate(item.id)">
        <i>{{ item.icon }}</i><span>{{ item.label }}</span>
        <b v-if="item.id === 'retail-news'">NEW</b>
      </button>
    </div>

    <div class="sidebar-spacer"></div>

    <button class="sidebar-search" @click="onSearch">⌕ <span>搜索工具 / 情报</span><kbd>/</kbd></button>
    <button class="sidebar-theme" @click="onToggleTheme"><span>{{ darkMode ? '☀' : '☾' }}</span><span>{{ darkMode ? '切换白天' : '切换黑夜' }}</span><small>{{ darkMode ? 'LIGHT' : 'DARK' }}</small></button>
    <div class="sidebar-footer"><span class="status-dot"></span>情报自动同步 <small>LIVE</small></div>
  </aside>
</template>