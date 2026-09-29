import { readFile, writeFile } from 'node:fs/promises'

const newsFile = new URL('../public/retail-news.json', import.meta.url)
const eventsFile = new URL('../public/retail-events.json', import.meta.url)
const dailyFile = new URL('../public/retail-daily.json', import.meta.url)

const sourceRules = [
  { test: /官方|official/i, trust: 'A', label: '官方信源' },
  { test: /上市公司|交易所|财报|公告/i, trust: 'A', label: '披露信源' },
  { test: /行业媒体|媒体/i, trust: 'B', label: '行业媒体' },
  { test: /行业聚合/i, trust: 'C', label: '聚合信源' }
]

function evidence(item) {
  const rule = sourceRules.find(x => x.test.test(item.sourceType || ''))
  const official = rule?.trust === 'A'
  const hasUrl = /^https?:\\/\\//i.test(item.url || '')
  return {
    level: hasUrl ? (official ? 'A' : rule?.trust || 'C') : 'D',
    label: hasUrl ? (official ? '可核验' : '可追溯') : '缺少原文',
    sourceClass: rule?.label || '未知信源',
    verification: official ? 'source_confirmed' : hasUrl ? 'source_traceable' : 'needs_source'
  }
}

function dimensions(item) {
  const t = [item.title, item.summary, item.impact, item.action].join(' ')
  return [
    /labor|人效|员工|人工成本|省人力/i.test(t) ? '省人力' : null,
    /revenue|sales|conversion|客单|收入|销售|转化/i.test(t) ? '增收入' : null,
    /inventory|stock|waste|损耗|库存|缺货/i.test(t) ? '降损耗' : null,
    /store|坪效|门店|throughput|效率/i.test(t) ? '提坪效' : null,
    /payment|checkout|支付|结账/i.test(t) ? '支付' : null,
    /delivery|fulfillment|履约/i.test(t) ? '履约' : null
  ].filter(Boolean)
}

const news = JSON.parse(await readFile(newsFile, 'utf8'))
news.items = (news.items || []).map(item => ({
  ...item,
  evidence: item.evidence || evidence(item),
  businessDimensions: item.businessDimensions?.length ? item.businessDimensions : dimensions(item),
  factBoundary: item.factBoundary || '事实以原始信源为准；AI 摘要仅用于导航。',
  updatedAt: news.generatedAt
}))

const events = JSON.parse(await readFile(eventsFile, 'utf8'))
events.events = (events.events || []).map(event => {
  const reports = event.reports || event.items || []
  const enrichedReports = reports.map(report => ({
    ...report,
    evidence: report.evidence || evidence(report),
    businessDimensions: report.businessDimensions?.length ? report.businessDimensions : dimensions(report)
  }))
  const confirmed = enrichedReports.filter(x => x.evidence?.level === 'A').length
  return {
    ...event,
    reports: enrichedReports,
    evidenceLevel: confirmed ? 'A' : enrichedReports.some(x => x.evidence?.level === 'B') ? 'B' : 'C',
    evidenceCount: confirmed,
    businessDimensions: [...new Set(enrichedReports.flatMap(x => x.businessDimensions || []))].slice(0, 6),
    factBoundary: '事件聚合不等于事实确认；以各时间点的原始披露为准。'
  }
})

const daily = JSON.parse(await readFile(dailyFile, 'utf8'))
daily.method = '多源采集 → 规则初筛 → LLM 相关性/影响力判断 → 事件聚类 → 证据分级 → 事件热度 → 日报'
daily.factBoundary = '日报为情报摘要，不替代原始公告、财报或企业正式披露。'
daily.generatedAt = new Date().toISOString()

await writeFile(newsFile, JSON.stringify(news, null, 2), 'utf8')
await writeFile(eventsFile, JSON.stringify(events, null, 2), 'utf8')
await writeFile(dailyFile, JSON.stringify(daily, null, 2), 'utf8')
console.log('[retail-radar] evidence and business dimensions enriched')
