<script setup>
const lifecycleOrder = ['announcement','agreement','launch','expansion','disclosure','result']
function lifecyclePassed(stage,current){
  const a=lifecycleOrder.indexOf(stage), b=lifecycleOrder.indexOf(current)
  return b>=0 && a>=0 && a<b
}

import { computed, ref } from 'vue'

const props=defineProps({ lanes:{type:Array,required:true}, activeLane:{type:String,required:true}, keyword:{type:String,required:true}, news:{type:Array,required:true}, events:{type:Array,default:()=>[]}, syncLabel:{type:String,required:true}, dailyDigest:{type:Object,default:()=>({})}, selected:{type:Object,default:null}, onOpen:{type:Function,required:true} })

const emit=defineEmits(['update:activeLane','update:keyword','closeDetail'])
const detailTab=ref('overview')
const selectedEvent=computed(()=>props.selected?.eventId ? props.events.find(event=>event.id===props.selected.eventId) : null)
const eventReports=computed(()=>selectedEvent.value?.reports?.length ? selectedEvent.value.reports.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))) : props.selected ? props.news.filter(item=>props.selected.eventId ? item.eventId===props.selected.eventId : item.id===props.selected.id).sort((a,b)=>String(a.date).localeCompare(String(b.date))) : [])
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
          <span>▤ <strong>{{ eventReports.length || 1 }}</strong> 篇报道</span>
          <span>♧ <strong>{{ selectedEvent?.sourceCount || selected.eventSourceCount || 1 }}</strong> 个独立信源</span>
          <span v-if="selectedEvent?.verification">⌁ <strong>{{ selectedEvent.verification.status==='verified' ? '已交叉支持' : selectedEvent.verification.status==='partially_verified' ? '部分支持' : '待核验' }}</strong></span>
          <span>◷ {{ selected.date }} 更新</span>
        </div>

        <div class="event-tabs" role="tablist">
          <button role="tab" :aria-selected="detailTab==='overview'" :class="{active:detailTab==='overview'}" @click="detailTab='overview'">事件概览</button>
          <button role="tab" :aria-selected="detailTab==='timeline'" :class="{active:detailTab==='timeline'}" @click="detailTab='timeline'">事件时间线 <b>{{ eventReports.length || 1 }}</b></button>
          <button role="tab" :aria-selected="detailTab==='heat'" :class="{active:detailTab==='heat'}" @click="detailTab='heat'">热度走势</button>
        </div>
      </header>

      <div v-if="detailTab==='overview'" class="event-layout">
        <main class="event-main-card">
          <div class="event-card-head">
            <h2>先了解这件事</h2>
            <span>AI 综合</span>
          </div>

          <p class="event-summary">{{ selected.eventSummary || selected.summary }}</p>

          <div class="event-generated">
            信息状态 · {{ selected.source }} · {{ selected.date }} · {{ selected.evidence?.label || '原文可追溯' }} · {{ selectedEvent?.verification?.status==='verified' ? '多源支持' : selectedEvent?.verification?.status==='partially_verified' ? '部分支持' : '待核验' }}
          </div>
          <div v-if="selected.businessDimensions?.length" class="event-business-dimensions">
            <span>经营影响</span>
            <b v-for="dimension in selected.businessDimensions" :key="dimension">{{ dimension }}</b>
          </div>

          <div v-if="selectedEvent?.lifecycle" class="event-lifecycle">
            <div class="event-lifecycle-head">
              <div><span>EVENT LIFECYCLE</span><strong>{{ selectedEvent.lifecycle.stageLabel }}</strong></div>
              <small>当前阶段</small>
            </div>
            <div class="event-lifecycle-track">
              <i v-for="stage in ['announcement','agreement','launch','expansion','disclosure','result']" :key="stage" :class="{active: stage===selectedEvent.lifecycle.stage, passed: lifecyclePassed(stage, selectedEvent.lifecycle.stage)}"></i>
            </div>
            <div class="event-lifecycle-labels"><span>宣布</span><span>合作</span><span>上线</span><span>扩张</span><span>披露</span><span>结果</span></div>
            <div v-if="selectedEvent.lifecycle.confirmedMilestones?.length" class="lifecycle-list">
              <b>已确认</b><span v-for="item in selectedEvent.lifecycle.confirmedMilestones" :key="item">✓ {{ item }}</span>
            </div>
            <div class="lifecycle-next"><b>下一步验证</b><p>{{ selectedEvent.lifecycle.nextMilestone }}</p></div>
          </div>

          <section v-if="selected.eventMerchantImpact || selectedEvent?.merchantImpact" class="merchant-strategy-card">
            <div class="event-side-head"><h2>商家策略观察</h2><span>分析推断</span></div>
            <p>{{ selected.eventMerchantImpact || selectedEvent?.merchantImpact }}</p>
            <small>置信度：{{ ({high:'较高',medium:'中等',low:'较低'})[selected.eventImpactConfidence || selectedEvent?.impactConfidence || 'low'] }} · 请结合平台原文及店铺实际数据判断</small>
            <ul v-if="(selected.eventMerchantActions || selectedEvent?.merchantActions || []).length">
              <li v-for="action in (selected.eventMerchantActions || selectedEvent?.merchantActions || [])" :key="action">{{ action }}</li>
            </ul>
          </section>

          <div class="event-progress">
            <div class="event-progress-head">
              <strong>最新进展</strong>
              <time>{{ selected.date }}</time>
            </div>
            <p>{{ selected.eventWatch || selected.action }}</p>
            <span>›</span>
          </div>
        </main>

        <aside class="event-side">
          <section class="event-side-card">
            <div class="event-side-head"><h2>为什么热</h2></div>
            <p>{{ selected.eventImpact || selected.impact }}</p>
            <small>当前情报 · {{ selected.lane }}</small>
          </section>

          <section class="event-side-card">
            <div class="event-side-head"><h2>证据链</h2><span>{{ selected.eventSourceCount || 1 }} 个信源</span></div>
            <p class="side-caption">信源等级：{{ selected.evidence?.level || 'B' }} · {{ selected.evidence?.label || '可追溯' }}。不把二次转述当成事实，直接打开原文核对。</p>
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
        <div class="event-timeline-intro">
          <span>EVENT TIMELINE</span>
          <strong>同一事件的公开进展</strong>
          <p>按时间把不同信源串起来，同一事件不会被拆成孤立新闻。</p>
        </div>
        <div v-for="(report,index) in eventReports" :key="report.id || report.title" class="timeline-event">
          <time>{{ report.date }}</time>
          <i :class="{latest:index===eventReports.length-1}"></i>
          <article>
            <div class="timeline-event-meta"><span>{{ report.source }}</span><b>{{ report.sourceType || '信源' }}</b></div>
            <h2>{{ report.title }}</h2>
            <p>{{ report.eventSummary || report.summary }}</p>
            <a :href="report.url" target="_blank" rel="noopener">查看原始报道 ↗</a>
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
            <div class="story-meta"><span>{{ item.lane }}</span><b>{{ item.source }}</b><small>{{ item.evidence?.label || '原文可追溯' }}</small></div>
            <h2>{{ item.title }}</h2>
            <p>{{ item.summary }}</p>
            <div class="story-foot"><span v-for="tag in item.tags?.slice(0,3)" :key="tag">#{{ tag }}</span><span v-for="dimension in item.businessDimensions?.slice(0,2)" :key="dimension" class="business-chip">{{ dimension }}</span><strong>查看完整情报 →</strong></div>
          </button>
        </div>
      </div>
      <div v-if="!news.length" class="news-empty">没有匹配的情报，换个关键词试试。</div>
    </template>
  </section>
</template>

<style scoped>
.merchant-strategy-card {
  margin: 18px 0;
  padding: 18px 20px;
  border: 1px solid rgba(37, 99, 235, .22);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(37, 99, 235, .055), rgba(16, 185, 129, .035));
}
.merchant-strategy-card .event-side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.merchant-strategy-card .event-side-head h2 {
  margin: 0;
  font-size: 16px;
}
.merchant-strategy-card .event-side-head span {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(37, 99, 235, .09);
  color: #2563eb;
  font-size: 11px;
}
.merchant-strategy-card p {
  margin: 12px 0 8px;
  line-height: 1.75;
}
.merchant-strategy-card small {
  color: var(--text-secondary, #737373);
  line-height: 1.6;
}
.merchant-strategy-card ul {
  display: grid;
  gap: 7px;
  margin: 12px 0 0;
  padding-left: 18px;
}
.merchant-strategy-card li {
  line-height: 1.6;
}
</style>
