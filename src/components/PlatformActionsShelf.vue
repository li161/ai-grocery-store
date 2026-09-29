<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  meta: { type: Object, default: () => ({}) }
})
const keyword = ref('')
const activePlatform = ref('全部')
const activeType = ref('全部')
const activeWindow = ref('7天')
const windows = ['7天', '30天', '全部归档']
const platforms = ['全部', '淘宝', '京东', '美团', '拼多多']
const types = ['全部','App/产品功能','AI导购/购物助手','商家经营工具','流量/营销/补贴','平台规则/费用','履约/供应链','治理/算法']
function category(item) {
  if (item.actionType && types.includes(item.actionType)) return item.actionType
  const s = [item.title,item.summary,...(item.tags||[])].join(' ')
  if (/导购|购物助手|千问|AI购物|找同款|东东/.test(s)) return 'AI导购/购物助手'
  if (/App|版本|上线|新功能|产品发布|改版|客户端/.test(s)) return 'App/产品功能'
  if (/流量|营销|补贴|优惠|大促|返佣|招商|广告投放/.test(s)) return '流量/营销/补贴'
  if (/配送|履约|物流|取餐|库存|供应链|ERP|接口/.test(s)) return '履约/供应链'
  if (/算法|治理|恶意|隐私|合规|评价|食品安全/.test(s)) return '治理/算法'
  if (/商家|经营|掌柜|客服|运营|商户/.test(s)) return '商家经营工具'
  return '平台规则/费用'
}
const normalized = computed(() => props.items.map(item => ({ ...item, displayPlatform: item.platform || item.lane || '待识别', displayType: category(item) })))
const counts = computed(() => Object.fromEntries(platforms.map(p => [p, p === '全部' ? normalized.value.length : normalized.value.filter(x => x.displayPlatform === p).length])))
const typeCounts = computed(() => Object.fromEntries(types.map(t => [t, t === '全部' ? filteredPlatform.value.length : filteredPlatform.value.filter(x => x.displayType === t).length])))
const filteredPlatform = computed(() => normalized.value.filter(x => activePlatform.value === '全部' || x.displayPlatform === activePlatform.value))
const shown = computed(() => filteredPlatform.value
  .filter(x => {
    if (activeWindow.value === '全部归档') return true
    const days = activeWindow.value === '7天' ? 7 : 30
    const stamp = Date.parse(String(x.publishedAt || x.date || ''))
    return Number.isFinite(stamp) && stamp >= Date.now() - days * 86400000 && stamp <= Date.now() + 86400000
  })
  .filter(x => activeType.value === '全部' || x.displayType === activeType.value)
  .filter(x => !keyword.value || [x.title,x.summary,x.impact,x.action,x.source,x.displayPlatform,...(x.tags||[])].join(' ').toLowerCase().includes(keyword.value.toLowerCase()))
  .sort((a,b) => String(b.publishedAt || b.date || '').localeCompare(String(a.publishedAt || a.date || ''))))
