import { mkdir, readFile, writeFile } from 'node:fs/promises'

const newsFile = new URL('../public/retail-news.json', import.meta.url)
const eventsFile = new URL('../public/retail-events.json', import.meta.url)
const dailyFile = new URL('../public/retail-daily.json', import.meta.url)
const TIMEOUT = 8000
const historyDir = new URL('../public/retail-history/', import.meta.url)

const readJson = async (file, fallback) => { try { return JSON.parse(await readFile(file,'utf8')) } catch { return fallback } }
const writeJson = (file, value) => writeFile(file, JSON.stringify(value,null,2),'utf8')
const domain = url => { try { return new URL(url).hostname.replace(/^www\./,'') } catch { return '' } }
const decode = v => (v||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')
const clean = v => decode(v).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()

async function fetchArticle(url) {
  const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(), TIMEOUT)
  try {
    const r = await fetch(url,{redirect:'follow',signal:controller.signal,headers:{'user-agent':'ai-grocery-store-retail-radar/4.0',accept:'text/html,application/xhtml+xml'}})
    if(!r.ok) throw Error('HTTP '+r.status)
    const html = await r.text(); const finalUrl = r.url || url
    const meta = name => {
      const a = new RegExp('<meta[^>]+(?:name|property)=["\\']'+name+'["\\'][^>]+content=["\\']([\\s\\S]*?)["\\'][^>]*>','i')
      const b = new RegExp('<meta[^>]+content=["\\']([\\s\\S]*?)["\\'][^>]+(?:name|property)=["\\']'+name+'["\\'][^>]*>','i')
      return decode((html.match(a)||html.match(b)||[])[1]||'')
    }
    const canonical = (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)||[])[1] || finalUrl
    const blocks = [...html.matchAll(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(x=>clean(x[2])).sort((a,b)=>b.length-a.length)
    const excerpt = (blocks[0] || meta('description') || meta('og:description') || clean(html)).slice(0,1800)
    return {canonicalUrl:canonical,sourceDomain:domain(canonical),articleExcerpt:excerpt,retrievedAt:new Date().toISOString(),fetchError:null}
  } catch(e) { return {canonicalUrl:url,sourceDomain:domain(url),articleExcerpt:'',retrievedAt:new Date().toISOString(),fetchError:e.message} }
  finally { clearTimeout(timer) }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let cursor = 0
  async function worker(){ while(true){ const i=cursor++; if(i>=items.length)return; out[i]=await fn(items[i],i) } }
  await Promise.all(Array.from({length:limit},worker)); return out
}

async function llm(system,data) {
  const key=process.env.OPENAI_API_KEY; if(!key)return null
  const base=(process.env.OPENAI_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'')
  const model=process.env.RETAIL_LLM_MODEL||'deepseek-v4-flash'
  try {
    const r=await fetch(base+'/chat/completions',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(data)}],temperature:.1})})
    if(!r.ok)throw Error('LLM HTTP '+r.status)
    const j=await r.json(), c=j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || ''
    const m=c.match(/```(?:json)?\s*([\s\S]*?)\s*```/)||c.match(/\[[\s\S]*\]/)||c.match(/\{[\s\S]*\}/)
    return m?JSON.parse(m[1]||m[0]):null
  } catch(e){ console.warn('[retail-radar] verification fallback: '+e.message); return null }
}

const news=await readJson(newsFile,{generatedAt:null,items:[]})
const store=await readJson(eventsFile,{generatedAt:null,events:[]})
const daily=await readJson(dailyFile,{})
const current=news.items||[]

// 1. Read the original article for every newly visible signal. RSS remains discovery only.
const enriched=await mapLimit(current.slice(0,60),6,async item=>({...item,...await fetchArticle(item.canonicalUrl||item.url)}))
const byId=new Map(enriched.map(x=>[x.id,x]))
news.items=current.map(x=>byId.get(x.id)||x)

// 2. Persist every event report instead of discarding its reports after each run.
const eventMap=new Map((store.events||[]).map(e=>[e.id,{...e,reports:[...(e.reports||e.items||[])]}]))
for(const item of news.items){
  if(!item.eventId) continue
  let event=eventMap.get(item.eventId)
  if(!event){ event={id:item.eventId,title:item.eventTitle||item.title,reports:[],firstDate:item.date}; eventMap.set(event.id,event) }
  const index=event.reports.findIndex(x=>x.id===item.id)
  const report={...item,canonicalUrl:item.canonicalUrl||item.url,sourceDomain:item.sourceDomain||domain(item.url)}
  if(index>=0) event.reports[index]={...event.reports[index],...report}; else event.reports.push(report)
}

