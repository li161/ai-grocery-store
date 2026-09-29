import { readFile, writeFile } from 'node:fs/promises'

const YEAR = new Date().getUTCFullYear()
const archiveFile = new URL('../public/platform-actions-2026.json', import.meta.url)
const start = new Date(Date.UTC(YEAR, 0, 1))
const now = new Date()
const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
const iso = d => d.toISOString().slice(0, 10)

const queries = [
  { platform:'淘宝', actionType:'AI导购/购物助手', sourceType:'官方检索', query:'site:alibabagroup.com OR site:alibaba.com 淘宝 千问 AI购物助手 导购 购物功能' },
  { platform:'淘宝', actionType:'App/产品功能', sourceType:'公开检索', query:'淘宝 App 版本更新 新功能 搜索 推荐 商品详情 2026' },
  { platform:'淘宝', actionType:'商家经营工具', sourceType:'官方检索', query:'site:developer.alibaba.com OR site:alibabaprocurement.com 淘宝 天猫 商家 AI 经营工具 悟空 商品发布 客服' },
  { platform:'淘宝', actionType:'平台规则/费用', sourceType:'官方检索', query:'site:rule.tmall.com OR site:developer.alibaba.com 淘宝 天猫 商家 规则 公告 费用 佣金 2026' },
  { platform:'淘宝', actionType:'流量/营销/补贴', sourceType:'公开检索', query:'淘宝 天猫 商家 流量 搜索推荐 广告 营销 补贴 618 2026' },
  { platform:'京东', actionType:'AI导购/购物助手', sourceType:'公开检索', query:'京东 AI购 东东 AI购物助手 金牌导购 视频购物 找同款 2026' },
  { platform:'京东', actionType:'App/产品功能', sourceType:'公开检索', query:'京东 App 更新版本 新功能 购物 订单 AI 2026' },
  { platform:'京东', actionType:'商家经营工具', sourceType:'官方检索', query:'site:open.jd.com OR site:opendj.jd.com 京东 商家开放平台 新产品 工具 API 公告 2026' },
  { platform:'京东', actionType:'平台规则/费用', sourceType:'官方检索', query:'site:rule.jd.com OR site:jd.com 京东 商家规则 费用 佣金 政策调整 2026' },
  { platform:'京东', actionType:'履约/供应链', sourceType:'官方检索', query:'site:opendj.jd.com OR site:jd.com 京东秒送 履约 配送 物流 供应链 公告 2026' },
  { platform:'美团', actionType:'商家经营工具', sourceType:'官方检索', query:'site:meituan.com/news 美团 商家 AI 智能掌柜 经营工具 新产品 2026' },
  { platform:'美团', actionType:'App/产品功能', sourceType:'公开检索', query:'美团 App 更新 新功能 即时零售 搜索 推荐 购物 2026' },
  { platform:'美团', actionType:'平台规则/费用', sourceType:'官方检索', query:'site:rules-center.meituan.com 美团 商家 规则 费用 佣金 价格 公告 2026' },
  { platform:'美团', actionType:'流量/营销/补贴', sourceType:'公开检索', query:'美团 商家 流量 营销 补贴 活动 经营工具 2026' },
  { platform:'美团', actionType:'履约/供应链', sourceType:'官方检索', query:'site:meituan.com/news 美团 闪购 配送 履约 商品品质 供应链 2026' },
  { platform:'拼多多', actionType:'App/产品功能', sourceType:'公开检索', query:'拼多多商家版 App 版本更新 新功能 2026' },
  { platform:'拼多多', actionType:'AI导购/购物助手', sourceType:'公开检索', query:'拼多多 AI 导购 商品推荐 购物助手 新功能 2026' },
  { platform:'拼多多', actionType:'商家经营工具', sourceType:'官方检索', query:'site:open.pinduoduo.com 拼多多 商家工具 ERP 接口 数据传输 公告 2026' },
  { platform:'拼多多', actionType:'平台规则/费用', sourceType:'官方检索', query:'site:pinduoduo.com OR site:yangkeduo.com 拼多多 商家 规则 政策 公告 费用 2026' },
  { platform:'拼多多', actionType:'流量/营销/补贴', sourceType:'公开检索', query:'拼多多商家版 免费流量 活动报名 补贴 营销工具 2026' }
]

