<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const props = defineProps({ onBack: { type: Function, required: true }, initialAgent: { type: String, default: '' } })
const agents = [
  { id:'manager', name:'店长', role:'经营负责人', character:'海绵宝宝', emoji:'🧽', color:0x9a7bff, guide:'统筹经营目标、拆解任务、协调岗位并汇总结果。' },
  { id:'cashier', name:'小票', role:'收银员', character:'派大星', emoji:'⭐', color:0x42c8ff, guide:'处理订单咨询、支付流程指引与售后分流。' },
  { id:'guide', name:'小导', role:'导购顾问', character:'章鱼哥', emoji:'🦑', color:0xffbd65, guide:'识别顾客需求、比较商品并提供组合购买建议。' },
  { id:'buyer', name:'采购', role:'采购补货', character:'蟹老板', emoji:'🦀', color:0x50e0bd, guide:'整理缺货信号、供应商报价与补货建议。' },
  { id:'inventory', name:'盘点员', role:'库存盘点', character:'珊迪', emoji:'🐿️', color:0x65a6ff, guide:'核对库存差异，发现临期和损耗风险。' },
  { id:'pm', name:'林舟', role:'产品经理', character:'痞老板', emoji:'🦠', color:0xff79c6, guide:'将经营目标拆成流程、验收标准和迭代计划。' }
]
const selected = ref(props.initialAgent ? [props.initialAgent] : agents.map(a=>a.id))
const activeAgents = computed(()=>agents.filter(a=>selected.value.includes(a.id)))
const messages = ref([
 {id:1,role:'system',text:'3D 协作空间已启动。拖动旋转真实模型；点击角色本体或标签可聚焦并发起协作。',time:'刚刚'},
 {id:2,role:'manager',text:'我是店长。告诉我经营目标，我会拆解任务并协调各岗位协作。',time:'刚刚'}
])
const draft=ref('')
const busy=ref(false)
const status=ref('空间就绪 · 等待任务')
const mode=ref('deepseek')
const apiBase=ref(import.meta.env.VITE_AGENT_API || 'https://ai-grocery-store-agent-api.onrender.com')
const sceneShell=ref(null)
const canvasHost=ref(null)
const roomRenderStatus=ref('正在加载高细节场景…')
const highDetailRoomLoaded=ref(false)
const highDetailCafeLoaded=ref(false)
const messageList=ref(null)
const focusAgent=ref('manager')
const labelPositions=ref({})
const motion=ref('idle')
const zoom=ref(1)
const quickPrompts=['制定今天的门店经营计划','@盘点员 设计今日库存核查方案','@采购 列出补货决策所需数据','@店长 汇总各岗位风险与待办']
const now=()=>new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
let renderer=null, composer=null, ssaoPass=null, bloomPass=null, scene=null, camera=null, resizeObserver=null, raf=0, raycaster=null, pointerDown=null, sceneListeners=[], environmentTarget=null
let orbitAngle=0, orbitTilt=.12, targetZoom=1
const characterGroups=new Map(), characterHitMeshes=[]
const sceneClock=new THREE.Clock()
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

