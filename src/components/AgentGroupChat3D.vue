<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'

const props = defineProps({ onBack: { type: Function, required: true }, initialAgent: { type: String, default: '' } })
const agents = [
  { id:'manager', name:'店长', role:'经营负责人', color:0x9a7bff, guide:'统筹经营目标、拆解任务、协调岗位并汇总结果。', pos:[0,0,0] },
  { id:'cashier', name:'小票', role:'收银员', color:0x42c8ff, guide:'处理订单咨询、支付流程指引与售后分流。', pos:[-3.4,0,-1.3] },
  { id:'guide', name:'小导', role:'导购顾问', color:0xffbd65, guide:'识别顾客需求、比较商品并提供组合购买建议。', pos:[3.4,0,-1.3] },
  { id:'buyer', name:'采购', role:'采购补货', color:0x50e0bd, guide:'整理缺货信号、供应商报价与补货建议。', pos:[-4.2,0,2] },
  { id:'inventory', name:'盘点员', role:'库存盘点', color:0x65a6ff, guide:'核对库存差异，发现临期和损耗风险。', pos:[4.2,0,2] },
  { id:'pm', name:'林舟', role:'产品经理', color:0xff79c6, guide:'将经营目标拆成流程、验收标准和迭代计划。', pos:[0,0,3.7] }
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
const messageList=ref(null)
const focusAgent=ref('manager')
const motion=ref('idle')
const zoom=ref(1)
const quickPrompts=['制定今天的门店经营计划','@盘点员 设计今日库存核查方案','@采购 列出补货决策所需数据','@店长 汇总各岗位风险与待办']
const now=()=>new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
let renderer, scene, camera, raf, resizeObserver, raycaster, pointerDown=null
const avatarMeshes=new Map()
const clickableMeshes=[]
const clock=new THREE.Clock()
let root, orbitAngle=0, orbitTilt=0.18, targetZoom=1, centralCore, orbitLines=[], beamMaterials=[]
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
    const task=pd.task;if(!task)throw new Error('任务状态响应缺少 task')
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
 const material=new THREE.MeshStandardMaterial({color:a.color,metalness:.35,roughness:.25,emissive:a.color,emissiveIntensity:.22})
 const dark=new THREE.MeshStandardMaterial({color:0x111b35,metalness:.55,roughness:.22})
 const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.36,.58,6,12),material);torso.position.y=.83;group.add(torso)
 const head=new THREE.Mesh(new THREE.SphereGeometry(.34,24,20),new THREE.MeshStandardMaterial({color:0xe9f3ff,metalness:.12,roughness:.24,emissive:a.color,emissiveIntensity:.08}));head.position.y=1.62;group.add(head)
 const visor=new THREE.Mesh(new THREE.SphereGeometry(.255,24,14,0,Math.PI*2,0,Math.PI*.48),dark);visor.scale.set(1,.66,.32);visor.position.set(0,1.64,.25);group.add(visor)
 const eyeMat=new THREE.MeshBasicMaterial({color:a.color})
 for(const x of [-.09,.09]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.035,10,8),eyeMat);eye.position.set(x,1.65,.34);group.add(eye)}
 for(const side of [-1,1]){const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.095,.42,4,8),material);arm.position.set(side*.43,.92,0);arm.rotation.z=side*.18;group.add(arm)}
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.57,.018,8,64),new THREE.MeshBasicMaterial({color:a.color,transparent:true,opacity:.9}));ring.rotation.x=Math.PI/2;ring.position.y=.08;group.add(ring)
 const halo=new THREE.Mesh(new THREE.TorusGeometry(.42,.012,6,48),new THREE.MeshBasicMaterial({color:a.color,transparent:true,opacity:.45}));halo.position.y=2.1;halo.rotation.x=Math.PI/2;group.add(halo)
 const hit=new THREE.Mesh(new THREE.SphereGeometry(.68,12,8),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));hit.position.y=1.05;hit.userData.agentId=a.id;group.add(hit);clickableMeshes.push(hit)
 group.userData={...group.userData,ring,halo,torso,head,material}
 scene.add(group);avatarMeshes.set(a.id,group)
}
function initScene(){
 if(!canvasHost.value)return
 scene=new THREE.Scene();scene.background=new THREE.Color(0x070b18);scene.fog=new THREE.FogExp2(0x070b18,.035)
 camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.set(0,8,15)
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25
 canvasHost.value.appendChild(renderer.domElement)
 scene.add(new THREE.AmbientLight(0x8299ff,1.8))
 const key=new THREE.PointLight(0x66baff,80,30);key.position.set(0,7,4);scene.add(key)
 const rim=new THREE.PointLight(0xa35cff,60,25);rim.position.set(-6,3,-5);scene.add(rim)
 const floor=new THREE.Mesh(new THREE.CircleGeometry(13,96),new THREE.MeshStandardMaterial({color:0x101a31,metalness:.7,roughness:.42,transparent:true,opacity:.85}));floor.rotation.x=-Math.PI/2;floor.position.y=-.18;scene.add(floor)
 const grid=new THREE.GridHelper(24,48,0x375caa,0x1d315b);grid.position.y=-.16;scene.add(grid)
 for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(2.15+i*.48,.012,8,100),new THREE.MeshBasicMaterial({color:i===1?0x9b65ff:0x35baff,transparent:true,opacity:.48-i*.1}));ring.rotation.x=Math.PI/2;ring.position.y=.01+i*.012;scene.add(ring);orbitLines.push(ring)}
 centralCore=new THREE.Group()
 const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.62,2),new THREE.MeshStandardMaterial({color:0x6d83ff,metalness:.8,roughness:.15,emissive:0x493aff,emissiveIntensity:1.5,wireframe:true}));centralCore.add(core)
 const coreGlow=new THREE.Mesh(new THREE.SphereGeometry(.38,24,24),new THREE.MeshBasicMaterial({color:0x2dbbff,transparent:true,opacity:.24}));centralCore.add(coreGlow);centralCore.position.y=1.3;scene.add(centralCore)
 for(const a of agents)createAgent(a)
 raycaster=new THREE.Raycaster()
 const resize=()=>{if(!canvasHost.value||!renderer)return;const w=canvasHost.value.clientWidth,h=canvasHost.value.clientHeight;camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
 resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvasHost.value);resize()
 const pointerMove=e=>{if(pointerDown){orbitAngle+=(e.clientX-pointerDown.x)*.006;orbitTilt=Math.max(-.2,Math.min(.65,orbitTilt+(e.clientY-pointerDown.y)*.003));pointerDown={x:e.clientX,y:e.clientY};return}}
 const pointerUp=e=>{if(!pointerDown)return;const moved=Math.abs(e.clientX-pointerDown.startX)+Math.abs(e.clientY-pointerDown.startY);if(moved<8){const rect=renderer.domElement.getBoundingClientRect();const p=new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(p,camera);const hit=raycaster.intersectObjects(clickableMeshes,false)[0];if(hit){focusAgent.value=hit.object.userData.agentId;motion.value='wave';}}
 pointerDown=null}
 const down=e=>{pointerDown={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};renderer.domElement.setPointerCapture?.(e.pointerId)}
 renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerup',pointerUp)
 renderer.domElement.addEventListener('wheel',e=>{targetZoom=Math.max(.72,Math.min(1.45,targetZoom+(e.deltaY>0?-.06:.06)))},{passive:true})
 const animate=()=>{raf=requestAnimationFrame(animate);const t=clock.getElapsedTime();centralCore.rotation.y=t*.32;centralCore.rotation.x=Math.sin(t*.3)*.15;orbitLines.forEach((r,i)=>{r.rotation.z=t*(i%2?-.1:.08);r.material.opacity=.35+Math.sin(t*1.4+i)*.12})
  for(const [id,g] of avatarMeshes){const a=agents.find(x=>x.id===id);const active=selected.value.includes(id);const focus=focusAgent.value===id;g.position.y=a.pos[1]+Math.sin(t*1.5+agents.indexOf(a))*.06+(motion.value==='wave'&&focus?Math.abs(Math.sin(t*7))*.35:0);g.rotation.y=Math.sin(t*.4+agents.indexOf(a))*.12;g.scale.setScalar((focus?1.13:1)*(active?1:.78));g.userData.ring.material.opacity=active?.9:.18;g.userData.halo.rotation.z=t*.65;g.userData.material.emissiveIntensity=focus?1.0:.22}
  const radius=15/zoom.value;camera.position.x=Math.sin(orbitAngle)*radius;camera.position.z=Math.cos(orbitAngle)*radius;camera.position.y=5.4+orbitTilt*8;camera.lookAt(0,.7,0);camera.position.lerp(new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z),.1);renderer.render(scene,camera)}
 animate()
}
function zoomBy(delta){zoom.value=Math.max(.72,Math.min(1.45,zoom.value+delta));targetZoom=zoom.value}
function resetView(){orbitAngle=0;orbitTilt=.18;zoom.value=1;targetZoom=1;focusAgent.value='manager';motion.value='wave'}
onMounted(()=>initScene())
onBeforeUnmount(()=>{cancelAnimationFrame(raf);resizeObserver?.disconnect();if(renderer){renderer.dispose();renderer.domElement.remove()}scene?.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of (Array.isArray(o.material)?o.material:[o.material]))m.dispose()}})})
const selectedAgent=computed(()=>agents.find(a=>a.id===focusAgent.value)||agents[0])
</script>

