<script setup>
import { ref } from 'vue'

defineProps({
  lanes:{type:Array,required:true}, activeLane:{type:String,required:true}, keyword:{type:String,required:true},
  news:{type:Array,required:true}, syncLabel:{type:String,required:true}, dailyDigest:{type:Object,default:()=>({})}, selected:{type:Object,default:null},
  onOpen:{type:Function,required:true}
})

const emit=defineEmits(['update:activeLane','update:keyword','closeDetail'])
const detailTab=ref('overview')
</script>

<template>
  <section class="news-module">
    <div v-if="selected" class="event-detail-page intelligence-detail">
      <nav class="event-breadcrumb" aria-label="当前位置">
        <button @click="emit('closeDetail')">←</button>
        <button @click="emit('closeDetail')">零售情报</button>
        <span>/</span>
        <span>事件详情</span>
      </nav>

      <header class="event-detail-header">
        <div class="event-eyebrow">
          <span>{{ selected.lane }}</span>
          <b>持续更新</b><small>原文可追溯</small>
        </div>

        <h1>{{ selected.title }}</h1>

        <div class="event-meta">
          <span>▤ <strong>1</strong> 篇报道</span>
          <span>♧ <strong>1</strong> 个原始信源</span>
          <span>◷ {{ selected.date }} 更新</span>
        </div>

        <div class="event-tabs" role="tablist">
          <button role="tab" :aria-selected="detailTab==='overview'" :class="{active:detailTab==='overview'}" @click="detailTab='overview'">事件概览</button>
          <button role="tab" :aria-selected="detailTab==='timeline'" :class="{active:detailTab==='timeline'}" @click="detailTab='timeline'">报道时间线 <b>1</b></button>
          <button role="tab" :aria-selected="detailTab==='heat'" :class="{active:detailTab==='heat'}" @click="detailTab='heat'">热度走势</button>
        </div>
      </header>

      <div v-if="detailTab==='overview'" class="event-layout">
        <main class="event-main-card">
          <div class="event-card-head">
            <h2>先了解这件事</h2>
            <span>AI 综合</span>
          </div>

          <p class="event-summary">{{ selected.summary }}</p>

          <div class="event-generated">
            信息状态 · {{ selected.source }} · {{ selected.date }} · 原文直达
          </div>

          <div class="event-progress">
            <div class="event-progress-head">
              <strong>最新进展</strong>
              <time>{{ selected.date }}</time>
            </div>
            <p>{{ selected.action }}</p>
            <span>›</span>
          </div>
        </main>

        <aside class="event-side">
          <section class="event-side-card">
            <div class="event-side-head"><h2>为什么热</h2></div>
            <p>{{ selected.impact }}</p>
            <small>当前情报 · {{ selected.lane }}</small>
          </section>

          <section class="event-side-card">
            <div class="event-side-head"><h2>原始信源</h2><span>1 篇</span></div>
            <p class="side-caption">不把二次转述当成事实，直接打开原文核对。</p>
            <a :href="selected.url" target="_blank" rel="noopener" class="source-story">
              <small>{{ selected.source }}</small>
              <strong>{{ selected.title }} <i>›</i></strong>
            </a>
          </section>

          <section class="event-side-card event-tags-card">
            <div class="event-side-head"><h2>关键词</h2></div>
            <div class="event-tags">
              <span v-for="tag in selected.tags" :key="tag">#{{ tag }}</span>
            </div>
          </section>
        </aside>
      </div>

      <div v-else-if="detailTab==='timeline'" class="event-tab-panel">
        <div class="timeline-event">
          <time>{{ selected.date }}</time>
          <i></i>
          <article>
            <span>{{ selected.source }}</span>
            <h2>{{ selected.title }}</h2>
            <p>{{ selected.summary }}</p>
            <a :href="selected.url" target="_blank" rel="noopener">查看原始报道 ↗</a>
          </article>
        </div>
      </div>

      <div v-else class="event-tab-panel event-heat-panel">
        <div class="empty-metric">
          <span>热度走势</span>
          <strong>暂无独立历史热度数据</strong>
          <p>当前页面保留事件事实与来源，不用缺少数据时人为制造趋势。</p>
        </div>
      </div>
    </div>

    <template v-else>
      <header class="news-module-head">
        <div><div class="module-kicker"><span>04</span> RETAIL INTELLIGENCE <small>零售情报</small></div><h1>零售情报时间线</h1><p>不把新闻压成一句结论。每条情报都保留：发生了什么、为什么重要、下一步看什么。</p></div>
        <div class="news-sync"><span class="live-dot"></span><strong>自动雷达中</strong><small>{{ syncLabel }}</small></div>
        <aside class="daily-radar">
          <span>DAILY · AI 零售日报</span>
          <strong>{{ dailyDigest.lead }}</strong>
          <small>{{ dailyDigest.bullets?.length || 0 }} 条重点 · {{ dailyDigest.method }}</small>
        </aside>
      </header>

      <div class="news-lanes">
        <button v-for="lane in lanes" :key="lane" :class="{active:activeLane===lane}" @click="emit('update:activeLane',lane)">{{ lane }}</button>
      </div>
      <div class="timeline-toolbar"><label>⌕ <input :value="keyword" placeholder="搜索平台、导购、支付、库存..." @input="emit('update:keyword',$event.target.value)"></label><span>{{ news.length }} 条情报</span></div>

      <div class="news-timeline">
        <div v-for="item in news" :key="item.id" class="timeline-row">
          <time>{{ item.date }}</time>
          <div class="timeline-pin"><i></i></div>
          <button class="timeline-story" @click="onOpen(item)">
            <div class="story-meta"><span>{{ item.lane }}</span><b>{{ item.source }}</b><small>原文可追溯</small></div>
            <h2>{{ item.title }}</h2>
            <p>{{ item.summary }}</p>
            <div class="story-foot"><span v-for="tag in item.tags?.slice(0,3)" :key="tag">#{{ tag }}</span><strong>查看完整情报 →</strong></div>
          </button>
        </div>
      </div>
      <div v-if="!news.length" class="news-empty">没有匹配的情报，换个关键词试试。</div>
    </template>
  </section>
</template>
