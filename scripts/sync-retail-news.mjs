import { mkdir, writeFile, readFile } from 'node:fs/promises'

const FEED_DEFS = [
  {name:'AI Shopping',query:'AI shopping assistant retail agentic commerce',lane:'AI 导购',sourceType:'行业媒体'},
  {name:'Retail AI',query:'retail AI agent inventory shopping',lane:'零售运营',sourceType:'行业媒体'},
  {name:'China Retail AI',query:'China retail AI shopping Qwen Taobao JD',lane:'中国零售',sourceType:'行业媒体'},
  {name:'Agentic Commerce',query:'"agentic commerce" shopping retail',lane:'Agentic Commerce',sourceType:'行业媒体'},
  {name:'Amazon AI',query:'site:aboutamazon.com AI shopping Rufus Alexa retail',lane:'AI 导购',sourceType:'官方'},
  {name:'Google Commerce',query:'site:blog.google shopping Gemini agentic commerce',lane:'Agentic Commerce',sourceType:'官方'},
  {name:'OpenAI Shopping',query:'site:openai.com shopping commerce product discovery',lane:'AI 导购',sourceType:'官方'},
  {name:'Alibaba Qwen',query:'site:alibabagroup.com Qwen Taobao shopping',lane:'中国零售',sourceType:'官方'},
  {name:'Walmart AI',query:'site:corporate.walmart.com AI retail shopping',lane:'零售运营',sourceType:'官方'},
  {name:'JD AI Retail',query:'site:jdcorporateblog.com AI retail shopping',lane:'中国零售',sourceType:'官方'},
  {name:'Retail Dive AI',query:'site:retaildive.com AI retail shopping',lane:'零售运营',sourceType:'行业媒体'},
  {name:'Grocery AI',query:'grocery retail AI store inventory checkout',lane:'零售运营',sourceType:'行业媒体'},
  {name:'Retail AI China',query:'中国 零售 AI 门店 智能购物车 库存 推荐',lane:'中国零售',sourceType:'行业媒体'}
]

function isoDay(d){return d.toISOString().slice(0,10)}
function addDays(d,n){const x=new Date(d);x.setUTCDate(x.getUTCDate()+n);return x}
function googleUrl(query,after,before){return 'https://news.google.com/rss/search?q='+encodeURIComponent(query+' after:'+after+' before:'+before)+'&hl=en-US&gl=US&ceid=US:en'}
function buildFeeds(){
  const today=new Date()
  const feeds=[]
  // Recent windows are deliberately split so one broad Google News result set
  // cannot hide quieter days behind the newest results.
  for(let offset=0;offset<9;offset+=3){
    const before=isoDay(addDays(today,-offset))
    const after=isoDay(addDays(today,-offset-3))
    for(const def of FEED_DEFS){
      feeds.push({...def,name:def.name+' · '+after+'~'+before,url:googleUrl(def.query,after,before)})
    }
  }
  return feeds
}
const FEEDS=buildFeeds()


const seedFile = new URL('../src/data/retailNews.generated.js', import.meta.url)
const publicFile = new URL('../public/retail-news.json', import.meta.url)
const eventsFile = new URL('../public/retail-events.json', import.meta.url)
const dailyFile = new URL('../public/retail-daily.json', import.meta.url)
const healthFile = new URL('../public/retail-source-health.json', import.meta.url)
const historyDir = new URL('../public/retail-history/', import.meta.url)

