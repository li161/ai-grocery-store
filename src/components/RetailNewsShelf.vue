<script setup>
defineProps({
  lanes: { type: Array, required: true },
  activeLane: { type: String, required: true },
  keyword: { type: String, required: true },
  news: { type: Array, required: true },
  syncLabel: { type: String, required: true },
  onOpen: { type: Function, required: true }
})
const emit = defineEmits(['update:activeLane','update:keyword'])
</script>

<template>
  <section id="retail-news" class="section news-section">
    <div class="section-head news-head">
      <div>
        <span class="eyebrow">AISLE 02 · RETAIL INTELLIGENCE</span>
        <h2>零售情报货架</h2>
        <p>不只收集 AI 新闻，而是把平台动态翻译成：导购、商品、库存、支付和 App 下一步该怎么做。</p>
      </div>
      <div class="news-status"><span class="live-dot"></span><strong>自动补货中</strong><small>{{ syncLabel }}</small></div>
    </div>

    <div class="signal-board">
      <div><b>01</b><strong>AI 导购</strong><small>从推荐进入比较、下单</small></div>
      <div><b>02</b><strong>Agentic Commerce</strong><small>AI 开始成为交易入口</small></div>
      <div><b>03</b><strong>零售运营</strong><small>需求预测连接库存履约</small></div>
      <div><b>04</b><strong>平台关系</strong><small>流量、数据、订单归属重新分配</small></div>
    </div>

    <div class="news-controls">
      <div class="news-tabs">
        <button v-for="lane in lanes" :key="lane" :class="{active: activeLane === lane}" @click="emit('update:activeLane', lane)">{{ lane }}</button>
      </div>
      <label class="news-search">⌕ <input :value="keyword" placeholder="搜平台、AI 导购、支付、库存..." @input="emit('update:keyword', $event.target.value)"></label>
    </div>

    <div class="news-rack">
      <button v-for="item in news" :key="item.id" class="news-card" @click="onOpen(item)">
        <div class="news-card-top"><span class="news-lane">{{ item.lane }}</span><time>{{ item.date }}</time></div>
        <h3>{{ item.title }}</h3>
        <p>{{ item.summary }}</p>
        <div class="news-card-bottom"><strong>{{ item.source }}</strong><span>{{ item.tags?.slice(0,2).join(' · ') }}</span><b>打开情报 ↗</b></div>
      </button>
    </div>
    <div v-if="!news.length" class="news-empty">这一栏暂时没有匹配的情报，换个关键词试试。</div>
  </section>
</template>
