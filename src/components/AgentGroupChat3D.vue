<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'

const props = defineProps({ onBack: { type: Function, required: true }, initialAgent: { type: String, default: '' } })
const agents = [
  { id:'manager', name:'店长', role:'经营负责人', color:0x9a7bff, guide:'统筹经营目标、拆解任务、协调岗位并汇总结果。', pos:[0,0,-1.9] },
  { id:'cashier', name:'小票', role:'收银员', color:0x42c8ff, guide:'处理订单咨询、支付流程指引与售后分流。', pos:[-2.1,0,-2.0] },
  { id:'guide', name:'小导', role:'导购顾问', color:0xffbd65, guide:'识别顾客需求、比较商品并提供组合购买建议。', pos:[2.6,0,1.9] },
  { id:'buyer', name:'采购', role:'采购补货', color:0x50e0bd, guide:'整理缺货信号、供应商报价与补货建议。', pos:[-4.5,0,1.5] },
  { id:'inventory', name:'盘点员', role:'库存盘点', color:0x65a6ff, guide:'核对库存差异，发现临期和损耗风险。', pos:[4.4,0,1.3] },
  { id:'pm', name:'林舟', role:'产品经理', color:0xff79c6, guide:'将经营目标拆成流程、验收标准和迭代计划。', pos:[0,0,4.2] }
]
const selected = ref(props.initialAgent ? [props.initialAgent] : agents.map(a=>a.id))
const activeAgents = computed(()=>agents.filter(a=>selected.value.includes(a.id)))
const messages = ref([
 {id:1,role:'system',text:'协作空间已启动。点击任意数字人可聚焦；拖动场景可环绕查看。',time:'刚刚'},
 {id:2,role:'manager',text:'我是店长。告诉我经营目标，我会拆解任务并协调各岗位协作。',time:'刚刚'}
])
const draft=ref('')
const busy=ref(false)
const status=ref('空间就绪 · 等待任务')
const mode=ref('deepseek')
const apiBase=ref(import.meta.env.VITE_AGENT_API || 'https://ai-grocery-store-agent-api.onrender.com')
const canvasHost=ref(null)
const sceneShell=ref(null)
const messageList=ref(null)
const focusAgent=ref('manager')
const motion=ref('idle')
const zoom=ref(1)
const quickPrompts=['制定今天的门店经营计划','@盘点员 设计今日库存核查方案','@采购 列出补货决策所需数据','@店长 汇总各岗位风险与待办']
const now=()=>new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
let renderer, scene, camera, raf, resizeObserver, raycaster, pointerDown=null, sceneListeners=[]
const avatarMeshes=new Map()
const clickableMeshes=[]
const clock=new THREE.Clock()
let root, orbitAngle=0, orbitTilt=0.18, targetZoom=1, centralCore, orbitLines=[], beamMaterials=[]
let parallaxX=0, parallaxY=0, parallaxTargetX=0, parallaxTargetY=0
function toggleAgent(id){ if(busy.value)return; selected.value=selected.value.includes(id)?selected.value.filter(x=>x!==id):[...selected.value,id]; focusAgent.value=id; motion.value='wave' }
function addPrompt(p){draft.value=p}
function resolveTargets(text){
 const tokens=[...text.matchAll(/@([\w\u4e00-\u9fa5]+)/g)].map(m=>m[1].toLowerCase())
 if(!tokens.length||tokens.some(n=>['所有人','全体','all'].includes(n)))return activeAgents.value
 const aliases={'店长':'manager','小票':'cashier','收银员':'cashier','小导':'guide','导购':'guide','采购':'buyer','采购员':'buyer','盘点员':'inventory','林舟':'pm','产品经理':'pm'}
 const ids=new Set(tokens.map(n=>aliases[n]||agents.find(a=>a.id===n||a.name.toLowerCase()===n)?.id).filter(Boolean))
 return ids.size?agents.filter(a=>ids.has(a.id)&&selected.value.includes(a.id)):activeAgents.value
}
function addMessage(role,text){messages.value.push({id:Date.now()+Math.random(),role,text,time:now()})}
async function send(){
 const text=draft.value.trim(); if(!text||busy.value||!selected.value.length)return
 const targets=resolveTargets(text)
 if(!targets.length){status.value='没有可接收消息的岗位，请勾选数字人或使用 @所有人';return}
 addMessage('user',text); draft.value=''; busy.value=true; motion.value='working'; status.value='任务已分派 · 数字人开始协作'
 try{
  if(mode.value==='demo'){
   await Promise.all(targets.map(async(a,i)=>{await new Promise(r=>setTimeout(r,500+i*260));addMessage(a.id,({
    manager:'我先拆解经营目标，再协调各岗位并汇总风险与待办。涉及真实交易或库存变更的动作需要人工确认。',
    cashier:'我会整理订单咨询、支付指引和售后分流方案；未接入真实订单系统前，不会声称已执行交易。',
    guide:'我会先确认顾客用途、预算和偏好，再比较商品特点与适配场景。',
    buyer:'我会根据缺货信号整理补货候选、供应商报价与交期，形成待审核建议。',
    inventory:'我会生成商品与库位核查清单，将账实差异标记为待核验线索。',
    pm:'我会把目标转成流程、责任岗位、验收标准和复盘指标。'
   })[a.id])}))
   status.value='演示协作完成'; return
  }
  const base=apiBase.value.trim().replace(/\/$/,'')
  if(!base)throw new Error('后端 API 地址未配置')
  const response=await fetch(base+'/api/chat?async=1',{method:'POST',headers:{'content-type':'application/json','idempotency-key':globalThis.crypto?.randomUUID?.()||'chat-'+Date.now()},body:JSON.stringify({message:text,agents:targets.map(({id,name,role,guide})=>({id,name,role,instructions:guide})),history:messages.value.slice(0,-1).slice(-12).map(m=>({role:m.role,text:m.text}))})})
  const data=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(data.error||'Agent API 请求失败（HTTP '+response.status+'）')
  if(data.started&&data.taskId){
   const deadline=Date.now()+90000, shown=new Set(); let terminal=false
   while(Date.now()<deadline){
    const pr=await fetch(base+'/api/tasks/'+encodeURIComponent(data.taskId));const pd=await pr.json().catch(()=>({}))
    if(!pr.ok)throw new Error(pd.error||'任务状态查询失败')
    const task=pd.task;if(!task)throw new Error('任务状态响应缺少 task');data.task=task
    for(const item of task.tasks||[]){
     if(item.status==='succeeded'&&!shown.has(item.agentId)){addMessage(item.agentId,item.result||'任务已完成，但没有返回文本。');shown.add(item.agentId)}
     else if(['failed','skipped','interrupted'].includes(item.status)&&!shown.has('e'+item.agentId)){addMessage('system',(item.agentName||item.agentId)+'：'+(item.error||'任务未完成'));shown.add('e'+item.agentId)}
    }
    terminal=['completed','partial_failed','failed','interrupted'].includes(task.status)
    status.value='协作进度 '+(task.tasks||[]).filter(t=>t.status==='succeeded').length+'/'+(task.tasks||[]).length+' · '+task.status
    if(terminal)break
    await new Promise(r=>setTimeout(r,900))
   }
   if(!terminal)throw new Error('等待超过 90 秒，任务可能仍在后台执行。任务 ID：'+data.taskId)
   if(data.task?.status!=='completed')status.value='部分岗位未完成 · '+data.taskId.slice(0,8)
   else status.value='协作完成 · '+data.taskId.slice(0,8)
  }else if(data.replies?.length){data.replies.forEach(item=>addMessage(item.agentId,item.text));status.value='协作完成'}
  else throw new Error('服务没有返回回复')
 }catch(e){status.value='调用失败：'+e.message;addMessage('system','Agent 服务调用失败，请检查后端部署状态和服务日志。')}
 finally{busy.value=false;motion.value='idle';await nextTick();if(messageList.value)messageList.value.scrollTop=messageList.value.scrollHeight}
}
function createAgent(a){
 const group=new THREE.Group();group.position.set(...a.pos);group.userData.agentId=a.id
 // Human proportions and fabric/skin materials replace the previous sci-fi robot silhouettes.
 const skin=new THREE.MeshStandardMaterial({color:0xd7a77f,roughness:.84})
 const hair=new THREE.MeshStandardMaterial({color:0x3a2a22,roughness:.92})
 const trousers=new THREE.MeshStandardMaterial({color:0x303b40,roughness:.9})
 const shoe=new THREE.MeshStandardMaterial({color:0x282321,roughness:.75})
 const clothColors={manager:0x263d35,cashier:0xeee3d0,guide:0x7b3d2c,buyer:0x34485a,inventory:0x65704c,pm:0x6c5547}
 const cloth=new THREE.MeshStandardMaterial({color:clothColors[a.id]||0x52616b,roughness:.88})
 const accent=new THREE.MeshStandardMaterial({color:a.color,roughness:.55,emissive:a.color,emissiveIntensity:.08})
 const mat=(geometry,material,x,y,z,scale)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);if(scale)m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;group.add(m);return m}
 // Head, neck, torso and layered clothing.
 mat(new THREE.CylinderGeometry(.075,.09,.14,12),skin,0,1.38,0)
 mat(new THREE.SphereGeometry(.19,20,16),skin,0,1.62,0,[.84,1.05,.88])
 mat(new THREE.SphereGeometry(.195,18,12,0,Math.PI*2,0,Math.PI*.56),hair,0,1.69,-.025,[.88,.78,.94])
 mat(new THREE.BoxGeometry(.23,.055,.09),hair,0,1.75,.12,[1,.8,1])
 // A subtle nose and eyes help the characters read as people at room scale.
 mat(new THREE.SphereGeometry(.022,8,8),skin,0,1.59,.17,[.75,1.3,.7])
 const eyeMat=new THREE.MeshStandardMaterial({color:0x28231f,roughness:.7})
 for(const side of [-1,1])mat(new THREE.SphereGeometry(.018,8,8),eyeMat,side*.065,1.635,.163)
 mat(new THREE.CapsuleGeometry(.24,.34,4,10),cloth,0,1.04,0,[1.05,1.05,.72])
 mat(new THREE.BoxGeometry(.1,.34,.018),accent,0,1.07,.18)
 mat(new THREE.CylinderGeometry(.19,.22,.12,12),cloth,0,.78,0,[1,1,.78])
 for(const side of [-1,1]){
  mat(new THREE.SphereGeometry(.115,12,10),cloth,side*.245,1.22,0,[1,.8,1])
  const upper=mat(new THREE.CylinderGeometry(.075,.09,.32,10),cloth,side*.29,.99,.015);upper.rotation.z=side*-.16
  const fore=mat(new THREE.CylinderGeometry(.055,.065,.27,10),cloth,side*.32,.73,.065);fore.rotation.z=side*.13
  mat(new THREE.SphereGeometry(.065,10,8),skin,side*.33,.58,.09)
  mat(new THREE.CylinderGeometry(.09,.115,.32,10),trousers,side*.105,.49,0)
  mat(new THREE.BoxGeometry(.14,.1,.27),shoe,side*.105,.08,.045)
 }
 // Apron and name badge for service-facing roles.
 if(a.id==='cashier'||a.id==='guide'||a.id==='manager'){
  mat(new THREE.BoxGeometry(.28,.37,.025),new THREE.MeshStandardMaterial({color:a.id==='cashier'?0x5a4030:0x3f5548,roughness:.9}),0,.96,.145)
  mat(new THREE.BoxGeometry(.055,.065,.018),accent,.07,1.12,.163)
 }
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.37,.012,6,40),new THREE.MeshBasicMaterial({color:a.color,transparent:true,opacity:.48}));ring.rotation.x=Math.PI/2;ring.position.y=.025;group.add(ring)
 const halo=new THREE.Mesh(new THREE.TorusGeometry(.23,.009,6,32),new THREE.MeshBasicMaterial({color:a.color,transparent:true,opacity:.3}));halo.position.y=1.99;halo.rotation.x=Math.PI/2;group.add(halo)
 const hit=new THREE.Mesh(new THREE.CapsuleGeometry(.48,.85,4,8),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));hit.position.y=1.05;hit.userData.agentId=a.id;group.add(hit);clickableMeshes.push(hit)
 group.userData={...group.userData,ring,halo,torso:group.children.find(o=>o.geometry?.type==='CapsuleGeometry'),head:group.children[2],material:accent}
 group.visible=false;scene.add(group);avatarMeshes.set(a.id,group)
}
function initScene(){
 const el=sceneShell.value
 if(!el)return
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v))
 const down=e=>{
  if(e.target.closest?.('button,a,textarea,input'))return
  pointerDown={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY}
  el.setPointerCapture?.(e.pointerId)
 }
 const move=e=>{
  const rect=el.getBoundingClientRect()
  if(pointerDown){
   const dx=e.clientX-pointerDown.x,dy=e.clientY-pointerDown.y
   parallaxTargetX=clamp(parallaxTargetX+dx*.006,-1,1)
   parallaxTargetY=clamp(parallaxTargetY+dy*.006,-1,1)
   pointerDown={...pointerDown,x:e.clientX,y:e.clientY}
   return
  }
  parallaxTargetX=((e.clientX-rect.left)/Math.max(rect.width,1)-.5)*2
  parallaxTargetY=((e.clientY-rect.top)/Math.max(rect.height,1)-.5)*2
 }
 const up=()=>{pointerDown=null}
 const leave=()=>{if(!pointerDown){parallaxTargetX=0;parallaxTargetY=0}}
 const wheel=e=>{e.preventDefault();zoom.value=clamp(zoom.value+(e.deltaY>0?-.055:.055),.78,1.38);targetZoom=zoom.value}
 const animate=()=>{
  raf=requestAnimationFrame(animate)
  parallaxX+=(parallaxTargetX-parallaxX)*.055
  parallaxY+=(parallaxTargetY-parallaxY)*.055
  if(sceneShell.value){
   sceneShell.value.style.backgroundPosition=`${50+parallaxX*7}% ${50+parallaxY*5}%`
   sceneShell.value.style.backgroundSize=`${112+(zoom.value-1)*18}% auto`
  }
 }
 el.addEventListener('pointerdown',down)
 el.addEventListener('pointermove',move)
 el.addEventListener('pointerup',up)
 el.addEventListener('pointercancel',up)
 el.addEventListener('pointerleave',leave)
 el.addEventListener('wheel',wheel,{passive:false})
 sceneListeners=[[el,'pointerdown',down],[el,'pointermove',move],[el,'pointerup',up],[el,'pointercancel',up],[el,'pointerleave',leave],[el,'wheel',wheel]]
 animate()
}
function zoomBy(delta){zoom.value=Math.max(.72,Math.min(1.45,zoom.value+delta));targetZoom=zoom.value}
function resetView(){orbitAngle=0;orbitTilt=.18;zoom.value=1;targetZoom=1;parallaxTargetX=0;parallaxTargetY=0;focusAgent.value='manager';motion.value='wave'}
onMounted(()=>initScene())
onBeforeUnmount(()=>{cancelAnimationFrame(raf);resizeObserver?.disconnect();for(const [el,event,handler] of sceneListeners)el.removeEventListener(event,handler);sceneListeners=[];if(renderer){renderer.dispose();renderer.domElement.remove()}scene?.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of (Array.isArray(o.material)?o.material:[o.material]))m.dispose()}})})
const selectedAgent=computed(()=>agents.find(a=>a.id===focusAgent.value)||agents[0])
</script>

