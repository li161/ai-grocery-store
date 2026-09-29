import { mkdir, writeFile } from 'node:fs/promises'

const FEEDS = [
  {name:'Google News · AI Shopping',url:'https://news.google.com/rss/search?q=AI+shopping+assistant+retail+agentic+commerce+when%3A7d&hl=en-US&gl=US&ceid=US:en',lane:'AI 导购',sourceType:'行业聚合'},
  {name:'Google News · Retail AI',url:'https://news.google.com/rss/search?q=retail+AI+agent+inventory+shopping+when%3A7d&hl=en-US&gl=US&ceid=US:en',lane:'零售运营',sourceType:'行业聚合'},
  {name:'Google News · China Retail AI',url:'https://news.google.com/rss/search?q=China+retail+AI+shopping+Qwen+Taobao+JD+when%3A14d&hl=en-US&gl=US&ceid=US:en',lane:'中国零售',sourceType:'行业聚合'},
  {name:'Google News · Agentic Commerce',url:'https://news.google.com/rss/search?q=%22agentic+commerce%22+shopping+retail+when%3A14d&hl=en-US&gl=US&ceid=US:en',lane:'Agentic Commerce',sourceType:'行业聚合'},
  {name:'Google News · Amazon AI',url:'https://news.google.com/rss/search?q=site%3Aaboutamazon.com+AI+shopping+Rufus+Alexa+retail+when%3A30d&hl=en-US&gl=US&ceid=US:en',lane:'AI 导购',sourceType:'官方'},
  {name:'Google News · Google Commerce',url:'https://news.google.com/rss/search?q=site%3Ablog.google+shopping+Gemini+agentic+commerce+when%3A30d&hl=en-US&gl=US&ceid=US:en',lane:'Agentic Commerce',sourceType:'官方'},
  {name:'Google News · OpenAI Shopping',url:'https://news.google.com/rss/search?q=site%3Aopenai.com+shopping+commerce+product+discovery+when%3A30d&hl=en-US&gl=US&ceid=US:en',lane:'AI 导购',sourceType:'官方'},
  {name:'Google News · Claude Commerce',url:'https://news.google.com/rss/search?q=site%3Aclaude.com+commerce+agent+shopping+when%3A30d&hl=en-US&gl=US&ceid=US:en',lane:'AI 导购',sourceType:'官方'},
  {name:'Google News · Alibaba Qwen',url:'https://news.google.com/rss/search?q=site%3Aalibabagroup.com+Qwen+Taobao+shopping+when%3A60d&hl=en-US&gl=US&ceid=US:en',lane:'中国零售',sourceType:'官方'},
  {name:'Google News · Walmart AI',url:'https://news.google.com/rss/search?q=site%3Acorporate.walmart.com+AI+retail+shopping+when%3A60d&hl=en-US&gl=US&ceid=US:en',lane:'零售运营',sourceType:'官方'},
  {name:'Google News · JD AI Retail',url:'https://news.google.com/rss/search?q=site%3Ajdcorporateblog.com+AI+retail+shopping+when%3A60d&hl=en-US&gl=US&ceid=US:en',lane:'中国零售',sourceType:'官方'},
  {name:'Google News · NRF Retail AI',url:'https://news.google.com/rss/search?q=retail+AI+NRF+store+operations+when%3A30d&hl=en-US&gl=US&ceid=US:en',lane:'零售运营',sourceType:'行业媒体'},
  {name:'Google News · Retail Dive AI',url:'https://news.google.com/rss/search?q=site%3Aretaildive.com+AI+retail+shopping+when%3A30d&hl=en-US&gl=US&ceid=US:en',lane:'零售运营',sourceType:'行业媒体'}
]

const seedFile = new URL('../src/data/retailNews.generated.js', import.meta.url)
const publicFile = new URL('../public/retail-news.json', import.meta.url)

function decode(value = '') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
}

function tag(xml, name) {
  const re = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i')
  return decode(xml.match(re)?.[1]?.trim() || '')
}

