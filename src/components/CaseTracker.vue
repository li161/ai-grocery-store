<script setup>
import { ref } from 'vue'
import { retailCases } from '../data/retailCases'
const props=defineProps({ caseData: { type:Object, default:null } })
const selected=ref(props.caseData || retailCases[0])
</script>

<template>
<section v-if="selected" class="case-tracker section">
  <header class="tracker-head">
    <button class="tracker-back" @click="$emit('back')">← 返回经营结果</button>
    <div class="module-kicker"><span>05</span> CASE TRACKING <small>案例追踪</small></div>
    <div class="tracker-meta"><span>{{ selected.outcomeLabel }}</span><b>{{ selected.status }}</b></div>
    <h1>{{ selected.title }}</h1>
    <p>{{ selected.headline }}</p>
  </header>

  <div class="tracker-layout">
    <main class="evidence-card">
      <div class="evidence-head"><div><span>证据链</span><h2>这件事到底走到哪一步了？</h2></div><small>按公开信源对齐</small></div>
      <div class="evidence-row" v-for="(item,index) in selected.sources" :key="item.date">
        <div class="evidence-date">{{ item.date }}</div>
        <div class="evidence-node"><i></i></div>
        <article>
          <div class="evidence-source"><strong>{{ item.source }}</strong><b>{{ item.state }}</b></div>
          <h3>{{ item.title }}</h3>
          <p>{{ item.note }}</p>
          <a :href="item.url" target="_blank" rel="noopener">查看原始信源 ↗</a>
        </article>
      </div>
    </main>

    <aside class="tracker-side">
      <section>
        <small>核心数字</small>
        <strong>{{ selected.metric.value }}<em>{{ selected.metric.unit }}</em></strong>
        <p>{{ selected.metric.label }} · {{ selected.metric.note }}</p>
      </section>
      <section>
        <small>验证结论</small>
        <p>{{ selected.verification }}</p>
      </section>
      <section>
        <small>下一次对照</small>
        <p>{{ selected.next }}</p>
      </section>
    </aside>
  </div>
</section>
</template>