function rebuild(e){
  const reports=e.reports||[], latest=reports.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]
  const sources=[...new Set(reports.map(x=>x.sourceDomain||x.source).filter(Boolean))]
  const official=reports.filter(x=>x.sourceType==='官方').length
  const age=Math.max(0,(Date.now()-Date.parse((latest && latest.date || new Date().toISOString().slice(0,10))+'T12:00:00Z'))/86400000)
  const status=age<=2?'active':age<=7?'following':age<=21?'cooling':'settled'
  return {...e,firstDate:e.firstDate||reports[0]&&reports[0].date,latestAt:latest&&latest.date,reportCount:reports.length,sourceCount:sources.length,sources,officialSourceCount:official,status,dateSpanDays:Math.max(0,(Date.parse((latest&&latest.date||'')+'T12:00:00Z')-Date.parse((e.firstDate||latest&&latest.date||'')+'T12:00:00Z'))/86400000),reports:reports.slice(-60)}
}
let events=[...eventMap.values()].map(rebuild).sort((a,b)=>String(b.latestAt).localeCompare(String(a.latestAt))).slice(0,300)

// 3. Multi-source verification compares only the reports actually stored in the event.
const candidates=events.slice(0,30).map((e,index)=>({index,id:e.id,title:e.title,reports:e.reports.slice(-8).map(x=>({date:x.date,source:x.source,domain:x.sourceDomain,title:x.title,excerpt:x.articleExcerpt&&x.articleExcerpt.slice(0,900)}))}))
const checks=await llm('你是多来源事实核验器。只能比较输入中的原始报道摘录，不可调用外部知识。status只能是 verified、partially_verified、needs_review。verified要求至少2个独立来源支持核心事实且没有明显冲突；partially_verified表示只有部分事实得到支持或只有一个来源；needs_review表示来源不足、正文不可读或存在冲突。不要把企业计划、意向、预计数字写成已发生结果。输出JSON数组：index,status,confirmedFacts[],uncertainFacts[],conflicts[],nextChecks[]。',candidates)
if(Array.isArray(checks)) for(const x of checks){ const e=events[Number(x.index)]; if(e)e.verification={status:['verified','partially_verified','needs_review'].includes(x.status)?x.status:'needs_review',confirmedFacts:Array.isArray(x.confirmedFacts)?x.confirmedFacts.slice(0,6):[],uncertainFacts:Array.isArray(x.uncertainFacts)?x.uncertainFacts.slice(0,6):[],conflicts:Array.isArray(x.conflicts)?x.conflicts.slice(0,6):[],nextChecks:Array.isArray(x.nextChecks)?x.nextChecks.slice(0,6):[],verifiedAt:new Date().toISOString()} }

// 4. Build a lifecycle state: announcement -> agreement -> launch -> expansion -> disclosure -> result.
const lifecycleInput = events.slice(0,30).map((e,index)=>({index,id:e.id,title:e.title,reports:e.reports.slice(-10).map(x=>({
  date:x.date,source:x.source,sourceType:x.sourceType,title:x.title,excerpt:x.articleExcerpt&&x.articleExcerpt.slice(0,700)
}))}))
const lifecycle = await llm('你是零售AI项目生命周期分析器。只依据输入报道判断事件目前处于哪个阶段。stage只能是 announcement、agreement、launch、expansion、disclosure、result、unknown。阶段含义：announcement=宣布/发布；agreement=签约/合作/意向；launch=上线/开始部署；expansion=扩展规模/门店；disclosure=财报/经营数据披露；result=明确经营结果或效果数据。不要把计划、目标、意向写成已经发生。输出JSON数组：index,stage,stageLabel,confirmedMilestones[],pendingMilestones[],nextMilestone。',lifecycleInput)
if(Array.isArray(lifecycle)) for(const x of lifecycle){
  const e=events[Number(x.index)]
  if(e)e.lifecycle={
    stage:['announcement','agreement','launch','expansion','disclosure','result','unknown'].includes(x.stage)?x.stage:'unknown',
    stageLabel:String(x.stageLabel||'待判断'),
    confirmedMilestones:Array.isArray(x.confirmedMilestones)?x.confirmedMilestones.slice(0,6):[],
    pendingMilestones:Array.isArray(x.pendingMilestones)?x.pendingMilestones.slice(0,6):[],
    nextMilestone:String(x.nextMilestone||'继续观察后续公开披露'),
    updatedAt:new Date().toISOString()
  }
}

// 4. Feed the verified event state back to the live item list.
const eventById=new Map(events.map(e=>[e.id,e]))
news.items=news.items.map(item=>{const e=eventById.get(item.eventId);return e?{...item,eventSourceCount:e.sourceCount,eventReportCount:e.reportCount,eventVerification:e.verification&&e.verification.status,eventVerificationAt:e.verification&&e.verification.verifiedAt}:item})
news.generatedAt=new Date().toISOString()
daily.generatedAt=new Date().toISOString()
daily.method='多源采集 → RSS发现 → 原文抓取 → 历史事件持续合并 → 多源证据核验 → 热度/日报'
daily.factBoundary='AI核验用于整理公开证据，不替代原始公告、财报、监管披露或原始报道。'

await writeJson(newsFile,news)
await writeJson(eventsFile,{generatedAt:news.generatedAt,events})
await writeJson(dailyFile,daily)
console.log('[retail-radar] persisted reports='+events.reduce((n,e)=>n+e.reportCount,0)+' events='+events.length+' articleFetch='+enriched.length+' verified='+events.filter(e=>e.verification&&e.verification.status==='verified').length)