function guessTags(title = '') {
  const rules = [
    ['AI 导购', /shopping assistant|shopping agent|导购|购物助手/i],
    ['Agent', /agentic|agent/i],
    ['支付', /checkout|payment|支付/i],
    ['库存', /inventory|stock|supply chain|库存|供应链/i],
    ['推荐', /recommend|recommendation|推荐/i],
    ['零售App', /app|mobile|应用/i]
  ]
  return rules.filter(([, re]) => re.test(title)).map(([name]) => name)
}

async function fetchFeed(feed) {
  try {
    const response = await fetch(feed.url, {headers:{'user-agent':'ai-grocery-store-retail-sync/1.0'}})
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const xml = await response.text()
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,15).map((m,index) => {
      const raw = m[1], title = tag(raw,'title'), link = tag(raw,'link'), pubDate = tag(raw,'pubDate'), sourceName = tag(raw,'source')
      if (!title || !link) return null
      const parsed = Date.parse(pubDate)
      return {
        id:'feed-' + feed.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase() + '-' + index + '-' + (parsed || Date.now()),
        source:sourceName || feed.name, sourceType:feed.sourceType,
        date:Number.isNaN(parsed) ? new Date().toISOString().slice(0,10) : new Date(parsed).toISOString().slice(0,10),
        lane:feed.lane,
        title,
        summary:'信源原文自动同步。页面不改写事实；请打开原文查看完整报道与上下文。',
        impact:'自动进入零售 AI 雷达，暂不将标题解释为经营结论。',
        action:'下一步：核对原文、原始披露和后续进展，再进入案例追踪。',
        tags:[...new Set([feed.lane,...guessTags(title)])].slice(0,4),
        url:link
      }
    }).filter(Boolean)
  } catch (error) {
    console.warn('[retail-sync] ' + feed.name + ': ' + error.message)
    return []
  }
}


