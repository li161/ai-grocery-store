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
 scene.add(group);avatarMeshes.set(a.id,group)
}
function initScene(){
 if(!canvasHost.value)return
 scene=new THREE.Scene();scene.background=null;scene.fog=null
 camera=new THREE.PerspectiveCamera(38,1,.1,120);camera.position.set(0,7.1,16.8)
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setClearColor(0x000000,0);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap
 canvasHost.value.appendChild(renderer.domElement)
 scene.add(new THREE.HemisphereLight(0xfff5df,0x75604a,2.1));scene.add(new THREE.AmbientLight(0xffffff,.72))
 const key=new THREE.DirectionalLight(0xffe6bd,3.1);key.position.set(-4,9,5);key.castShadow=true;key.shadow.mapSize.set(1536,1536);key.shadow.camera.left=-12;key.shadow.camera.right=12;key.shadow.camera.top=10;key.shadow.camera.bottom=-10;key.shadow.bias=-0.00025;scene.add(key)
 const fill=new THREE.DirectionalLight(0xffffff,1.0);fill.position.set(5,6,2);scene.add(fill)
 const warmLamp=new THREE.PointLight(0xffc875,75,22);warmLamp.position.set(0,5,-1);scene.add(warmLamp)
 const daylight=new THREE.DirectionalLight(0xc6e4ff,2.0);daylight.position.set(8,6,1);scene.add(daylight)
 const bounce=new THREE.PointLight(0xffd8a2,18,13);bounce.position.set(-5,3,0);scene.add(bounce)
 const room=new THREE.Group();scene.add(room)
 const box=(w,h,d,x,y,z,mat,group=room)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m}
 // Procedural canvas textures give timber a visible grain instead of flat, toy-like color blocks.
 function makeGrainTexture(base, line, seed=1){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d');ctx.fillStyle=base;ctx.fillRect(0,0,512,512);let n=seed;
  const rand=()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296};
  for(let i=0;i<260;i++){ctx.beginPath();const y=rand()*512;ctx.moveTo(0,y);ctx.bezierCurveTo(120,y+(rand()-.5)*18,350,y+(rand()-.5)*20,512,y+(rand()-.5)*12);ctx.strokeStyle=line;ctx.globalAlpha=.025+rand()*.11;ctx.lineWidth=.4+rand()*2.2;ctx.stroke()}
  ctx.globalAlpha=1;const tex=new THREE.CanvasTexture(canvas);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;return tex;
 }
 const woodTex=makeGrainTexture('#70472e','#e2b17a',7);woodTex.repeat.set(2,1);
 const darkTex=makeGrainTexture('#38271e','#b1845b',11);darkTex.repeat.set(2,1);
 const wood=new THREE.MeshStandardMaterial({map:woodTex,color:0xffffff,roughness:.76,metalness:.01})
 const darkWood=new THREE.MeshStandardMaterial({map:darkTex,color:0xffffff,roughness:.68})
 const trim=new THREE.MeshStandardMaterial({color:0xb98a54,roughness:.42,metalness:.12})
 const plasterTex=makeGrainTexture('#e8dfcf','#b8a58e',31);plasterTex.repeat.set(3,2);
 const plaster=new THREE.MeshStandardMaterial({map:plasterTex,color:0xffffff,roughness:.96})
 const marbleCanvas=document.createElement('canvas');marbleCanvas.width=512;marbleCanvas.height=512;const mc=marbleCanvas.getContext('2d');mc.fillStyle='#d7c8b2';mc.fillRect(0,0,512,512);let marbleSeed=43;const mr=()=>{marbleSeed=(marbleSeed*1103515245+12345)>>>0;return marbleSeed/4294967296};for(let i=0;i<38;i++){mc.beginPath();let x=mr()*512,y=mr()*512;mc.moveTo(x,y);mc.bezierCurveTo(x+60,y-35,x-60,y+80,x+180,y+150);mc.strokeStyle=i%3?'#ffffff':'#9a8976';mc.globalAlpha=.07+mr()*.16;mc.lineWidth=.6+mr()*2;mc.stroke()}mc.globalAlpha=1;const marbleTex=new THREE.CanvasTexture(marbleCanvas);marbleTex.colorSpace=THREE.SRGBColorSpace;marbleTex.wrapS=marbleTex.wrapT=THREE.RepeatWrapping;marbleTex.repeat.set(2,1);
 const marble=new THREE.MeshStandardMaterial({map:marbleTex,color:0xffffff,roughness:.24,metalness:.04})
 const brass=new THREE.MeshStandardMaterial({color:0xc69a55,metalness:.68,roughness:.28})
 const bookMats=[0x7c342d,0x284c46,0x263e5b,0xb08a54,0x8b6848,0x4c3b58,0xc7b58f,0x536a58].map(color=>new THREE.MeshStandardMaterial({color,roughness:.82}))
 const floorTex=makeGrainTexture('#986b45','#e0b27a',19);floorTex.repeat.set(5,3);
 const floorMat=new THREE.MeshStandardMaterial({map:floorTex,color:0xffffff,roughness:.68})
 box(20,.22,19,0,-.24,0,floorMat)
 // Board seams run lengthwise for a believable timber floor; thin brass lines are removed from the floor itself.
 for(let x=-9.5;x<10;x+=1.25){box(.012,.008,18.8,x,-.122,0,darkWood)}
 for(let z=-8.7;z<9;z+=.82){box(19.9,.009,.012,0,-.122,z,darkWood)}
 // Warm plaster walls and dark walnut ceiling beams frame the room.
 box(20,7,.28,0,3.35,-8.7,plaster);box(.28,7,18, -9.85,3.35,0,plaster);box(.28,7,18,9.85,3.35,0,plaster)
 const beamMat=new THREE.MeshStandardMaterial({color:0x4b3425,roughness:.62})
 for(let x=-9;x<=9;x+=3){box(.2,.34,18,x,6.65,0,beamMat)}
 box(20,.24,.3,0,6.2,-8.5,beamMat)
 // Layered ceiling cornice and recessed warm light channels soften the double-height room.
 box(19.5,.16,.18,0,6.48,-8.48,trim)
 box(.18,.16,17.1,-9.55,6.48,0,trim)
 box(.18,.16,17.1,9.55,6.48,0,trim)
 const coveMat=new THREE.MeshBasicMaterial({color:0xffd89a,transparent:true,opacity:.72})
 for(let x=-8.7;x<=8.7;x+=.42){const glow=new THREE.Mesh(new THREE.BoxGeometry(.28,.018,.035),coveMat);glow.position.set(x,6.37,-8.36);room.add(glow)}
 // Full-height bookcases across the back wall, packed with individually modeled books.
 function bookshelf(x,z,width=3.2,depth=.52){
  const g=new THREE.Group();g.position.set(x,0,z);room.add(g)
  box(width,4.9,depth,0,2.45,0,wood,g)
  box(width+.08,.13,depth+.08,0,4.95,0,trim,g)
  for(let y=.75;y<4.6;y+=.86){
   box(width-.12,.075,depth+.04,0,y,0,darkWood,g)
   let bx=-width/2+.13
   while(bx<width/2-.16){
    const bw=.105+Math.random()*.095,bh=.42+Math.random()*.31
    const book=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,.22),bookMats[Math.floor(Math.random()*bookMats.length)])
    book.position.set(bx+bw/2,y+bh/2+.035,.02);book.rotation.z=(Math.random()-.5)*.045;book.castShadow=true;g.add(book)
    box(bw*.48,.025,.012, bx+bw*.5,y+bh*.72,.137,brass,g)
    bx+=bw+.035
   }
  }
  for(let px=-width/2+.18;px<width/2;px+=1.05)box(.075,4.9,depth+.08,px,2.45,0,trim,g)
 }
 for(let x=-7.5;x<=7.5;x+=3.75)bookshelf(x,-8.25,3.55,.5)
 for(let z=-5.9;z<=3.1;z+=3.1){bookshelf(-9.35,z,2.55,.48);bookshelf(9.35,z,2.55,.48)}
 // Tall arched-style window bays on the right wall, with mullions and warm afternoon light.
 const glass=new THREE.MeshStandardMaterial({color:0x9fc5d0,roughness:.22,metalness:.08,emissive:0x6c9cac,emissiveIntensity:.18})
 for(let z=-4.6;z<=1.6;z+=3.1){
  // Tall glass lower bay with a segmented semicircular arch above it.
  box(.06,2.45,2.2,9.64,2.75,z,trim)
  box(.07,2.28,1.94,9.58,2.78,z,glass)
  box(.1,2.35,.09,9.5,2.75,z,wood)
  box(.1,.09,2,9.5,2.75,z,wood)
  const archR=.98
  const archRing=new THREE.Mesh(new THREE.TorusGeometry(archR,.075,12,48,Math.PI),wood);archRing.rotation.y=Math.PI/2;archRing.position.set(9.49,4.0,z);archRing.castShadow=true;room.add(archRing)
  for(let i=0;i<=12;i++){
   const a=Math.PI*i/12
   const zz=z+Math.cos(a)*archR, yy=4.0+Math.sin(a)*archR
   const mullion=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.08),trim);mullion.position.set(9.5,yy,zz);room.add(mullion)
   if(i<12){const a2=Math.PI*(i+1)/12;const p1=new THREE.Vector3(9.5,yy,zz),p2=new THREE.Vector3(9.5,4+Math.sin(a2)*archR,z+Math.cos(a2)*archR);const d=new THREE.Vector3().subVectors(p2,p1);const seg=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,d.length(),8),wood);seg.position.copy(p1).add(p2).multiplyScalar(.5);seg.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());room.add(seg)}
  }
  for(let i=1;i<6;i++){const a=Math.PI*i/6;box(.09,1.95,.055,9.49,2.78,z+Math.cos(a)*archR,wood)}
 }
 // Brass picture lights create local pools of warm light over the back-wall book spines.
 for(let x=-7.4;x<=7.4;x+=3.7){
  const arm=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.24,8),brass);arm.position.set(x,5.08,-7.92);arm.rotation.x=Math.PI/2;room.add(arm)
  const hood=new THREE.Mesh(new THREE.BoxGeometry(.72,.055,.12),brass);hood.position.set(x,4.98,-7.9);room.add(hood)
  const bookLight=new THREE.PointLight(0xffc982,7,3.8);bookLight.position.set(x,4.82,-7.65);room.add(bookLight)
 }
 // Upper mezzanine and gallery railing: this is the strongest missing spatial cue in the reference.
 const balconyMat=new THREE.MeshStandardMaterial({color:0x493225,roughness:.58,metalness:.08})
 box(8.8,.22,2.35,0,4.18,-5.45,wood)
 box(8.95,.12,2.42,0,4.31,-5.45,trim)
 // Balustrade faces the room; repeated fine balusters read as a real upper floor, not a flat wall.
 box(8.8,.12,.12,0,4.9,-4.25,darkWood)
 box(8.8,.12,.12,0,4.45,-4.25,trim)
 for(let x=-4.25;x<=4.25;x+=.28){box(.035,.42,.035,x,4.68,-4.25,balconyMat)}
 // A curved stair flight descends from the mezzanine at the right side of the room.
 // Tapered wedge-like treads are rotated around a shared center to create a continuous spiral.
 const stairCenter=new THREE.Vector3(5.55,0,-2.0)
 for(let i=0;i<17;i++){
  const angle=-Math.PI*.82+i*.105
  const radius=1.8-i*.018
  const step=new THREE.Mesh(new THREE.BoxGeometry(.78,.13,.5),i%3===0?wood:darkWood)
  step.position.set(stairCenter.x+Math.cos(angle)*radius,4.0-i*.205,stairCenter.z+Math.sin(angle)*radius)
  step.rotation.y=-angle;step.castShadow=true;step.receiveShadow=true;room.add(step)
  const railPost=new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,.52,8),brass)
  railPost.position.set(stairCenter.x+Math.cos(angle)*(radius+.35),4.31-i*.205,stairCenter.z+Math.sin(angle)*(radius+.35));room.add(railPost)
 }
 // A dark curved handrail follows the stair's outer edge in short joined segments.
 for(let i=0;i<16;i++){
  const a1=-Math.PI*.82+i*.105,a2=a1+.105, r=2.15
  const p1=new THREE.Vector3(stairCenter.x+Math.cos(a1)*r,4.56-i*.205,stairCenter.z+Math.sin(a1)*r)
  const p2=new THREE.Vector3(stairCenter.x+Math.cos(a2)*r,4.56-(i+1)*.205,stairCenter.z+Math.sin(a2)*r)
  const d=new THREE.Vector3().subVectors(p2,p1);const rail=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,d.length(),8),balconyMat)
  rail.position.copy(p1).add(p2).multiplyScalar(.5);rail.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());room.add(rail)
 }
 // Landscape layers beyond the glazing add distance cues instead of a flat cyan pane.
 const skyMat=new THREE.MeshBasicMaterial({color:0xb8d5dc})
 for(const z of [-4.6,-1.5,1.6]){
  box(.025,5.6,2.35,9.83,3.2,z,skyMat)
  for(let i=0;i<7;i++){
   const tree=new THREE.Mesh(new THREE.ConeGeometry(.22+((i*7)%3)*.08,1.0+(i%4)*.25,7),new THREE.MeshStandardMaterial({color:[0x6d8870,0x879a7c,0x4c6b5a][i%3],roughness:1}))
   tree.position.set(9.76,1.0+(i%3)*.12,z-0.82+i*.27);tree.rotation.z=(i%2?-.12:.12);room.add(tree)
  }
 }
 // A shallow bowed walnut bar front gives the counter a more architectural, custom-built silhouette.
 // Faceted segments keep the curve lightweight while retaining real shadows and material response.
 for(let i=0;i<14;i++){
  const x=-3.78+i*.58, normalized=x/4
  const bow=.48*(1-normalized*normalized)
  const panel=box(.59,.91,.78,x,.48,.02+bow,wood);panel.rotation.y=-normalized*.16
  const inset=box(.49,.54,.035,x,.51,.425+bow,darkWood);inset.rotation.y=-normalized*.16
  const inner=box(.4,.42,.018,x,.51,.448+bow,wood);inner.rotation.y=-normalized*.16
  const pull=box(.11,.025,.025,x,.51,.463+bow,brass);pull.rotation.y=-normalized*.16
 }
 box(7.95,.17,1.02,0,1.02,.12,darkWood)
 box(8.1,.12,1.12,0,1.13,.12,marble)
 // Thin brass toe-kick follows the counter's bowed front.
 for(let i=0;i<14;i++){const x=-3.78+i*.58;box(.57,.045,.025,x,.09,.42+.48*(1-(x/4)*(x/4)),trim)}
 // Coffee machine, cup stack, grinder and book display make the counter read as a real place.
 const steel=new THREE.MeshStandardMaterial({color:0x9aa6a7,metalness:.72,roughness:.27})
 box(.75,.62,.52,-2.8,1.5,-.18,steel);box(.52,.18,.38,-2.8,1.9,-.18,darkWood)
 box(.25,.35,.25,-1.9,1.35,-.1,wood);box(.22,.06,.22,-1.9,1.56,-.1,trim)
 for(let i=0;i<3;i++){const cup=new THREE.Mesh(new THREE.CylinderGeometry(.075,.06,.16,16),new THREE.MeshStandardMaterial({color:0xf5eee0,roughness:.32}));cup.position.set(-1.35+i*.2,1.28,-.1);room.add(cup)}
 box(.62,.12,.38,2.5,1.25,-.08,wood);for(let i=0;i<4;i++)box(.11,.28,.22,2.28+i*.14,1.45,-.08,bookMats[i])
 // Pendant lights and brass fixtures hang over the bar.
 for(const x of [-2.7,0,2.7]){
  const cord=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,1.2,8),darkWood);cord.position.set(x,5.55,-.15);room.add(cord)
  const shade=new THREE.Mesh(new THREE.CylinderGeometry(.18,.34,.22,24,1,true),brass);shade.position.set(x,4.95,-.15);room.add(shade)
  const bulb=new THREE.PointLight(0xffc879,28,7);bulb.position.set(x,4.75,-.15);room.add(bulb)
 }
 // A few reading tables and upholstered chairs in the public side of the room.
 const tableMat=new THREE.MeshStandardMaterial({color:0x65422e,roughness:.55})
 for(const [x,z] of [[-5,3.7],[5,4.2]]){
  box(1.7,.13,1.05,x,.85,z,tableMat);box(1.58,.025,.93,x,.925,z,trim);for(const dx of [-.68,.68])for(const dz of [-.38,.38])box(.09,.82,.09,x+dx,.4,z+dz,darkWood)
  for(const dx of [-.9,.9]){box(.55,.12,.5,x+dx,.48,z,wood);box(.55,.48,.08,x+dx,.73,z-.2,darkWood);box(.09,.65,.09,x+dx,.18,z,darkWood)}
 }
 // Leafy potted plants soften the timber-heavy room and add scale cues near the windows.
 const potMat=new THREE.MeshStandardMaterial({color:0xb56e48,roughness:.86});const leafMats=[0x466b42,0x63834c,0x2f593c].map(color=>new THREE.MeshStandardMaterial({color,roughness:.9,side:THREE.DoubleSide}));
 for(const [px,pz] of [[7.9,-6.4],[7.9,2.5],[-7.8,5.7]]){const pot=new THREE.Mesh(new THREE.CylinderGeometry(.2,.15,.35,16),potMat);pot.position.set(px,.06,pz);room.add(pot);for(let i=0;i<9;i++){const leaf=new THREE.Mesh(new THREE.SphereGeometry(.11,8,7),leafMats[i%leafMats.length]);const angle=i*2.399;leaf.position.set(px+Math.cos(angle)*(.12+(i%3)*.05),.34+(i%4)*.12,pz+Math.sin(angle)*(.12+(i%3)*.05));leaf.scale.set(.65,1.8,.55);leaf.rotation.z=Math.cos(angle)*.55;room.add(leaf)}}
 // Replace the sci-fi floor grid with a softly lit, continuous timber floor.
 const rug=new THREE.Mesh(new THREE.BoxGeometry(5.2,.025,2.5),new THREE.MeshStandardMaterial({color:0x43534a,roughness:1}));rug.position.set(0,-.105,3.7);room.add(rug)
 // The timber floor, built-in shelves and counter form the physical room.
 // Small brass sign above the service area; no floating sci-fi hologram.
 centralCore=new THREE.Group()
 const sign=new THREE.Mesh(new THREE.BoxGeometry(1.8,.5,.08),new THREE.MeshStandardMaterial({color:0x5c3d2a,roughness:.55}))
 sign.position.set(0,2.25,-.72);centralCore.add(sign);centralCore.position.set(0,0,0);centralCore.visible=false;scene.add(centralCore)
 // Render the actual Three.js room so the architecture, lighting, furniture, and agents share one camera.
 // A flat photo backdrop made the agents appear detached and did not support coherent orbit interaction.
 room.visible=true
 for(const a of agents)createAgent(a)
 raycaster=new THREE.Raycaster()
 const resize=()=>{if(!canvasHost.value||!renderer)return;const w=canvasHost.value.clientWidth,h=canvasHost.value.clientHeight;camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
 resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvasHost.value);resize()
 const pointerMove=e=>{if(pointerDown){orbitAngle+=(e.clientX-pointerDown.x)*.006;orbitTilt=Math.max(-.2,Math.min(.65,orbitTilt+(e.clientY-pointerDown.y)*.003));pointerDown={...pointerDown,x:e.clientX,y:e.clientY};return}const rect=renderer.domElement.getBoundingClientRect();parallaxTargetX=((e.clientX-rect.left)/Math.max(rect.width,1)-.5)*2;parallaxTargetY=((e.clientY-rect.top)/Math.max(rect.height,1)-.5)*2;}
 const pointerUp=e=>{if(!pointerDown)return;const moved=Math.abs(e.clientX-pointerDown.startX)+Math.abs(e.clientY-pointerDown.startY);if(moved<8){const rect=renderer.domElement.getBoundingClientRect();const p=new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(p,camera);const hit=raycaster.intersectObjects(clickableMeshes,false)[0];if(hit){focusAgent.value=hit.object.userData.agentId;motion.value='wave';}}
 pointerDown=null}
 const down=e=>{pointerDown={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};renderer.domElement.setPointerCapture?.(e.pointerId)}
 renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerup',pointerUp)
 renderer.domElement.addEventListener('wheel',e=>{zoom.value=Math.max(.72,Math.min(1.45,zoom.value+(e.deltaY>0?-.06:.06)));targetZoom=zoom.value},{passive:true})
 const animate=()=>{raf=requestAnimationFrame(animate);const t=clock.getElapsedTime();parallaxX+=(parallaxTargetX-parallaxX)*.045;parallaxY+=(parallaxTargetY-parallaxY)*.045;centralCore.rotation.y=Math.sin(t*.25)*.025
  for(const [id,g] of avatarMeshes){const a=agents.find(x=>x.id===id);const active=selected.value.includes(id);const focus=focusAgent.value===id;g.position.y=a.pos[1]+Math.sin(t*1.5+agents.indexOf(a))*.06+(motion.value==='wave'&&focus?Math.abs(Math.sin(t*7))*.35:0);g.rotation.y=Math.sin(t*.4+agents.indexOf(a))*.12;g.scale.setScalar((focus?1.13:1)*(active?1:.78));g.userData.ring.material.opacity=active?.9:.18;g.userData.halo.rotation.z=t*.65;g.userData.material.emissiveIntensity=focus ? 1.0 : 0.22}
  const radius=16/zoom.value;const desiredCamera=new THREE.Vector3(Math.sin(orbitAngle)*radius+parallaxX*.72,5.4+orbitTilt*8-parallaxY*.42,Math.cos(orbitAngle)*radius);camera.position.lerp(desiredCamera,.085);const lookTarget=new THREE.Vector3(parallaxX*.22,1.25-parallaxY*.12,-.25);camera.lookAt(lookTarget);renderer.render(scene,camera)}
 animate()
}
function zoomBy(delta){zoom.value=Math.max(.72,Math.min(1.45,zoom.value+delta));targetZoom=zoom.value}
function resetView(){orbitAngle=0;orbitTilt=.18;zoom.value=1;targetZoom=1;parallaxTargetX=0;parallaxTargetY=0;focusAgent.value='manager';motion.value='wave'}
onMounted(()=>initScene())
onBeforeUnmount(()=>{cancelAnimationFrame(raf);resizeObserver?.disconnect();if(renderer){renderer.dispose();renderer.domElement.remove()}scene?.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of (Array.isArray(o.material)?o.material:[o.material]))m.dispose()}})})
const selectedAgent=computed(()=>agents.find(a=>a.id===focusAgent.value)||agents[0])
</script>