const mat=(color,roughness=.72,metalness=0,extra={})=>new THREE.MeshStandardMaterial({color,roughness,metalness,...extra})
const characterMat=(color,roughness=.48,extra={})=>new THREE.MeshPhysicalMaterial({color,roughness,metalness:0,clearcoat:.16,clearcoatRoughness:.3,...extra})
function mesh(geometry,material,pos,parent,rot=null,scale=null){
 const m=new THREE.Mesh(geometry,material);m.position.set(pos[0],pos[1],pos[2]);if(rot)m.rotation.set(rot[0],rot[1],rot[2]);if(scale)m.scale.set(scale[0],scale[1],scale[2])
 // Decorative room pieces receive lighting/AO but do not all enter the shadow map.
 // Cast shadows explicitly for hero characters, staircase railings and selected focal objects.
 m.castShadow=false;m.receiveShadow=true;(parent||scene).add(m);return m
}
function canvasTexture(paint,repeatX=1,repeatY=1){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512
 const ctx=canvas.getContext('2d');paint(ctx,512,512)
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(repeatX,repeatY);tex.anisotropy=8;return tex
}
function makeWoodTexture(){
 return canvasTexture((ctx,w,h)=>{
  ctx.fillStyle='#68432c';ctx.fillRect(0,0,w,h)
  let seed=29;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
  for(let i=0;i<230;i++){const y=random()*h;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(130,y+(random()-.5)*22,360,y+(random()-.5)*14,w,y+(random()-.5)*8);ctx.strokeStyle=random()>.48?'#d9ae75':'#21150f';ctx.globalAlpha=.05+random()*.15;ctx.lineWidth=.5+random()*2.4;ctx.stroke()}
  ctx.globalAlpha=1
 },2,1)
}
function makeMarbleTexture(){
 return canvasTexture((ctx,w,h)=>{
  ctx.fillStyle='#dfd4c4';ctx.fillRect(0,0,w,h)
  let seed=93;const random=()=>{seed=(seed*1103515245+12345)>>>0;return seed/4294967296}
  for(let i=0;i<48;i++){ctx.beginPath();let x=random()*w,y=random()*h;ctx.moveTo(x,y);ctx.bezierCurveTo(x+50,y-80,x-85,y+70,x+190,y+150);ctx.strokeStyle=i%4?'#fffaf0':'#8f8172';ctx.globalAlpha=.12+random()*.16;ctx.lineWidth=.7+random()*2.4;ctx.stroke()}
  ctx.globalAlpha=1
 },2,1)
}
function createBookcase(x,z,width=2.5,height=4.6,depth=.48,side=false){
 const g=new THREE.Group();g.position.set(x,0,z);if(side)g.rotation.y=Math.PI/2;(roomRoot||scene).add(g)
 const oak=woodMat,dark=darkWoodMat,gold=brassMat
 mesh(new THREE.BoxGeometry(width,height,depth),oak,[0,height/2,0],g)
 mesh(new THREE.BoxGeometry(width+.07,.11,depth+.08),gold,[0,height+.02,0],g)
 // Stable per-shelf randomization keeps the books natural without changing on every rebuild.
 let seed=Math.abs(Math.floor((x+30)*7919+(z+30)*104729))||1
 const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
 const booksByMaterial=bookMaterials.map(()=>[])
 const spineBands=[]
 for(let row=1;row<5;row++){
  const y=row*(height/5)
  mesh(new THREE.BoxGeometry(width-.08,.065,depth+.035),dark,[0,y,0],g)
  let x0=-width/2+.09;const shelfY=y+.07
  while(x0<width/2-.1){
   const bw=Math.min(.075+random()*.105,width/2-.1-x0)
   const bh=.28+random()*.42
   const materialIndex=Math.floor(random()*bookMaterials.length)
   booksByMaterial[materialIndex].push({x:x0+bw/2,y:shelfY+bh/2,z:.01,w:bw,h:bh,d:.18,rotation:(random()-.5)*.035})
   spineBands.push({x:x0+bw*.5,y:shelfY+bh*.68,z:.104,w:bw*.36,h:.018,d:.008})
   x0+=bw+.018
  }
 }
 // Instancing draws hundreds of books in a handful of GPU calls instead of one draw per book.
 const unitBookGeometry=new THREE.BoxGeometry(1,1,1)
 const dummy=new THREE.Object3D()
 for(let materialIndex=0;materialIndex<booksByMaterial.length;materialIndex++){
  const items=booksByMaterial[materialIndex]
  if(!items.length)continue
  const instances=new THREE.InstancedMesh(unitBookGeometry,bookMaterials[materialIndex],items.length)
  items.forEach((book,index)=>{
   dummy.position.set(book.x,book.y,book.z);dummy.rotation.set(0,0,book.rotation);dummy.scale.set(book.w,book.h,book.d);dummy.updateMatrix()
   instances.setMatrixAt(index,dummy.matrix)
  })
  instances.instanceMatrix.needsUpdate=true;instances.castShadow=false;instances.receiveShadow=true;g.add(instances)
 }
 if(spineBands.length){
  const bandGeometry=new THREE.BoxGeometry(1,1,1)
  const bands=new THREE.InstancedMesh(bandGeometry,brassMat,spineBands.length)
  spineBands.forEach((band,index)=>{
   dummy.position.set(band.x,band.y,band.z);dummy.rotation.set(0,0,0);dummy.scale.set(band.w,band.h,band.d);dummy.updateMatrix()
   bands.setMatrixAt(index,dummy.matrix)
  })
  bands.instanceMatrix.needsUpdate=true;bands.castShadow=false;bands.receiveShadow=true;g.add(bands)
 }
 for(let px=-width/2+.08;px<width/2;px+=width>2?1.05:.72){
  mesh(new THREE.BoxGeometry(.055,height,depth+.055),gold,[px,height/2,0],g)
 }
 return g
}
let roomRoot, woodMat, darkWoodMat, brassMat, plasterMat, marbleMat, floorMat, bookMaterials
function buildLibraryRoom(){
 roomRoot=new THREE.Group();scene.add(roomRoot)
 const woodTex=makeWoodTexture(), floorTex=makeWoodTexture(), marbleTex=makeMarbleTexture()
 woodMat=new THREE.MeshStandardMaterial({map:woodTex,color:0xffffff,roughness:.7})
 darkWoodMat=mat(0x35251d,.78)
 brassMat=mat(0xc29859,.34,.58)
 plasterMat=mat(0xe0d2be,.96)
 marbleMat=new THREE.MeshStandardMaterial({map:marbleTex,color:0xffffff,roughness:.28,metalness:.03})
 floorMat=new THREE.MeshStandardMaterial({map:floorTex,color:0xd9b88a,roughness:.48,metalness:.025})
 bookMaterials=[0x6e2f2b,0x29484a,0x283a5b,0x967142,0x5e4030,0x473653,0xb7a17b,0x405543,0x874f37].map(c=>mat(c,.86))
 const box=(w,h,d,x,y,z,m=woodMat,p=roomRoot,rot=null)=>mesh(new THREE.BoxGeometry(w,h,d),m,[x,y,z],p,rot)
 // Full-scale shell and continuous timber flooring.
 box(20,.22,22,0,-.16,0,floorMat)
 for(let x=-9.5;x<=9.5;x+=1.25)box(.014,.008,21,x,-.043,0,darkWoodMat)
 for(let z=-10;z<=10;z+=.9)box(20,.008,.014,0,-.042,z,darkWoodMat)
 box(20,8,.3,0,3.8,-8.9,plasterMat)
 box(.3,8,20,-9.85,3.8,0,plasterMat)
 box(.3,8,20,9.85,3.8,0,plasterMat)
 // Walnut ceiling structure and warm cornice.
 for(let x=-9;x<=9;x+=3)box(.22,.34,18.2,x,7.35,0,darkWoodMat)
 box(20,.26,.34,0,7.05,-8.55,darkWoodMat)
 for(let x=-9.2;x<=9.2;x+=.38)box(.22,.018,.025,x,6.92,-8.36,mat(0xffc876,.4,.25))
 // Packed bookcases on rear and side walls.
 for(let x=-7.8;x<=4.8;x+=3.15)createBookcase(x,-8.56,2.95,4.95,.46)
 for(let z=-5.9;z<=3.1;z+=3.1)createBookcase(-9.55,z,2.55,4.75,.45,true)
 // Back-wall arched clerestory windows: visible over the tall shelves instead of leaving a blank, blown-out wall.
 const rearGlass=mat(0x78a9bf,.22,.04,{transparent:true,opacity:.28,side:THREE.DoubleSide,emissive:0x214d61,emissiveIntensity:.12})
 for(const x of [-6.1,-2.55,1.0,4.55]){
  box(2.5,1.65,.055,x,6.02,-8.68,rearGlass)
  box(.075,1.7,.09,x-1.22,6.02,-8.61,brassMat);box(.075,1.7,.09,x+1.22,6.02,-8.61,brassMat)
  box(.075,1.62,.09,x,6.02,-8.61,brassMat)
  box(2.45,.075,.09,x,5.21,-8.61,brassMat)
  const arch=new THREE.Mesh(new THREE.TorusGeometry(1.24,.05,10,36,Math.PI),brassMat)
  arch.position.set(x,6.83,-8.61);roomRoot.add(arch)
 }
 // Tall right-wall arched windows, bronze mullions and actual glass panels.
 const glass=mat(0x83b5c6,.18,.12,{transparent:true,opacity:.35,side:THREE.DoubleSide,emissive:0x1e5365,emissiveIntensity:.16})
 for(let z=-5.0;z<=1.1;z+=3.05){
  box(.08,3.15,2.25,9.62,2.15,z,glass)
  box(.1,3.35,.08,9.52,2.18,z-1.08,brassMat);box(.1,3.35,.08,9.52,2.18,z+1.08,brassMat)
  box(.1,.08,2.25,9.52,3.72,z,brassMat);box(.1,.08,2.25,9.52,.62,z,brassMat)
  const arc=new THREE.Mesh(new THREE.TorusGeometry(1.08,.055,10,44,Math.PI),brassMat)
  arc.rotation.y=Math.PI/2;arc.position.set(9.5,3.78,z);roomRoot.add(arc)
  box(.075,2.8,.055,9.5,2.08,z,brassMat)
  box(.075,.055,2.0,9.5,2.2,z,brassMat)
 }
 // Pale exterior light beyond the glazing.
 const sky=mat(0xa9cddd,.8,0,{emissive:0x4d8b9e,emissiveIntensity:.13})
 for(let z=-5;z<=1;z+=3.05)box(.02,5.1,2.3,9.83,2.9,z,sky)
 // Upper mezzanine with detailed balusters.
 box(8.7,.18,2.7,0,4.05,-5.15,woodMat)
 box(8.9,.1,2.8,0,4.18,-5.15,brassMat)
 box(8.8,.1,.12,0,4.8,-3.78,darkWoodMat)
 box(8.8,.1,.12,0,4.36,-3.78,brassMat)
 for(let x=-4.25;x<=4.25;x+=.24)box(.027,.4,.03,x,4.58,-3.78,brassMat)
 // Grand curved staircase: individually modeled treads and a continuous handrail tube.
 const stairCenter=new THREE.Vector3(2.75,0,-1.55)
 for(let i=0;i<23;i++){
  const t=i/22,ang=-Math.PI*.78+t*1.8*Math.PI,r=1.95-t*.25,y=3.95-t*3.45
  const step=box(.72,.105,.48,stairCenter.x+Math.cos(ang)*r,y,stairCenter.z+Math.sin(ang)*r,i%3===0?woodMat:darkWoodMat,roomRoot,null)
  step.rotation.y=-ang
  const post=mesh(new THREE.CylinderGeometry(.023,.028,.43,10),brassMat,[stairCenter.x+Math.cos(ang)*(r+.38),y+.26,stairCenter.z+Math.sin(ang)*(r+.38)],roomRoot)
  post.castShadow=true
 }
 const railPts=[]
 for(let i=0;i<=58;i++){const t=i/58,ang=-Math.PI*.78+t*1.8*Math.PI,r=2.33-t*.25,y=4.34-t*3.45;railPts.push(new THREE.Vector3(stairCenter.x+Math.cos(ang)*r,y,stairCenter.z+Math.sin(ang)*r))}
 const rail=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts),240,.045,8,false),darkWoodMat);rail.castShadow=true;roomRoot.add(rail)
 // Curved café counter with a polished marble top and timber panels.
 for(let i=0;i<18;i++){
  const x=-6.3+i*.48,n=x/6.5,bow=.65*(1-n*n),z=.85+bow
  const panel=box(.49,.95,.72,x,.47,z,woodMat);panel.rotation.y=-n*.08
  box(.43,.57,.035,x,.48,z+.38,darkWoodMat)
  box(.39,.48,.02,x,.48,z+.405,woodMat)
  box(.5,.12,.9,x,1.01,z,marbleMat)
  box(.04,.025,.82,x,.95,z+.04,brassMat)
 }
 // Espresso machine, grinder, cups and menu-board details.
 box(.92,.75,.55,-3.8,1.48,.3,mat(0x7d898b,.25,.75))
 box(.58,.17,.42,-3.8,1.95,.3,darkWoodMat)
 for(let i=0;i<4;i++)mesh(new THREE.CylinderGeometry(.065,.055,.16,20),mat(0xf0e4cd,.24),[-2.8+i*.18,1.32,.3],roomRoot)
 for(let x=-7.8;x<=-3.5;x+=2.1){
  box(1.7,1.2,.06,x,3.3,.15,mat(0x262629,.85))
  box(1.62,1.11,.025,x,3.3,.04,mat(0x101a22,.9))
  for(let row=0;row<4;row++)box(1.22,.014,.012,x,3.65-row*.23,.017,mat(0xd9c7a8,.7))
 }
 // Brass pendant fixtures with warm point sources.
 for(const x of [-4.6,-1.2,2.2,5.3]){
  mesh(new THREE.CylinderGeometry(.012,.012,1.35,10),darkWoodMat,[x,6.1,-.3],roomRoot)
  mesh(new THREE.CylinderGeometry(.15,.32,.22,28,1,true),brassMat,[x,5.42,-.3],roomRoot)
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(.08,16,12),mat(0xffd99c,.2,.05,{emissive:0xffbc56,emissiveIntensity:1.8}));bulb.position.set(x,5.26,-.3);roomRoot.add(bulb)
  const lamp=new THREE.PointLight(0xffbd6b,15,7.5);lamp.position.set(x,5.15,-.3);roomRoot.add(lamp)
 }
 // Reading tables, chairs and potted greenery.
 for(const [x,z] of [[1.7,4.7],[5.8,4.1],[3.5,6.5],[-7.2,4.3]]){
  box(1.55,.11,1.0,x,.82,z,woodMat);box(1.48,.035,.93,x,.9,z,brassMat)
  for(const dx of [-.62,.62])for(const dz of [-.35,.35])box(.085,.76,.085,x+dx,.4,z+dz,darkWoodMat)
  for(const side of [-1,1]){
   box(.49,.1,.47,x+side*.98,.47,z,woodMat)
   box(.48,.45,.075,x+side*.98,.7,z-.18,darkWoodMat)
   box(.075,.62,.075,x+side*.98,.21,z,darkWoodMat)
  }
 }
 const potMat=mat(0x995f42,.83),leafMats=[0x355f3e,0x4e794c,0x6c8a4a].map(c=>mat(c,.9))
 for(const [x,z] of [[7.8,-4.7],[7.7,.8],[-7.4,5.2],[0,2.0]]){
  mesh(new THREE.CylinderGeometry(.18,.14,.32,20),potMat,[x,.03,z],roomRoot)
  for(let i=0;i<11;i++){const a=i*2.399;const leaf=mesh(new THREE.SphereGeometry(.1,10,8),leafMats[i%3],[x+Math.cos(a)*(.12+(i%3)*.04),.29+(i%5)*.11,z+Math.sin(a)*(.12+(i%3)*.04)],roomRoot);leaf.scale.set(.7,1.8,.55)}
 }
}
function makeLimb(parent,material,from,to,r1=.07,r2=.06){
 const start=new THREE.Vector3(...from),end=new THREE.Vector3(...to),d=new THREE.Vector3().subVectors(end,start)
 const limb=new THREE.Mesh(new THREE.CylinderGeometry(r2,r1,d.length(),14),material)
 limb.position.copy(start).add(end).multiplyScalar(.5);limb.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());limb.castShadow=true;limb.receiveShadow=true;parent.add(limb)
 const joint=new THREE.Mesh(new THREE.SphereGeometry(Math.max(r1,r2),12,10),material);joint.position.copy(start);parent.add(joint)
 return limb
}
function faceEyes(parent,x,y,z,eyeScale=.13,irisColor=0x3d7dbb){
 const white=mat(0xfff5e4,.3),iris=mat(irisColor,.25),pupil=mat(0x17202a,.18),shine=mat(0xffffff,.1)
 for(const dx of [-x,x]){
  mesh(new THREE.SphereGeometry(eyeScale,24,20),white,[dx,y,z],parent,[0,0,0],[.82,1.05,.52])
  mesh(new THREE.SphereGeometry(eyeScale*.49,20,16),iris,[dx*.85,y,z+eyeScale*.42],parent)
  mesh(new THREE.SphereGeometry(eyeScale*.27,16,12),pupil,[dx*.85,y,z+eyeScale*.67],parent)
  mesh(new THREE.SphereGeometry(eyeScale*.12,10,8),shine,[dx*.85-eyeScale*.1,y+eyeScale*.14,z+eyeScale*.84],parent)
 }
}
function createSpongeBob(a){
 const g=new THREE.Group();g.position.set(...agentPositions[a.id]);g.userData.agentId=a.id
 const yellow=characterMat(0xf5cf32,.48),yellowShade=mat(0xd5a922,.65),white=characterMat(0xfff4df,.42),brown=characterMat(0x8b4e27,.62),red=characterMat(0xdf3c34,.42),black=mat(0x292a2d,.42),blue=characterMat(0x2e8bc7,.3),pink=characterMat(0xffa2b6,.48),green=characterMat(0x74a94c,.5),purple=characterMat(0x7665b8,.44),teal=characterMat(0x3e9da0,.44)
 const add=(geo,m,p,r=null,s=null)=>{const part=mesh(geo,m,p,g,r,s);part.castShadow=true;part.receiveShadow=true;return part}
 const rounded=(w,h,d,rad,m,p)=>add(new THREE.BoxGeometry(w,h,d,8,8,4),m,p,null,[1,1,1])
 const hit=mesh(new THREE.SphereGeometry(.86,16,12),mat(0xffffff,.8,0,{transparent:true,opacity:0,depthWrite:false}),[0,1,0],g);hit.castShadow=false;hit.receiveShadow=false;hit.userData.agentId=a.id;characterHitMeshes.push(hit)
 const smileCurve=(pts,material,r=.018)=>{const curve=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p)));const m=new THREE.Mesh(new THREE.TubeGeometry(curve,28,r,8,false),material);g.add(m)}
 if(a.id==='manager'){
  add(new RoundedBoxGeometry(.91,.88,.46,8,.075),yellow,[0,1.45,0])
  // Spongebob's signature pores and soft specular highlights.
  for(const [x,y,z,r] of [[-.34,1.73,.238,.035],[.3,1.68,.24,.03],[-.38,1.37,.238,.045],[.39,1.32,.238,.038],[-.26,1.12,.238,.025],[.26,1.13,.238,.03],[0,1.82,.23,.02]])add(new THREE.SphereGeometry(r,10,8),yellowShade,[x,y,z])
  faceEyes(g,.2,1.58,.255,.17,0x43a5ec)
  add(new THREE.SphereGeometry(.06,12,10),yellow,[0,1.39,.3],[0,0,0],[.65,1.6,.55])
  smileCurve([[-.3,1.28,.258],[-.18,1.22,.28],[0,1.2,.29],[.18,1.22,.28],[.3,1.28,.258]],black,.018)
  add(new THREE.BoxGeometry(.15,.075,.025),white,[0,1.205,.296])
  add(new THREE.BoxGeometry(.9,.22,.47),white,[0,.95,0])
  add(new THREE.BoxGeometry(.91,.43,.47),brown,[0,.62,0])
  add(new THREE.BoxGeometry(.1,.31,.045),red,[0,.84,.26]);add(new THREE.ConeGeometry(.09,.13,4),red,[0,.63,.29],[Math.PI,0,0])
  for(const dx of [-.22,.22]){add(new THREE.BoxGeometry(.12,.17,.045),white,[dx,.34,.02]);makeLimb(g,white,[dx,.32,0],[dx,.14,0],.045,.04);add(new THREE.SphereGeometry(.12,16,12),black,[dx,.08,.06],[0,0,0],[1.25,.55,1.55])}
  makeLimb(g,yellow,[-.49,1.08,0],[-.68,.83,.03],.06,.045);makeLimb(g,yellow,[.49,1.08,0],[.69,.83,.03],.06,.045)
  add(new THREE.SphereGeometry(.06,12,10),yellow,[-.68,.82,.03]);add(new THREE.SphereGeometry(.06,12,10),yellow,[.69,.82,.03])
 }else if(a.id==='cashier'){
  // Patrick Star: a beveled five-point star body and green-purple shorts.
  const shape=new THREE.Shape();const cx=0,cy=1.18,outer=.68,inner=.31
  for(let i=0;i<10;i++){const ang=Math.PI/2+i*Math.PI/5;const rr=i%2===0?outer:inner;const x=cx+Math.cos(ang)*rr,y=cy+Math.sin(ang)*rr;if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y)}shape.closePath()
  const starGeo=new THREE.ExtrudeGeometry(shape,{depth:.27,bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:.06,bevelThickness:.05,curveSegments:12})
  add(starGeo,pink,[0,0,-.13])
  faceEyes(g,.125,1.34,.24,.115,0x3980bc)
  add(new THREE.SphereGeometry(.06,12,10),yellow,[0,1.08,.24],[0,0,0],[1.4,.5,.4])
  smileCurve([[-.18,1.08,.22],[0,1.03,.255],[.18,1.08,.22]],black,.016)
  add(new THREE.CylinderGeometry(.33,.36,.36,24),green,[0,.48,0])
  add(new THREE.BoxGeometry(.66,.08,.29),purple,[0,.62,.03])
  for(const dx of [-.32,.32])makeLimb(g,pink,[dx,.79,0],[dx*1.45,.49,.02],.075,.07)
  for(const dx of [-.18,.18]){makeLimb(g,pink,[dx,.3,0],[dx,.12,0],.055,.05);add(new THREE.SphereGeometry(.12,16,12),black,[dx,.08,.05],[0,0,0],[1.2,.5,1.6])}
 }else if(a.id==='guide'){
  // Squidward: long aqua head, tapered nose, six expressive tentacle limbs and a polo shirt.
  const aqua=characterMat(0x7bc9bd,.42),nose=characterMat(0x8bd1c5,.38),shirt=characterMat(0x93674f,.66)
  add(new THREE.SphereGeometry(.37,32,24),aqua,[0,1.65,.02],[0,0,0],[.72,1.35,.8])
  faceEyes(g,.13,1.74,.29,.12,0xe4c86d)
  add(new THREE.CylinderGeometry(.07,.045,.32,18),nose,[0,1.43,.29],[.28,0,0])
  add(new THREE.BoxGeometry(.5,.44,.31),shirt,[0,.93,0])
  for(let i=-1;i<=1;i++)makeLimb(g,aqua,[i*.12,.7,.02],[i*.16,.3,.1],.055,.045)
  for(const dx of [-.32,.32])makeLimb(g,aqua,[dx,1.12,0],[dx*1.65,.87,.12],.055,.045)
  makeLimb(g,aqua,[-.12,.7,0],[-.15,.12,0],.05,.04);makeLimb(g,aqua,[.12,.7,0],[.15,.12,0],.05,.04)
 }else if(a.id==='buyer'){
  // Mr. Krabs: red shell, eyestalks, blue trousers and oversized claws.
  const crab=characterMat(0xe74637,.4),bluePants=characterMat(0x2a72a4,.56),claw=characterMat(0xe94a3c,.36)
  add(new THREE.SphereGeometry(.47,32,24),crab,[0,1.2,0],[0,0,0],[1.18,.82,.76])
  for(const dx of [-.15,.15]){makeLimb(g,crab,[dx,.99,0],[dx,1.55,.02],.045,.04);add(new THREE.SphereGeometry(.13,20,16),white,[dx,1.62,.08],[0,0,0],[.72,1.15,.65]);add(new THREE.SphereGeometry(.045,14,12),blue,[dx,1.62,.15]);add(new THREE.SphereGeometry(.023,10,8),black,[dx,1.62,.19])}
  add(new THREE.BoxGeometry(.49,.32,.31),bluePants,[0,.78,0])
  for(const dx of [-.25,.25]){makeLimb(g,crab,[dx,.9,0],[dx*1.8,.67,.05],.075,.06);add(new THREE.SphereGeometry(.17,20,16),claw,[dx*2,.65,.05],[0,0,0],[1.2,.8,.7]);makeLimb(g,crab,[dx,.72,0],[dx*1.15,.38,.02],.05,.04)}
  for(const dx of [-.12,.12]){makeLimb(g,crab,[dx,.66,0],[dx,.22,0],.05,.04);add(new THREE.SphereGeometry(.11,16,12),black,[dx,.1,.04],[0,0,0],[1.5,.5,1.5])}
 }else if(a.id==='inventory'){
  // Sandy Cheeks: squirrel silhouette, buck teeth and a clear astronaut helmet.
  const fur=characterMat(0xc58b58,.63),suit=characterMat(0xeee4d1,.42),pink=characterMat(0xe8a1aa,.48)
  add(new THREE.SphereGeometry(.29,28,20),fur,[0,1.42,0],[0,0,0],[.9,1.12,.82])
  for(const dx of [-.19,.19]){add(new THREE.ConeGeometry(.12,.3,16),fur,[dx,1.68,-.01],[0,0,dx<0?-.22:.22]);add(new THREE.SphereGeometry(.052,12,10),pink,[dx,1.75,.02])}
  faceEyes(g,.105,1.46,.23,.1,0x6c9e62)
  add(new THREE.SphereGeometry(.05,12,10),fur,[0,1.25,.25])
  add(new THREE.BoxGeometry(.09,.07,.025),white,[-.035,1.21,.27]);add(new THREE.BoxGeometry(.09,.07,.025),white,[.055,1.21,.27])
  add(new THREE.SphereGeometry(.35,24,20,0,Math.PI*2,0,Math.PI),mat(0xcfe8f1,.14,.08,{transparent:true,opacity:.22,side:THREE.DoubleSide}),[0,1.48,0])
  add(new THREE.TorusGeometry(.31,.025,10,36),mat(0xd4dce2,.36,.45),[0,1.43,0],[Math.PI/2,0,0])
  add(new THREE.BoxGeometry(.42,.53,.32),suit,[0,.78,0])
  add(new THREE.BoxGeometry(.12,.12,.035),mat(0x4e88c4,.35),[0,.9,.18])
  for(const dx of [-.26,.26])makeLimb(g,suit,[dx,.95,0],[dx*1.4,.69,.04],.06,.05)
  for(const dx of [-.13,.13]){makeLimb(g,suit,[dx,.52,0],[dx,.17,0],.06,.045);add(new THREE.BoxGeometry(.15,.09,.22),mat(0x514b45,.5),[dx,.08,.04])}
 }else{
  // Plankton: compact green cyclops with two antennae and articulated feet.
  const plank=characterMat(0x71bc3d,.38),redMouth=characterMat(0x551d20,.48)
  add(new THREE.SphereGeometry(.25,32,24),plank,[0,1.02,0],[0,0,0],[.8,1.25,.65])
  add(new THREE.SphereGeometry(.17,24,20),white,[0,1.1,.15],[0,0,0],[1,1,.65])
  add(new THREE.SphereGeometry(.085,20,16),red,[0,1.1,.25])
  add(new THREE.SphereGeometry(.045,14,10),black,[0,1.1,.3])
  for(const dx of [-.11,.11]){makeLimb(g,plank,[dx,.85,0],[dx*1.9,.6,.02],.025,.02);makeLimb(g,plank,[dx,.7,0],[dx*1.5,.45,.02],.025,.02)}
  makeLimb(g,plank,[-.08,1.23,0],[-.18,1.52,0],.02,.015);makeLimb(g,plank,[.08,1.23,0],[.18,1.52,0],.02,.015)
  add(new THREE.SphereGeometry(.045,12,10),red,[0,.78,.15])
 }
 const ring=mesh(new THREE.TorusGeometry(.42,.012,8,44),new THREE.MeshBasicMaterial({color:a.color,transparent:true,opacity:.55}),[0,.025,0],g,[Math.PI/2,0,0])
 g.userData.ring=ring;scene.add(g);characterGroups.set(a.id,g);return g
}
const agentPositions={manager:[-5.1,0,3.15],cashier:[-3.4,0,4.05],guide:[-1.7,0,3.0],buyer:[0,0,4.0],inventory:[1.7,0,3.05],pm:[3.4,0,4.0]}
function buildCharacter(){for(const a of agents){const character=createSpongeBob(a);character.scale.setScalar(a.id==='pm'?1.55:1.25)}}