function tokenize(text='') {
  return new Set((text.toLowerCase().match(/[a-z0-9]+|[\\u4e00-\\u9fff]{2,4}/g) || []).filter(x=>x.length>1))
}
function similarity(a,b) {
  const A=tokenize(a), B=tokenize(b), union=new Set([...A,...B])
  return union.size ? [...A].filter(x=>B.has(x)).length/union.size : 0
}
function heuristicScore(item) {
  const text=item.title+' '+item.summary
  let relevance=35, impact=35
  if(/retail|shopping|commerce|store|grocery|零售|购物|电商|门店|商超/i.test(text)) relevance+=22
  if(/agent|AI|人工智能|assistant|智能/i.test(text)) relevance+=18
  if(/inventory|pricing|checkout|payment|recommend|forecast|库存|定价|支付|结算|推荐|预测|履约/i.test(text)) impact+=18
  if(/revenue|sales|labor|cost|conversion|margin|收入|销售|人效|成本|转化|利润/i.test(text)) impact+=14
  if(item.sourceType==='官方') relevance+=8
  return {relevanceScore:Math.min(100,relevance),impactScore:Math.min(100,impact)}
}
async function scoreWithLLM(items) {
  const apiKey=process.env.OPENAI_API_KEY
  if(!apiKey||!items.length) return []
  const base=process.env.OPENAI_BASE_URL||'https://api.openai.com/v1'
  const model=process.env.RETAIL_LLM_MODEL||'gpt-5-mini'
  const payload=items.map((item,index)=>({index,title:item.title,source:item.source,lane:item.lane,date:item.date}))
  const system='你是AI零售情报雷达筛选器。评估新闻是否值得零售经营者继续追踪。relevance=与AI零售直接相关程度；impact=对导购、转化、客单、库存、履约、人效、损耗、门店运营、支付、平台格局的潜在影响；novelty=新颖程度；evidence=信源可信度。均0-100整数。keep仅在relevance>=60且impact>=45时为true。reason不超过35个中文字符。不要编造事实，只输出JSON数组。'
  try {
    const response=await fetch(base.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{authorization:'Bearer '+apiKey,'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(payload)}],temperature:0.1})})
    if(!response.ok) throw new Error('LLM HTTP '+response.status)
    const data=await response.json(), content=data.choices?.[0]?.message?.content||'', match=content.match(/\[[\s\S]*\]/)
    if(!match) throw new Error('LLM JSON missing')
    return JSON.parse(match[0])
  } catch(error) { console.warn('[retail-radar] LLM fallback: '+error.message); return [] }
}
function cluster(items) {
  const clusters=[]
  for(const item of items) {
    let target=clusters.find(c=>similarity(c.items[0].title,item.title)>=0.28)
    if(!target){target={id:'cluster-'+(clusters.length+1),items:[]};clusters.push(target)}
    target.items.push(item)
  }
  return clusters
}
function rank(items) {
  const now=Date.now()
  return items.map(item=>{
    const age=Math.max(0,(now-Date.parse(item.date+'T12:00:00Z'))/86400000)
    const freshness=Math.max(0,100-age*8), clusterBoost=Math.min(20,Math.max(0,(item.clusterSize||1)-1)*7)
    const sourceBoost=item.sourceType==='官方'?10:item.sourceType==='行业媒体'?6:2
    const relevance=item.relevanceScore||50, impact=item.impactScore||40, novelty=item.noveltyScore||50, evidence=item.evidenceScore||60
    item.heatScore=Math.min(100,Math.round(relevance*.30+impact*.30+novelty*.10+evidence*.10+freshness*.12+clusterBoost+sourceBoost))
    return item
  }).sort((a,b)=>b.heatScore-a.heatScore)
}
function buildDigest(items) {
  const today=new Date().toISOString().slice(0,10), top=items.filter(x=>x.date>=today).slice(0,5)
  return {date:today,generatedAt:new Date().toISOString(),title:'AI 零售日报',lead:top[0]?.title||'今日暂无足够新情报',bullets:top.slice(0,4).map(x=>({title:x.title,source:x.source,heatScore:x.heatScore,reason:x.llmReason||x.impact})),method:'信源抓取 → AI 零售影响评分 → 事件聚簇 → 热度排序 → 日报'}
}
const previousModule=await import(seedFile.href+'?t='+Date.now())
const previous=previousModule.retailNews||[]
const previousByTitle=new Map(previous.map(x=>[x.title.toLowerCase().trim(),x]))
const results=(await Promise.all(FEEDS.map(fetchFeed))).flat()
const seen=new Set()
const unique=results.filter(item=>{const key=item.title.toLowerCase().replace(/\\s+/g,' ');if(seen.has(key))return false;seen.add(key);return true})
const scoredInput=unique.filter(item=>!previousByTitle.has(item.title.toLowerCase().trim())).slice(0,30)
const llmScores=await scoreWithLLM(scoredInput)
const llmByIndex=new Map(llmScores.map(x=>[Number(x.index),x]))
const fresh=unique.map(item=>{
  const old=previousByTitle.get(item.title.toLowerCase().trim()), heuristic=heuristicScore(item)
  const llm=old?.scoredBy ? old : llmByIndex.get(scoredInput.findIndex(x=>x.title===item.title))
  return {...item,...heuristic,...(llm||{}),scoredBy:llm?'llm+heuristic':'heuristic'}
}).filter(item=>(item.keep??true)&&(item.relevanceScore||0)>=45)
const curated=previous.filter(item=>!item.id?.startsWith('feed-'))
const all=[...fresh,...curated]
const clusters=cluster(all)
clusters.forEach(c=>c.items.forEach(item=>{item.clusterId=c.id;item.clusterSize=c.items.length;item.clusterTitle=c.items[0].title}))
const ranked=rank(all).slice(0,80)
const digest=buildDigest(ranked)
const output='// AUTO-GENERATED by scripts/sync-retail-news.mjs.\\n// Do not edit manually.\\n\\nexport const retailNewsLastSyncedAt = '+JSON.stringify(new Date().toISOString())+'\\n\\nexport const retailNews = '+JSON.stringify(ranked,null,2)+'\\n'
await mkdir(new URL('../src/data/',import.meta.url),{recursive:true})
await writeFile(seedFile,output,'utf8')
await writeFile(publicFile,JSON.stringify({generatedAt:new Date().toISOString(),items:ranked},null,2),'utf8')
await writeFile(new URL('../public/retail-daily.json',import.meta.url),JSON.stringify(digest,null,2),'utf8')
console.log('[retail-radar] fetched='+unique.length+' llmScored='+llmScores.length+' clusters='+clusters.length+' kept='+ranked.length)
