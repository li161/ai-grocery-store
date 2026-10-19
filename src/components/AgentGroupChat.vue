<script setup>
import { computed, nextTick, ref, watch } from 'vue'
const props = defineProps({ onBack: { type: Function, required: true }, initialAgent: { type: String, default: '' } })
const agents = [
 { id:'manager', name:'店长', role:'经营负责人', icon:'♙', color:'violet', guide:'统筹经营目标、拆解任务、协调其他岗位并汇总结果。' },
 { id:'cashier', name:'小票', role:'收银员数字人', icon:'▤', color:'blue', guide:'处理订单咨询、支付流程指引、售后分流与服务话术。' },
 { id:'guide', name:'小导', role:'导购数字人', icon:'✳', color:'amber', guide:'识别顾客需求、比较商品、提供推荐与组合购买建议。' },
 { id:'buyer', name:'采购', role:'采购补货数字人', icon:'⇄', color:'blue', guide:'整理缺货信号、供应商报价与补货建议，未经确认不得执行采购。' },
 { id:'inventory', name:'盘点员', role:'库存盘点数字人', icon:'▦', color:'amber', guide:'协助盘点、核对库存差异、发现临期和损耗风险。' },
 { id:'pm', name:'林舟', role:'产品经理 / 流程负责人', icon:'⌘', color:'violet', guide:'将经营目标拆成流程、需求、验收标准和迭代计划。' }
]
const messages = ref([{id:1,role:'system',text:'门店经营协作室已创建。店长负责拆解经营目标，收银、导购、采购、盘点与产品经理按岗位协作。当前为演示模式。',time:'刚刚'},{id:2,role:'manager',text:'我是店长 / 经营负责人。告诉我今天的经营目标，我会先拆任务，再协调各岗位数字员工。',time:'刚刚'}])
const draft = ref('')
const messageList = ref(null)
const quickPrompts = ['帮我制定今天的门店经营计划', '@盘点员 设计一份今日库存核查方案', '@采购 列出补货决策所需数据', '@店长 汇总各岗位风险与待办']
watch(messages, async () => {
 await nextTick()
 if (messageList.value) messageList.value.scrollTo({ top: messageList.value.scrollHeight, behavior: 'smooth' })
}, { deep: true })
const mode = ref('deepseek')
const busy = ref(false)
const status = ref('')
const apiBase = ref(import.meta.env.VITE_AGENT_API || 'https://ai-grocery-store-agent-api.onrender.com')
const selected = ref(props.initialAgent ? [props.initialAgent] : agents.map(a => a.id))
const activeAgents = computed(() => agents.filter(a => selected.value.includes(a.id)))
const now = () => new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
function toggleAgent(id){ if (busy.value) return; selected.value = selected.value.includes(id) ? selected.value.filter(x=>x!==id) : [...selected.value,id] }
function addPrompt(prompt){ if (!busy.value) draft.value = prompt }
function resolveTargets(text){
 const tokens = [...text.matchAll(/@([\w\u4e00-\u9fa5]+)/g)].map(m=>m[1].toLowerCase())
 if (!tokens.length || tokens.some(n=>['所有人','全体','all'].includes(n))) return activeAgents.value
 const aliases = {'店长':'manager','经营负责人':'manager','小票':'cashier','收银员':'cashier','小导':'guide','导购':'guide','采购':'buyer','采购员':'buyer','盘点员':'inventory','林舟':'pm','产品经理':'pm'}
 const ids = new Set(tokens.map(n=>aliases[n] || agents.find(a=>a.id===n || a.name.toLowerCase()===n || a.role.toLowerCase()===n)?.id).filter(Boolean))
 return ids.size ? agents.filter(a=>ids.has(a.id) && selected.value.includes(a.id)) : activeAgents.value
}
function demoReply(a){
 if(a.id==='manager') return '我先把目标拆成岗位任务：前台由收银员和导购承接，采购与盘点核对履约和库存，最后由我汇总风险与待办。涉及真实交易或库存变更的动作需要人工确认。'
 if(a.id==='cashier') return '我可以先处理订单状态、支付步骤和售后入口等常见问题；接入真实订单系统前，我只提供流程指引，不会声称已完成退款或交易。'
 if(a.id==='guide') return '我会先确认顾客的用途、预算和偏好，再对比商品特点与适配场景。接入真实商品目录后，推荐可以引用实际库存和价格。'
 if(a.id==='buyer') return '我会根据缺货信号整理补货候选、供应商报价和交期，输出待审核建议；未获得授权前不下采购单。'
 if(a.id==='inventory') return '我可以按商品、库位和账面数量生成盘点清单，并把差异标记为待核验线索；没有接入库存数据前不会虚构盘点结果。'
 return '我负责把经营目标转成可执行流程：明确输入、责任岗位、验收标准和复盘指标，再与店长确认优先级。'
}
async function send(){
 const text=draft.value.trim(); if(!text||busy.value||!selected.value.length)return
 const targets=resolveTargets(text)
 if (!targets.length) { status.value = '没有可接收该消息的已选岗位，请先勾选数字人或使用 @所有人'; return }
 messages.value.push({id:Date.now(),role:'user',text,time:now()})
 draft.value=''
 busy.value=true
 status.value = mode.value === 'deepseek' ? '请求已分派，等待各岗位返回…' : '演示中：各岗位正在处理…'
 try{
  if(mode.value==='deepseek'){
   if(!apiBase.value.trim())throw new Error('后端 API 地址未配置，请设置 VITE_AGENT_API')
   const controller=new AbortController()
   const requestTimer=setTimeout(()=>controller.abort(),70000)
   let response
   let data
   const requestKey=globalThis.crypto?.randomUUID?.()||('chat-'+Date.now()+'-'+Math.random().toString(36).slice(2))
   try{
    response=await fetch(apiBase.value.trim().replace(/\/$/, '')+'/api/chat',{
     method:'POST',signal:controller.signal,
     headers:{'content-type':'application/json','idempotency-key':requestKey},
     body:JSON.stringify({message:text,agents:targets.map(({id,name,role,guide})=>({id,name,role,instructions:guide})),history:messages.value.slice(0, -1).slice(-12).map(m=>({role:m.role,text:m.text}))})
    })
    data=await response.json().catch(()=>({}))
   }catch(error){
    if(error.name==='AbortError')throw new Error('请求超过 70 秒已中止。可检查后端日志；不要立即重复提交相同的高成本任务。')
    throw error
   }finally{clearTimeout(requestTimer)}
   if(!response.ok)throw new Error(data.error||'Agent API 请求失败（HTTP '+response.status+'）')
   for(const item of data.replies||[])messages.value.push({id:Date.now()+Math.random(),role:item.agentId,text:item.text,time:now()})
   if(!data.replies?.length)throw new Error('服务没有返回回复')
   const runId=data.taskId||data.traceId
   if(data.failed)status.value='部分 Agent 失败 · 任务 '+(runId||'已记录').toString().slice(0,8)
   else status.value='全部回复完成 · 任务 '+(runId||'已记录').toString().slice(0,8)
   if(Array.isArray(data.errors)&&data.errors.length)messages.value.push({id:Date.now()+Math.random(),role:'system',text:'失败任务：'+data.errors.join('；'),time:now()})
  }else{
   const results=await Promise.allSettled(targets.map(async(a,i)=>{await new Promise(r=>setTimeout(r,400+i*260));return {id:Date.now()+Math.random(),role:a.id,text:demoReply(a),time:now()}}))
   results.forEach(r=>{if(r.status==='fulfilled')messages.value.push(r.value)})
   status.value='演示完成 · 切换 DeepSeek 模式可调用真实模型'
  }
 }catch(e){status.value='调用失败：'+e.message;messages.value.push({id:Date.now()+Math.random(),role:'system',text:'Agent 服务调用失败。请检查后端部署状态、DeepSeek API Key 配置和服务日志。',time:now()})}
 finally{busy.value=false}
}
</script>
<template>
<section class="gc-wrap">
 <header class="gc-top"><button class="gc-back" @click="props.onBack">← 返回杂货铺</button><div class="gc-brand"><span class="gc-live"></span>AI 杂货铺 <i>/</i> 数字人群聊</div><span class="gc-pill">MVP · {{mode==='demo'?'演示模式':'DeepSeek Runtime'}}</span></header>
 <div class="gc-layout">
  <aside class="gc-side"><div class="gc-label">协作空间 <span>01</span></div><div class="gc-room"><b>◉　门店经营协作室</b><small>6 个岗位数字人 · 共享群聊</small></div><div class="gc-label gc-gap">数字人 / AGENTS <span>{{activeAgents.length}}/6</span></div>
   <button v-for="a in agents" :key="a.id" class="gc-agent" :class="{chosen:selected.includes(a.id)}" @click="toggleAgent(a.id)"><span class="gc-avatar" :class="a.color">{{a.icon}}</span><span><b>{{a.name}}</b><small>{{a.role}}</small></span><i>{{selected.includes(a.id)?'✓':'+'}}</i></button>
   <div class="gc-side-note">✳　<b>Router 在线</b><small>规则优先 · 并行调度</small></div>
  </aside>
  <main class="gc-chat"><div class="gc-chat-head"><div><small>SHARED CONTEXT / ROOM 001</small><h1>门店经营协作室 <em :class="{'is-busy':busy}">● {{busy ? '协作中' : '就绪'}}</em></h1><p>多角色讨论 · 独立 Agent · 同一消息时间线</p></div><span>⌘　⋯</span></div>
   <div class="gc-mode"><div><b>运行模式</b><small>{{mode==='demo'?'内置演示逻辑，不会调用模型':'并行调用已部署的 DeepSeek API 后端'}}</small></div><div class="gc-switch"><button :disabled="busy" :class="{on:mode==='demo'}" @click="mode='demo'">演示</button><button :disabled="busy" :class="{on:mode==='deepseek'}" @click="mode='deepseek'">DeepSeek</button></div></div>
   <div v-if="mode==='deepseek'" class="gc-endpoint gc-key-note"><span>服务地址已配置</span><small>实际可用性以发送测试为准；模型密钥仅保存在服务端。</small></div>
   <div ref="messageList" class="gc-messages"><div v-for="m in messages" :key="m.id" class="gc-message" :class="'msg-'+m.role">
    <div v-if="m.role==='user'" class="gc-user">{{m.text}}</div><template v-else><span class="gc-avatar" :class="agents.find(a=>a.id===m.role)?.color||'system'">{{agents.find(a=>a.id===m.role)?.icon||'✳'}}</span><div class="gc-msg-body"><div class="gc-meta"><b>{{agents.find(a=>a.id===m.role)?.name||'系统'}}</b><span>{{agents.find(a=>a.id===m.role)?.role||'通知'}}</span><time>{{m.time}}</time></div><div class="gc-msg-text">{{m.text}}</div></div></template>
   </div><div v-if="busy" class="gc-thinking">● ● ●　{{status}}</div></div>
   <div class="gc-composer"><div class="gc-quick-prompts"><button v-for="prompt in quickPrompts" :key="prompt" :disabled="busy" @click="addPrompt(prompt)">{{prompt}}</button></div><div class="gc-hint">@ 店长 / 收银员 / 导购 / 采购 / 盘点员 / 产品经理 / 所有人</div><textarea v-model="draft" :disabled="busy" rows="3" placeholder="发起讨论，或 @某位数字人定向提问…" @keydown.enter.exact.prevent="send"></textarea><div class="gc-send-row"><span>{{status||'Enter 发送 · Shift + Enter 换行'}}</span><button :disabled="busy||!draft.trim()||!selected.length" @click="send">{{busy?'协作中…':'发送消息 ↗'}}</button></div></div>
  </main>
  <aside class="gc-monitor"><div class="gc-label">运行监控 <span class="gc-live-label">LIVE</span></div><div class="gc-metric"><small>在线数字人</small><strong>{{selected.length}}<i> / 6</i></strong><div class="gc-meter"><span :style="{width:(selected.length/6*100)+'%'}"></span></div></div><div class="gc-metric"><small>本房间消息</small><strong>{{messages.length}}<i> 条</i></strong></div><div class="gc-metric"><small>调度策略</small><b>Rule → Agent</b></div><div class="gc-label gc-gap">消息生命周期</div><div v-for="(s,i) in ['接收消息 · 生成请求','规则路由 · @ 提及','并行调用 · 独立回答','聚合结果 · 失败隔离']" :key="s" class="gc-step"><span>{{i+1}}</span>{{s}}</div><div class="gc-safety"><b>安全边界</b><p>DeepSeek 密钥仅保存在后端环境变量；浏览器不保存或传输模型密钥。后端启用来源白名单与 IP 限流。</p></div></aside>
 </div>