function decode(v=''){return v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
function tag(xml,name){const r=new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+name+'>','i');return decode((xml.match(r)||[])[1]||'')}
function tokens(s=''){return new Set((s.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]{2,4}/g)||[]).filter(x=>x.length>1))}
function sim(a,b){const A=tokens(a),B=tokens(b),U=new Set([...A,...B]);return U.size?[...A].filter(x=>B.has(x)).length/U.size:0}
function hash(s=''){let h=2166136261;for(const ch of s.toLowerCase()){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}
function tags(t=''){const rules=[['AI 导购',/shopping assistant|shopping agent|导购|购物助手/i],['Agent',/agentic|agent/i],['支付',/checkout|payment|支付/i],['库存',/inventory|stock|supply chain|库存|供应链/i],['推荐',/recommend|recommendation|推荐/i],['门店',/store|shop|门店/i],['履约',/delivery|fulfillment|履约/i],['定价',/pricing|price|定价|价格/i]];return rules.filter(x=>x[1].test(t)).map(x=>x[0])}
const sourceHealth=[]
async function fetchFeed(feed){try{const r=await fetch(feed.url,{headers:{'user-agent':'ai-grocery-store-retail-radar/3.0'}});if(!r.ok)throw Error('HTTP '+r.status);const xml=await r.text();const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,40).map((m,i)=>{const raw=m[1],title=tag(raw,'title'),url=tag(raw,'link'),pd=tag(raw,'pubDate'),source=tag(raw,'source');if(!title||!url)return null;const d=Date.parse(pd);return {id:'feed-'+hash(title+url),source:source||feed.name,sourceType:feed.sourceType,date:isNaN(d)?new Date().toISOString().slice(0,10):new Date(d).toISOString().slice(0,10),publishedAt:isNaN(d)?null:new Date(d).toISOString(),discoveredAt:new Date().toISOString(),lane:feed.lane,title,summary:'信源原文自动同步；事实以原始报道为准。',impact:'等待 AI 零售影响判断。',action:'打开原文核对事件，再观察后续经营结果。',tags:[feed.lane,...tags(title)].slice(0,5),url}}).filter(Boolean)}catch(e){console.warn('[retail-radar] '+feed.name+': '+e.message);return []}}
function heuristic(x){const t=x.title;let r=30,i=30,e=x.sourceType==='官方'?90:x.sourceType==='行业媒体'?72:55;if(/retail|shopping|commerce|store|grocery|零售|购物|电商|门店/i.test(t))r+=28;if(/agent|AI|人工智能|assistant|智能/i.test(t))r+=20;if(/inventory|pricing|checkout|payment|recommend|forecast|库存|定价|支付|推荐|预测|履约/i.test(t))i+=22;if(/revenue|sales|labor|cost|conversion|margin|收入|销售|人效|成本|转化|利润/i.test(t))i+=18;return {relevanceScore:Math.min(100,r),impactScore:Math.min(100,i),evidenceScore:e}}
async function llm(system,data){const key=process.env.OPENAI_API_KEY;if(!key)return null;const base=process.env.OPENAI_BASE_URL||'https://api.openai.com/v1',model=process.env.RETAIL_LLM_MODEL||'gpt-5-mini';try{const r=await fetch(base.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(data)}],temperature:.1})});if(!r.ok)throw Error('LLM HTTP '+r.status);const j=await r.json(),c=j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content||'',m=c.match(/```(?:json)?\s*([\s\S]*?)\s*```/)||c.match(/\[[\s\S]*\]/)||c.match(/\{[\s\S]*\}/);return m?JSON.parse(m[1]||m[0]):null}catch(e){console.warn('[retail-radar] LLM fallback: '+e.message);return null}}
async function score(items){const data=items.map((x,i)=>({index:i,title:x.title,source:x.source,lane:x.lane,date:x.date}));const r=await llm('你是AI零售情报筛选器。relevance=与AI零售直接相关程度；impact=对导购、转化、客单、库存、履约、人效、损耗、门店运营、支付、平台格局的影响；novelty=新颖程度；evidence=证据可信度。均0-100。keep仅在relevance>=60且impact>=45时为true。不要编造事实。输出JSON数组。',data);return Array.isArray(r)?r:[]}
async function cluster(items,oldEvents){const candidates=items.map((x,i)=>({index:i,title:x.title,source:x.source,candidates:oldEvents.map((e,j)=>({eventIndex:j,title:e.title,score:sim(x.title,e.title)})).filter(y=>y.score>=.18).sort((a,b)=>b.score-a.score).slice(0,4)}));const r=await llm('你是事件聚簇器。判断新闻是否与候选为同一持续事件。same或followup表示同一事件，new表示新事件。只有事实对象、公司/产品和核心动作高度一致才合并。输出JSON数组：index,type,eventIndex,title。new时title不超过24字。',candidates);const decisions=new Map((Array.isArray(r)?r:[]).map(x=>[Number(x.index),x]));const events=oldEvents.map(e=>({...e,items:e.items||e.reports||[]}));for(const c of candidates){const d=decisions.get(c.index);let e=null;if(d&&d.type!=='new'&&events[Number(d.eventIndex)])e=events[Number(d.eventIndex)];if(!e){const title=(d&&d.title)||c.title;e={id:'event-'+hash(title),title,items:[],firstDate:items[c.index].date}}e.items.push(items[c.index]);if(!events.includes(e))events.push(e)}return events.filter(e=>e.items.length)}
function scoreEvents(events){const now=Date.now();return events.map(e=>{const sources=[...new Set(e.items.map(x=>x.source))],latest=e.items.slice().sort((a,b)=>b.date.localeCompare(a.date))[0],age=Math.max(0,(now-Date.parse(latest.date+'T12:00:00Z'))/86400000),fresh=Math.max(0,100-age*10),impact=e.items.reduce((s,x)=>s+(x.impactScore||40),0)/e.items.length,rel=e.items.reduce((s,x)=>s+(x.relevanceScore||40),0)/e.items.length,evidence=e.items.reduce((s,x)=>s+(x.evidenceScore||60),0)/e.items.length;e.sourceCount=sources.length;e.reportCount=e.items.length;e.latestAt=latest.date;e.heatScore=Math.min(100,Math.round(impact*.32+rel*.20+evidence*.13+fresh*.15+Math.min(30,sources.length*9)+(e.items.some(x=>x.sourceType==='官方')?10:0)));e.status=age<=2?'active':'cooling';e.sources=sources;e.lane=latest.lane;e.tags=[...new Set(e.items.flatMap(x=>x.tags||[]))].slice(0,6);return e}).sort((a,b)=>b.heatScore-a.heatScore)}
async function enrich(events){const data=events.slice(0,20).map((e,i)=>({index:i,id:e.id,title:e.title,heatScore:e.heatScore,sourceCount:e.sourceCount,latestAt:e.latestAt,lane:e.lane,reports:e.items.slice(0,3).map(x=>({title:x.title,source:x.source,date:x.date}))}));const r=await llm('你是零售行业编辑。只基于事件资料生成summary(发生了什么<=70字)、why(为什么值得零售经营者关注<=55字)、watch(下一步验证什么<=55字)。不得编造数字。输出JSON数组并保留index。',data);if(Array.isArray(r))r.forEach(x=>{const e=events[Number(x.index)];if(e){e.summary=x.summary||'';e.impact=x.why||'';e.watch=x.watch||''}});return events}
async function digest(events){const top=events.slice(0,8),r=await llm('你是AI零售日报编辑。只能根据事件资料写日报。输出JSON：lead<=80字、sections数组(title,summary,eventId)、watchlist数组。不要编造数字。',top.map(e=>({id:e.id,title:e.title,heatScore:e.heatScore,sourceCount:e.sourceCount,latestAt:e.latestAt,summary:e.summary,impact:e.impact,watch:e.watch})));return {date:new Date().toISOString().slice(0,10),generatedAt:new Date().toISOString(),title:'AI 零售日报',lead:(r&&r.lead)||(top[0]&&top[0].summary)||'等待今日情报聚合完成',sections:Array.isArray(r&&r.sections)?r.sections:top.slice(0,5).map(e=>({title:e.title,summary:e.summary,eventId:e.id})),watchlist:Array.isArray(r&&r.watchlist)?r.watchlist:top.slice(0,5).map(e=>e.watch||'继续观察后续披露'),method:'信源 → AI筛选 → 候选召回 → LLM事件判断 → 事件热度 → 日报'}}
const previousModule=await import(seedFile.href+'?t='+Date.now())
const previous=previousModule.retailNews||[]
let oldEvents=[]
try{const r=await fetch(eventsFile);if(r.ok)oldEvents=(await r.json()).events||[]}catch{}
const raw=(await Promise.all(FEEDS.map(fetchFeed))).flat(),seen=new Set()
const todayMs=Date.now()
const LIVE_DAYS=7
const liveCutoff=todayMs-LIVE_DAYS*86400000
const unique=raw.filter(x=>{const k=x.title.toLowerCase();if(seen.has(k))return false;seen.add(k);return true}).filter(x=>{const p=Date.parse(x.publishedAt||x.date),discovered=Date.parse(x.discoveredAt||x.publishedAt||x.date);const timeline=(Number.isFinite(p)&&Number.isFinite(discovered)&&discovered-p>72*3600000)?p:discovered;return Number.isFinite(timeline)&&timeline>=liveCutoff})
const previousLive=previous.filter(x=>{const p=Date.parse(x.publishedAt||x.date),discovered=Date.parse(x.discoveredAt||x.publishedAt||x.date);const timeline=(Number.isFinite(p)&&Number.isFinite(discovered)&&discovered-p>72*3600000)?p:discovered;return Number.isFinite(timeline)&&timeline>=liveCutoff})
const previousByTitle=new Map(previousLive.map(x=>[x.title.toLowerCase().trim(),x]))
const fresh=unique.filter(x=>!previousByTitle.has(x.title.toLowerCase().trim())).slice(0,120)
const scores=await score(fresh),scoreMap=new Map(scores.map(x=>[Number(x.index),x]))
const scored=fresh.map((x,i)=>{const h=heuristic(x),s=scoreMap.get(i);return {...x,...h,...(s?{relevanceScore:Number(s.relevance||0),impactScore:Number(s.impact||0),noveltyScore:Number(s.novelty||0),evidenceScore:Number(s.evidence||0),keep:Boolean(s.keep),llmReason:String(s.reason||'')}:{}),scoredBy:s?'llm+heuristic':'heuristic'}}).filter(x=>(x.keep??true)&&(x.relevanceScore||0)>=45)
const existing=unique.filter(x=>previousByTitle.has(x.title.toLowerCase().trim())).map(x=>({...x,...previousByTitle.get(x.title.toLowerCase().trim())}))
const lastGood=previousLive.length>=3?previousLive:[]
const recentCutoff=Date.now()-14*86400000
const recentExisting=existing.filter(x=>!x.publishedAt || Date.parse(x.publishedAt)>=recentCutoff)
const items=[...recentExisting,...scored]
const safeItems=items.length>=3?items:lastGood
if(items.length<3) console.warn('[retail-radar] insufficient fresh signals; preserving previous good snapshot:',lastGood.length)
const events=await cluster(safeItems,oldEvents),enriched=await enrich(scoreEvents(events)),rankedEvents=scoreEvents(enriched)
const eventByItem=new Map(rankedEvents.flatMap(e=>e.items.map(x=>[x.id,e]))),rankedItems=safeItems.map(x=>{const e=eventByItem.get(x.id);return {...x,eventId:e&&e.id,eventTitle:e&&e.title,eventHeatScore:e&&e.heatScore,eventSourceCount:e&&e.sourceCount,eventReportCount:e&&e.reportCount,eventSummary:e&&e.summary,eventImpact:e&&e.impact,eventWatch:e&&e.watch}}).sort((a,b)=>(b.eventHeatScore||0)-(a.eventHeatScore||0)).slice(0,160)
const generatedAt=new Date().toISOString(),report=await digest(rankedEvents)
const output='// AUTO-GENERATED by scripts/sync-retail-news.mjs.\\n// Do not edit manually.\\n\\nexport const retailNewsLastSyncedAt = '+JSON.stringify(generatedAt)+'\\n\\nexport const retailNews = '+JSON.stringify(rankedItems,null,2)+'\\n'
await mkdir(new URL('../src/data/',import.meta.url),{recursive:true})
await mkdir(historyDir,{recursive:true})
await writeFile(seedFile,output,'utf8')
await writeFile(publicFile,JSON.stringify({generatedAt,items:rankedItems},null,2),'utf8')
await writeFile(eventsFile,JSON.stringify({generatedAt,events:rankedEvents.map(e=>{const copy={...e};delete copy.items;return copy})},null,2),'utf8')
await writeFile(dailyFile,JSON.stringify(report,null,2),'utf8')
await writeFile(healthFile,JSON.stringify({generatedAt,window:'7d',summary:{feeds:sourceHealth.length,healthy:sourceHealth.filter(x=>x.status==='ok').length,failed:sourceHealth.filter(x=>x.status==='error').length,rawCandidates:unique.length,accepted:rankedItems.length},sources:sourceHealth},null,2),'utf8')
const historyFile = new URL(new Date().toISOString().slice(0,10)+'.json',historyDir)
try { await readFile(historyFile,'utf8') } catch { await writeFile(historyFile,JSON.stringify({date:new Date().toISOString().slice(0,10),generatedAt,window:'7d',items:rankedItems,events:rankedEvents.map(e=>({...e,reports:undefined}))},null,2),'utf8') }
console.log('[retail-radar] fetched='+unique.length+' fresh='+fresh.length+' scored='+scores.length+' events='+rankedEvents.length)