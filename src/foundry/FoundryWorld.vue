<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'

const API_DEFAULT = import.meta.env.VITE_AGENT_API || 'https://ai-grocery-store-agent-api.onrender.com'
const apiBase = ref(API_DEFAULT)
const activeSpace = ref('world')
const selectedId = ref('manager')
const taskInput = ref('分析今天门店库存风险，并给出补货建议')
const busy = ref(false)
const runStatus = ref('READY')
const taskId = ref('')
const events = ref([])
const trajectories = ref([])
const includeIds = ref(['manager', 'inventory', 'buyer'])
const exportMessage = ref('')
const worldHost = ref(null)
const canvasState = ref('正在构建实验空间…')
const agentPositions = ref({})
const agentStates = ref({})
const activeTab = ref('overview')
const API_TIMEOUT = 100000

const agents = [
  { id:'manager', name:'林舟', role:'任务规划师', title:'ORCHESTRATOR', bio:'拆解目标、建立依赖、汇总结果。', color:0x8c9cff, outfit:0x253c56, position:[-3.2,0,0], instructions:'你是任务规划师。把目标拆解成清晰的工作结论，指出需要其他岗位验证的内容。' },
  { id:'inventory', name:'周岚', role:'库存分析师', title:'INVENTORY', bio:'核对库存、识别缺货和滞销风险。', color:0x64d9c2, outfit:0x285b55, position:[0,0,-1.1], instructions:'你是库存分析师。分析库存风险，区分已知数据与待核实数据，不得捏造库存数字。' },
  { id:'buyer', name:'陈默', role:'采购专员', title:'PROCUREMENT', bio:'根据风险和依赖结果提出采购建议。', color:0xf0bd75, outfit:0x70503a, position:[3.2,0,0], instructions:'你是采购专员。结合依赖任务结果提出采购建议，说明数量计算所需数据和人工审批点。' },
  { id:'auditor', name:'许知', role:'质量审核员', title:'QUALITY', bio:'检查证据、逻辑和最终结论。', color:0xd99adf, outfit:0x593d63, position:[0,0,2.3], instructions:'你是质量审核员。检查前序结果是否有证据支持，标记推断、缺失信息和潜在错误。' },
]
const selectedAgent = computed(() => agents.find(a => a.id === selectedId.value) || agents[0])
const successCount = computed(() => trajectories.value.filter(t => t.status === 'completed').length)
const lastTrajectory = computed(() => trajectories.value[0] || null)

let renderer, scene, camera, raf, observer, raycaster, pointerDown, dragTarget
const clock = new THREE.Clock()
const avatarRoots = new Map()
const clickable = []
const links = []
let pointerMoved = false

