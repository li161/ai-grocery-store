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
  { platform:'拼多多', actionType:'流量/营销/补贴', sourceType:'公开检索', query:'拼多多商家版 免费流量 活动报名 补贴 营销工具 2026' },
  { platform:'淘宝', actionType:'AI导购/购物助手', sourceType:'公开检索', query:'淘宝 千问 AI购物助手 虚拟试穿 价格追踪 自动下单 2026' },
  { platform:'淘宝', actionType:'App/产品功能', sourceType:'公开检索', query:'天猫 AI空间站 Token充值中心 数字商品 上线 2026' },
  { platform:'京东', actionType:'商家经营工具', sourceType:'公开检索', query:'京东 京麦 AI经营中心 AI专家团 商品信息分 商家大会 2026' },
  { platform:'京东', actionType:'AI导购/购物助手', sourceType:'公开检索', query:'京东 App 东东 AI购物助手 视频搜同款 3D商品 语音导购 2026' },
  { platform:'美团', actionType:'商家经营工具', sourceType:'官方检索', query:'site:meituan.com/news CatPaw 智能掌柜 袋鼠管家 商家 AI 2026' },
  { platform:'美团', actionType:'平台规则/费用', sourceType:'官方检索', query:'site:rules-center.meituan.com 商户规则 公告 履约 品质 违规 2026' },
  { platform:'拼多多', actionType:'AI导购/购物助手', sourceType:'公开检索', query:'拼多多 AI搜索 自然语言搜索 灰度测试 上线 2026' },
  { platform:'拼多多', actionType:'商家经营工具', sourceType:'官方检索', query:'site:open.pinduoduo.com/application/document/announcement 拼多多 商家 开放平台 公告 接口 2026' }
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
    return { title, url, publishedAt: Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10), summary, source, ...query, sourceType: '公开检索候选', status: '自动发现·待核验' }
  }).filter(item => item.title && item.url && item.publishedAt.startsWith(String(YEAR)))
}
function relevance(item) {
  const text = item.title + ' ' + item.summary + ' ' + item.source
  const aliases = {
    '淘宝': /淘宝|天猫|千问|阿里巴巴|淘天|淘宝闪购/i,
    '京东': /京东|京麦|东东|京ME|京东AI购/i,
    '美团': /美团|CatPaw|智能掌柜|袋鼠管家|小团|美团闪购|大众点评/i,
    '拼多多': /拼多多|多多买菜|多多果园|拼多多商家版/i
  }
  const action = /发布|上线|推出|更新|升级|调整|新增|开放|测试|规则|公告|政策|收费|佣金|补贴|流量|搜索|推荐|导购|购物助手|App|版本|工具|接口|配送|履约|AI|隐私|商品|商家|商户|卖家|经营|营销|活动|供应链|售后/i.test(text)
  return action && (aliases[item.platform]?.test(text) || aliases[item.platform]?.test(item.query || ''))
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

async function fetchJdOfficialNotices() {
  try {
    const response = await fetch('https://opendj.jd.com/api/notice.htm', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; RetailPlatformRadar/1.0)', accept: 'application/json' }, signal: AbortSignal.timeout(18000) })
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const payload = await response.json()
    const rawRows = Array.isArray(payload) ? payload : (payload.data || payload.list || payload.rows || [])
    const rows = Array.isArray(rawRows) ? rawRows : (rawRows.list || rawRows.rows || rawRows.records || [])
    const parseDate = value => {
      const match = String(value || '').match(/(\\d{4})年(\\d{1,2})月(\\d{1,2})日/)
      if (match) return match[1] + '-' + match[2].padStart(2,'0') + '-' + match[3].padStart(2,'0')
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0,10)
    }
    return rows.map(row => {
      const title = row.noticeTitle || row.title || ''
      const date = parseDate(row.noticeTime || row.createTime)
      const content = decode(row.noticeContent || row.content || '').slice(0, 420)
      const id = row.id || row.noticeId || title
      const text = title + ' ' + content
      let actionType = '平台规则/费用'
      if (/AI|导购|购物助手|推荐/.test(text)) actionType = 'AI导购/购物助手'
      else if (/工具|商家|开放平台|接口|ERP|应用|产品/.test(text)) actionType = '商家经营工具'
      else if (/流量|营销|补贴|活动|优惠/.test(text)) actionType = '流量/营销/补贴'
      else if (/配送|履约|物流|取餐|仓储/.test(text)) actionType = '履约/供应链'
      return {
        id: 'jd-official-' + String(id),
        platform: '京东', lane: '京东', actionType,
        date, publishedAt: date, source: row.noticeSignature || '京东秒送开放平台',
        sourceType: '官方公告', status: '已由官方公告确认',
        title, summary: content || '京东开放平台发布公告，详情请查看原文。',
        url: row.noticeUrl || ('https://opendj.jd.com/staticnew/widgets/noticeDetail.html?id=' + encodeURIComponent(id)),
        tags: ['京东开放平台', actionType], official: true
      }
    }).filter(item => item.title && item.url && item.publishedAt.startsWith(String(YEAR)))
  } catch (error) {
    return { error: String(error.message || error), items: [] }
  }
}

