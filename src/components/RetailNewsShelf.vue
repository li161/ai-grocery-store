<script setup>
defineProps({
  lanes:{type:Array,required:true}, activeLane:{type:String,required:true}, keyword:{type:String,required:true},
  news:{type:Array,required:true}, syncLabel:{type:String,required:true}, selected:{type:Object,default:null},
  onOpen:{type:Function,required:true}
})
const emit=defineEmits(['update:activeLane','update:keyword','closeDetail'])
</script>

<template>
  <section class="news-module">
    <div v-if="selected" class="news-detail-view">
      <button class="back-to-news" @click="emit('closeDetail')">← 返回零售情报</button>
      <div class="news-detail-topline"><span>{{ selected.lane }}</span><time>{{ selected.date }}</time><em>{{ selected.source }}</em></div>
      <h1>{{ selected.title }}</h1>
      <p class="news-detail-lead">{{ selected.summary }}</p>
      <div class="news-detail-grid">
        <article><span>发生了什么</span><h3>事件摘要</h3><p>{{ selected.summary }}</p></article>
        <article><span>为什么值得看</span><h3>对零售意味着什么</h3><p>{{ selected.impact }}</p></article>
        <article><span>接下来关注</span><h3>导购 / 商品 / 运营动作</h3><p>{{ selected.action }}</p></article>
      </div>
      <div class="news-detail-tags"><b v-for="tag in selected.tags" :key="tag">#{{ tag }}</b></div>
      <div class="news-source-panel"><div><span>原始报道</span><strong>{{ selected.source }}</strong><small>{{ selected.date }} · 这是可追溯的原始来源</small></div><a :href="selected.url" target="_blank" rel="noopener">打开原文 ↗</a></div>
    </div>

    <template v-else>
      <header class="news-module-head">
        <div><div class="module-kicker"><span>04</span> RETAIL INTELLIGENCE <small>零售情报</small></div><h1>零售情报时间线</h1><p>不把新闻压成一句结论。每条情报都保留：发生了什么、为什么重要、下一步看什么。</p></div>
        <div class="news-sync"><span class="live-dot"></span><strong>自动补货中</strong><small>{{ syncLabel }}</small></div>
      </header>

      <div class="news-lanes">
        <button v-for="lane in lanes" :key="lane" :class="{active:activeLane===lane}" @click="emit('update:activeLane',lane)">{{ lane }}</button>
      </div>
      <div class="timeline-toolbar"><label>⌕ <input :value="keyword" placeholder="搜索平台、导购、支付、库存..." @input="emit('update:keyword',$event.target.value)"></label><span>{{ news.length }} 条情报</span></div>

      <div class="news-timeline">
        <div v-for="(item,index) in news" :key="item.id" class="timeline-row">
          <time>{{ item.date }}</time>
          <div class="timeline-pin"><i></i></div>
          <button class="timeline-story" @click="onOpen(item)">
            <div class="story-meta"><span>{{ item.lane }}</span><b>{{ item.source }}</b></div>
            <h2>{{ item.title }}</h2>
            <p>{{ item.summary }}</p>
            <div class="story-foot"><span v-for="tag in item.tags?.slice(0,3)" :key="tag">#{{ tag }}</span><strong>查看完整情报 →</strong></div>
          </button>
        </div>
      </div>
      <div v-if="!news.length" class="news-empty">没有匹配的情报，换个关键词试试。</div>
    </section>
</template>