<template>
<section class="space3d">
 <header class="space-top">
  <button class="back" @click="props.onBack" aria-label="返回杂货铺">‹</button>
  <div class="brand"><span class="brand-orb"><span>AI</span></span><span><b>门店经营协作室</b><small>6 个岗位数字人 · 共享群聊</small></span></div>
  <div class="top-agents"><button v-for="a in agents" :key="a.id" class="top-agent" :class="{focused:focusAgent===a.id,muted:!selected.includes(a.id)}" @click="focusAgent=a.id;motion='wave';toggleAgent(a.id)" :style="{'--agent-color':'#'+a.color.toString(16).padStart(6,'0')}"><span class="top-agent-avatar"><i></i></span><span><b>{{a.name}}</b><small>{{a.role}}</small></span></button></div>
  <div class="top-state"><i></i><span>Router 在线</span><small>规则优先 · 并行调度</small></div>
  <button class="mode-btn" @click="mode=mode==='demo'?'deepseek':'demo'">{{mode==='demo'?'演示模式':'DeepSeek Runtime'}}</button>
 </header>
 <main class="space-layout">
  <section class="stage-column">
   <div ref="sceneShell" class="scene-shell">
    <div ref="canvasHost" class="three-canvas"></div>
    <div class="scene-vignette"></div>
    <div class="left-glass glass-panel">
     <div class="panel-overline">SHARED CONTEXT / ROOM 001</div>
     <div class="left-panel-title"><span class="status-mark">✦</span><div><b>门店经营协作室</b><small>{{busy?'多角色协同 · 任务运行中':'多角色讨论 · 同步消息 · 实时协作'}}</small></div><span class="live-badge"><i></i>{{busy?'执行中':'就绪'}}</span></div>
     <div class="task-summary"><span>当前任务</span><b>{{busy?'岗位并行协作':'等待新任务'}}</b></div>
     <div class="summary-bottom"><span><i></i>{{activeAgents.length}} / 6 个岗位在线</span><span class="latency">⏱ 2h</span></div>
    </div>
    <div class="environment-label">THE LIBRARY BAR <span>·</span> PHOTO ENVIRONMENT</div>
    <div class="agent-labels">
     <button v-for="(a,i) in agents" :key="a.id" class="agent-label" :class="['agent-'+a.id,{focused:focusAgent===a.id,muted:!selected.includes(a.id)}]" :style="{'--agent-color':'#'+a.color.toString(16).padStart(6,'0')}" @click="focusAgent=a.id;motion='wave';if(!selected.includes(a.id))toggleAgent(a.id)">
      <i></i><span><b>{{a.name}}</b><small>{{a.role}}</small></span><em>{{selected.includes(a.id)?'在线':'已静音'}}</em>
     </button>
    </div>
    <div class="view-dock">
     <div class="radar"><span class="radar-ring r1"></span><span class="radar-ring r2"></span><span class="radar-center"></span><i v-for="(a,i) in agents" :key="a.id" :style="{left:(24+((i*31)%56))+'%',top:(20+((i*23)%60))+'%',background:'#'+a.color.toString(16).padStart(6,'0')}"></i></div>
     <div class="dock-controls"><b>视角控制</b><small>拖动场景 · 视差跟随</small><div><button @click="resetView">⟳ 复位</button><button @click="zoomBy(.12)">＋ 缩放</button><button @click="zoomBy(-.12)">－ 缩放</button></div></div>
    </div>
    <div class="environment-credit">摄影场景：<a href="https://unsplash.com/photos/a-spiral-staircase-in-a-library-with-bookshelves-dq5pMr51upo" target="_blank" rel="noreferrer">Roger Ce / Unsplash</a></div>
    <div class="scene-footnote">当前场景：门店经营协作室 <span>·</span> {{activeAgents.length}} 个协作角色在线</div>
   </div>
  </section>
  <aside class="chat-panel">
   <div class="panel-head"><div><span class="eyebrow">SHARED CONVERSATION</span><h2>团队群聊 <span class="live-pill">● LIVE</span></h2><p>同一上下文，岗位独立响应</p></div><button class="panel-menu" aria-label="新建会话" @click="messages=[{id:Date.now(),role:'system',text:'新会话已创建。所有数字人共享本房间上下文。',time:now()}]">↻</button></div>
   <div class="focus-card"><div class="focus-avatar" :style="{'--agent-color':'#'+selectedAgent.color.toString(16).padStart(6,'0')}"><span></span></div><div><small>当前聚焦角色</small><b>{{selectedAgent.name}} <i>{{selectedAgent.role}}</i></b><p>{{selectedAgent.guide}}</p></div><button @click="toggleAgent(focusAgent)">{{selected.includes(focusAgent)?'−':'+'}}</button></div>
   <div class="messages" ref="messageList"><div v-for="m in messages" :key="m.id" class="message" :class="['m-'+m.role,{user:m.role==='user'}]"><template v-if="m.role==='user'"><div class="user-bubble">{{m.text}}</div><time>{{m.time}}</time></template><template v-else><div class="message-meta"><span class="message-dot" :style="{'--dot-color':'#'+(agents.find(a=>a.id===m.role)?.color||0x8294c5).toString(16).padStart(6,'0')}"></span><b>{{agents.find(a=>a.id===m.role)?.name||'系统'}}</b><time>{{m.time}}</time></div><p>{{m.text}}</p></template></div><div v-if="busy" class="typing"><span></span><span></span><span></span>{{status}}</div></div>
   <div class="prompt-row"><button v-for="p in quickPrompts" :key="p" @click="addPrompt(p)" :disabled="busy">{{p}}</button></div>
   <div class="composer"><div class="mention-hint">@ 店长 / 导购 / 采购 / 盘点员 / 产品经理 / 所有人</div><textarea v-model="draft" rows="3" :disabled="busy" placeholder="描述你的目标，数字人团队将开始协作…" @keydown.enter.exact.prevent="send"></textarea><div class="composer-bottom"><span>{{status}}</span><button :disabled="busy||!draft.trim()||!selected.length" @click="send"><span>{{busy?'协作中':'发起协作'}}</span><b>↗</b></button></div></div>
  </aside>
 </main>
