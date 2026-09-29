<script setup>
import { computed } from 'vue'
const props=defineProps({news:{type:Array,required:true},onOpen:{type:Function,required:true}})
const ranked=computed(()=>props.news.slice().sort((a,b)=>(b.eventHeatScore||0)-(a.eventHeatScore||0)).slice(0,10))
const score=(item,index)=>item.eventHeatScore ?? item.heatScore ?? Math.max(62,92-index*7)
</script>

<template>
  <section class="hot-module">
    <header class="hot-head">
      <div><span class="hot-live">● 实时热度</span><h1>AI 热点榜</h1><p>同一事件多源合并；按零售影响、独立信源、时效与官方披露计算事件热度。</p></div>
      <time>更新于 {{ ranked[0]?.date || '—' }} · 事件热度</time>
    </header>

    <div v-if="ranked.length" class="hot-feature">
      <button class="hot-main" @click="onOpen(ranked[0])">
        <div class="hot-rank-no">NO.01 <span>刚刚更新</span></div>
        <div class="hot-main-grid"><div><h2>{{ ranked[0].title }}</h2><p>{{ ranked[0].summary }}</p><strong>最新进展 · {{ ranked[0].impact }}</strong><small>{{ ranked[0].eventSourceCount || 1 }} 个独立信源 · {{ ranked[0].date }}</small></div><div class="hot-score"><i></i><b>{{ score(ranked[0],0) }}</b><span>事件热度</span></div></div>
      </button>
      <div class="hot-side">
        <button v-for="(item,index) in ranked.slice(1,3)" :key="item.id" @click="onOpen(item)">
          <span>NO.0{{ index+2 }}</span><em>{{ item.lane }} · {{ item.eventSourceCount || 1 }} 源</em><h3>{{ item.title }}</h3><p>{{ item.summary }}</p><strong>{{ score(item,index+1) }}</strong>
        </button>
      </div>
    </div>

    <div class="hot-list">
      <div class="hot-list-title"><strong>继续看 No.04–10</strong><span>按 AI 零售影响 + 新鲜度 + 信源 + 事件聚簇排序 · 点击查看完整情报</span></div>
      <button v-for="(item,index) in ranked.slice(3)" :key="item.id" @click="onOpen(item)">
        <b>{{ String(index+4).padStart(2,'0') }}</b><div><strong>{{ item.title }}</strong><p>{{ item.date }} · {{ item.eventSourceCount || 1 }} 个独立信源 · {{ item.eventTitle || item.summary }}</p></div><span>{{ score(item,index+3) }}</span>
      </button>
    </div>
  </section>
</template>