<template>
<section class="space3d">
 <header class="space-top"><button class="back" @click="props.onBack">← 返回杂货铺</button><div class="brand"><span class="brand-orb">AI</span><span><b>AI 杂货铺</b><small>AGENT COLLABORATION SPACE</small></span></div><div class="top-state"><i></i>{{busy?'团队正在协作':'协作空间在线'}}</div><button class="mode-btn" @click="mode=mode==='demo'?'deepseek':'demo'">{{mode==='demo'?'演示模式':'DeepSeek Runtime'}}　↔</button></header>
 <div class="space-layout">
  <section class="stage-column">
   <div class="stage-head"><div><span class="eyebrow">THE LIBRARY BAR / 001</span><h1>在书香与咖啡之间，<em>让团队自然协作。</em></h1><p>选择数字人 · 拖动环绕 · 发起任务 · 实时查看协作结果</p></div><div class="scene-actions"><button @click="zoomBy(.12)">＋</button><button @click="zoomBy(-.12)">−</button><button @click="resetView">◎ 复位视角</button></div></div>
   <div class="scene-shell"><div ref="canvasHost" class="three-canvas"></div><div class="scene-vignette"></div><div class="scene-hud hud-top"><span><i class="pulse"></i> THE LIBRARY BAR</span><span>BOOKS · COFFEE · COLLABORATION</span></div><div class="scene-hud hud-bottom"><span>拖动旋转 · 移动鼠标触发空间视差</span><span>滚轮缩放 · 点击数字人聚焦</span></div>
    <div class="agent-labels"><button v-for="a in agents" :key="a.id" class="agent-label" :class="{focused:focusAgent===a.id,muted:!selected.includes(a.id)}" :style="{'--agent-color':'#'+a.color.toString(16).padStart(6,'0')}" @click="focusAgent=a.id;motion='wave'"><i></i><span><b>{{a.name}}</b><small>{{a.role}}</small></span><em>{{selected.includes(a.id)?'在线':'已静音'}}</em></button></div>
    <div class="core-caption"><span class="core-dot"></span><b>协作核心</b><small>{{activeAgents.length}} AGENTS LINKED</small></div>
   </div>
   <div class="stage-foot"><div class="foot-stat"><small>当前团队</small><b>{{activeAgents.length}} <i>/ 6</i></b></div><div class="foot-stat"><small>消息事件</small><b>{{messages.length}} <i>条</i></b></div><div class="foot-stat"><small>空间动作</small><b>{{motion==='working'?'任务协作':motion==='wave'?'角色响应':'待命巡航'}}</b></div><div class="foot-tip">✦ 点击角色卡可选中 / 取消协作成员</div></div>
   <div class="team-strip"><button v-for="a in agents" :key="a.id" class="team-chip" :class="{on:selected.includes(a.id),active:focusAgent===a.id}" @click="toggleAgent(a.id);focusAgent=a.id"><span :style="{background:'#'+a.color.toString(16).padStart(6,'0')}"></span><b>{{a.name}}</b><small>{{a.role}}</small><i>{{selected.includes(a.id)?'✓':'+'}}</i></button></div>
  </section>
  <aside class="chat-panel"><div class="panel-head"><div><span class="eyebrow">SHARED CONVERSATION</span><h2>团队群聊 <span class="live-pill">● LIVE</span></h2><p>同一上下文，岗位独立响应</p></div><button class="panel-menu" @click="messages=[{id:Date.now(),role:'system',text:'新会话已创建。所有数字人共享本房间上下文。',time:now()}]">↻</button></div>
   <div class="focus-card"><div class="focus-avatar" :style="{'--agent-color':'#'+selectedAgent.color.toString(16).padStart(6,'0')}"><span></span></div><div><small>当前聚焦角色</small><b>{{selectedAgent.name}} <i>{{selectedAgent.role}}</i></b><p>{{selectedAgent.guide}}</p></div><button @click="toggleAgent(focusAgent)">{{selected.includes(focusAgent)?'−':'+'}}</button></div>
   <div class="messages" ref="messageList"><div v-for="m in messages" :key="m.id" class="message" :class="['m-'+m.role,{user:m.role==='user'}]"><template v-if="m.role==='user'"><div class="user-bubble">{{m.text}}</div><time>{{m.time}}</time></template><template v-else><div class="message-meta"><span class="message-dot" :style="{'--dot-color':'#'+(agents.find(a=>a.id===m.role)?.color||0x8294c5).toString(16).padStart(6,'0')}"></span><b>{{agents.find(a=>a.id===m.role)?.name||'系统'}}</b><time>{{m.time}}</time></div><p>{{m.text}}</p></template></div><div v-if="busy" class="typing"><span></span><span></span><span></span> {{status}}</div></div>
   <div class="prompt-row"><button v-for="p in quickPrompts" :key="p" @click="addPrompt(p)" :disabled="busy">{{p}}</button></div>
   <div class="composer"><div class="mention-hint">@ 店长 / 导购 / 采购 / 盘点员 / 产品经理 / 所有人</div><textarea v-model="draft" rows="3" :disabled="busy" placeholder="描述你的目标，数字人团队将开始协作…" @keydown.enter.exact.prevent="send"></textarea><div class="composer-bottom"><span>{{status}}</span><button :disabled="busy||!draft.trim()||!selected.length" @click="send"><span>{{busy?'协作中':'发起协作'}}</span><b>↗</b></button></div></div>
  </aside>
 </div>