const verifiedCount = computed(() => normalized.value.filter(x => /官方.*确认|官方公告|官方发布确认|已由应用版本记录确认/.test(x.status || '')).length)
const recentCount = computed(() => normalized.value.filter(x => { const d = Date.parse(String(x.publishedAt || x.date || '')); return Number.isFinite(d) && d >= Date.now() - 7 * 86400000 && d <= Date.now() + 86400000 }).length)
const unresolvedLinkCount = computed(() => normalized.value.filter(x => /news\.google\.com/i.test(x.url || '')).length)
function isGoogleRedirect(item) { return /news\.google\.com/i.test(item.url || '') }
function formatDate(item) {
  const date = String(item.publishedAt || item.date || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '日期待核验'
}
function formatDateTime(value) {
  if (!value) return '尚无成功同步记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date)
  const part = type => parts.find(item => item.type === type)?.value || ''
  return part('year') + '-' + part('month') + '-' + part('day') + ' ' + part('hour') + ':' + part('minute') + '（北京时间）'
}
</script>

<template>
  <section class="platform-actions-module section">
    <div class="module-kicker"><span>04</span> DAILY INTELLIGENCE <small>每日平台情报</small></div>
    <header class="platform-heading section-head compact">
      <div>
        <h1>今日情报</h1>
        <p>优先查看最近发布的平台公告、商家规则与经营工具变化。每条信息保留来源状态；检索索引不等于原文，未核验内容不会伪装成官方结论。</p>
      </div>
      <div class="platform-summary"><strong>{{ recentCount }}</strong><span>近 7 天线索</span><small>{{ verifiedCount }} 条有明确来源状态</small></div>
    </header>

    <div class="daily-brief-strip">
      <div><span class="brief-eyebrow">DAILY BRIEF</span><strong>先看近期变化，再回查原文</strong><small>近 7 天 {{ recentCount }} 条 · {{ unresolvedLinkCount }} 条仍使用 Google News 跳转链接</small></div>
      <div class="brief-window" aria-label="情报时间范围">
        <button v-for="window in windows" :key="window" :class="{active:activeWindow===window}" @click="activeWindow=window">{{ window }}</button>
      </div>
    </div>

    <div class="platform-tabs" role="tablist" aria-label="选择平台">
      <button v-for="p in platforms" :key="p" role="tab" :aria-selected="activePlatform===p" :class="{active:activePlatform===p}" @click="activePlatform=p;activeType='全部'">
        {{ p === '全部' ? '全部平台' : p }} <b>{{ counts[p] }}</b>
      </button>
    </div>

    <div class="platform-source-strip">
      <div><strong>信源覆盖</strong><span>官方公告 / 规则中心 / App 版本 / 开放平台 / 行业报道 / 微信公众号文章索引</span></div>
      <div v-if="meta.sourceHealth?.queries" class="source-health">
        <b>{{ meta.sourceHealth.healthy }}/{{ meta.sourceHealth.queries }}</b> 检索成功
        <span v-if="meta.sourceHealth.failed">· {{ meta.sourceHealth.failed }} 失败</span>
        <span>· {{ meta.sourceHealth.newlyFound || 0 }} 条本轮候选</span>
      </div>
    </div>

    <div v-if="meta.sourceDirectory?.length" class="source-directory">
      <span>平台入口 / 公众号检索</span>
      <a v-for="source in meta.sourceDirectory.filter(x => activePlatform === '全部' || x.platform === activePlatform)" :key="source.platform + source.url" :href="source.url" target="_blank" rel="noopener noreferrer"><b>{{ source.platform }}</b>{{ source.name }} ↗</a>
    </div>

    <div class="platform-toolbar">
      <label><span>⌕</span><input v-model="keyword" placeholder="搜索功能名称、公告、商家规则、流量或费用……"></label>
      <span class="result-count">显示 {{ shown.length }} / {{ filteredPlatform.length }} 条</span>
    </div>
    <nav class="platform-type-tabs" aria-label="动作类型">
      <button v-for="t in types" :key="t" :class="{active:activeType===t}" @click="activeType=t">{{ t }} <b>{{ typeCounts[t] }}</b></button>
    </nav>

    <div v-if="shown.length" class="platform-action-list">
      <article v-for="item in shown" :key="item.id || item.url || item.title" class="platform-action-card">
        <div class="action-date"><strong>{{ formatDate(item) }}</strong><span>{{ item.displayPlatform }}</span></div>
        <div class="action-content">
          <div class="action-meta"><b>{{ item.displayType }}</b><span>{{ isGoogleRedirect(item) ? 'Google News 索引 · ' + (item.source || '原文地址待确认') : (item.sourceType === '微信公众号文章检索' ? '公众号索引 · ' + (item.source || '微信文章公开索引') : (item.source || '公开信源')) }}</span><small :class="{verified:/官方.*确认|官方公告|官方发布确认|已由应用版本记录确认/.test(item.status || '')}">{{ item.status || '来源状态待核验' }}</small></div>
          <h2>{{ item.title }}</h2>
          <p class="action-summary">{{ item.summary || '已发现相关平台动态，需进一步核对原文内容。' }}</p>
          <div v-if="item.impact || item.action" class="action-interpretation">
            <div v-if="item.impact"><strong>潜在经营影响 · 分析推断</strong><p>{{ item.impact }}</p></div>
            <div v-if="item.action"><strong>建议核查</strong><p>{{ item.action }}</p></div>
          </div>
          <div class="action-foot"><span>{{ (item.tags||[]).map(t=>'#'+t).join('　') }}</span><a v-if="item.url" :href="item.url" target="_blank" rel="noopener noreferrer">{{ isGoogleRedirect(item) ? '打开检索结果（非原文） ↗' : '查看来源原文 ↗' }}</a></div>
        </div>
      </article>
    </div>
    <div v-else class="platform-empty">
      <strong>{{ keyword || activeType !== '全部' ? '没有匹配的记录' : '该筛选下暂时没有可展示记录' }}</strong>
      <p>不会用其他平台的数据填充空缺。可以切换时间范围，或清除平台、类型和关键词筛选。</p>
      <button @click="keyword='';activeType='全部';activePlatform='全部';activeWindow='7天'">重置筛选</button>
    </div>

    <footer class="platform-footer">
      <div class="coverage-note"><strong>采集范围与限制</strong><p>{{ meta.coverageNote || '持续监测平台公开公告、产品发布、App 版本和商家经营规则。' }}</p></div>
      <small class="status-note"><strong>状态说明：</strong>「官方确认」表示有可追溯的官方来源；「自动发现·待核验」表示搜索候选，须回查原文后才能作为事实使用。公开数据无法覆盖仅对特定商家开放的后台通知、灰度功能或私域通知。</small>
      <span class="archive-time"><strong>最近归档</strong><time :datetime="meta.generatedAt || undefined">{{ formatDateTime(meta.generatedAt) }}</time></span>
    </footer>
  </section>
</template>

<style scoped>
.platform-actions-module{
  --surface:var(--app-panel,#fbf4e8);
  --surface-soft:color-mix(in srgb,var(--app-panel,#fbf4e8) 92%,var(--app-text,#261d16) 8%);
  --text-primary:var(--app-text,#261d16);
  --text-secondary:var(--app-muted,#75685b);
  --line:var(--app-line,#d2c0a8);
  --accent:var(--app-accent,#9a7040);
  --accent-soft:color-mix(in srgb,var(--app-accent,#9a7040) 12%,transparent);
  max-width:1240px;margin:0 auto;min-width:0;color:var(--app-text,#261d16);
}
.platform-actions-module .module-kicker{margin-bottom:18px}
.platform-actions-module .daily-brief-strip{display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap;margin:0 0 18px;padding:16px 18px;border:1px solid var(--app-line,#d2c0a8);background:var(--app-panel,#fbf4e8)}
.platform-actions-module .brief-eyebrow{display:block;margin-bottom:5px;color:var(--app-accent,#9a7040);font-size:9px;letter-spacing:.14em}
.platform-actions-module .daily-brief-strip>div:first-child{display:grid;gap:4px}
.platform-actions-module .daily-brief-strip strong{font-size:13px}
.platform-actions-module .daily-brief-strip small{font-size:10px;color:var(--app-muted,#75685b)}
.platform-actions-module .brief-window{display:flex;gap:5px;flex-wrap:wrap}
.platform-actions-module .brief-window button{padding:7px 10px;border:1px solid var(--app-line,#d2c0a8);background:transparent;color:var(--app-muted,#75685b);font-size:10px;cursor:pointer}
.platform-actions-module .brief-window button.active{background:var(--app-accent,#9a7040);border-color:var(--app-accent,#9a7040);color:white}
.platform-actions-module .platform-heading{margin-bottom:26px;padding-bottom:22px;border-bottom:1px solid var(--app-line,#d2c0a8)}
.platform-actions-module .platform-heading h1{color:var(--app-text,#261d16);font-size:clamp(28px,3vw,36px);letter-spacing:-.045em}
.platform-actions-module .platform-heading p{color:var(--app-muted,#75685b);font-size:12px;max-width:680px}
.platform-actions-module .platform-summary{border-radius:3px;background:var(--app-panel,#fbf4e8);border-style:dashed}
.platform-actions-module .platform-tabs{gap:7px;margin:18px 0 14px;padding-bottom:14px}
.platform-actions-module .platform-tabs button,.platform-actions-module .platform-type-tabs button{border-radius:3px}
.platform-actions-module .platform-source-strip{border-radius:3px}
.platform-actions-module .source-directory a{border-radius:3px}
.platform-actions-module .platform-toolbar label{border-radius:3px}
.platform-actions-module .platform-action-card{border-radius:4px;box-shadow:0 2px 0 color-mix(in srgb,var(--app-text,#261d16) 3%,transparent)}
.platform-actions-module .platform-action-card:hover{border-color:var(--app-accent,#9a7040);box-shadow:0 4px 14px color-mix(in srgb,var(--app-text,#261d16) 7%,transparent)}
.platform-actions-module .action-interpretation>div{border-left:2px solid color-mix(in srgb,var(--app-accent,#9a7040) 45%,transparent);border-radius:2px}
.platform-actions-module .platform-empty{border-radius:4px}
.platform-actions-module .platform-footer{border-color:var(--app-line,#d2c0a8)}
.platform-actions-module .platform-footer .coverage-note,.platform-actions-module .platform-footer .status-note{max-width:100%;min-width:0;overflow-wrap:anywhere}
.platform-actions-module .platform-footer .archive-time{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;padding-top:9px;border-top:1px solid var(--line,#d2c0a8);font-variant-numeric:tabular-nums}
.platform-actions-module .platform-footer .archive-time strong{white-space:nowrap}
.platform-actions-module .platform-footer .archive-time time{color:var(--text-secondary,#75685b)}
.platform-heading{align-items:flex-start!important;gap:24px}
.platform-heading h1{margin:0 0 10px;font-size:clamp(27px,3.3vw,38px);letter-spacing:-.035em}
.platform-heading p{max-width:720px;line-height:1.8}
.platform-summary{flex:0 0 auto;min-width:112px;padding:13px 16px;border:1px solid var(--line,#d2c0a8);border-radius:3px;background:var(--surface,#fbf4e8);display:flex;flex-direction:column;align-items:flex-start;gap:3px}
.platform-summary strong{font-size:30px;line-height:1.2;color:var(--accent,#9a7040)}
.platform-summary span,.platform-summary small{font-size:11px;color:var(--text-secondary,#75685b)}
.platform-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:22px 0 15px;padding-bottom:15px;border-bottom:1px solid var(--line,#d2c0a8)}
.platform-tabs button,.platform-type-tabs button{display:inline-flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid var(--line,#d2c0a8);border-radius:3px;background:var(--surface,#fbf4e8);color:var(--text-secondary,#75685b);font-size:12px;cursor:pointer;transition:background .15s,border-color .15s}
.platform-tabs button.active,.platform-type-tabs button.active{background:var(--accent-soft,rgba(154,112,64,.12));border-color:var(--accent,#9a7040);color:var(--text-primary,#261d16)}
.platform-tabs button b,.platform-type-tabs button b{font-size:10px;color:var(--text-secondary,#75685b);font-weight:600}
.platform-source-strip{display:flex;justify-content:space-between;gap:15px;align-items:center;flex-wrap:wrap;margin-bottom:13px;padding:12px 14px;border:1px solid var(--line,#d2c0a8);border-radius:3px;background:var(--surface-soft,#f5ecdf)}
.platform-source-strip>div:first-child{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px}
.platform-source-strip strong{font-size:11px}
.platform-source-strip span,.source-health{font-size:11px;color:var(--text-secondary,#75685b)}
.source-health b{color:var(--accent,#9a7040)}
.source-directory{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin:0 0 20px}
.source-directory>span{font-size:11px;color:var(--text-secondary,#75685b);margin-right:3px}
.source-directory a{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid var(--line,#d2c0a8);border-radius:3px;color:var(--text-secondary,#75685b);font-size:10px;text-decoration:none;background:var(--surface,#fbf4e8)}
.source-directory a b{color:var(--accent,#9a7040);font-weight:600}
.source-directory a:hover{border-color:var(--accent,#9a7040);color:var(--text-primary,#261d16)}
.platform-toolbar{display:flex;align-items:center;gap:14px;margin:18px 0 12px}
.platform-toolbar label{display:flex;align-items:center;gap:9px;max-width:620px;flex:1;min-width:0;padding:0 12px;border:1px solid var(--line,#d2c0a8);border-radius:3px;background:var(--surface,#fbf4e8)}
.platform-toolbar label span{font-size:20px;color:var(--text-secondary,#75685b)}
.platform-toolbar input{width:100%;min-width:0;padding:11px 0;border:0;outline:none;background:transparent;color:var(--text-primary,#261d16);font:inherit;font-size:12px}
.result-count{white-space:nowrap;color:var(--text-secondary,#75685b);font-size:11px}
.platform-type-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:17px}
.platform-type-tabs button{padding:7px 9px;font-size:10px}
.platform-action-list{display:grid;gap:10px}
.platform-action-card{display:grid;grid-template-columns:108px minmax(0,1fr);gap:19px;padding:19px 20px;border:1px solid var(--line,#d2c0a8);border-radius:4px;background:var(--surface,#fbf4e8);transition:border-color .15s}
.platform-action-card:hover{border-color:var(--accent,#9a7040)}
.action-date{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding-top:3px}
.action-date strong{font-size:12px;font-weight:650;color:var(--text-primary,#261d16)}
.action-date span{padding:4px 7px;border-radius:3px;background:var(--surface-soft,#f5ecdf);color:var(--text-secondary,#75685b);font-size:10px}
.action-content{min-width:0}
.action-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:10px;color:var(--text-secondary,#75685b)}
.action-meta>b{padding:4px 7px;border-radius:3px;background:var(--accent-soft,rgba(154,112,64,.12));color:var(--accent,#9a7040);font-weight:600}
.action-meta small{padding:3px 6px;border-radius:3px;background:rgba(183,121,31,.10);color:#95651f;font-size:10px}
.action-meta small.verified{background:var(--accent-soft,rgba(154,112,64,.12));color:var(--accent,#9a7040)}
.action-content h2{margin:10px 0 6px;font-size:16px;line-height:1.55;font-weight:650;color:var(--text-primary,#261d16)}
.action-summary{margin:0;color:var(--text-secondary,#75685b);font-size:12px;line-height:1.8}
.action-interpretation{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px}
.action-interpretation>div{padding:10px 11px;border-radius:2px;background:var(--surface-soft,#f5ecdf)}
.action-interpretation strong{font-size:10px;color:var(--text-primary,#261d16)}
.action-interpretation p{margin:5px 0 0;color:var(--text-secondary,#75685b);font-size:11px;line-height:1.7}
.action-foot{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-top:12px;color:var(--text-secondary,#75685b);font-size:10px}
.action-foot>span{line-height:1.7;overflow-wrap:anywhere}
.action-foot a{flex-shrink:0;color:var(--accent,#9a7040);text-decoration:none}
.platform-empty{text-align:center;padding:54px 20px;border:1px dashed var(--line,#d2c0a8);border-radius:4px}
.platform-empty strong{font-size:14px}
.platform-empty p{max-width:520px;margin:10px auto;color:var(--text-secondary,#75685b);font-size:12px;line-height:1.8}
.platform-empty button{padding:8px 12px;border:1px solid var(--line,#d2c0a8);border-radius:3px;background:var(--surface,#fbf4e8);color:var(--text-primary,#261d16);font-size:11px;cursor:pointer}
.platform-footer{display:grid;gap:9px;margin-top:24px;padding-top:17px;border-top:1px solid var(--line,#d2c0a8);color:var(--text-secondary,#75685b);font-size:11px;line-height:1.8}
.platform-footer strong{color:var(--text-primary,#261d16);font-size:11px}
.platform-footer p{margin:4px 0}
.platform-footer>small{font-size:10px}
@media(max-width:760px){.platform-heading{flex-direction:column}.platform-summary{flex-direction:row;align-items:center;gap:8px;width:100%;box-sizing:border-box}.platform-summary strong{font-size:22px}.platform-toolbar{align-items:stretch;flex-direction:column;gap:8px}.platform-toolbar label{max-width:none;flex:none}.result-count{text-align:right}.platform-action-card{grid-template-columns:1fr;gap:9px;padding:14px}.action-date{flex-direction:row;align-items:center;justify-content:space-between}.action-interpretation{grid-template-columns:1fr}.action-foot{flex-direction:column}.action-foot a{align-self:flex-start}}
</style>