function addEvent(type, message, detail = '') {
  events.value.unshift({ id: crypto.randomUUID(), time: new Date().toLocaleTimeString(), type, message, detail })
  events.value = events.value.slice(0, 40)
}
function setSpace(space) {
  activeSpace.value = space
  if (space === 'harness') activeTab.value = 'graph'
  if (space === 'distill') activeTab.value = 'dataset'
}
function createAvatar(agent) {
  const root = new THREE.Group()
  root.position.set(...agent.position)
  root.userData.agentId = agent.id
  const skin = new THREE.MeshStandardMaterial({ color:0xc99170, roughness:0.78 })
  const cloth = new THREE.MeshStandardMaterial({ color:agent.outfit, roughness:0.62 })
  const dark = new THREE.MeshStandardMaterial({ color:0x171c25, roughness:0.82 })
  const hair = new THREE.MeshStandardMaterial({ color:agent.id === 'buyer' ? 0x30251e : 0x24242b, roughness:0.9 })
  const eye = new THREE.MeshStandardMaterial({ color:0x17151a, roughness:0.35 })
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42,0.7,6,12), cloth)
  body.position.y = 1.18
  root.add(body)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.15,0.2,12),skin)
  neck.position.y = 1.76
  root.add(neck)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.39,24,20),skin)
  head.position.y = 2.08
  head.scale.set(0.86,1.08,0.88)
  root.add(head)
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.405,20,12,0,Math.PI*2,0,Math.PI*0.48),hair)
  hairCap.position.set(0,2.22,-0.015)
  hairCap.scale.set(0.9,1,0.9)
  root.add(hairCap)
  for (const x of [-0.13,0.13]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.035,10,8),eye)
    e.position.set(x,2.1,0.335)
    root.add(e)
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045,10,8),skin)
  nose.position.set(0,2.02,0.37)
  root.add(nose)
  for (const side of [-1,1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.105,0.55,4,8),cloth)
    arm.position.set(side*0.49,1.22,0)
    arm.rotation.z = side*0.14
    root.add(arm)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12,12,10),skin)
    hand.position.set(side*0.52,0.82,0.02)
    root.add(hand)
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14,0.48,4,8),dark)
    leg.position.set(side*0.19,0.43,0)
    root.add(leg)
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.12,0.38),dark)
    shoe.position.set(side*0.19,0.12,0.08)
    root.add(shoe)
  }
  const badge = new THREE.Mesh(new THREE.SphereGeometry(0.075,12,10),new THREE.MeshBasicMaterial({color:agent.color}))
  badge.position.set(0.28,1.45,0.35)
  root.add(badge)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72,0.012,8,48),new THREE.MeshBasicMaterial({color:agent.color,transparent:true,opacity:0.7}))
  ring.rotation.x = Math.PI/2
  ring.position.y = 0.05
  root.add(ring)
  const halo = new THREE.PointLight(agent.color,1.1,3.5)
  halo.position.set(0,2.6,0)
  root.add(halo)
  root.traverse(o => { if (o.isMesh) { o.userData.agentId=agent.id; clickable.push(o) } })
  root.userData.ring = ring
  root.userData.agentId = agent.id
  scene.add(root)
  avatarRoots.set(agent.id,root)
}
function addTextSprite(text,color) {
  const canvas=document.createElement('canvas')
  canvas.width=512; canvas.height=128
  const ctx=canvas.getContext('2d')
  ctx.fillStyle='rgba(8,15,23,.82)'; ctx.roundRect(8,8,496,112,22); ctx.fill()
  ctx.strokeStyle='#'+color.toString(16).padStart(6,'0'); ctx.lineWidth=3; ctx.stroke()
  ctx.font='600 34px Inter,Arial'; ctx.fillStyle='#eaf2fa'; ctx.textAlign='center'; ctx.fillText(text,256,78)
  const texture=new THREE.CanvasTexture(canvas)
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}))
  sprite.scale.set(2.25,0.56,1)
  return sprite
}
function initScene() {
  if (!worldHost.value) return
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x080d13)
  scene.fog = new THREE.FogExp2(0x080d13,0.035)
  camera = new THREE.PerspectiveCamera(42,worldHost.value.clientWidth/worldHost.value.clientHeight,0.1,100)
  camera.position.set(0,5.8,12.5)
  camera.lookAt(0,1,0)
  renderer = new THREE.WebGLRenderer({antialias:true,alpha:false})
  renderer.setPixelRatio(Math.min(devicePixelRatio,2))
  renderer.setSize(worldHost.value.clientWidth,worldHost.value.clientHeight)
  renderer.shadowMap.enabled=true
  renderer.shadowMap.type=THREE.PCFSoftShadowMap
  renderer.outputColorSpace=THREE.SRGBColorSpace
  renderer.toneMapping=THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure=1.15
  worldHost.value.appendChild(renderer.domElement)
  scene.add(new THREE.HemisphereLight(0xc5ddff,0x111722,2.1))
  const key=new THREE.DirectionalLight(0xffe5c6,3.2)
  key.position.set(-4,9,5); key.castShadow=true; scene.add(key)
  const rim=new THREE.PointLight(0x3c8dff,24,22); rim.position.set(4,5,-5); scene.add(rim)
  const floor=new THREE.Mesh(new THREE.CircleGeometry(14,80),new THREE.MeshStandardMaterial({color:0x111b25,metalness:0.42,roughness:0.58}))
  floor.rotation.x=-Math.PI/2; floor.position.y=-0.04; floor.receiveShadow=true; scene.add(floor)
  const grid=new THREE.GridHelper(24,48,0x27465c,0x1a2b39); grid.position.y=-0.02; scene.add(grid)
  const platform=new THREE.Mesh(new THREE.CylinderGeometry(5.8,6.2,0.16,80),new THREE.MeshStandardMaterial({color:0x152534,metalness:0.55,roughness:0.4}))
  platform.position.y=0.02; scene.add(platform)
  const edge=new THREE.Mesh(new THREE.TorusGeometry(5.8,0.035,10,120),new THREE.MeshBasicMaterial({color:0x3989b7}))
  edge.rotation.x=Math.PI/2; edge.position.y=0.12; scene.add(edge)
  const starGeo=new THREE.BufferGeometry(), starPos=[]
  for(let i=0;i<550;i++) starPos.push((Math.random()-.5)*34,Math.random()*14+1,(Math.random()-.5)*34)
  starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPos,3))
  scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0x6ca8ca,size:0.025,transparent:true,opacity:0.55})))
  agents.forEach(agent=>{createAvatar(agent);const label=addTextSprite(agent.name+'  /  '+agent.title,agent.color);label.position.set(agent.position[0],3.05,agent.position[2]);scene.add(label)})
  raycaster=new THREE.Raycaster()
  const onDown=e=>{pointerDown={x:e.clientX,y:e.clientY};pointerMoved=false}
  const onMove=e=>{
    if(pointerDown && Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)>5) pointerMoved=true
    if(pointerMoved && dragTarget){
      const rect=renderer.domElement.getBoundingClientRect()
      const x=((e.clientX-rect.left)/rect.width)*2-1
      const z=((e.clientY-rect.top)/rect.height)*2-1
      dragTarget.position.x=THREE.MathUtils.clamp(x*5,-4.8,4.8)
      dragTarget.position.z=THREE.MathUtils.clamp(z*4,-3.5,3.5)
      agentPositions.value={...agentPositions.value,[dragTarget.userData.agentId]:[dragTarget.position.x,dragTarget.position.z]}
    }
  }
  const onUp=e=>{
    if(pointerDown && !pointerMoved){
      const rect=renderer.domElement.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1),camera)
      const hit=raycaster.intersectObjects(clickable,false)[0]
      if(hit?.object.userData.agentId) selectedId.value=hit.object.userData.agentId
    }
    dragTarget=null;pointerDown=null
  }
  const onDouble=e=>{
    const rect=renderer.domElement.getBoundingClientRect()
    raycaster.setFromCamera(new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1),camera)
    const hit=raycaster.intersectObjects(clickable,false)[0]
    if(hit?.object.userData.agentId){dragTarget=avatarRoots.get(hit.object.userData.agentId);selectedId.value=hit.object.userData.agentId}
  }
  renderer.domElement.addEventListener('pointerdown',onDown)
  renderer.domElement.addEventListener('pointermove',onMove)
  renderer.domElement.addEventListener('pointerup',onUp)
  renderer.domElement.addEventListener('dblclick',onDouble)
  renderer.domElement.addEventListener('pointerleave',onUp)
  observer=new ResizeObserver(()=>{
    if(!renderer||!camera)return
    const w=worldHost.value.clientWidth,h=worldHost.value.clientHeight
    camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h)
  })
  observer.observe(worldHost.value)
  const animate=()=>{
    raf=requestAnimationFrame(animate)
    const t=clock.getElapsedTime()
    avatarRoots.forEach((root,id)=>{
      root.position.y=0.06+Math.sin(t*1.4+agents.findIndex(a=>a.id===id))*0.035
      root.rotation.y=Math.sin(t*.35+agents.findIndex(a=>a.id===id))*.08
      root.userData.ring.material.opacity=id===selectedId.value?.95:.32
      root.userData.ring.scale.setScalar(id===selectedId.value?1.2:1)
    })
    renderer.render(scene,camera)
  }
  animate()
  canvasState.value='3D WORLD ONLINE · 4 AGENTS'
}
function stopScene(){
  cancelAnimationFrame(raf);observer?.disconnect()
  if(renderer){renderer.dispose();renderer.domElement.remove()}
  scene?.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}})
  renderer=null;scene=null
}
function graphAgents() {
  const ids=includeIds.value
  return ids.map(id=>{
    const a=agents.find(x=>x.id===id)
    const deps=id==='manager'?[]:id==='inventory'?['manager']:id==='buyer'?['inventory']:['buyer']
    return {id:a.id,name:a.name,role:a.role,instructions:a.instructions,dependsOn:deps.filter(d=>ids.includes(d))}
  })
}
async function runHarness(){
  const message=taskInput.value.trim()
  if(!message||busy.value)return
  const selected=graphAgents()
  if(!selected.length){addEvent('error','请至少选择一个数字人');return}
  if(!apiBase.value.trim()){addEvent('error','请配置 Agent API 地址');return}
  busy.value=true;runStatus.value='RUNNING';events.value=[];taskId.value=''
  addEvent('system','Harness run queued',message)
  const controller=new AbortController()
  const timeout=setTimeout(()=>controller.abort(),API_TIMEOUT)
  let taskSnapshot=null
  try{
    const response=await fetch(apiBase.value.replace(/\/$/, '')+'/api/chat?async=1',{
      method:'POST',signal:controller.signal,
      headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},
      body:JSON.stringify({message,agents:selected,history:[]})
    })
    const payload=await response.json().catch(()=>({}))
    if(!response.ok)throw new Error(payload.error||'Harness API HTTP '+response.status)
    if(!payload.taskId)throw new Error('API 没有返回 taskId，无法跟踪真实执行')
    taskId.value=payload.taskId
    addEvent('system','真实 Harness 已接收任务',payload.taskId)
    const deadline=Date.now()+90000
    while(Date.now()<deadline){
      const poll=await fetch(apiBase.value.replace(/\/$/, '')+'/api/tasks/'+encodeURIComponent(payload.taskId),{signal:controller.signal})
      const data=await poll.json().catch(()=>({}))
      if(!poll.ok||!data.task)throw new Error(data.error||'任务状态读取失败')
      taskSnapshot=data.task
      for(const t of taskSnapshot.tasks||[]){
        const state=t.status
        agentStates.value={...agentStates.value,[t.agentId]:state}
        const eventKey=t.agentId+':'+state
        if(!events.value.some(e=>e.key===eventKey)){
          events.value.unshift({id:crypto.randomUUID(),key:eventKey,time:new Date().toLocaleTimeString(),type:state,message:(t.agentName||t.agentId)+' · '+state,detail:t.error||t.result||''})
        }
      }
      if(['completed','failed','partial','interrupted'].includes(taskSnapshot.status))break
      await new Promise(r=>setTimeout(r,1200))
    }
    if(!taskSnapshot)throw new Error('没有获得任务执行快照')
    const status=taskSnapshot.status==='completed'?'completed':taskSnapshot.status
    runStatus.value=status.toUpperCase()
    const record={id:payload.taskId,createdAt:new Date().toISOString(),message,provider:payload.provider,model:payload.model,status,tasks:taskSnapshot.tasks||[]}
    trajectories.value.unshift(record)
    persistTrajectories()
    addEvent('system','任务执行结束',status+' · '+record.tasks.filter(t=>t.status==='succeeded').length+'/'+record.tasks.length+' succeeded')
  }catch(error){
    runStatus.value='ERROR';addEvent('error','Harness 执行异常',error.name==='AbortError'?'请求超时或已中止':error.message)
  }finally{clearTimeout(timeout);busy.value=false}
}
const STORAGE_KEY='agent-foundry-trajectories-v1'
function persistTrajectories(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(trajectories.value.slice(0,100)))}catch(e){console.warn('trajectory persistence failed',e)}}
function loadTrajectories(){try{const v=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');if(Array.isArray(v))trajectories.value=v}catch{trajectories.value=[]}}
function makeSftRows(){
  const rows=[]
  for(const run of trajectories.value){
    for(const task of run.tasks||[]){
      if(task.status!=='succeeded'||!task.result)continue
      const agent=agents.find(a=>a.id===task.agentId)
      rows.push({text:[`### Instruction\n${run.message}`,`### Role\n${agent?.role||task.agentName||task.agentId}`,`### Context\n依赖任务：${(task.dependsOn||[]).join(', ')||'无'}`,`### Response\n${task.result}`].join('\n\n')})
    }
  }
  return rows
}
function exportDataset(){
  const rows=makeSftRows()
  if(!rows.length){exportMessage.value='暂无成功轨迹。先运行一次真实 Harness 任务。';return}
  const blob=new Blob([rows.map(row=>JSON.stringify(row)).join('\n')+'\n'],{type:'application/x-ndjson'})
  const url=URL.createObjectURL(blob),a=document.createElement('a')
  a.href=url;a.download='agent-foundry-sft-'+new Date().toISOString().slice(0,10)+'.jsonl';a.click();URL.revokeObjectURL(url)
  exportMessage.value='已导出 '+rows.length+' 条成功样本。'
}
function downloadTrainingReadme(){
  const text='AGENT FOUNDRY · Student SFT\n\n1. Create a Python 3.10+ environment.\n2. pip install -r training/requirements.txt\n3. python training/train_sft.py --input ./agent-foundry-sft.jsonl --output ./student-model\n\nThis first-stage trainer performs text-response SFT. It does not yet distill structured tool-call policies or deploy the resulting model into the online Harness.\n'
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain'})),a=document.createElement('a');a.href=url;a.download='STUDENT-TRAINING.md';a.click();URL.revokeObjectURL(url)
}
onMounted(()=>{loadTrajectories();initScene()})
onBeforeUnmount(stopScene)
</script>

<template>
  <main class="foundry-shell">
    <header class="foundry-topbar">
      <a class="foundry-brand" href="/"><span class="brand-mark">AF</span><span><b>AGENT FOUNDRY</b><small>BUILD · TRAIN · EVOLVE</small></span></a>
      <div class="topbar-center"><span class="live-dot"></span> EXPERIMENT ENVIRONMENT <i>LOCAL / CLOUD HYBRID</i></div>
      <div class="topbar-right"><span class="topbar-clock">LAB 001</span><a href="/">EXIT LAB ↗</a></div>
    </header>

    <nav class="world-nav">
      <button :class="{active:activeSpace==='world'}" @click="setSpace('world')"><span>01</span> WORLD</button>
      <button :class="{active:activeSpace==='harness'}" @click="setSpace('harness')"><span>02</span> HARNESS</button>
      <button :class="{active:activeSpace==='distill'}" @click="setSpace('distill')"><span>03</span> DISTILL</button>
      <button :class="{active:activeSpace==='arena'}" @click="setSpace('arena')"><span>04</span> ARENA</button>
    </nav>

    <section class="world-stage">
      <div class="world-canvas" ref="worldHost"></div>
      <div class="world-vignette"></div>
      <div class="world-heading"><span>THE AGENT ECOSYSTEM / 001</span><h1>{{ activeSpace==='world'?'A WORLD OF DIGITAL MINDS':activeSpace==='harness'?'DESIGN HOW THEY THINK':activeSpace==='distill'?'TRANSFER THE CAPABILITY':'PUT THEM TO THE TEST' }}</h1><p>真实执行 · 可观察轨迹 · 可复现训练</p></div>
      <div class="scene-status"><span class="live-dot"></span>{{ canvasState }}</div>
      <div class="world-hint">DRAG TO REPOSITION · CLICK TO INSPECT</div>
      <div class="world-agent-strip">
        <button v-for="agent in agents" :key="agent.id" :class="{chosen:selectedId===agent.id}" @click="selectedId=agent.id">
          <i :style="{background:'#'+agent.color.toString(16).padStart(6,'0')}"></i><span><b>{{agent.name}}</b><small>{{agent.role}}</small></span><em>{{agentStates[agent.id]||'IDLE'}}</em>
        </button>
      </div>
      <aside class="agent-inspector">
        <div class="inspector-kicker">DIGITAL HUMAN / {{selectedAgent.title}}</div>
        <div class="inspector-person">
          <div class="agent-monogram" :style="{--agent-color:'#'+selectedAgent.color.toString(16).padStart(6,'0')}">{{selectedAgent.name.slice(0,1)}}</div>
          <div><h2>{{selectedAgent.name}}</h2><span>{{selectedAgent.role}}</span></div>
        </div>
        <p>{{selectedAgent.bio}}</p>
        <div class="inspector-divider"></div>
        <div class="inspector-stat"><span>RUNTIME STATE</span><b>{{agentStates[selectedId]||'STANDBY'}}</b></div>
        <div class="inspector-stat"><span>MODEL</span><b>DEEPSEEK · API</b></div>
        <button class="inspector-action" @click="includeIds.includes(selectedId)?includeIds=includeIds.filter(x=>x!==selectedId):includeIds=[...includeIds,selectedId]">{{includeIds.includes(selectedId)?'REMOVE FROM RUN':'ADD TO HARNESS'}} <span>↗</span></button>
      </aside>
      <div class="world-center-note" v-if="activeSpace==='world'"><b>THE LAB IS ALIVE</b><span>选择一位数字人，给它一个目标。</span></div>
    </section>

    <section class="command-dock">
      <div class="dock-label"><span class="live-dot"></span><b>MISSION CONTROL</b><small>{{busy?'EXECUTION IN PROGRESS':runStatus}}</small></div>
      <textarea v-model="taskInput" :disabled="busy" rows="2" placeholder="向你的数字人团队下达一个目标…"></textarea>
      <button class="run-button" :disabled="busy||!taskInput.trim()" @click="runHarness"><span>{{busy?'RUNNING':'EXECUTE'}}</span><b>{{busy?'◌':'↗'}}</b></button>
    </section>

    <section class="workspace-grid">
      <div class="workspace-main">
        <div class="section-toolbar"><div><span class="section-overline">{{activeSpace.toUpperCase()}} / LIVE WORKSPACE</span><h2>{{activeSpace==='world'?'协作现场':activeSpace==='harness'?'Harness 编排':'实验数据舱'}}</h2></div><div class="runtime-pill"><span class="live-dot"></span>{{busy?'LIVE RUN':'READY'}}</div></div>
        <div v-if="activeSpace==='world'" class="world-workspace">
          <div class="workspace-card task-card"><div class="card-eyebrow">CURRENT MISSION</div><h3>{{taskInput||'等待输入任务'}}</h3><p>选择数字人并执行任务，系统会调用现有 DeepSeek Harness Runtime。</p><div class="task-meta"><span>{{includeIds.length}} AGENTS SELECTED</span><span>{{trajectories.length}} RUNS RECORDED</span></div></div>
          <div class="workspace-card"><div class="card-eyebrow">TEAM COMPOSITION</div><div class="team-list"><button v-for="agent in agents" :key="agent.id" :class="{included:includeIds.includes(agent.id)}" @click="includeIds.includes(agent.id)?includeIds=includeIds.filter(x=>x!==agent.id):includeIds=[...includeIds,agent.id]"><span class="team-check">{{includeIds.includes(agent.id)?'✓':'+'}}</span><span><b>{{agent.name}</b><small>{{agent.role}}</small></span><i>{{agent.title}}</i></button></div></div>
        </div>
        <div v-else-if="activeSpace==='harness'" class="harness-workspace">
          <div class="graph-header"><div><b>DEPENDENCY GRAPH</b><small>规则优先 · DAG 调度 · 失败隔离</small></div><span>EDITABLE RUN CONFIG</span></div>
          <div class="graph-flow">
            <div v-for="(agent,index) in graphAgents()" :key="agent.id" class="graph-node" :class="{selected:selectedId===agent.id}" @click="selectedId=agent.id"><span>0{{index+1}}</span><b>{{agent.name}}</b><small>{{agent.role}}</small><em>{{agent.dependsOn.length?'DEPENDS: '+agent.dependsOn.join(', '):'ROOT TASK'}}</em></div>
          </div>
          <p class="graph-note">当前图配置直接转成 /api/chat 的 agents + dependsOn 参数；改变团队成员会改变实际执行 DAG。</p>
        </div>
        <div v-else-if="activeSpace==='distill'" class="distill-workspace">
          <div class="distill-hero"><div><span class="card-eyebrow">TEACHER → STUDENT</span><h3>从真实执行中提取能力</h3><p>只把成功任务结果转换为 SFT 文本样本；失败轨迹保留用于分析，不进入默认训练集。</p></div><div class="distill-orbit"><span>TEACHER</span><b>→</b><span>STUDENT</span></div></div>
          <div class="dataset-stats"><div><b>{{trajectories.length}}</b><span>EXECUTIONS</span></div><div><b>{{makeSftRows().length}}</b><span>SUCCESS SAMPLES</span></div><div><b>{{successCount}}</b><span>COMPLETED RUNS</span></div></div>
          <div class="dataset-actions"><button @click="exportDataset">EXPORT SFT DATASET ↗</button><button @click="downloadTrainingReadme">TRAINING GUIDE ↓</button></div><p class="export-message">{{exportMessage}}</p>
          <div class="training-caveat">当前训练链路为文本行为 SFT。尚未实现结构化 Tool Calling 蒸馏、Student 在线推理接入和自动发布。</div>
        </div>
        <div v-else class="arena-workspace">
          <div class="arena-intro"><span class="card-eyebrow">BENCHMARK ARENA</span><h3>同一任务，不同数字人策略</h3><p>先积累真实执行记录，再对比不同 Harness 配置。当前不生成模拟成绩。</p></div>
          <div class="arena-metrics"><div><span>RECORDED RUNS</span><b>{{trajectories.length}}</b></div><div><span>COMPLETED</span><b>{{successCount}}</b></div><div><span>SUCCESS SAMPLES</span><b>{{makeSftRows().length}}</b></div></div>
          <div v-for="run in trajectories.slice(0,5)" :key="run.id" class="arena-run"><div><b>{{run.message}}</b><small>{{run.createdAt}} · {{run.model||'unknown model'}}</small></div><strong :class="run.status">{{run.status}}</strong></div>
        </div>
      </div>
      <aside class="event-panel">
        <div class="event-panel-head"><div><span class="section-overline">OBSERVABILITY / TRACE</span><h3>运行事件</h3></div><span class="event-count">{{events.length.toString().padStart(2,'0')}}</span></div>
        <div class="event-list" v-if="events.length"><article v-for="event in events.slice(0,9)" :key="event.id" class="event-item"><i :class="event.type"></i><div><b>{{event.message}}</b><small>{{event.time}}</small><p v-if="event.detail">{{event.detail.slice(0,180)}}</p></div></article></div>
        <div v-else class="event-empty"><span>◌</span><b>等待运行事件</b><p>任务启动后，这里将展示后端任务状态和结果。</p></div>
        <div class="event-footer"><span>API ENDPOINT</span><input v-model="apiBase" aria-label="Agent API 地址" /></div>
      </aside>
    </section>
    <footer class="foundry-footer"><span>AGENT FOUNDRY 2.0</span><span>REAL RUNTIME · TRACEABLE DATA · REPRODUCIBLE EXPERIMENTS</span><a href="/">BACK TO STORE ↗</a></footer>
  </main>
</template>