const LIBRARY_SCENE_URL='/models/breakfast_room_extended.gltf'
function normalizeAsset(root,targetWidth){
 root.updateMatrixWorld(true)
 const bounds=new THREE.Box3().setFromObject(root)
 const size=bounds.getSize(new THREE.Vector3())
 const center=bounds.getCenter(new THREE.Vector3())
 const scale=targetWidth/Math.max(size.x,size.z)
 root.scale.setScalar(scale)
 root.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale)
 root.updateMatrixWorld(true)
 root.traverse(object=>{
  if(!object.isMesh)return
  object.castShadow=false
  object.receiveShadow=true
  const materials=Array.isArray(object.material)?object.material:[object.material]
  for(const material of materials){
   if('envMapIntensity' in material)material.envMapIntensity=1.05
   if(material.map)material.map.anisotropy=8
  }
 })
 return {root,size,scale}
}
function createCoffeeBarAccent(){
 const bar=new THREE.Group()
 bar.name='PBR_Coffee_Bar_Accent'
 bar.position.set(-.15,0,.55)
 scene.add(bar)
 const addPart=(geometry,material,pos,rotation=null)=>{
  const part=mesh(geometry,material,pos,bar,rotation)
  part.castShadow=false
  part.receiveShadow=true
  return part
 }
 const walnut=characterMat(0x34231c,.35)
 const walnutLite=characterMat(0x62422f,.4)
 const steel=characterMat(0x7e898e,.22)
 const steelDark=mat(0x242d32,.27,.58)
 const porcelain=characterMat(0xf3ebdf,.2)
 const gold=mat(0xc59a56,.26,.7)
 addPart(new RoundedBoxGeometry(6.15,.96,1.15,8,.065),walnut,[0,.51,0])
 addPart(new RoundedBoxGeometry(6.28,.115,1.28,8,.04),marbleMat,[0,1.055,0])
 addPart(new RoundedBoxGeometry(5.98,.018,1.20,5,.009),gold,[0,.987,0])
 for(let x=-2.65;x<=2.66;x+=.48){
  addPart(new RoundedBoxGeometry(.018,.72,.045,2,.008),gold,[x,.48,.587])
 }
 addPart(new THREE.BoxGeometry(5.92,.065,.045),gold,[0,.115,.59])
 for(let x=-2.45;x<=2.46;x+=.82){
  addPart(new RoundedBoxGeometry(.65,.28,.025,3,.012),walnutLite,[x,.64,.582])
  addPart(new THREE.CylinderGeometry(.018,.018,.14,12),gold,[x,.64,.608],[0,0,Math.PI/2])
 }
 // Espresso machine
 const machine=new THREE.Group()
 machine.position.set(-1.28,1.12,-.12)
 bar.add(machine)
 const machinePart=(geometry,material,pos,rotation=null)=>{
  const part=mesh(geometry,material,pos,machine,rotation)
  part.castShadow=false
  part.receiveShadow=true
  return part
 }
 machinePart(new RoundedBoxGeometry(1.18,.82,.62,7,.055),steel,[0,.42,0])
 machinePart(new RoundedBoxGeometry(1.02,.11,.57,5,.025),steelDark,[0,.85,.015])
 machinePart(new RoundedBoxGeometry(.78,.23,.16,5,.03),steelDark,[0,.64,.33])
 machinePart(new RoundedBoxGeometry(.53,.08,.15,4,.022),gold,[0,.75,.35])
 for(const x of [-.35,0,.35]){
  machinePart(new THREE.CylinderGeometry(.075,.075,.018,24),gold,[x,.39,.32],[Math.PI/2,0,0])
  machinePart(new THREE.CylinderGeometry(.046,.046,.025,20),steelDark,[x,.39,.338],[Math.PI/2,0,0])
  machinePart(new THREE.CylinderGeometry(.022,.022,.22,14),steelDark,[x,.23,.36],[0,0,Math.PI/2])
 }
 machinePart(new THREE.CylinderGeometry(.115,.115,.035,32),porcelain,[-.38,.9,.31])
 machinePart(new THREE.CylinderGeometry(.075,.075,.045,28),steelDark,[-.38,.923,.32])
 machinePart(new THREE.CylinderGeometry(.02,.025,.32,14),steel,[-.46,.17,.32],[0,0,-.45])
 machinePart(new THREE.CylinderGeometry(.02,.025,.32,14),steel,[.46,.17,.32],[0,0,.45])
 machinePart(new THREE.CylinderGeometry(.04,.04,.12,18),gold,[.47,.26,.34],[0,0,.4])
 // Grinder and cups
 const grinder=new THREE.Group()
 grinder.position.set(.95,1.12,-.04)
 bar.add(grinder)
 const grinderPart=(geometry,material,pos,rotation=null)=>{
  const part=mesh(geometry,material,pos,grinder,rotation)
  part.castShadow=false
  part.receiveShadow=true
  return part
 }
 grinderPart(new THREE.CylinderGeometry(.19,.17,.35,32),steelDark,[0,.20,0])
 grinderPart(new THREE.CylinderGeometry(.145,.15,.28,32),steel,[0,.49,0])
 grinderPart(new THREE.CylinderGeometry(.16,.16,.075,32),steelDark,[0,.68,0])
 grinderPart(new THREE.CylinderGeometry(.12,.12,.17,28),mat(0x39251b,.26),[0,.80,0])
 grinderPart(new THREE.BoxGeometry(.09,.14,.07),gold,[.12,.44,.11])
 for(let i=0;i<4;i++){
  const x=1.72+i*.24
  addPart(new THREE.CylinderGeometry(.082,.068,.16,24),porcelain,[x,1.17,.08])
  addPart(new THREE.TorusGeometry(.071,.012,8,22),porcelain,[x,1.255,.08])
  addPart(new THREE.CylinderGeometry(.013,.013,.04,12),walnutLite,[x,1.09,.08])
 }
 // Textured café menu board.
 const menuTexture=canvasTexture((ctx,w,h)=>{
  ctx.fillStyle='#111713';ctx.fillRect(0,0,w,h)
  ctx.fillStyle='#cba66b';ctx.font='bold 32px Georgia';ctx.fillText('LIBRARY / BAR',24,52)
  ctx.fillStyle='#f6e8cc';ctx.font='24px Georgia'
  const rows=[['ESPRESSO','4.5'],['FLAT WHITE','5.0'],['FILTER COFFEE','4.0'],['PASTRY','3.5']]
  rows.forEach((row,i)=>{
   const y=118+i*82
   ctx.fillText(row[0],25,y)
   ctx.textAlign='right';ctx.fillText(row[1],w-25,y);ctx.textAlign='left'
  })
 },1,1)
 const menuMaterial=new THREE.MeshStandardMaterial({map:menuTexture,roughness:.72,emissive:0x332719,emissiveMap:menuTexture,emissiveIntensity:.28})
 addPart(new RoundedBoxGeometry(1.65,1.07,.09,4,.025),walnut,[2.05,2.05,-.20])
 addPart(new THREE.PlaneGeometry(1.48,.91),menuMaterial,[2.05,2.06,-.148])
 for(const x of [1.35,2.75])addPart(new THREE.CylinderGeometry(.018,.018,.85,10),gold,[x,1.42,-.19])
 highDetailCafeLoaded.value=true
}
function loadHighDetailRoom(){
 const loader=new GLTFLoader()
 loader.load(LIBRARY_SCENE_URL,gltf=>{
  const result=normalizeAsset(gltf.scene,14.2)
  result.root.name='CCBY_Wig42_BreakfastRoom_PBR_Environment'
  scene.add(result.root)
  if(roomRoot)roomRoot.visible=false
  highDetailRoomLoaded.value=true
  createCoffeeBarAccent()
  roomRenderStatus.value='高细节 PBR 室内 + 咖啡吧 · REAL-TIME 3D'
 },undefined,error=>{
  highDetailRoomLoaded.value=false
  highDetailCafeLoaded.value=false
  roomRenderStatus.value='本地 3D 备用场景'
  if(roomRoot)roomRoot.visible=true
  console.error('[3D room] Self-hosted GLTF load failed:',error)
 })
}