async function fetchMeituanRuleDirectory() {
  try {
    const response = await fetch('https://rules-center.meituan.com/', {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; RetailPlatformRadar/1.0)', accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(18000)
    })
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const html = await response.text()
    const rows = []
    const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    for (const match of anchors) {
      const title = decode(match[2]).replace(/\s+/g, ' ').trim()
      if (!title || title.length < 6 || !/商户|商家|美团闪购|到店餐饮|服务零售|商品|履约|品质|违规|规则|公告|食品安全|大闸蟹|花束|隐私|配送/.test(title)) continue
      const vicinity = html.slice(Math.max(0, match.index - 180), Math.min(html.length, match.index + match[0].length + 260))
      const dateMatch = vicinity.match(/(20\d{2})[\/.年-](\d{1,2})[\/.月-](\d{1,2})日?/)
      if (!dateMatch) continue
      const publishedAt = dateMatch[1] + '-' + dateMatch[2].padStart(2, '0') + '-' + dateMatch[3].padStart(2, '0')
      if (!publishedAt.startsWith(String(YEAR))) continue
      let url
      try { url = new URL(match[1], 'https://rules-center.meituan.com/').href } catch { continue }
      if (!/^https:\/\/rules-center\.meituan\.com\//i.test(url)) continue
      let actionType = '平台规则/费用'
      if (/履约|配送|库存|供应链/.test(title)) actionType = '履约/供应链'
      else if (/流量|营销|补贴|活动|优惠/.test(title)) actionType = '流量/营销/补贴'
      else if (/App|产品|功能|上线|AI/.test(title)) actionType = 'App/产品功能'
      rows.push({
        id: 'meituan-rule-' + publishedAt + '-' + title,
        platform: '美团', lane: '美团', actionType, date: publishedAt, publishedAt,
        source: '美团规则中心', sourceType: '官方规则目录自动抓取',
        status: '官方目录线索·正文待核验', title,
        summary: '该条目从美团规则中心公开目录自动发现。采集器只记录目录标题、日期和链接；适用范围、生效日期及具体责任以规则正文为准。',
        impact: '该规则可能影响商家商品信息、履约流程或违规风险，具体影响需以规则正文核对。',
        action: '打开原文核对适用业态、规则生效时间、商家义务、违规处置和申诉机制。',
        url, tags: ['美团规则中心', actionType], official: true
      })
    }
    return { items: rows, status: 'ok' }
  } catch (error) {
    return { items: [], status: 'error', error: String(error.message || error) }
  }
}