</section>
</template>

<style>
.space3d{--bg:#0d1d2c;--panel:rgba(9,25,41,.88);--line:rgba(128,185,222,.24);min-height:calc(100vh - 64px);margin:-1px 0 0;padding:18px clamp(12px,1.8vw,28px) 28px;background:radial-gradient(ellipse at 52% 35%,#5c452b 0%,transparent 48%),linear-gradient(135deg,#101e2d,#192b3b 58%,#101b28);color:#f1f5fa;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
.space-top{height:54px;display:flex;align-items:center;gap:22px;max-width:1800px;margin:0 auto 18px;border-bottom:1px solid var(--line);padding-bottom:10px;background:linear-gradient(90deg,#142536aa,#14253655);backdrop-filter:blur(12px);border-radius:0 0 12px 12px}.space-top button{cursor:pointer}.back,.mode-btn{border:1px solid var(--line);border-radius:10px;background:#ffffff0b;color:#e4edf7;padding:10px 13px;font-size:12px}.brand{display:flex;align-items:center;gap:10px}.brand-orb{width:35px;height:35px;border-radius:12px;display:grid;place-items:center;font-weight:900;background:linear-gradient(135deg,#5bd9ff,#8065ff 65%,#d95dff);box-shadow:0 0 25px #7865ff55}.brand b,.brand small{display:block}.brand b{font-size:13px;letter-spacing:.03em}.brand small{font-size:8px;letter-spacing:.15em;color:#a8bfd2;margin-top:3px}.top-state{margin-left:auto;font-size:11px;color:#d0dfed}.top-state i,.pulse{display:inline-block;width:7px;height:7px;border-radius:50%;background:#5df2c1;box-shadow:0 0 12px #5df2c1;margin-right:8px}.mode-btn{margin-left:4px}
.space-layout{max-width:1800px;margin:auto;display:grid;grid-template-columns:minmax(0,1.6fr) minmax(340px,.82fr);gap:20px;align-items:stretch}.stage-column{min-width:0}.stage-head{display:flex;justify-content:space-between;align-items:end;gap:18px;padding:5px 3px 20px}.eyebrow{font-size:9px;letter-spacing:.19em;color:#8fd7f5;font-weight:800}.stage-head h1{font-size:clamp(27px,3vw,44px);letter-spacing:-.045em;margin:9px 0 7px;font-weight:760}.stage-head h1 em{font-style:normal;background:linear-gradient(90deg,#ffdca2,#f8b66d,#b7e6ff);background-clip:text;color:transparent}.stage-head p,.panel-head p{font-size:11px;color:#b2c7d9;margin:0}.scene-actions{display:flex;gap:6px;flex-shrink:0}.scene-actions button{border:1px solid var(--line);background:#ffffff;color:#355577;border-radius:9px;padding:9px 12px;cursor:pointer;font-size:12px;transition:.2s}.scene-actions button:hover{border-color:#6e94ff;box-shadow:0 0 20px #627dff25;transform:translateY(-2px)}
.scene-shell{position:relative;height:clamp(440px,62vh,740px);border:1px solid #b28a58;border-radius:16px;overflow:hidden;background:#3b2b20;box-shadow:inset 0 0 100px #59cfff24,0 0 35px #66baff24,0 22px 70px #355d831a;isolation:isolate}.three-canvas{position:absolute;inset:0;touch-action:none}.three-canvas canvas{display:block;width:100%;height:100%;outline:none}.scene-vignette{pointer-events:none;position:absolute;inset:0;background:linear-gradient(180deg,#24180c16,transparent 24%,transparent 70%,#24180c2b),radial-gradient(ellipse at center,transparent 30%,#24180c12 100%);z-index:1}.scene-hud{position:absolute;z-index:2;left:18px;right:18px;display:flex;justify-content:space-between;font-size:8px;letter-spacing:.15em;color:#426d9a;pointer-events:none}.hud-top{top:17px}.hud-bottom{bottom:15px;letter-spacing:.04em;text-transform:none;color:#687ba9}.agent-labels{position:absolute;z-index:3;right:14px;top:58px;display:grid;gap:7px;width:155px}.agent-label{display:flex;align-items:center;gap:8px;text-align:left;border:1px solid #b99b70;background:#fff9efed;backdrop-filter:blur(12px);padding:8px 9px;border-radius:10px;color:#1d3c60;cursor:pointer;transition:.22s}.agent-label:hover,.agent-label.focused{transform:translateX(-4px);border-color:var(--agent-color);box-shadow:0 0 24px color-mix(in srgb,var(--agent-color),transparent 75%)}.agent-label>i{width:7px;height:7px;flex-shrink:0;border-radius:50%;background:var(--agent-color);box-shadow:0 0 10px var(--agent-color)}.agent-label span{min-width:0;flex:1}.agent-label b,.agent-label small{display:block}.agent-label b{font-size:10px}.agent-label small{font-size:8px;color:#6483a7;margin-top:3px}.agent-label em{font-style:normal;font-size:7px;color:#5e7ea1}.agent-label.muted{opacity:.45}.core-caption{position:absolute;z-index:3;left:50%;top:48%;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:5px;pointer-events:none;text-shadow:0 2px 12px #ffffff}.core-caption b{font-size:12px;letter-spacing:.12em}.core-caption small{font-size:8px;color:#387eb8;letter-spacing:.16em}.core-dot{width:5px;height:5px;border-radius:50%;background:#60e8ff;box-shadow:0 0 16px 5px #60e8ff66}
.stage-foot{display:flex;align-items:center;gap:24px;padding:15px 4px;border-bottom:1px solid var(--line)}.foot-stat small,.foot-stat b{display:block}.foot-stat small{font-size:9px;color:#a5bfd2;margin-bottom:5px}.foot-stat b{font-size:18px}.foot-stat i{font-size:10px;font-style:normal;color:#6885a6;font-weight:500}.foot-tip{margin-left:auto;color:#a6c2d7;font-size:10px}.team-strip{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;padding-top:13px} .team-chip{min-width:0;display:grid;grid-template-columns:7px 1fr auto;align-items:center;gap:7px;border:1px solid var(--line);border-radius:10px;background:#10283b;padding:9px 8px;color:#e0edf7;text-align:left;cursor:pointer;transition:.2s}.team-chip>span{width:7px;height:7px;border-radius:50%;box-shadow:0 0 10px currentColor}.team-chip b{font-size:10px;overflow:hidden;text-overflow:ellipsis} .team-chip small{grid-column:2/3;color:#9ab3c8;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.team-chip i{grid-column:3;grid-row:1/3;font-style:normal;color:#7586b5}.team-chip.on{background:linear-gradient(120deg,#00eaff14,#b52cff18);border-color:#00eaff66}.team-chip.active{border-color:#a18aff;box-shadow:inset 0 0 20px #8670ff13}
.chat-panel{display:flex;flex-direction:column;min-height:650px;max-height:calc(100vh - 120px);border:1px solid #83b7d65c;border-radius:16px;background:linear-gradient(160deg,#10283bdc,#0b1d2de8);box-shadow:0 25px 70px #0005;backdrop-filter:blur(18px);overflow:hidden}.panel-head{padding:22px 20px 17px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);background:#0b1c2b55}.panel-head h2{margin:8px 0 5px;font-size:21px;letter-spacing:-.03em;color:#f2f7fc}.live-pill{font-size:8px;color:#6df2c2;border:1px solid #3de2b033;background:#38d8a00d;border-radius:20px;padding:4px 6px;vertical-align:middle;letter-spacing:.1em}.panel-menu{border:1px solid var(--line);background:#ffffff06;color:#91a5df;border-radius:9px;padding:8px 10px;cursor:pointer} .focus-card{display:flex;align-items:center;gap:11px;margin:13px 14px 0;padding:12px;border:1px solid #9bbde533;background:linear-gradient(110deg,#18384d,#142b3d);border-radius:13px}.focus-avatar{width:38px;height:38px;border-radius:13px;display:grid;place-items:center;background:radial-gradient(circle at 40% 35%,var(--agent-color),#eaf5ff 78%);box-shadow:0 0 20px color-mix(in srgb,var(--agent-color),transparent 70%);flex-shrink:0}.focus-avatar span{width:13px;height:13px;border:2px solid white;border-radius:50%;box-shadow:0 0 12px white}.focus-card>div:nth-child(2){min-width:0;flex:1}.focus-card small,.focus-card b{display:block} .focus-card small{font-size:8px;color:#65809d;margin-bottom:4px}.focus-card b{font-size:12px;color:#f1f6fb}.focus-card b i{font-size:9px;font-style:normal;color:#6683a5;font-weight:400;margin-left:5px}.focus-card p{font-size:9px;color:#b4c8d8;margin:5px 0 0;line-height:1.5}.focus-card>button{border:1px solid var(--line);background:#ffffff08;color:#d7e0ff;border-radius:7px;width:27px;height:27px;cursor:pointer}.messages{padding:17px 17px 8px;flex:1;overflow:auto;min-height:130px;scroll-behavior:smooth}.message{margin-bottom:17px;animation:message-in .28s ease-out}.message-meta{display:flex;align-items:center;gap:7px;margin-bottom:6px}.message-dot{width:7px;height:7px;border-radius:50%;background:var(--dot-color);box-shadow:0 0 8px var(--dot-color)} .message-meta b{font-size:10px;color:#e3edf7}.message-meta time,.message>time{font-size:8px;color:#6a86a7;margin-left:auto}.message p{margin:0 0 0 14px;font-size:11px;line-height:1.7;color:#e3edf7;background:#ffffff0b;border-left:1px solid #7aa8dd88;padding:9px 11px;border-radius:0 9px 9px 0;white-space:pre-wrap;overflow-wrap:anywhere}.message.user{display:flex;flex-direction:column;align-items:flex-end}.user-bubble{max-width:92%;background:linear-gradient(115deg,#4c67d6,#7255cc);border:1px solid #a3a5ff55;padding:10px 12px;border-radius:13px 13px 3px 13px;font-size:11px;line-height:1.6;color:white}.message>time{margin-top:4px}.typing{display:flex;align-items:center;gap:5px;color:#4e7296;font-size:9px;padding:6px 0 10px}.typing span{width:4px;height:4px;border-radius:50%;background:#76baff;animation:typing 1s infinite}.typing span:nth-child(2){animation-delay:.15s}.typing span:nth-child(3){animation-delay:.3s}.prompt-row{display:flex;gap:6px;overflow-x:auto;padding:11px 14px;border-top:1px solid var(--line)} .prompt-row button{flex-shrink:0;max-width:180px;border:1px solid #a8c7e655;background:#f3f8ff;border-radius:8px;padding:7px 9px;font-size:9px;color:#496b8d;cursor:pointer;white-space:nowrap}.prompt-row button:hover{border-color:#9b8bff;color:white}.composer{padding:13px 14px 15px;border-top:1px solid var(--line);background:#0a1b2b99}.mention-hint{font-size:8px;color:#607e9f;margin-bottom:8px}.composer textarea{width:100%;resize:vertical;min-height:72px;border:1px solid #829aff42;border-radius:11px;background:#071725a8;color:#f1f6fb;padding:12px;font:inherit;font-size:11px;line-height:1.6;outline:none}.composer textarea:focus{border-color:#7b8fff;box-shadow:0 0 0 3px #778bff15}.composer textarea::placeholder{color:#8ca6bb}.composer-bottom{display:flex;align-items:center;gap:10px;margin-top:9px}.composer-bottom>span{font-size:8px;color:#8294c0;flex:1;line-height:1.5}.composer-bottom button{display:flex;align-items:center;gap:14px;border:0;border-radius:10px;background:linear-gradient(115deg,#4c87ff,#8a5cff 70%,#bd69ff);color:white;padding:10px 12px;font-weight:700;font-size:10px;cursor:pointer;box-shadow:0 6px 24px #6b62ff40;transition:.2s}.composer-bottom button:hover{transform:translateY(-2px);box-shadow:0 8px 28px #6b62ff66}.composer-bottom button b{font-size:15px}.composer-bottom button:disabled{opacity:.45;cursor:not-allowed;transform:none}@keyframes message-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes typing{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
@media(max-width:1150px){.space-layout{grid-template-columns:minmax(0,1fr)}.chat-panel{max-height:none;min-height:620px}.scene-shell{height:560px}.stage-head h1{font-size:32px}.stage-column{min-width:0}}@media(max-width:650px){.space3d{padding:12px 10px 24px}.space-top{gap:8px;margin-bottom:14px}.back{font-size:10px;padding:8px}.brand small{display:none}.brand b{font-size:11px}.brand-orb{width:29px;height:29px}.top-state{display:none}.mode-btn{margin-left:auto;font-size:9px;padding:8px}.stage-head{align-items:flex-start;flex-direction:column;padding-bottom:13px}.stage-head h1{font-size:29px}.scene-actions{align-self:flex-end}.scene-shell{height:470px;border-radius:15px}.agent-labels{right:7px;top:48px;width:110px;gap:5px}.agent-label{padding:6px;gap:5px}.agent-label b{font-size:9px}.agent-label small{font-size:7px}.agent-label em{display:none}.core-caption{top:50%;left:42%}.scene-hud{left:10px;right:10px;font-size:7px}.stage-foot{gap:12px;flex-wrap:wrap}.foot-stat b{font-size:15px}.foot-tip{width:100%;margin-left:0}.team-strip{grid-template-columns:repeat(3,minmax(0,1fr))}.chat-panel{border-radius:15px;min-height:610px}.panel-head{padding:17px 14px}.panel-head h2{font-size:19px}.focus-card{margin:10px 10px 0}.messages{padding:14px 12px}.prompt-row{padding:9px 10px}.composer{padding:11px 10px 12px}}
@media(prefers-reduced-motion:reduce){.space3d *{animation:none!important;transition:none!important}}

/* Immersive room composition: the environment is the canvas, not a boxed widget. */
.space3d{position:relative;min-height:100vh;height:100vh;padding:0;overflow:hidden;background:#101c28;color:#f4f7fb}
.space-top{position:absolute;z-index:20;top:0;left:0;right:0;max-width:none;height:68px;margin:0;padding:0 24px;border:0;border-bottom:1px solid #b8d8ef22;border-radius:0;background:linear-gradient(180deg,#081521df,#081521a6);backdrop-filter:blur(18px)}
.brand-orb{border-radius:50%;background:linear-gradient(145deg,#1e9edb,#3768c7);box-shadow:0 0 26px #36baf544}
.space-layout{position:absolute;inset:68px 0 0;max-width:none;margin:0;display:block}
.stage-column{position:absolute;inset:0;min-width:0}
.stage-head{position:absolute;z-index:5;left:30px;top:26px;max-width:min(58vw,790px);padding:0;align-items:flex-start}
.stage-head h1{font-size:clamp(30px,3.25vw,54px);line-height:1.12;max-width:790px;text-shadow:0 3px 30px #061321b8}
.stage-head p{color:#e0e9f2;font-size:12px;text-shadow:0 2px 10px #061321}
.eyebrow{color:#f2bd7a}
.scene-actions{position:absolute;top:155px;right:0}
.scene-actions button{background:#0b1e2c9e;color:#edf5fb;border:1px solid #c0e2f04d;backdrop-filter:blur(12px)}
.scene-shell{position:absolute;inset:0;height:auto;border:0;border-radius:0;background:#20180f;box-shadow:none;isolation:isolate}
.three-canvas{position:absolute;inset:0}
.scene-vignette{background:linear-gradient(180deg,#07111c86 0%,transparent 17%,transparent 65%,#07111c65 100%),linear-gradient(90deg,#07111c35,transparent 30%,transparent 65%,#07111c24),radial-gradient(ellipse at center,transparent 45%,#07111c3d 100%)}
.scene-hud{color:#d9e5ef;text-shadow:0 1px 9px #061321}
.hud-top{top:16px;left:30px;right:370px}
.hud-bottom{left:30px;right:370px;bottom:18px;color:#c3d1df}
.agent-labels{right:366px;top:auto;bottom:70px;width:178px;gap:6px}
.agent-label{background:#0a1c2bbf;border:1px solid #b8d6e64a;color:#f3f7fb;backdrop-filter:blur(18px);box-shadow:0 8px 28px #0003}
.agent-label small{color:#b4c9d8}
.agent-label em{color:#9db5c9}
.core-caption{top:54%;left:43%;color:#f5f8fb;text-shadow:0 2px 18px #061321}
.core-caption small{color:#b8dff5}
.stage-foot{position:absolute;z-index:4;left:30px;bottom:18px;gap:20px;padding:10px 14px;border:1px solid #b9d9ed30;border-radius:12px;background:#081a29a6;backdrop-filter:blur(14px);border-bottom:1px solid #b9d9ed30}
.foot-stat small{color:#b7cbd9}.foot-stat b{font-size:14px}.foot-tip{color:#d0dce7}
.team-strip{display:none}
.chat-panel{position:absolute;z-index:10;top:18px;right:18px;bottom:18px;width:330px;min-height:0;max-height:none;border-radius:15px;border:1px solid #b9d9ed48;background:linear-gradient(160deg,#0a1c2bdc,#081724e8);box-shadow:0 22px 70px #0005;backdrop-filter:blur(22px)}
.panel-head{padding:20px 18px 15px;background:#07172455}
.panel-head h2{font-size:19px}
.focus-card{margin:11px 11px 0;padding:10px;background:#ffffff0a}
.messages{padding:15px 13px 8px}
.message p{background:#ffffff0a;line-height:1.65}
.prompt-row{padding:9px 11px}
.prompt-row button{background:#ffffff0b;color:#d4e3f0;border-color:#9fc6e52d}
.composer{background:#0715219c;padding:11px}
.composer textarea{min-height:76px}
@media(max-width:900px){
 .space3d{height:auto;min-height:100vh;overflow:visible;padding-top:68px}
 .space-top{position:absolute}
 .space-layout{position:relative;inset:auto;display:flex;flex-direction:column;gap:0}
 .stage-column{position:relative;inset:auto;min-height:680px}
 .stage-head{top:18px;left:16px;right:16px;max-width:none}
 .stage-head h1{font-size:clamp(25px,6vw,40px);max-width:70%}
 .stage-head p{max-width:70%}
 .scene-actions{top:130px}
 .scene-shell{position:absolute;top:0;left:0;right:0;bottom:0;height:auto;min-height:680px}
 .hud-top{left:16px;right:16px;top:14px}
 .hud-bottom{left:16px;right:16px}
 .agent-labels{right:12px;bottom:58px;width:132px}
 .stage-foot{left:12px;bottom:12px;right:155px;gap:12px;flex-wrap:wrap}
 .foot-stat b{font-size:12px}
 .foot-tip{display:none}
 .chat-panel{position:relative;top:auto;right:auto;bottom:auto;width:auto;margin:0 12px 16px;min-height:580px;max-height:75vh}
}
@media(max-width:560px){
 .space-top{height:60px;padding:0 10px;gap:8px}
 .space-layout{margin-top:-8px}
 .stage-column{min-height:620px}
 .stage-head{top:16px}
 .stage-head h1{font-size:25px;max-width:100%}
 .stage-head p{font-size:10px;max-width:80%}
 .scene-actions{top:128px;right:0}
 .scene-actions button{padding:7px 8px;font-size:10px}
 .scene-shell{min-height:620px}
 .agent-labels{top:auto;bottom:66px;right:8px;width:116px}
 .agent-label{padding:6px}
 .core-caption{left:36%;top:57%}
 .stage-foot{left:9px;right:132px;bottom:9px;padding:8px;gap:8px}
 .foot-stat small{font-size:8px}
 .foot-stat b{font-size:11px}
 .hud-top span:last-child,.hud-bottom span:last-child{display:none}
 .chat-panel{margin:0 8px 10px}
}

</style>