</section>
</template>
<style>
.gc-wrap{min-height:100vh;background:#f5f6f8;color:#202635;padding:0 26px 36px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.gc-top{height:64px;display:flex;align-items:center;gap:20px;border-bottom:1px solid #e3e6eb;max-width:1500px;margin:auto}.gc-back{border:0;background:none;color:#687386;cursor:pointer;font-size:12px}.gc-brand{font-weight:750;font-size:13px}.gc-brand i{font-style:normal;color:#b2b9c4;margin:0 7px}.gc-live{display:inline-block;width:7px;height:7px;border-radius:50%;background:#26b887;margin-right:8px;box-shadow:0 0 0 4px #26b88720}.gc-pill{margin-left:auto;font-size:10px;border:1px solid #dfe3e9;border-radius:20px;padding:7px 10px;color:#687386;background:#fff}.gc-layout{max-width:1500px;margin:22px auto;display:grid;grid-template-columns:215px minmax(380px,1fr) 220px;gap:17px;align-items:start}.gc-side,.gc-chat,.gc-monitor{background:#fff;border:1px solid #e7e9ee;border-radius:13px}.gc-side{padding:16px 12px;min-height:640px}.gc-label{display:flex;justify-content:space-between;color:#9aa2b0;font-size:10px;font-weight:800;letter-spacing:1px;padding:0 6px 12px}.gc-label span{letter-spacing:0}.gc-room{border:1px solid #e5e8ff;background:#f5f6ff;border-radius:9px;padding:12px;color:#4948a5}.gc-room b{font-size:12px}.gc-room small{display:block;font-size:10px;color:#9299a7;margin:6px 0 0 27px}.gc-gap{margin-top:26px}.gc-agent{display:flex;align-items:center;gap:9px;width:100%;padding:10px 6px;border:1px solid transparent;border-radius:9px;background:white;text-align:left;cursor:pointer}.gc-agent.chosen{background:#fafbfc;border-color:#eef0f4}.gc-avatar{display:flex;align-items:center;justify-content:center;width:34px;height:34px;flex:0 0 34px;border-radius:10px;font-size:16px;background:#f1edff}.gc-avatar.blue{background:#e8f3ff}.gc-avatar.amber{background:#fff2df}.gc-avatar.system{background:#e8f7ef}.gc-agent b,.gc-agent small{display:block}.gc-agent b{font-size:12px}.gc-agent small{font-size:10px;color:#9299a7;margin-top:4px}.gc-agent i{margin-left:auto;font-style:normal;color:#5b59c5}.gc-side-note{border-top:1px solid #edf0f4;margin-top:25px;padding:16px 4px;font-size:11px;color:#28a879}.gc-side-note small{display:block;margin:6px 0 0 23px;color:#929aa7;font-size:10px}.gc-chat{overflow:hidden;min-height:700px}.gc-chat-head{display:flex;justify-content:space-between;padding:23px 24px 17px;border-bottom:1px solid #edf0f3}.gc-chat-head small{font-size:9px;letter-spacing:1.4px;color:#9da5b2;font-weight:800}.gc-chat-head h1{font-size:22px;margin:9px 0 5px;letter-spacing:-.8px}.gc-chat-head h1 em{font-size:9px;color:#23a879;font-style:normal;margin-left:10px;letter-spacing:0}.gc-chat-head p{font-size:11px;color:#8c94a2;margin:0}.gc-chat-head>span{color:#8b93a0}.gc-mode{margin:14px 20px 0;padding:12px;border:1px solid #edf0f5;background:#fafbfc;border-radius:9px;display:flex;align-items:center;justify-content:space-between;gap:10px}.gc-mode b,.gc-mode small{display:block;font-size:11px}.gc-mode small{font-size:10px;color:#929aa7;margin-top:4px}.gc-switch{display:flex;padding:3px;border:1px solid #e8eaf0;background:#fff;border-radius:7px;flex-shrink:0}.gc-switch button{border:0;background:transparent;padding:6px 9px;font-size:10px;color:#858d9b;border-radius:5px;cursor:pointer}.gc-switch button.on{background:#252a3b;color:#fff}.gc-endpoint{margin:10px 20px 0;display:flex;flex-direction:column;gap:4px;padding:10px 12px;border:1px solid #e7f2eb;border-radius:8px;background:#f7fbf8}.gc-key-note span{font-size:10px;color:#27835f;font-weight:700}.gc-key-note small{font-size:10px;color:#87928c}.gc-messages{padding:21px 22px;min-height:310px;max-height:430px;overflow:auto;display:flex;flex-direction:column;gap:22px;scroll-behavior:smooth;overscroll-behavior:contain}.gc-message{display:flex;align-items:flex-start;gap:10px}.gc-msg-body{min-width:0;flex:1}.gc-meta{display:flex;align-items:center;gap:8px;margin:2px 0 7px}.gc-meta b{font-size:11px}.gc-meta span,.gc-meta time{font-size:9px;color:#9aa2ae}.gc-meta time{margin-left:auto}.gc-msg-text{font-size:12px;line-height:1.8;color:#535c6b;white-space:pre-wrap}.msg-user{justify-content:flex-end}.gc-user{max-width:82%;font-size:12px;line-height:1.7;background:#35364d;color:#fff;border-radius:12px 12px 3px 12px;padding:11px 14px;white-space:pre-wrap}.msg-system .gc-msg-text{background:#f5f7fa;padding:9px 12px;border-radius:7px;color:#788190}.gc-thinking{font-size:10px;color:#8c94a2}
.gc-quick-prompts{display:flex;gap:6px;flex-wrap:wrap;padding:10px 10px 0}
.gc-quick-prompts button{border:1px solid #e6e8f0;background:#fff;border-radius:20px;padding:6px 9px;font-size:10px;color:#6e7285;cursor:pointer;transition:all .15s}
.gc-quick-prompts button:hover:not(:disabled){border-color:#b9b8ed;background:#f8f7ff;color:#4b49b8}
.gc-quick-prompts button:disabled,.gc-switch button:disabled,.gc-agent:disabled{opacity:.5;cursor:not-allowed}
.gc-chat-head h1 em.is-busy{color:#6b69d6}
.gc-composer{margin:0 17px 17px;border:1px solid #dfe3ea;border-radius:10px;box-shadow:0 4px 15px #1e293b08;overflow:hidden}.gc-hint{padding:10px 12px 0;font-size:10px;color:#9994d4}.gc-composer textarea{display:block;width:100%;box-sizing:border-box;resize:vertical;border:0;outline:0;padding:10px 12px;font:12px/1.6 inherit;min-height:75px;color:#333b4a}.gc-composer textarea::placeholder{color:#b0b6c0}.gc-send-row{border-top:1px solid #f0f1f4;padding:9px 10px;display:flex;align-items:center;justify-content:space-between;gap:8px}.gc-send-row span{font-size:9px;color:#9ba2ae;overflow:hidden;text-overflow:ellipsis}.gc-send-row button{border:0;border-radius:7px;padding:9px 12px;background:#4b49b8;color:#fff;font-size:10px;white-space:nowrap;cursor:pointer}.gc-send-row button:disabled{opacity:.45;cursor:not-allowed}.gc-monitor{padding:18px 14px;min-height:640px}.gc-live-label{font-size:8px;color:#28a879;background:#eaf8f1;padding:4px 6px;border-radius:4px}.gc-metric{border-bottom:1px solid #edf0f4;padding:12px 1px}.gc-metric small{display:block;font-size:10px;color:#929aa7}.gc-metric strong{display:block;font-size:23px;margin-top:6px}.gc-metric strong i{font-style:normal;font-size:10px;color:#9aa2ad;font-weight:500}.gc-metric>b{display:block;font-size:13px;margin-top:8px}.gc-meter{height:3px;background:#f0f1f5;border-radius:5px;margin-top:9px}.gc-meter span{display:block;height:100%;background:#6c69d9;border-radius:5px;transition:width .2s}.gc-step{display:flex;gap:9px;align-items:center;font-size:10px;color:#626b79;padding:10px 0}.gc-step span{width:22px;height:22px;display:grid;place-items:center;border-radius:7px;background:#f1f1ff;color:#5b59c5}.gc-safety{margin-top:18px;padding:12px;background:#f8f9fb;border-radius:8px}.gc-safety b{font-size:10px}.gc-safety p{font-size:10px;line-height:1.7;color:#858d9a;margin:6px 0 0}@media(max-width:1100px){.gc-layout{grid-template-columns:190px minmax(0,1fr)}.gc-monitor{display:none}}@media(max-width:680px){.gc-wrap{padding:0 9px 20px}.gc-top{height:55px;gap:8px}.gc-back{font-size:10px}.gc-brand{font-size:10px}.gc-pill{font-size:8px;padding:6px}.gc-layout{display:flex;flex-direction:column;margin-top:10px;gap:10px}.gc-side{min-height:0;width:100%;box-sizing:border-box;padding:12px}.gc-agent{display:inline-flex;width:32%;padding:7px 3px;gap:4px;vertical-align:top}.gc-avatar{width:27px;height:27px;flex-basis:27px;font-size:12px}.gc-agent b{font-size:10px}.gc-agent small{font-size:9px}.gc-agent i{display:none}.gc-side-note{display:none}.gc-chat{width:100%;min-height:0}.gc-chat-head{padding:17px 13px}.gc-chat-head h1{font-size:19px}.gc-chat-head p{font-size:10px}.gc-mode{margin:10px 9px 0;padding:9px}.gc-messages{padding:16px 12px;max-height:45vh;min-height:200px}.gc-composer{margin:0 8px 9px}.gc-msg-text{font-size:11px}.gc-send-row span{font-size:8px}.gc-send-row button{padding:9px}.gc-monitor{display:block;width:100%;box-sizing:border-box;min-height:0}.gc-metric{display:inline-block;width:31%;vertical-align:top;padding:8px 3px}.gc-metric strong{font-size:17px}.gc-monitor .gc-gap,.gc-step,.gc-safety{display:none}}
</style>