let previous = { items: [] }
try { previous = JSON.parse(await readFile(archiveFile, 'utf8')) } catch {}
const windows = (!previous.sourceHealth || now.getUTCDay() === 0)
  ? quarterWindows()
  : [{ after: iso(new Date(now.getTime() - 35 * 86400000)), before: iso(tomorrow) }]
const tasks = windows.flatMap(window => queries.map(query => ({ query, window })))
const results = await mapLimit(tasks, 8, task => fetchQuery(task.query, task.window))
const jdOfficialResult = await fetchJdOfficialNotices()
const jdOfficialItems = Array.isArray(jdOfficialResult) ? jdOfficialResult : jdOfficialResult.items
const meituanRulesResult = await fetchMeituanRuleDirectory()
const meituanRuleItems = meituanRulesResult.items
const found = [...results.flatMap(result => result.items), ...jdOfficialItems, ...meituanRuleItems].filter(relevance)
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
  jdOfficialNotices: jdOfficialItems.length,
  jdOfficialStatus: Array.isArray(jdOfficialResult) ? 'ok' : 'error',
  meituanRuleNotices: meituanRuleItems.length,
  meituanRulesStatus: meituanRulesResult.status,\n  meituanRuleNotices: meituanRuleItems.length,\n  meituanRulesStatus: meituanRulesResult.status,
  byPlatform: Object.fromEntries(['淘宝','京东','美团','拼多多'].map(p => [p, items.filter(x => (x.platform || x.lane) === p).length]))
}
const archive = {
  generatedAt,
  year: YEAR,
  coverageNote: '独立平台动作雷达：按季度检索 App/产品迭代、AI导购、商家经营工具、流量营销、平台规则、履约供应链和治理动态。自动发现记录标记为“待核验”；官方公告与 App 版本记录的已核验条目保留状态。公开搜索有索引与结果条数限制，不能保证覆盖仅在商家后台、私域或灰度发布的全部动作。',
  sourceDirectory: [{"platform":"淘宝","name":"阿里巴巴官方新闻","url":"https://www.alibabagroup.com/"},{"platform":"淘宝","name":"淘宝开放平台","url":"https://open.taobao.com/"},{"platform":"淘宝","name":"天猫规则中心","url":"https://rule.tmall.com/"},{"platform":"淘宝","name":"淘宝 App 版本记录","url":"https://apps.apple.com/cn/app/%E6%B7%98%E5%AE%9D/id387682726"},{"platform":"京东","name":"京东秒送开放平台公告","url":"https://opendj.jd.com/api/notice.htm"},{"platform":"京东","name":"京东开放平台","url":"https://open.jd.com/"},{"platform":"京东","name":"京东 App 版本记录","url":"https://apps.apple.com/vn/app/%E4%BA%AC%E4%B8%9C-%E5%8F%88%E5%A5%BD%E5%8F%88%E4%BE%BF%E5%AE%9C/id414245413"},{"platform":"京东","name":"京东 AI 购版本记录","url":"https://apps.apple.com/us/app/%E4%BA%AC%E4%B8%9Cai%E8%B4%AD/id6748010090"},{"platform":"美团","name":"美团商家生态新闻","url":"https://www.meituan.com/news?category=merchants-ecology"},{"platform":"美团","name":"美团规则中心","url":"https://rules-center.meituan.com/"},{"platform":"美团","name":"美团 App 版本记录","url":"https://apps.apple.com/cn/app/%E7%BE%8E%E5%9B%A2/id423084029"},{"platform":"拼多多","name":"拼多多商家版 App 版本记录","url":"https://apps.apple.com/mo/app/pinduoduo-seller-center/id1229469444"},{"platform":"拼多多","name":"拼多多开放平台","url":"https://open.pinduoduo.com/"},{"platform":"拼多多","name":"拼多多商家帮助中心","url":"https://mms.pinduoduo.com/"}],
  sourceHealth: health,
  items
}
await writeFile(archiveFile, JSON.stringify(archive, null, 2), 'utf8')
console.log('[platform-actions] ' + JSON.stringify(health))