function onCanvasPointerDown(e){
 if(!renderer||!camera)return
 pointerDown={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY}
 renderer.domElement.setPointerCapture?.(e.pointerId)
}
function onCanvasPointerMove(e){
 if(!renderer||!camera)return
 if(pointerDown){
  const dx=e.clientX-pointerDown.x,dy=e.clientY-pointerDown.y
  orbitAngle-=dx*.006;orbitTilt=Math.max(-.02,Math.min(.42,orbitTilt+dy*.003))
  pointerDown={...pointerDown,x:e.clientX,y:e.clientY,startX:pointerDown.startX,startY:pointerDown.startY}
 }
}
function onCanvasPointerUp(e){
 if(!renderer||!camera||!pointerDown)return
 const moved=Math.abs(e.clientX-pointerDown.startX)+Math.abs(e.clientY-pointerDown.startY)
 if(moved<8){
  const rect=renderer.domElement.getBoundingClientRect()
  const p=new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1)
  raycaster.setFromCamera(p,camera)
  const hit=raycaster.intersectObjects(characterHitMeshes,false)[0]
  if(hit?.object.userData.agentId){focusAgent.value=hit.object.userData.agentId;motion.value='wave'}
 }
 pointerDown=null
}
function initScene(){
 const host=canvasHost.value;if(!host)return
 const headlessRender=navigator.webdriver===true
 scene=new THREE.Scene();scene.background=new THREE.Color(0x19150f);scene.fog=new THREE.FogExp2(0x19150f,.013)
 camera=new THREE.PerspectiveCamera(48,1,.1,120)
 camera.position.set(0,3.25,12.5);camera.lookAt(0,1.55,-.5)
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'})
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,headlessRender ? 0.85 : 1.35));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;renderer.shadowMap.enabled=!headlessRender;renderer.shadowMap.type=THREE.PCFSoftShadowMap
 const pmremGenerator=new THREE.PMREMGenerator(renderer);const roomEnvironment=new RoomEnvironment();environmentTarget=pmremGenerator.fromScene(roomEnvironment,.04);scene.environment=environmentTarget.texture;pmremGenerator.dispose();roomEnvironment.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of (Array.isArray(o.material)?o.material:[o.material]))m.dispose()}})
 host.appendChild(renderer.domElement)
 scene.add(new THREE.HemisphereLight(0xffedd6,0x514237,1.12));scene.add(new THREE.AmbientLight(0xffffff,.18))
 const sun=new THREE.DirectionalLight(0xffd8a4,2.35);sun.position.set(-7,10,7);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-12;sun.shadow.camera.right=12;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-12;sun.shadow.bias=-.00022;scene.add(sun)
 const fill=new THREE.DirectionalLight(0xfff4e7,.72);fill.position.set(5,7,3);scene.add(fill)
 const warm=new THREE.PointLight(0xffc06e,22,16);warm.position.set(-1,5,0);scene.add(warm)
 buildLibraryRoom();buildCharacter();raycaster=new THREE.Raycaster()
 loadHighDetailRoom()
 // Cinematic render pipeline: contact shadows, richer material depth, controlled highlight bloom.
 const initialWidth=Math.max(1,host.clientWidth),initialHeight=Math.max(1,host.clientHeight)
 composer=new EffectComposer(renderer);composer.setPixelRatio(renderer.getPixelRatio())
 composer.addPass(new RenderPass(scene,camera))
 // Full contact AO on normal browsers; headless verification uses the same materials/scene with a lighter render path.
 if(!headlessRender){ssaoPass=new SSAOPass(scene,camera,initialWidth,initialHeight);ssaoPass.kernelRadius=12;ssaoPass.minDistance=.005;ssaoPass.maxDistance=.13;composer.addPass(ssaoPass)}
 bloomPass=new UnrealBloomPass(new THREE.Vector2(initialWidth,initialHeight),.14,.32,.92);composer.addPass(bloomPass)
 composer.addPass(new OutputPass())
 const resize=()=>{if(!host||!renderer)return;const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);composer?.setSize(w,h)}
 resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);resize()
 const down=e=>onCanvasPointerDown(e),move=e=>onCanvasPointerMove(e),up=e=>onCanvasPointerUp(e)
 host.addEventListener('pointerdown',down);host.addEventListener('pointermove',move);host.addEventListener('pointerup',up);host.addEventListener('pointercancel',()=>{pointerDown=null})
 const wheel=e=>{e.preventDefault();zoom.value=Math.max(.7,Math.min(1.35,zoom.value+(e.deltaY>0?-.055:.055)))}
 host.addEventListener('wheel',wheel,{passive:false})
 sceneListeners=[[host,'pointerdown',down],[host,'pointermove',move],[host,'pointerup',up],[host,'wheel',wheel]]
 const animate=()=>{
  raf=requestAnimationFrame(animate);const t=sceneClock.getElapsedTime()
  for(const [id,g] of characterGroups){const focus=focusAgent.value===id;g.position.y=Math.sin(t*1.8+agents.findIndex(a=>a.id===id))*.025+(motion.value==='wave'&&focus?Math.abs(Math.sin(t*7))*.12:0);g.rotation.y=Math.sin(t*.45+agents.findIndex(a=>a.id===id))*.035;g.userData.ring.material.opacity=focus?.95:.38}
  const highDetail=highDetailRoomLoaded.value
  const radius=(highDetail?12.8:15.5)/zoom.value
  const desired=new THREE.Vector3(Math.sin(orbitAngle)*radius,highDetail?2.7+orbitTilt*4:5.4+orbitTilt*8,(highDetail?-.5:3.0)+Math.cos(orbitAngle)*radius)
  camera.position.lerp(desired,.07);camera.lookAt(0,highDetail?1.55:2.4,highDetail?-.5:3.3);camera.updateMatrixWorld()
  // Anchor DOM labels to projected 3D head positions so they track rotation and zoom.
  if(Math.floor(t*18)!==Math.floor((t-1/60)*18)){
   const width=renderer.domElement.clientWidth,height=renderer.domElement.clientHeight,next={}
   for(const [id,g] of characterGroups){
    const anchor=g.localToWorld(new THREE.Vector3(0,2.55,0));anchor.project(camera)
    const x=(anchor.x*.5+.5)*width,y=(-anchor.y*.5+.5)*height
    const visible=anchor.z>-1&&anchor.z<1&&x>4&&x<width-4&&y>88&&y<height-8
    next[id]={left:x+'px',top:y+'px',visibility:visible?'visible':'hidden'}
   }
   labelPositions.value=next
  }
  composer.render()
 }
 animate()
}
function zoomBy(delta){zoom.value=Math.max(.7,Math.min(1.35,zoom.value+delta))}
function resetView(){orbitAngle=0;orbitTilt=.12;zoom.value=1;focusAgent.value='manager';motion.value='wave'}
onMounted(()=>initScene())
onBeforeUnmount(()=>{cancelAnimationFrame(raf);resizeObserver?.disconnect();for(const [el,event,handler] of sceneListeners)el.removeEventListener(event,handler);sceneListeners=[];composer?.dispose();composer=null;ssaoPass=null;bloomPass=null;if(renderer){renderer.dispose();renderer.domElement.remove()}environmentTarget?.dispose();environmentTarget=null;scene?.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of (Array.isArray(o.material)?o.material:[o.material])){for(const key of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap','alphaMap','bumpMap','envMap'])if(m[key])m[key].dispose();m.dispose()}}})})
const selectedAgent=computed(()=>agents.find(a=>a.id===focusAgent.value)||agents[0])
</script>

<template>
<section class="space3d">
 <header class="space-top">
  <button class="back" @click="props.onBack" aria-label="返回杂货铺">‹</button>
  <div class="brand"><span class="brand-orb"><span>AI</span></span><span><b>门店经营协作室</b><small>6 个岗位数字人 · 共享群聊</small></span></div>
  <div class="top-agents"><button v-for="a in agents" :key="a.id" class="top-agent" :class="{focused:focusAgent===a.id,muted:!selected.includes(a.id)}" @click="focusAgent=a.id;motion='wave';toggleAgent(a.id)" :style="{'--agent-color':'#'+a.color.toString(16).padStart(6,'0')}"><span class="top-agent-avatar">{{a.emoji}}</span><span><b>{{a.name}}</b><small>{{a.character}}</small></span></button></div>
  <div class="top-state"><i></i><span>协作空间在线</span><small>角色可用 · 等待调度</small></div>
  <button class="mode-btn" @click="mode=mode==='demo'?'deepseek':'demo'">{{mode==='demo'?'演示模式':'DeepSeek Runtime'}}</button>
 </header>
 <main class="space-layout">
  <section class="stage-column">
   <div ref="sceneShell" class="scene-shell">
    <div ref="canvasHost" class="three-canvas" :data-room-ready="highDetailRoomLoaded ? 'true' : 'false'" :data-cafe-ready="highDetailCafeLoaded ? 'true' : 'false'" :data-room-status="roomRenderStatus"></div>
    <div class="scene-vignette"></div>
    <div class="left-glass glass-panel">
     <div class="panel-overline">SHARED CONTEXT / ROOM 001</div>
     <div class="left-panel-title"><span class="status-mark">✦</span><div><b>门店经营协作室</b><small>{{busy?'多角色协同 · 任务运行中':'多角色讨论 · 同步消息 · 实时协作'}}</small></div><span class="live-badge"><i></i>{{busy?'执行中':'就绪'}}</span></div>
     <div class="task-summary"><span>当前任务</span><b>{{busy?'岗位并行协作':'等待新任务'}}</b></div>
     <div class="summary-bottom"><span><i></i>{{activeAgents.length}} / 6 个岗位在线</span><span class="latency">⏱ 2h</span></div>
    </div>
    <div class="environment-label">LIBRARY CAFÉ <span>·</span> {{roomRenderStatus}} <small>Environment: The Breakfast Room by Wig42 · CC BY 3.0</small></div>
    <div class="agent-labels">
     <button v-for="(a,i) in agents" :key="a.id" class="agent-label" :class="['agent-'+a.id,{focused:focusAgent===a.id,muted:!selected.includes(a.id)}]" :style="[{'--agent-color':'#'+a.color.toString(16).padStart(6,'0')},labelPositions[a.id] || {}]" @click="focusAgent=a.id;motion='wave';if(!selected.includes(a.id))toggleAgent(a.id)">
      <i></i><span class="character-emoji">{{a.emoji}}</span><span class="agent-label-name"><b>{{a.name}}</b></span>
     </button>
    </div>
    <div class="view-dock">
     <div class="radar"><span class="radar-ring r1"></span><span class="radar-ring r2"></span><span class="radar-center"></span><i v-for="(a,i) in agents" :key="a.id" :style="{left:(24+((i*31)%56))+'%',top:(20+((i*23)%60))+'%',background:'#'+a.color.toString(16).padStart(6,'0')}"></i></div>
     <div class="dock-controls"><b>视角控制</b><small>拖动旋转 · 滚轮缩放 · 点击角色</small><div><button @click="resetView">⟳ 复位</button><button @click="zoomBy(.12)">＋ 缩放</button><button @click="zoomBy(-.12)">－ 缩放</button></div></div>
    </div>
    <div class="scene-footnote">当前场景：门店经营协作室 <span>·</span> {{activeAgents.length}} 个协作角色在线</div>
   </div>
  </section>
  <aside class="chat-panel">
   <div class="panel-head"><div><span class="eyebrow">SHARED CONVERSATION</span><h2>团队群聊 <span class="live-pill">● LIVE</span></h2><p>同一上下文，岗位独立响应</p></div><button class="panel-menu" aria-label="新建会话" @click="messages=[{id:Date.now(),role:'system',text:'新会话已创建。所有数字人共享本房间上下文。',time:now()}]">↻</button></div>
   <div class="focus-card"><div class="focus-avatar" :style="{'--agent-color':'#'+selectedAgent.color.toString(16).padStart(6,'0')}">{{selectedAgent.emoji}}</div><div><small>当前聚焦角色</small><b>{{selectedAgent.name}} <i>{{selectedAgent.role}}</i></b><p>{{selectedAgent.guide}}</p></div><button @click="toggleAgent(focusAgent)">{{selected.includes(focusAgent)?'−':'+'}}</button></div>
   <div class="messages" ref="messageList"><div v-for="m in messages" :key="m.id" class="message" :class="['m-'+m.role,{user:m.role==='user'}]"><template v-if="m.role==='user'"><div class="user-bubble">{{m.text}}</div><time>{{m.time}}</time></template><template v-else><div class="message-meta"><span class="message-character-avatar" :style="{'--agent-color':'#'+(agents.find(a=>a.id===m.role)?.color||0x8294c5).toString(16).padStart(6,'0')}">{{agents.find(a=>a.id===m.role)?.emoji||'✦'}}</span><b>{{agents.find(a=>a.id===m.role)?.name||'系统'}}</b><time>{{m.time}}</time></div><p>{{m.text}}</p></template></div><div v-if="busy" class="typing"><span></span><span></span><span></span>{{status}}</div></div>
   <div class="prompt-row"><button v-for="p in quickPrompts" :key="p" @click="addPrompt(p)" :disabled="busy">{{p}}</button></div>
   <div class="composer"><div class="mention-hint">@ 店长 / 导购 / 采购 / 盘点员 / 产品经理 / 所有人</div><textarea v-model="draft" rows="3" :disabled="busy" placeholder="描述你的目标，数字人团队将开始协作…" @keydown.enter.exact.prevent="send"></textarea><div class="composer-bottom"><span>{{status}}</span><button :disabled="busy||!draft.trim()||!selected.length" @click="send"><span>{{busy?'协作中':'发起协作'}}</span><b>↗</b></button></div></div>
  </aside>
 </main>
</section>
</template>

<style>
.space3d{position:relative;height:100vh;min-height:690px;overflow:hidden;background:#0b1723;color:#f4f7fa;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.space-top{position:absolute;z-index:30;top:0;left:0;right:0;height:78px;display:flex;align-items:center;gap:14px;padding:0 20px;background:linear-gradient(180deg,#0a1524ee,#0a1524b8);border-bottom:1px solid #b9d8ed30;backdrop-filter:blur(20px)}
.space-top button{cursor:pointer;color:inherit}.back{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;border:1px solid #8ebad533;border-radius:50%;background:#ffffff0b;font-size:30px;line-height:1;color:#e9f4fc;transition:.2s}.back:hover{background:#2d73a8}.brand{display:flex;align-items:center;gap:11px;flex:0 0 auto;min-width:215px}.brand-orb{width:39px;height:39px;display:grid;place-items:center;border-radius:50%;background:linear-gradient(145deg,#1a9fe0,#3464bd);box-shadow:0 0 24px #38a9ef45;font-size:14px;font-weight:900}.brand b,.brand small{display:block}.brand b{font-size:15px;letter-spacing:.04em}.brand small{font-size:10px;color:#b8c9d8;margin-top:4px;letter-spacing:.04em}.top-agents{display:flex;align-items:center;justify-content:center;gap:4px;flex:1;min-width:0;overflow:hidden}.top-agent{display:flex;align-items:center;gap:7px;min-width:0;padding:8px 9px;border:1px solid transparent;border-radius:12px;background:transparent;text-align:left;transition:.2s}.top-agent:hover,.top-agent.focused{background:#ffffff10;border-color:#ffffff20}.top-agent.muted{opacity:.48}.top-agent-avatar{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle at 34% 25%,var(--agent-color),#0e2538 95%);border:1px solid #ffffff36;box-shadow:0 0 14px color-mix(in srgb,var(--agent-color),transparent 76%);font-size:22px;line-height:1}.top-agent b,.top-agent small{display:block;white-space:nowrap}.top-agent b{font-size:11px}.top-agent small{font-size:9px;color:#b7c9d7;margin-top:3px}.top-state{display:grid;grid-template-columns:8px auto;align-items:center;gap:0 7px;flex:0 0 auto;padding:9px 12px;background:#ffffff0b;border:1px solid #c0d9eb1c;border-radius:11px;font-size:11px;color:#e5f2fa}.top-state i{grid-row:1/3;width:7px;height:7px;border-radius:50%;background:#23e3b1;box-shadow:0 0 12px #23e3b1}.top-state small{grid-column:2;color:#a9bece;font-size:9px;margin-top:4px}.mode-btn{flex:0 0 auto;padding:9px 11px;border:1px solid #8bb4d333;border-radius:10px;background:#ffffff0b;font-size:10px}
.space-layout{position:absolute;inset:78px 0 0;max-width:none;margin:0;display:block}.stage-column{position:absolute;inset:0;min-width:0}.scene-shell{position:absolute;inset:0;overflow:hidden;background-color:#261b12;background-image:none;background-size:auto;background-position:center;background-repeat:no-repeat;isolation:isolate}
.scene-load-state{position:absolute;z-index:5;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid #b8d9ed40;border-radius:12px;background:#071725bb;color:#e6f3fb;font-size:11px;backdrop-filter:blur(12px);pointer-events:auto}.scene-load-state button{border:1px solid #a9d8f044;border-radius:8px;background:#ffffff10;color:#8bdcff;padding:5px 8px;cursor:pointer}.loader-dot{width:7px;height:7px;background:#38e6bc;border-radius:50%;box-shadow:0 0 12px #38e6bc;animation:typing 1s infinite}.three-canvas{position:absolute;inset:0;z-index:1;touch-action:none}.three-canvas canvas{display:block;width:100%;height:100%;outline:none}.scene-vignette{position:absolute;z-index:2;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 44%,transparent 42%,#06111b45 100%);box-shadow:inset 0 0 120px #06111b30}
.glass-panel{border:1px solid #9bcae74a;background:linear-gradient(135deg,#091a2ad9,#0c2032be);box-shadow:0 14px 44px #0004;backdrop-filter:blur(20px);border-radius:14px}.left-glass{position:absolute;z-index:6;left:20px;top:28px;width:min(385px,33vw);padding:14px 16px;color:#edf6fc}.panel-overline{font-size:9px;letter-spacing:.19em;color:#b2d6ea;margin-bottom:12px}.left-panel-title{display:flex;align-items:center;gap:10px}.status-mark{width:31px;height:31px;flex:0 0 31px;display:grid;place-items:center;border-radius:9px;background:linear-gradient(145deg,#1eb2f3,#4454cb);box-shadow:0 0 15px #39b3f64a}.left-panel-title>div{flex:1;min-width:0}.left-panel-title b,.left-panel-title small{display:block}.left-panel-title b{font-size:13px}.left-panel-title small{font-size:10px;color:#afc5d4;margin-top:5px}.live-badge{font-size:9px;padding:5px 7px;border-radius:20px;background:#12d7a718;color:#65f4c8;white-space:nowrap}.live-badge i{display:inline-block;width:6px;height:6px;background:#2ce9b3;border-radius:50%;margin-right:4px}.task-summary{display:flex;justify-content:space-between;gap:10px;padding:13px 0 10px;margin-top:7px;border-top:1px solid #c0def01b;font-size:10px;color:#b1c9d9}.task-summary b{color:#e9f6fc;font-weight:600}.summary-bottom{display:flex;align-items:center;justify-content:space-between;color:#8ce9e0;font-size:10px}.summary-bottom>span:first-child i{display:inline-block;width:6px;height:6px;background:#34e5bb;border-radius:50%;margin-right:6px}.latency{color:#c4d6e4;padding:4px 7px;border-radius:8px;background:#ffffff0d}
.environment-label{position:absolute;z-index:4;top:19px;left:50%;transform:translateX(-50%);font-size:9px;letter-spacing:.24em;color:#fff9;text-shadow:0 1px 7px #0008;pointer-events:none}.environment-label span{color:#59caff}
.agent-labels{position:absolute;z-index:8;inset:0;pointer-events:none}.agent-label{position:absolute;display:flex;align-items:center;gap:8px;min-width:0;padding:6px 9px;gap:6px;text-align:left;border:1px solid #d3e4ee45;border-radius:20px;background:#0a1a2aaf;color:#f8fbff;box-shadow:0 8px 22px #0004;backdrop-filter:blur(14px);cursor:pointer;pointer-events:auto;transition:transform .22s,border-color .22s,background .22s}.agent-label{transform:translate(-50%,-112%)}.agent-label:hover,.agent-label.focused{transform:translate(-50%,calc(-112% - 3px)) scale(1.035);border-color:var(--agent-color);background:#071725e8;box-shadow:0 0 24px color-mix(in srgb,var(--agent-color),transparent 74%)}.agent-label>i{width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:var(--agent-color);box-shadow:0 0 12px var(--agent-color)}.character-emoji{font-size:17px;line-height:1;flex:0 0 auto;filter:drop-shadow(0 1px 3px #0007)}.agent-label span{min-width:0;flex:1}.agent-label b,.agent-label small{display:block;white-space:nowrap}.agent-label b{font-size:10px}.agent-label small{font-size:8px;color:#c1d3df;margin-top:3px}.agent-label em{font-style:normal;font-size:8px;color:#8ee5ca}.agent-label.muted{opacity:.55}/* Labels follow projected 3D anchors instead of fixed screen coordinates. */
.view-dock{position:absolute;z-index:6;left:20px;bottom:29px;display:flex;align-items:center;gap:13px;padding:10px 12px;border-radius:15px;background:linear-gradient(120deg,#081a2acc,#0c2338a6);border:1px solid #b8d9ed30;backdrop-filter:blur(16px)}.radar{position:relative;width:84px;height:84px;flex:0 0 84px;border:1px solid #2baeea9c;border-radius:50%;background:radial-gradient(circle,#1c84b73b,transparent 72%),#05172580;box-shadow:inset 0 0 24px #24a2db18,0 0 18px #149bd71b}.radar:before,.radar:after{content:"";position:absolute;background:#43b7e66b}.radar:before{left:50%;top:8%;bottom:8%;width:1px}.radar:after{top:50%;left:8%;right:8%;height:1px}.radar-ring{position:absolute;inset:19%;border:1px solid #3da6d54a;border-radius:50%}.radar-ring.r2{inset:36%}.radar-center{position:absolute;top:47%;left:47%;width:6px;height:6px;border-radius:50%;background:#c6f6ff;box-shadow:0 0 13px 4px #29baf67a}.radar i{position:absolute;width:5px;height:5px;border-radius:50%;box-shadow:0 0 8px currentColor}.dock-controls>b,.dock-controls>small{display:block}.dock-controls>b{font-size:11px}.dock-controls>small{font-size:9px;color:#b2c9d9;margin-top:5px}.dock-controls>div{display:flex;gap:5px;margin-top:9px}.dock-controls button{border:1px solid #bdd7e52c;border-radius:8px;padding:7px 9px;background:#ffffff0d;color:#e4eef6;font-size:9px;cursor:pointer}.dock-controls button:hover{background:#1b5d84}.environment-credit{position:absolute;right:360px;bottom:18px;z-index:5;padding:6px 8px;background:#07172571;border-radius:7px;color:#d8e5ee;font-size:8px}.environment-credit a{color:#8bdefb;text-decoration:none}.environment-credit a:hover{text-decoration:underline}.scene-footnote{position:absolute;z-index:5;left:20px;bottom:8px;color:#dae7efaa;font-size:8px;text-shadow:0 1px 5px #000}.scene-footnote span{margin:0 5px}
.chat-panel{position:absolute;z-index:15;top:20px;right:16px;bottom:18px;width:330px;min-height:0;max-height:none;display:flex;flex-direction:column;border:1px solid #94c7e75b;border-radius:15px;background:linear-gradient(160deg,#091b2bdf,#081725ed);box-shadow:0 22px 65px #0007;backdrop-filter:blur(22px);overflow:hidden}.panel-head{padding:17px 16px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #b0d3e51c;background:#07152242}.eyebrow{font-size:9px;letter-spacing:.18em;color:#85d9f7;font-weight:800}.panel-head h2{margin:7px 0 5px;font-size:19px;letter-spacing:-.03em;color:#f5f8fc}.panel-head p{font-size:10px;color:#b2c6d5;margin:0}.live-pill{font-size:8px;color:#6df2c2;border:1px solid #3de2b033;background:#38d8a00d;border-radius:20px;padding:4px 6px;vertical-align:middle;letter-spacing:.1em}.panel-menu{border:1px solid #bad8e522;background:#ffffff08;color:#c8e0f0;border-radius:9px;padding:8px 10px;cursor:pointer}.focus-card{display:flex;align-items:center;gap:10px;margin:10px 10px 0;padding:10px;border:1px solid #9bbde533;background:#ffffff08;border-radius:12px}.focus-avatar{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 40% 35%,var(--agent-color),#15354a 80%);border:1px solid #fff3;box-shadow:0 0 20px color-mix(in srgb,var(--agent-color),transparent 70%);flex-shrink:0;font-size:28px;line-height:1}.focus-card>div:nth-child(2){min-width:0;flex:1}.focus-card small,.focus-card b{display:block}.focus-card small{font-size:8px;color:#9db7ca;margin-bottom:4px}.focus-card b{font-size:12px;color:#f1f6fb}.focus-card b i{font-size:9px;font-style:normal;color:#9ab5c9;font-weight:400;margin-left:5px}.focus-card p{font-size:9px;color:#b4c8d8;margin:5px 0 0;line-height:1.5}.focus-card>button{border:1px solid #bdd7e51f;background:#ffffff08;color:#d7e0ff;border-radius:7px;width:26px;height:26px;cursor:pointer}.messages{padding:14px 13px 8px;flex:1;overflow:auto;min-height:130px;scroll-behavior:smooth}.message{margin-bottom:15px;animation:message-in .28s ease-out}.message-meta{display:flex;align-items:center;gap:7px;margin-bottom:6px}.message-character-avatar{width:27px;height:27px;display:grid;place-items:center;flex:0 0 27px;border-radius:50%;font-size:17px;line-height:1;background:radial-gradient(circle at 35% 25%,var(--agent-color),#10263a 94%);border:1px solid #ffffff35;box-shadow:0 0 12px color-mix(in srgb,var(--agent-color),transparent 70%)}.message-meta b{font-size:10px;color:#e3edf7}.message-meta time,.message>time{font-size:8px;color:#87a3b8;margin-left:auto}.message p{margin:0 0 0 14px;font-size:11px;line-height:1.65;color:#e3edf7;background:#ffffff0a;border-left:1px solid #7aa8dd88;padding:9px 10px;border-radius:0 9px 9px 0;white-space:pre-wrap;overflow-wrap:anywhere}.message.user{display:flex;flex-direction:column;align-items:flex-end}.user-bubble{max-width:92%;background:linear-gradient(115deg,#236cb1,#3e58b0);border:1px solid #a3d9ff3b;padding:10px 12px;border-radius:13px 13px 3px 13px;font-size:11px;line-height:1.6;color:white}.message>time{margin-top:4px}.typing{display:flex;align-items:center;gap:5px;color:#9ec1d7;font-size:9px;padding:6px 0 10px}.typing span{width:4px;height:4px;border-radius:50%;background:#76baff;animation:typing 1s infinite}.typing span:nth-child(2){animation-delay:.15s}.typing span:nth-child(3){animation-delay:.3s}.prompt-row{display:flex;gap:6px;overflow-x:auto;padding:9px 10px;border-top:1px solid #b0d3e51c}.prompt-row button{flex-shrink:0;max-width:180px;border:1px solid #a8c7e62d;background:#ffffff0a;border-radius:8px;padding:7px 9px;font-size:9px;color:#c8dce9;cursor:pointer;white-space:nowrap}.prompt-row button:hover{border-color:#9bcbf7;color:#fff}.composer{padding:11px 11px 12px;border-top:1px solid #b0d3e51c;background:#07152199}.mention-hint{font-size:8px;color:#9bb5c7;margin-bottom:8px}.composer textarea{width:100%;resize:vertical;min-height:73px;border:1px solid #829aff42;border-radius:10px;background:#071725ae;color:#f1f6fb;padding:11px;font:inherit;font-size:11px;line-height:1.6;outline:none}.composer textarea:focus{border-color:#7b8fff;box-shadow:0 0 0 3px #778bff15}.composer textarea::placeholder{color:#8ca6bb}.composer-bottom{display:flex;align-items:center;gap:10px;margin-top:9px}.composer-bottom>span{font-size:8px;color:#9db5ca;flex:1;line-height:1.5}.composer-bottom button{display:flex;align-items:center;gap:14px;border:0;border-radius:10px;background:linear-gradient(115deg,#1e8bd1,#425dcb 70%,#7766d8);color:white;padding:10px 12px;font-weight:700;font-size:10px;cursor:pointer;box-shadow:0 6px 24px #164c8640;transition:.2s}.composer-bottom button:hover{transform:translateY(-2px);box-shadow:0 8px 28px #387cf266}.composer-bottom button:disabled{opacity:.45;cursor:not-allowed;transform:none}@keyframes message-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes typing{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
@media(max-width:1180px){.brand{min-width:180px}.top-agent{padding:7px 5px;gap:5px}.top-agent-avatar{width:29px;height:29px;flex-basis:29px}.top-agent small{font-size:8px}.top-state{display:none}.mode-btn{display:none}.chat-panel{width:315px}.agent-labels .agent-label{min-width:96px}.environment-credit{right:330px}}
@media(max-width:860px){.space3d{height:auto;min-height:100vh;overflow:visible;padding-top:78px}.space-top{height:70px;position:absolute;padding:0 12px;gap:9px}.brand{min-width:0;flex:1}.brand b{font-size:13px}.brand small{font-size:9px}.top-agents{display:none}.space-layout{position:relative;inset:auto;display:flex;flex-direction:column}.stage-column{position:relative;inset:auto;height:72vh;min-height:570px}.scene-shell{position:absolute;inset:0}.left-glass{left:12px;top:12px;width:min(340px,calc(100% - 24px));padding:11px 12px}.environment-label{display:none}.agent-labels .agent-label{min-width:0;padding:6px 8px}.agent-label small,.agent-label em{display:none}.agent-label b{font-size:9px}.agent-label>i{width:7px;height:7px;flex-basis:7px}/* Responsive positions are driven by the camera projection. */.view-dock{left:12px;bottom:14px}.radar{width:64px;height:64px;flex-basis:64px}.environment-credit{right:12px;bottom:8px}.scene-footnote{display:none}.chat-panel{position:relative;top:auto;right:auto;bottom:auto;width:auto;min-height:590px;max-height:78vh;margin:10px;border-radius:14px}}
@media(max-width:540px){.space-top{height:62px;padding:0 8px;gap:7px}.back{width:32px;height:32px;flex-basis:32px;font-size:24px}.brand-orb{width:32px;height:32px}.brand b{font-size:11px}.brand small{font-size:8px}.stage-column{height:68vh;min-height:530px}.left-glass{width:calc(100% - 24px);top:10px}/* The same projection logic is used on phones and desktops. */.agent-label{gap:5px;padding:5px 7px}.agent-label b{font-size:8px}.view-dock{gap:8px;padding:7px}.radar{width:52px;height:52px;flex-basis:52px}.dock-controls>b{font-size:9px}.dock-controls>small{font-size:8px}.dock-controls button{padding:6px 6px;font-size:8px}.environment-credit{font-size:7px}.chat-panel{min-height:570px;margin:8px}.panel-head{padding:14px 13px}.panel-head h2{font-size:17px}.focus-card{margin:9px 9px 0}.messages{padding:12px 10px}.composer{padding:10px}}
@media(prefers-reduced-motion:reduce){.space3d *{animation:none!important;transition:none!important}}
</style>