</section>
</template>

<style>
.space3d{position:relative;height:100vh;min-height:690px;overflow:hidden;background:#0b1723;color:#f4f7fa;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.space-top{position:absolute;z-index:30;top:0;left:0;right:0;height:78px;display:flex;align-items:center;gap:14px;padding:0 20px;background:linear-gradient(180deg,#0a1524ee,#0a1524b8);border-bottom:1px solid #b9d8ed30;backdrop-filter:blur(20px)}
.space-top button{cursor:pointer;color:inherit}.back{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;border:1px solid #8ebad533;border-radius:50%;background:#ffffff0b;font-size:30px;line-height:1;color:#e9f4fc;transition:.2s}.back:hover{background:#2d73a8}.brand{display:flex;align-items:center;gap:11px;flex:0 0 auto;min-width:215px}.brand-orb{width:39px;height:39px;display:grid;place-items:center;border-radius:50%;background:linear-gradient(145deg,#1a9fe0,#3464bd);box-shadow:0 0 24px #38a9ef45;font-size:14px;font-weight:900}.brand b,.brand small{display:block}.brand b{font-size:15px;letter-spacing:.04em}.brand small{font-size:10px;color:#b8c9d8;margin-top:4px;letter-spacing:.04em}.top-agents{display:flex;align-items:center;justify-content:center;gap:4px;flex:1;min-width:0;overflow:hidden}.top-agent{display:flex;align-items:center;gap:7px;min-width:0;padding:8px 9px;border:1px solid transparent;border-radius:12px;background:transparent;text-align:left;transition:.2s}.top-agent:hover,.top-agent.focused{background:#ffffff10;border-color:#ffffff20}.top-agent.muted{opacity:.48}.top-agent-avatar{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle at 34% 25%,var(--agent-color),#0e2538 95%);border:1px solid #ffffff36;box-shadow:0 0 14px color-mix(in srgb,var(--agent-color),transparent 76%)}.top-agent-avatar i{width:11px;height:14px;border-radius:50% 50% 42% 42%;background:#f1f3f5;box-shadow:0 8px 0 3px #e6edf4;transform:translateY(-3px)}.top-agent b,.top-agent small{display:block;white-space:nowrap}.top-agent b{font-size:11px}.top-agent small{font-size:9px;color:#b7c9d7;margin-top:3px}.top-state{display:grid;grid-template-columns:8px auto;align-items:center;gap:0 7px;flex:0 0 auto;padding:9px 12px;background:#ffffff0b;border:1px solid #c0d9eb1c;border-radius:11px;font-size:11px;color:#e5f2fa}.top-state i{grid-row:1/3;width:7px;height:7px;border-radius:50%;background:#23e3b1;box-shadow:0 0 12px #23e3b1}.top-state small{grid-column:2;color:#a9bece;font-size:9px;margin-top:4px}.mode-btn{flex:0 0 auto;padding:9px 11px;border:1px solid #8bb4d333;border-radius:10px;background:#ffffff0b;font-size:10px}
.space-layout{position:absolute;inset:78px 0 0;max-width:none;margin:0;display:block}.stage-column{position:absolute;inset:0;min-width:0}.scene-shell{position:absolute;inset:0;overflow:hidden;background-color:#261b12;background-image:linear-gradient(180deg,#08152112 5%,transparent 22%,transparent 68%,#07111e7a 100%),linear-gradient(90deg,#08152130,transparent 35%,transparent 65%,#08152126),url("https://images.unsplash.com/photo-1688411485620-2d2dbea26b1c?auto=format&fit=crop&fm=jpg&q=88&w=3000");background-size:cover;background-position:center center;background-repeat:no-repeat;transition:background-size .18s ease;isolation:isolate}
.three-canvas{position:absolute;inset:0;z-index:1;touch-action:none;opacity:0}.three-canvas canvas{display:block;width:100%;height:100%;outline:none}.scene-vignette{position:absolute;z-index:2;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 44%,transparent 42%,#06111b45 100%);box-shadow:inset 0 0 120px #06111b30}
.glass-panel{border:1px solid #9bcae74a;background:linear-gradient(135deg,#091a2ad9,#0c2032be);box-shadow:0 14px 44px #0004;backdrop-filter:blur(20px);border-radius:14px}.left-glass{position:absolute;z-index:6;left:20px;top:28px;width:min(385px,33vw);padding:14px 16px;color:#edf6fc}.panel-overline{font-size:9px;letter-spacing:.19em;color:#b2d6ea;margin-bottom:12px}.left-panel-title{display:flex;align-items:center;gap:10px}.status-mark{width:31px;height:31px;flex:0 0 31px;display:grid;place-items:center;border-radius:9px;background:linear-gradient(145deg,#1eb2f3,#4454cb);box-shadow:0 0 15px #39b3f64a}.left-panel-title>div{flex:1;min-width:0}.left-panel-title b,.left-panel-title small{display:block}.left-panel-title b{font-size:13px}.left-panel-title small{font-size:10px;color:#afc5d4;margin-top:5px}.live-badge{font-size:9px;padding:5px 7px;border-radius:20px;background:#12d7a718;color:#65f4c8;white-space:nowrap}.live-badge i{display:inline-block;width:6px;height:6px;background:#2ce9b3;border-radius:50%;margin-right:4px}.task-summary{display:flex;justify-content:space-between;gap:10px;padding:13px 0 10px;margin-top:7px;border-top:1px solid #c0def01b;font-size:10px;color:#b1c9d9}.task-summary b{color:#e9f6fc;font-weight:600}.summary-bottom{display:flex;align-items:center;justify-content:space-between;color:#8ce9e0;font-size:10px}.summary-bottom>span:first-child i{display:inline-block;width:6px;height:6px;background:#34e5bb;border-radius:50%;margin-right:6px}.latency{color:#c4d6e4;padding:4px 7px;border-radius:8px;background:#ffffff0d}
.environment-label{position:absolute;z-index:4;top:19px;left:50%;transform:translateX(-50%);font-size:9px;letter-spacing:.24em;color:#fff9;text-shadow:0 1px 7px #0008;pointer-events:none}.environment-label span{color:#59caff}
.agent-labels{position:absolute;z-index:8;inset:0;pointer-events:none}.agent-label{position:absolute;display:flex;align-items:center;gap:8px;min-width:112px;padding:7px 10px;text-align:left;border:1px solid #d3e4ee45;border-radius:20px;background:#0a1a2aaf;color:#f8fbff;box-shadow:0 8px 22px #0004;backdrop-filter:blur(14px);cursor:pointer;pointer-events:auto;transition:transform .22s,border-color .22s,background .22s}.agent-label:hover,.agent-label.focused{transform:translateY(-3px) scale(1.035);border-color:var(--agent-color);background:#071725e8;box-shadow:0 0 24px color-mix(in srgb,var(--agent-color),transparent 74%)}.agent-label>i{width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:var(--agent-color);box-shadow:0 0 12px var(--agent-color)}.agent-label span{min-width:0;flex:1}.agent-label b,.agent-label small{display:block;white-space:nowrap}.agent-label b{font-size:10px}.agent-label small{font-size:8px;color:#c1d3df;margin-top:3px}.agent-label em{font-style:normal;font-size:8px;color:#8ee5ca}.agent-label.muted{opacity:.55}.agent-manager{left:37%;top:48%}.agent-cashier{left:5%;top:49%}.agent-guide{left:52%;top:49%}.agent-buyer{left:25%;top:54%}.agent-inventory{left:39%;top:55%}.agent-pm{left:62%;top:59%}
.view-dock{position:absolute;z-index:6;left:20px;bottom:29px;display:flex;align-items:center;gap:13px;padding:10px 12px;border-radius:15px;background:linear-gradient(120deg,#081a2acc,#0c2338a6);border:1px solid #b8d9ed30;backdrop-filter:blur(16px)}.radar{position:relative;width:84px;height:84px;flex:0 0 84px;border:1px solid #2baeea9c;border-radius:50%;background:radial-gradient(circle,#1c84b73b,transparent 72%),#05172580;box-shadow:inset 0 0 24px #24a2db18,0 0 18px #149bd71b}.radar:before,.radar:after{content:"";position:absolute;background:#43b7e66b}.radar:before{left:50%;top:8%;bottom:8%;width:1px}.radar:after{top:50%;left:8%;right:8%;height:1px}.radar-ring{position:absolute;inset:19%;border:1px solid #3da6d54a;border-radius:50%}.radar-ring.r2{inset:36%}.radar-center{position:absolute;top:47%;left:47%;width:6px;height:6px;border-radius:50%;background:#c6f6ff;box-shadow:0 0 13px 4px #29baf67a}.radar i{position:absolute;width:5px;height:5px;border-radius:50%;box-shadow:0 0 8px currentColor}.dock-controls>b,.dock-controls>small{display:block}.dock-controls>b{font-size:11px}.dock-controls>small{font-size:9px;color:#b2c9d9;margin-top:5px}.dock-controls>div{display:flex;gap:5px;margin-top:9px}.dock-controls button{border:1px solid #bdd7e52c;border-radius:8px;padding:7px 9px;background:#ffffff0d;color:#e4eef6;font-size:9px;cursor:pointer}.dock-controls button:hover{background:#1b5d84}.environment-credit{position:absolute;right:360px;bottom:18px;z-index:5;padding:6px 8px;background:#07172571;border-radius:7px;color:#d8e5ee;font-size:8px}.environment-credit a{color:#8bdefb;text-decoration:none}.environment-credit a:hover{text-decoration:underline}.scene-footnote{position:absolute;z-index:5;left:20px;bottom:8px;color:#dae7efaa;font-size:8px;text-shadow:0 1px 5px #000}.scene-footnote span{margin:0 5px}
.chat-panel{position:absolute;z-index:15;top:20px;right:16px;bottom:18px;width:330px;min-height:0;max-height:none;display:flex;flex-direction:column;border:1px solid #94c7e75b;border-radius:15px;background:linear-gradient(160deg,#091b2bdf,#081725ed);box-shadow:0 22px 65px #0007;backdrop-filter:blur(22px);overflow:hidden}.panel-head{padding:17px 16px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #b0d3e51c;background:#07152242}.eyebrow{font-size:9px;letter-spacing:.18em;color:#85d9f7;font-weight:800}.panel-head h2{margin:7px 0 5px;font-size:19px;letter-spacing:-.03em;color:#f5f8fc}.panel-head p{font-size:10px;color:#b2c6d5;margin:0}.live-pill{font-size:8px;color:#6df2c2;border:1px solid #3de2b033;background:#38d8a00d;border-radius:20px;padding:4px 6px;vertical-align:middle;letter-spacing:.1em}.panel-menu{border:1px solid #bad8e522;background:#ffffff08;color:#c8e0f0;border-radius:9px;padding:8px 10px;cursor:pointer}.focus-card{display:flex;align-items:center;gap:10px;margin:10px 10px 0;padding:10px;border:1px solid #9bbde533;background:#ffffff08;border-radius:12px}.focus-avatar{width:35px;height:35px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 40% 35%,var(--agent-color),#15354a 80%);border:1px solid #fff3;box-shadow:0 0 20px color-mix(in srgb,var(--agent-color),transparent 70%);flex-shrink:0}.focus-avatar span{width:12px;height:13px;border-radius:50%;background:#f0f4f7;box-shadow:0 8px 0 3px #dce7ef;transform:translateY(-3px)}.focus-card>div:nth-child(2){min-width:0;flex:1}.focus-card small,.focus-card b{display:block}.focus-card small{font-size:8px;color:#9db7ca;margin-bottom:4px}.focus-card b{font-size:12px;color:#f1f6fb}.focus-card b i{font-size:9px;font-style:normal;color:#9ab5c9;font-weight:400;margin-left:5px}.focus-card p{font-size:9px;color:#b4c8d8;margin:5px 0 0;line-height:1.5}.focus-card>button{border:1px solid #bdd7e51f;background:#ffffff08;color:#d7e0ff;border-radius:7px;width:26px;height:26px;cursor:pointer}.messages{padding:14px 13px 8px;flex:1;overflow:auto;min-height:130px;scroll-behavior:smooth}.message{margin-bottom:15px;animation:message-in .28s ease-out}.message-meta{display:flex;align-items:center;gap:7px;margin-bottom:6px}.message-dot{width:7px;height:7px;border-radius:50%;background:var(--dot-color);box-shadow:0 0 8px var(--dot-color)}.message-meta b{font-size:10px;color:#e3edf7}.message-meta time,.message>time{font-size:8px;color:#87a3b8;margin-left:auto}.message p{margin:0 0 0 14px;font-size:11px;line-height:1.65;color:#e3edf7;background:#ffffff0a;border-left:1px solid #7aa8dd88;padding:9px 10px;border-radius:0 9px 9px 0;white-space:pre-wrap;overflow-wrap:anywhere}.message.user{display:flex;flex-direction:column;align-items:flex-end}.user-bubble{max-width:92%;background:linear-gradient(115deg,#236cb1,#3e58b0);border:1px solid #a3d9ff3b;padding:10px 12px;border-radius:13px 13px 3px 13px;font-size:11px;line-height:1.6;color:white}.message>time{margin-top:4px}.typing{display:flex;align-items:center;gap:5px;color:#9ec1d7;font-size:9px;padding:6px 0 10px}.typing span{width:4px;height:4px;border-radius:50%;background:#76baff;animation:typing 1s infinite}.typing span:nth-child(2){animation-delay:.15s}.typing span:nth-child(3){animation-delay:.3s}.prompt-row{display:flex;gap:6px;overflow-x:auto;padding:9px 10px;border-top:1px solid #b0d3e51c}.prompt-row button{flex-shrink:0;max-width:180px;border:1px solid #a8c7e62d;background:#ffffff0a;border-radius:8px;padding:7px 9px;font-size:9px;color:#c8dce9;cursor:pointer;white-space:nowrap}.prompt-row button:hover{border-color:#9bcbf7;color:#fff}.composer{padding:11px 11px 12px;border-top:1px solid #b0d3e51c;background:#07152199}.mention-hint{font-size:8px;color:#9bb5c7;margin-bottom:8px}.composer textarea{width:100%;resize:vertical;min-height:73px;border:1px solid #829aff42;border-radius:10px;background:#071725ae;color:#f1f6fb;padding:11px;font:inherit;font-size:11px;line-height:1.6;outline:none}.composer textarea:focus{border-color:#7b8fff;box-shadow:0 0 0 3px #778bff15}.composer textarea::placeholder{color:#8ca6bb}.composer-bottom{display:flex;align-items:center;gap:10px;margin-top:9px}.composer-bottom>span{font-size:8px;color:#9db5ca;flex:1;line-height:1.5}.composer-bottom button{display:flex;align-items:center;gap:14px;border:0;border-radius:10px;background:linear-gradient(115deg,#1e8bd1,#425dcb 70%,#7766d8);color:white;padding:10px 12px;font-weight:700;font-size:10px;cursor:pointer;box-shadow:0 6px 24px #164c8640;transition:.2s}.composer-bottom button:hover{transform:translateY(-2px);box-shadow:0 8px 28px #387cf266}.composer-bottom button:disabled{opacity:.45;cursor:not-allowed;transform:none}@keyframes message-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes typing{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
@media(max-width:1180px){.brand{min-width:180px}.top-agent{padding:7px 5px;gap:5px}.top-agent-avatar{width:29px;height:29px;flex-basis:29px}.top-agent small{font-size:8px}.top-state{display:none}.mode-btn{display:none}.chat-panel{width:315px}.agent-labels .agent-label{min-width:96px}.environment-credit{right:330px}}
@media(max-width:860px){.space3d{height:auto;min-height:100vh;overflow:visible;padding-top:78px}.space-top{height:70px;position:absolute;padding:0 12px;gap:9px}.brand{min-width:0;flex:1}.brand b{font-size:13px}.brand small{font-size:9px}.top-agents{display:none}.space-layout{position:relative;inset:auto;display:flex;flex-direction:column}.stage-column{position:relative;inset:auto;height:72vh;min-height:570px}.scene-shell{position:absolute;inset:0}.left-glass{left:12px;top:12px;width:min(340px,calc(100% - 24px));padding:11px 12px}.environment-label{display:none}.agent-labels .agent-label{min-width:0;padding:6px 8px}.agent-label small,.agent-label em{display:none}.agent-label b{font-size:9px}.agent-label>i{width:7px;height:7px;flex-basis:7px}.agent-cashier{left:3%;top:49%}.agent-buyer{left:25%;top:54%}.agent-inventory{left:40%;top:57%}.agent-guide{left:52%;top:49%}.agent-manager{left:34%;top:43%}.agent-pm{left:63%;top:60%}.view-dock{left:12px;bottom:14px}.radar{width:64px;height:64px;flex-basis:64px}.environment-credit{right:12px;bottom:8px}.scene-footnote{display:none}.chat-panel{position:relative;top:auto;right:auto;bottom:auto;width:auto;min-height:590px;max-height:78vh;margin:10px;border-radius:14px}}
@media(max-width:540px){.space-top{height:62px;padding:0 8px;gap:7px}.back{width:32px;height:32px;flex-basis:32px;font-size:24px}.brand-orb{width:32px;height:32px}.brand b{font-size:11px}.brand small{font-size:8px}.stage-column{height:68vh;min-height:530px}.left-glass{width:calc(100% - 24px);top:10px}.agent-cashier{left:3%;top:49%}.agent-manager{left:38%;top:47%}.agent-guide{left:57%;top:50%}.agent-buyer{left:24%;top:57%}.agent-inventory{left:42%;top:59%}.agent-pm{left:62%;top:63%}.agent-label{gap:5px;padding:5px 7px}.agent-label b{font-size:8px}.view-dock{gap:8px;padding:7px}.radar{width:52px;height:52px;flex-basis:52px}.dock-controls>b{font-size:9px}.dock-controls>small{font-size:8px}.dock-controls button{padding:6px 6px;font-size:8px}.environment-credit{font-size:7px}.chat-panel{min-height:570px;margin:8px}.panel-head{padding:14px 13px}.panel-head h2{font-size:17px}.focus-card{margin:9px 9px 0}.messages{padding:12px 10px}.composer{padding:10px}}
@media(prefers-reduced-motion:reduce){.space3d *{animation:none!important;transition:none!important}}
</style>