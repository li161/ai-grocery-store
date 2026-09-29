<script setup>
import { computed } from 'vue'
const props=defineProps({news:{type:Array,required:true},onOpen:{type:Function,required:true}})
const ranked=computed(()=>props.news.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,10))
const score=(item,index)=>item.heatScore ?? Math.max(62,92-index*7)
</script>

<template>
  <section class="hot-module">
    <header class="hot-head">
      <div><span class="hot-live">● 实时热度</span><h1>AI 热点榜</h1><p>把最近零售 / AI 圈值得继续追踪的事件单独拎出来。</p></div>
      <time>更新于 {{ ranked[0]?.date || '—' }} · 店内热度</time>
    </header>

    <div v-if="ranked.length" class="hot-feature">
      <button class="hot-main" @click="onOpen(ranked[0])">
        <div class="hot-rank-no">NO.01 <span>刚刚更新</span></div>
        <div class="hot-main-grid"><div><h2>{{ ranked[0].title }}</h2><p>{{ ranked[0].summary }}</p><strong>最新进展 · {{ ranked[0].impact }}</strong><small>{{ ranked[0].source }} · {{ ranked[0].date }}</small></div><div class="hot-score"><i></i><b>{{ score(ranked[0],0) }}</b><span>热度指数</span></div></div>
      </button>
      <div class="hot-side">
        <button v-for="(item,index) in ranked.slice(1,3)" :key="item.id" @click="onOpen(item)">
          <span>NO.0{{ index+2 }}</span><em>{{ item.lane }}</em><h3>{{ item.title }}</h3><p>{{ item.summary }}</p><strong>{{ score(item,index+1) }}</strong>
        </button>
      </div>
    </div>

    <div class="hot-list">
      <div class="hot-list-title"><strong>继续看 No.04–10</strong><span>按 AI 零售影响 + 新鲜度 + 信源 + 事件聚簇排序 · 点击查看完整情报</span></div>
      <button v-for="(item,index) in ranked.slice(3)" :key="item.id" @click="onOpen(item)">
        <b>{{ String(index+4).padStart(2,'0') }}</b><div><strong>{{ item.title }}</strong><p>{{ item.date }} · {{ item.source }} · {{ item.summary }}</p></div><span>{{ score(item,index+3) }}</span>
      </button>
    </div>
  </section>
</template>