<template>
<section class="space3d">
 <header class="space-top"><button class="back" @click="props.onBack">← 返回杂货铺</button><div class="brand"><span class="brand-orb">AI</span><span><b>AI 杂货铺</b><small>AGENT COLLABORATION SPACE</small></span></div><div class="top-state"><i></i>{{busy?'团队正在协作':'协作空间在线'}}</div><button class="mode-btn" @click="mode=mode==='demo'?'deepseek':'demo'">{{mode==='demo'?'演示模式':'DeepSeek Runtime'}}　↔</button></header>
 <div class="space-layout">
  <section class="stage-column">
   <div class="stage-head"><div><span class="eyebrow">LIVE SPATIAL INTERFACE / 001</span><h1>让想法，<em>在空间里协作。</em></h1><p>选择数字人 · 拖动环绕 · 发起任务 · 实时查看协作结果</p></div><div class="scene-actions"><button @click="zoomBy(.12)">＋</button><button @click="zoomBy(-.12)">−</button><button @click="resetView">◎ 复位视角</button></div></div>
   <div class="scene-shell"><div ref="canvasHost" class="three-canvas"></div><div class="scene-vignette"></div><div class="scene-hud hud-top"><span><i class="pulse"></i> SPATIAL ENGINE</span><span>WEBGL · REAL-TIME</span></div><div class="scene-hud hud-bottom"><span>拖动旋转场景</span><span>滚轮缩放 · 点击数字人聚焦</span></div>
    <div class="agent-labels"><button v-for="a in agents" :key="a.id" class="agent-label" :class="{focused:focusAgent===a.id,muted:!selected.includes(a.id)}" :style="{'--agent-color':'#'+a.color.toString(16).padStart(6,'0')}" @click="focusAgent=a.id;motion='wave'"><i></i><span><b>{{a.name}}</b><small>{{a.role}}</small></span><em>{{selected.includes(a.id)?'在线':'已静音'}}</em></button></div>
    <div class="core-caption"><span class="core-dot"></span><b>协作核心</b><small>{{activeAgents.length}} AGENTS LINKED</small></div>
   </div>
   <div class="stage-foot"><div class="foot-stat"><small>当前团队</small><b>{{activeAgents.length}} <i>/ 6</i></b></div><div class="foot-stat"><small>消息事件</small><b>{{messages.length}} <i>条</i></b></div><div class="foot-stat"><small>空间动作</small><b>{{motion==='working'?'任务协作':motion==='wave'?'角色响应':'待命巡航'}</b></div><div class="foot-tip">✦ 点击角色卡可选中 / 取消协作成员</div></div>
   <div class="team-strip"><button v-for="a in agents" :key="a.id" class="team-chip" :class="{on:selected.includes(a.id),active:focusAgent===a.id}" @click="toggleAgent(a.id);focusAgent=a.id"><span :style="{background:'#'+a.color.toString(16).padStart(6,'0')}"></span><b>{{a.name}}</b><small>{{a.role}}</small><i>{{selected.includes(a.id)?'✓':'+'}}</i></button></div>
  </section>
  <aside class="chat-panel"><div class="panel-head"><div><span class="eyebrow">SHARED CONVERSATION</span><h2>团队群聊 <span class="live-pill">● LIVE</span></h2><p>同一上下文，岗位独立响应</p></div><button class="panel-menu" @click="messages=[{id:Date.now(),role:'system',text:'新会话已创建。所有数字人共享本房间上下文。',time:now()}]">↻</button></div>
   <div class="focus-card"><div class="focus-avatar" :style="{--agent-color:'#'+selectedAgent.color.toString(16).padStart(6,'0')}"><span></span></div><div><small>当前聚焦角色</small><b>{{selectedAgent.name}} <i>{{selectedAgent.role}}</i></b><p>{{selectedAgent.guide}}</p></div><button @click="toggleAgent(focusAgent)">{{selected.includes(focusAgent)?'−':'+'}}</button></div>
   <div class="messages" ref="messageList"><div v-for="m in messages" :key="m.id" class="message" :class="['m-'+m.role,{user:m.role==='user'}]"><template v-if="m.role==='user'"><div class="user-bubble">{{m.text}}</div><time>{{m.time}}</time></template><template v-else><div class="message-meta"><span class="message-dot" :style="{'--dot-color':'#'+(agents.find(a=>a.id===m.role)?.color||0x8294c5).toString(16).padStart(6,'0')}"></span><b>{{agents.find(a=>a.id===m.role)?.name||'系统'}}</b><time>{{m.time}}</time></div><p>{{m.text}}</p></template></div><div v-if="busy" class="typing"><span></span><span></span><span></span> {{status}}</div></div>
   <div class="prompt-row"><button v-for="p in quickPrompts" :key="p" @click="addPrompt(p)" :disabled="busy">{{p}}</button></div>
   <div class="composer"><div class="mention-hint">@ 店长 / 导购 / 采购 / 盘点员 / 产品经理 / 所有人</div><textarea v-model="draft" rows="3" :disabled="busy" placeholder="描述你的目标，数字人团队将开始协作…" @keydown.enter.exact.prevent="send"></textarea><div class="composer-bottom"><span>{{status}}</span><button :disabled="busy||!draft.trim()||!selected.length" @click="send"><span>{{busy?'协作中':'发起协作'}}</span><b>↗</b></button></div></div>
  </aside>
 </div>
</section>
</template>

<style>
.space3d{--bg:#070b18;--panel:rgba(15,22,43,.88);--line:rgba(147,173,255,.16);min-height:calc(100vh - 64px);margin:-1px 0 0;padding:22px clamp(14px,2.4vw,38px) 32px;background:radial-gradient(ellipse at 26% 28%,#172b59 0%,transparent 42%),radial-gradient(ellipse at 80% 68%,#281744 0%,transparent 38%),var(--bg);color:#eef3ff;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
.space-top{height:54px;display:flex;align-items:center;gap:22px;max-width:1800px;margin:0 auto 24px;border-bottom:1px solid var(--line);padding-bottom:14px}.space-top button{cursor:pointer}.back,.mode-btn{border:1px solid var(--line);border-radius:10px;background:#ffffff08;color:#c6d3f6;padding:10px 13px;font-size:12px}.brand{display:flex;align-items:center;gap:10px}.brand-orb{width:35px;height:35px;border-radius:12px;display:grid;place-items:center;font-weight:900;background:linear-gradient(135deg,#5bd9ff,#8065ff 65%,#d95dff);box-shadow:0 0 25px #7865ff55}.brand b,.brand small{display:block}.brand b{font-size:13px;letter-spacing:.03em}.brand small{font-size:8px;letter-spacing:.15em;color:#7789b9;margin-top:3px}.top-state{margin-left:auto;font-size:11px;color:#a8b8e3}.top-state i,.pulse{display:inline-block;width:7px;height:7px;border-radius:50%;background:#5df2c1;box-shadow:0 0 12px #5df2c1;margin-right:8px}.mode-btn{margin-left:4px}
.space-layout{max-width:1800px;margin:auto;display:grid;grid-template-columns:minmax(0,1.6fr) minmax(340px,.82fr);gap:20px;align-items:stretch}.stage-column{min-width:0}.stage-head{display:flex;justify-content:space-between;align-items:end;gap:18px;padding:5px 3px 20px}.eyebrow{font-size:9px;letter-spacing:.19em;color:#7fa4ff;font-weight:800}.stage-head h1{font-size:clamp(27px,3vw,44px);letter-spacing:-.045em;margin:9px 0 7px;font-weight:760}.stage-head h1 em{font-style:normal;background:linear-gradient(90deg,#61d9ff,#a998ff,#f38de3);background-clip:text;color:transparent}.stage-head p,.panel-head p{font-size:11px;color:#8293bd;margin:0}.scene-actions{display:flex;gap:6px;flex-shrink:0}.scene-actions button{border:1px solid var(--line);background:#111a33;color:#cbd8ff;border-radius:9px;padding:9px 12px;cursor:pointer;font-size:12px;transition:.2s}.scene-actions button:hover{border-color:#6e94ff;box-shadow:0 0 20px #627dff25;transform:translateY(-2px)}
.scene-shell{position:relative;height:clamp(440px,57vh,680px);border:1px solid #7f9fff2b;border-radius:22px;overflow:hidden;background:radial-gradient(ellipse at 50% 54%,#17285c 0%,#0a1228 52%,#070b18 100%);box-shadow:inset 0 0 80px #4268db13,0 22px 70px #0005;isolation:isolate}.three-canvas{position:absolute;inset:0;touch-action:none}.three-canvas canvas{display:block;width:100%;height:100%;outline:none}.scene-vignette{pointer-events:none;position:absolute;inset:0;background:linear-gradient(180deg,#070b1855,transparent 24%,transparent 70%,#070b1877),radial-gradient(ellipse at center,transparent 30%,#05091688 100%);z-index:1}.scene-hud{position:absolute;z-index:2;left:18px;right:18px;display:flex;justify-content:space-between;font-size:8px;letter-spacing:.15em;color:#8ca6e5;pointer-events:none}.hud-top{top:17px}.hud-bottom{bottom:15px;letter-spacing:.04em;text-transform:none;color:#687ba9}.agent-labels{position:absolute;z-index:3;right:14px;top:58px;display:grid;gap:7px;width:155px}.agent-label{display:flex;align-items:center;gap:8px;text-align:left;border:1px solid #8ba5ff22;background:#0c1539b8;backdrop-filter:blur(12px);padding:8px 9px;border-radius:10px;color:#eaf0ff;cursor:pointer;transition:.22s}.agent-label:hover,.agent-label.focused{transform:translateX(-4px);border-color:var(--agent-color);box-shadow:0 0 24px color-mix(in srgb,var(--agent-color),transparent 75%)}.agent-label>i{width:7px;height:7px;flex-shrink:0;border-radius:50%;background:var(--agent-color);box-shadow:0 0 10px var(--agent-color)}.agent-label span{min-width:0;flex:1}.agent-label b,.agent-label small{display:block}.agent-label b{font-size:10px}.agent-label small{font-size:8px;color:#8295c3;margin-top:3px}.agent-label em{font-style:normal;font-size:7px;color:#7f92c2}.agent-label.muted{opacity:.45}.core-caption{position:absolute;z-index:3;left:50%;top:48%;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:5px;pointer-events:none;text-shadow:0 2px 12px #000}.core-caption b{font-size:12px;letter-spacing:.12em}.core-caption small{font-size:8px;color:#80a9ff;letter-spacing:.16em}.core-dot{width:5px;height:5px;border-radius:50%;background:#60e8ff;box-shadow:0 0 16px 5px #60e8ff66}
.stage-foot{display:flex;align-items:center;gap:24px;padding:15px 4px;border-bottom:1px solid var(--line)}.foot-stat small,.foot-stat b{display:block}.foot-stat small{font-size:9px;color:#7182ab;margin-bottom:5px}.foot-stat b{font-size:18px}.foot-stat i{font-size:10px;font-style:normal;color:#7385b3;font-weight:500}.foot-tip{margin-left:auto;color:#879acb;font-size:10px}.team-strip{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;padding-top:13px}.team-chip{min-width:0;display:grid;grid-template-columns:7px 1fr auto;align-items:center;gap:7px;border:1px solid var(--line);border-radius:10px;background:#ffffff05;padding:9px 8px;color:#e4ebff;text-align:left;cursor:pointer;transition:.2s}.team-chip>span{width:7px;height:7px;border-radius:50%;box-shadow:0 0 10px currentColor}.team-chip b{font-size:10px;overflow:hidden;text-overflow:ellipsis}.team-chip small{grid-column:2/3;color:#7788b5;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.team-chip i{grid-column:3;grid-row:1/3;font-style:normal;color:#7586b5}.team-chip.on{background:#24366a55;border-color:#657fff55}.team-chip.active{border-color:#a18aff;box-shadow:inset 0 0 20px #8670ff13}
.chat-panel{display:flex;flex-direction:column;min-height:650px;max-height:calc(100vh - 120px);border:1px solid #829fff2b;border-radius:20px;background:linear-gradient(160deg,#111a34ed,#0a1023f5);box-shadow:0 25px 70px #0005;overflow:hidden}.panel-head{padding:22px 20px 17px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}.panel-head h2{margin:8px 0 5px;font-size:21px;letter-spacing:-.03em}.live-pill{font-size:8px;color:#6df2c2;border:1px solid #3de2b033;background:#38d8a00d;border-radius:20px;padding:4px 6px;vertical-align:middle;letter-spacing:.1em}.panel-menu{border:1px solid var(--line);background:#ffffff06;color:#91a5df;border-radius:9px;padding:8px 10px;cursor:pointer}.focus-card{display:flex;align-items:center;gap:11px;margin:13px 14px 0;padding:12px;border:1px solid #829dff26;background:linear-gradient(110deg,#29396b66,#101a35aa);border-radius:13px}.focus-avatar{width:38px;height:38px;border-radius:13px;display:grid;place-items:center;background:radial-gradient(circle at 40% 35%,var(--agent-color),#121a3c 72%);box-shadow:0 0 20px color-mix(in srgb,var(--agent-color),transparent 70%);flex-shrink:0}.focus-avatar span{width:13px;height:13px;border:2px solid white;border-radius:50%;box-shadow:0 0 12px white}.focus-card>div:nth-child(2){min-width:0;flex:1}.focus-card small,.focus-card b{display:block}.focus-card small{font-size:8px;color:#7f91bf;margin-bottom:4px}.focus-card b{font-size:12px}.focus-card b i{font-size:9px;font-style:normal;color:#8194c0;font-weight:400;margin-left:5px}.focus-card p{font-size:9px;color:#a3b2d7;margin:5px 0 0;line-height:1.5}.focus-card>button{border:1px solid var(--line);background:#ffffff08;color:#d7e0ff;border-radius:7px;width:27px;height:27px;cursor:pointer}.messages{padding:17px 17px 8px;flex:1;overflow:auto;min-height:130px;scroll-behavior:smooth}.message{margin-bottom:17px;animation:message-in .28s ease-out}.message-meta{display:flex;align-items:center;gap:7px;margin-bottom:6px}.message-dot{width:7px;height:7px;border-radius:50%;background:var(--dot-color);box-shadow:0 0 8px var(--dot-color)}.message-meta b{font-size:10px;color:#e3eaff}.message-meta time,.message>time{font-size:8px;color:#687ba8;margin-left:auto}.message p{margin:0 0 0 14px;font-size:11px;line-height:1.7;color:#b9c7e9;background:#ffffff06;border-left:1px solid #718dff44;padding:9px 11px;border-radius:0 9px 9px 0;white-space:pre-wrap;overflow-wrap:anywhere}.message.user{display:flex;flex-direction:column;align-items:flex-end}.user-bubble{max-width:92%;background:linear-gradient(115deg,#4c67d6,#7255cc);border:1px solid #a3a5ff55;padding:10px 12px;border-radius:13px 13px 3px 13px;font-size:11px;line-height:1.6;color:white}.message>time{margin-top:4px}.typing{display:flex;align-items:center;gap:5px;color:#92a6dc;font-size:9px;padding:6px 0 10px}.typing span{width:4px;height:4px;border-radius:50%;background:#76baff;animation:typing 1s infinite}.typing span:nth-child(2){animation-delay:.15s}.typing span:nth-child(3){animation-delay:.3s}.prompt-row{display:flex;gap:6px;overflow-x:auto;padding:11px 14px;border-top:1px solid var(--line)}.prompt-row button{flex-shrink:0;max-width:180px;border:1px solid #7f98ff2e;background:#ffffff06;border-radius:8px;padding:7px 9px;font-size:9px;color:#aabbe4;cursor:pointer;white-space:nowrap}.prompt-row button:hover{border-color:#9b8bff;color:white}.composer{padding:13px 14px 15px;border-top:1px solid var(--line);background:#080d1be0}.mention-hint{font-size:8px;color:#7488b8;margin-bottom:8px}.composer textarea{width:100%;resize:vertical;min-height:72px;border:1px solid #829aff2e;border-radius:11px;background:#111a30;color:#edf2ff;padding:12px;font:inherit;font-size:11px;line-height:1.6;outline:none}.composer textarea:focus{border-color:#7b8fff;box-shadow:0 0 0 3px #778bff15}.composer textarea::placeholder{color:#63749e}.composer-bottom{display:flex;align-items:center;gap:10px;margin-top:9px}.composer-bottom>span{font-size:8px;color:#8294c0;flex:1;line-height:1.5}.composer-bottom button{display:flex;align-items:center;gap:14px;border:0;border-radius:10px;background:linear-gradient(115deg,#4c87ff,#8a5cff 70%,#bd69ff);color:white;padding:10px 12px;font-weight:700;font-size:10px;cursor:pointer;box-shadow:0 6px 24px #6b62ff40;transition:.2s}.composer-bottom button:hover{transform:translateY(-2px);box-shadow:0 8px 28px #6b62ff66}.composer-bottom button b{font-size:15px}.composer-bottom button:disabled{opacity:.45;cursor:not-allowed;transform:none}@keyframes message-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes typing{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
@media(max-width:1150px){.space-layout{grid-template-columns:minmax(0,1fr)}.chat-panel{max-height:none;min-height:620px}.scene-shell{height:560px}.stage-head h1{font-size:32px}.stage-column{min-width:0}}@media(max-width:650px){.space3d{padding:12px 10px 24px}.space-top{gap:8px;margin-bottom:14px}.back{font-size:10px;padding:8px}.brand small{display:none}.brand b{font-size:11px}.brand-orb{width:29px;height:29px}.top-state{display:none}.mode-btn{margin-left:auto;font-size:9px;padding:8px}.stage-head{align-items:flex-start;flex-direction:column;padding-bottom:13px}.stage-head h1{font-size:29px}.scene-actions{align-self:flex-end}.scene-shell{height:470px;border-radius:15px}.agent-labels{right:7px;top:48px;width:110px;gap:5px}.agent-label{padding:6px;gap:5px}.agent-label b{font-size:9px}.agent-label small{font-size:7px}.agent-label em{display:none}.core-caption{top:50%;left:42%}.scene-hud{left:10px;right:10px;font-size:7px}.stage-foot{gap:12px;flex-wrap:wrap}.foot-stat b{font-size:15px}.foot-tip{width:100%;margin-left:0}.team-strip{grid-template-columns:repeat(3,minmax(0,1fr))}.chat-panel{border-radius:15px;min-height:610px}.panel-head{padding:17px 14px}.panel-head h2{font-size:19px}.focus-card{margin:10px 10px 0}.messages{padding:14px 12px}.prompt-row{padding:9px 10px}.composer{padding:11px 10px 12px}}
@media(prefers-reduced-motion:reduce){.space3d *{animation:none!important;transition:none!important}}
</style>