function decode(s='') {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim()
}
function tag(block, name) {
  const match = block.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>', 'i'))
  return match ? decode(match[1]) : ''
}
function parseFeed(xml, query) {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(match => {
    const block = match[1]
    const title = tag(block, 'title').replace(/\s+-\s+[^-]+$/, '').trim()
    const url = tag(block, 'link')
    const publishedAt = tag(block, 'pubDate')
    const date = new Date(publishedAt)
    const summary = tag(block, 'description')
    const source = tag(block, 'source') || 'Google News RSS'
    return { title, url, publishedAt: Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10), summary, source, sourceType: '公开检索候选', status: '自动发现·待核验', ...query }
  }).filter(item => item.title && item.url && item.publishedAt.startsWith(String(YEAR)))
}
function relevance(item) {
  return /淘宝|天猫|京东|美团|拼多多|商家|商户|卖家|导购|购物|商品|App|应用|平台|AI|规则|流量|营销|补贴|配送|履约|经营|版本|新功能|上线|发布|佣金|广告|搜索|推荐|订单|库存|供应链/i.test(item.title + ' ' + item.summary)
}
async function mapLimit(items, limit, fn) {
  const output = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      output[index] = await fn(items[index])
    }
  }))
  return output
}
function quarterWindows() {
  const windows = []
  let cursor = new Date(start)
  while (cursor < tomorrow) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 3, 1))
    windows.push({ after: iso(cursor), before: iso(next < tomorrow ? next : tomorrow) })
    cursor = next
  }
  return windows
}
async function fetchQuery(query, window) {
  const q = query.query + ' after:' + window.after + ' before:' + window.before
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=zh-CN&gl=CN&ceid=CN:zh-Hans'
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; RetailPlatformRadar/1.0)', accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(18000) })
    if (!response.ok) throw new Error('HTTP ' + response.status)
    return { items: parseFeed(await response.text(), query), status: 'ok', query: query.query, window: window.after + '..' + window.before }
  } catch (error) {
    return { items: [], status: 'error', query: query.query, window: window.after + '..' + window.before, error: String(error.message || error) }
  }
}

let previous = { items: [] }
try { previous = JSON.parse(await readFile(archiveFile, 'utf8')) } catch {}
const tasks = quarterWindows().flatMap(window => queries.map(query => ({ query, window })))
const results = await mapLimit(tasks, 8, task => fetchQuery(task.query, task.window))
const found = results.flatMap(result => result.items).filter(relevance)
const merged = new Map()
for (const item of [...(previous.items || []), ...found]) {
  const key = String(item.title || '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (!key) continue
  const existing = merged.get(key)
  if (!existing) merged.set(key, { ...item, platform: item.platform || item.lane })
  else merged.set(key, { ...item, ...existing, platform: existing.platform || item.platform || item.lane })
}
const items = [...merged.values()].filter(item => {
  const date = String(item.publishedAt || item.date || '')
  return date.startsWith(String(YEAR)) || item.status === '线索已发现，公告日期待核验'
}).sort((a,b) => String(b.publishedAt || b.date).localeCompare(String(a.publishedAt || a.date)))
const generatedAt = new Date().toISOString()
const health = {
  queries: tasks.length,
  healthy: results.filter(x => x.status === 'ok').length,
  failed: results.filter(x => x.status === 'error').length,
  newlyFound: found.length,
  archivedItems: items.length,
  byPlatform: Object.fromEntries(['淘宝','京东','美团','拼多多'].map(p => [p, items.filter(x => (x.platform || x.lane) === p).length]))
}
const archive = {
  generatedAt,
  year: YEAR,
  coverageNote: '独立平台动作雷达：按季度检索 App/产品迭代、AI导购、商家经营工具、流量营销、平台规则、履约供应链和治理动态。自动发现记录标记为“待核验”；官方公告与 App 版本记录的已核验条目保留状态。公开搜索有索引与结果条数限制，不能保证覆盖仅在商家后台、私域或灰度发布的全部动作。',
  sourceDirectory: [
    { platform:'淘宝', name:'阿里巴巴官方新闻', url:'https://www.alibabagroup.com/' },
    { platform:'淘宝', name:'淘宝开放平台/规则中心', url:'https://developer.alibaba.com/docs/doc.htm?articleId=101564&docType=1&treeId=23' },
    { platform:'京东', name:'京东秒送开放平台公告', url:'https://opendj.jd.com/api/notice.htm' },
    { platform:'京东', name:'京东 App 版本记录', url:'https://apps.apple.com/vn/app/%E4%BA%AC%E4%B8%9C-%E5%8F%88%E5%A5%BD%E5%8F%88%E4%BE%BF%E5%AE%9C/id414245413' },
    { platform:'美团', name:'美团商家生态新闻', url:'https://www.meituan.com/news?category=merchants-ecology' },
    { platform:'美团', name:'美团规则中心', url:'https://rules-center.meituan.com/' },
    { platform:'拼多多', name:'拼多多商家版 App 版本记录', url:'https://apps.apple.com/mo/app/pinduoduo-seller-center/id1229469444' },
    { platform:'拼多多', name:'拼多多开放平台', url:'https://open.pinduoduo.com/' }
  ],
  sourceHealth: health,
  items
}
await writeFile(archiveFile, JSON.stringify(archive, null, 2), 'utf8')
console.log('[platform-actions] ' + JSON.stringify(health))
