import { readFile, writeFile } from 'node:fs/promises'

const newsFile = new URL('../public/retail-news.json', import.meta.url)
const dailyFile = new URL('../public/retail-daily.json', import.meta.url)
const readJson = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch { return fallback }
}
const clean = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim()
const now = new Date()
const today = now.toISOString().slice(0, 10)
const payload = await readJson(newsFile, { items: [] })
const all = Array.isArray(payload.items) ? payload.items : []
const recent = all.filter(item => {
  if (!item || !item.title) return false
  const url = item.canonicalUrl || item.url || ''
  const timestamp = Date.parse(item.publishedAt || item.date || '')
  return url.startsWith('http') && Number.isFinite(timestamp) && timestamp <= now.getTime() + 86400000 && timestamp >= now.getTime() - 7 * 86400000
}).sort((a, b) =>
  Number(b.impactScore || b.heatScore || 0) - Number(a.impactScore || a.heatScore || 0) ||
  String(b.publishedAt || b.date || '').localeCompare(String(a.publishedAt || a.date || ''))
)
const seen = new Set()
const top = recent.filter(item => {
  const key = item.eventId || clean(item.title).toLowerCase()
  if (seen.has(key)) return false
  seen.add(key)
  return true
}).slice(0, 8)
const sections = top.slice(0, 6).map(item => {
  const title = clean(item.eventTitle || item.title).slice(0, 180)
  const summary = clean(item.eventSummary || item.summary || item.impact)
  return {
    title,
    summary: summary && !summary.includes('等待今日') && !summary.includes('等待 AI')
      ? summary.slice(0, 220)
      : '自动采集到该公开信号。请打开原文核验发布时间、具体动作、适用对象及经营影响；当前摘要不将标题推断为已确认事实。',
    eventId: item.eventId || null,
    date: clean(item.date || item.publishedAt || today).slice(0, 10),
    source: clean(item.source || item.sourceDomain || '公开信源'),
    sourceUrl: item.canonicalUrl || item.url,
    evidence: item.evidence?.label || (item.sourceType === '官方' ? '官方来源，内容待核验' : '公开报道，待核验')
  }
})
const sourceCount = new Set(top.map(item => item.sourceDomain || item.source).filter(Boolean)).size
const lead = sections.length
  ? `日报于 ${today} 自动重建：近 7 日发现 ${recent.length} 条有日期和原文链接的信号，筛出 ${sections.length} 个优先事件（来源标识 ${sourceCount} 个）。请以原文核验事实与经营影响。`
  : `日报于 ${today} 已执行检查，但近 7 日没有通过日期和链接校验的有效信号。为避免把旧新闻显示为最新内容，本次不沿用过期条目；请检查采集工作流与信源健康状态。`
const report = {
  date: today,
  generatedAt: now.toISOString(),
  title: 'AI 零售日报',
  lead,
  sections,
  watchlist: sections.slice(0, 5).map(item => `核验「${item.title.slice(0, 48)}」原文中的发布时间、适用对象及结果数据，不要仅凭标题作经营决策。`),
  method: '多源采集 → 日期与原文链接校验 → 事件去重 → 来源追溯 → 日报重建',
  factBoundary: '日报是公开信号导航，不等同于事实确认；关键结论需核对原始公告、报道正文或财报。',
  quality: { inputItems: all.length, validRecentItems: recent.length, selectedEvents: sections.length, status: sections.length ? 'ok' : 'no-valid-recent-signals' }
}
await writeFile(dailyFile, JSON.stringify(report, null, 2), 'utf8')
console.log(`[retail-daily] date=${today} valid=${recent.length} sections=${sections.length} generatedAt=${report.generatedAt}`)
