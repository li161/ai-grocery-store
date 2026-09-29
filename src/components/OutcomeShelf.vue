<script setup>
import { computed, ref } from 'vue'
import { outcomeCategories, retailCases } from '../data/retailCases'

const props = defineProps({ onOpenCase: { type: Function, required: true } })
const active = ref('all')
const selected = ref(retailCases[0])
const filtered = computed(() => active.value === 'all' ? retailCases : retailCases.filter(item => item.outcome === active.value))
function select(item){ selected.value=item }
</script>

<template>
  <section class="outcome-module section">
    <header class="outcome-head">
      <div>
        <div class="module-kicker"><span>01</span> VERIFIED OUTCOMES <small>经营结果货架</small></div>
        <h1>别先看工具，先看结果</h1>
        <p>把公开案例按“省人力、降损耗、提坪效、增收入”组织。每个结果都必须有案例、有信源、有下一次验证点。</p>
      </div>
      <div class="outcome-rule"><strong>证据优先</strong><small>官宣 ≠ 已兑现</small></div>
    </header>

    <nav class="outcome-tabs">
      <button v-for="item in outcomeCategories" :key="item.id" :class="{active:active===item.id}" @click="active=item.id">{{ item.label }}</button>
    </nav>

    <div class="outcome-grid">
      <div class="case-shelf">
        <button v-for="item in filtered" :key="item.id" class="outcome-case" :class="{active:selected?.id===item.id}" @click="select(item)">
          <div class="outcome-case-top"><span>{{ item.outcomeLabel }}</span><b :class="'status-'+item.statusTone">{{ item.status }}</b></div>
          <div class="outcome-case-icon">{{ item.icon }}</div>
          <h2>{{ item.title }}</h2>
          <p>{{ item.headline }}</p>
          <div class="outcome-metric"><strong>{{ item.metric.value }}</strong><span>{{ item.metric.unit }}</span><small>{{ item.metric.label }} · {{ item.metric.note }}</small></div>
        </button>
        <div v-if="!filtered.length" class="outcome-empty">
          <strong>这个结果分类正在补案例</strong>
          <span>暂不填没有证据支撑的数字。后续同步到公开信源后再上架。</span>
        </div>
      </div>

      <article v-if="selected" class="outcome-preview">
        <div class="outcome-preview-head">
          <span>CASE TRACKING</span><b>{{ selected.status }}</b>
        </div>
        <h2>{{ selected.title }}</h2>
        <p class="outcome-summary">{{ selected.summary }}</p>

        <div class="evidence-strip">
          <div><small>经营结果</small><strong>{{ selected.outcomeLabel }}</strong></div>
          <div><small>当前状态</small><strong>{{ selected.status }}</strong></div>
          <div><small>追踪节点</small><strong>{{ selected.sources.length }} 个</strong></div>
        </div>

        <div class="verification-box">
          <span>我的标注</span>
          <p>{{ selected.verification }}</p>
        </div>

        <div class="next-check">
          <small>下一步看什么</small>
          <strong>{{ selected.next }}</strong>
        </div>

        <button class="track-entry" @click="props.onOpenCase(selected)">查看完整证据链 <span>→</span></button>
      </article>
    </div>
  </section>
</template>
