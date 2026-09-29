<script setup>
defineProps({
  categories: { type: Array, required: true },
  activeCategory: { type: String, required: true },
  keyword: { type: String, required: true },
  tools: { type: Array, required: true },
  onOpenTool: { type: Function, required: true }
})
const emit = defineEmits(['update:activeCategory','update:keyword'])
</script>

<template>
  <section id="tools" class="section tools-section">
    <div class="section-head">
      <div><span class="eyebrow">AISLE 01 · AI TOOLS</span><h2>工具货架</h2><p>像逛便利店一样挑 AI。点击商品，直接去官网。</p></div>
      <div class="receipt"><span>OPEN</span><strong>09:00—24:00</strong><small>营业中 · 随时补货</small></div>
    </div>
    <div class="filter-bar">
      <div class="category-tabs">
        <button v-for="category in categories" :key="category" :class="{active:activeCategory===category}" @click="emit('update:activeCategory',category)">{{ category }}</button>
      </div>
      <label class="search-box">⌕<input :value="keyword" placeholder="搜索货架上的工具..." @input="emit('update:keyword',$event.target.value)"></label>
    </div>
    <div class="physical-shelf">
      <div class="shelf-top"><div class="shelf-label"><span class="label-icon">AI</span><div><strong>精选工具</strong><small>THE AI TOOL AISLE</small></div></div><span class="stock">{{ tools.length }} 件在架</span></div>
      <div class="product-row">
        <button v-for="tool in tools" :key="tool.name" class="product" @click="onOpenTool(tool)">
          <span class="product-tag">{{ tool.note }}</span>
          <span class="product-pack" :class="tool.accent">{{ tool.icon }}</span>
          <span class="product-name">{{ tool.name }}</span>
          <span class="product-desc">{{ tool.desc }}</span>
          <span class="product-footer"><small>{{ tool.category }}</small><b>查看 ↗</b></span>
        </button>
      </div>
      <div class="wood-beam"></div><div class="shelf-floor"></div>
    </div>
  </section>
</template>
