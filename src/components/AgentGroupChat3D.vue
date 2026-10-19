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
 group.visible=false;scene.add(group);avatarMeshes.set(a.id,group)
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
 room.visible=false
 for(const a of agents)createAgent(a)
 raycaster=new THREE.Raycaster()
 const resize=()=>{if(!canvasHost.value||!renderer)return;const w=canvasHost.value.clientWidth,h=canvasHost.value.clientHeight;camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
 resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvasHost.value);resize()
 const pointerMove=e=>{if(pointerDown){const dx=e.clientX-pointerDown.x,dy=e.clientY-pointerDown.y;orbitAngle+=dx*.006;orbitTilt=Math.max(-.2,Math.min(.65,orbitTilt+dy*.003));parallaxTargetX=Math.max(-1,Math.min(1,parallaxTargetX+dx*.006));parallaxTargetY=Math.max(-1,Math.min(1,parallaxTargetY+dy*.006));pointerDown={...pointerDown,x:e.clientX,y:e.clientY};return}const rect=renderer.domElement.getBoundingClientRect();parallaxTargetX=((e.clientX-rect.left)/Math.max(rect.width,1)-.5)*2;parallaxTargetY=((e.clientY-rect.top)/Math.max(rect.height,1)-.5)*2;}
 const pointerUp=e=>{if(!pointerDown)return;const moved=Math.abs(e.clientX-pointerDown.startX)+Math.abs(e.clientY-pointerDown.startY);if(moved<8){const rect=renderer.domElement.getBoundingClientRect();const p=new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(p,camera);const hit=raycaster.intersectObjects(clickableMeshes,false)[0];if(hit){focusAgent.value=hit.object.userData.agentId;motion.value='wave';}}
 pointerDown=null}
 const down=e=>{pointerDown={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};renderer.domElement.setPointerCapture?.(e.pointerId)}
 renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerup',pointerUp)
 renderer.domElement.addEventListener('wheel',e=>{zoom.value=Math.max(.72,Math.min(1.45,zoom.value+(e.deltaY>0?-.06:.06)));targetZoom=zoom.value},{passive:true})
 const animate=()=>{raf=requestAnimationFrame(animate);const t=clock.getElapsedTime();parallaxX+=(parallaxTargetX-parallaxX)*.045;parallaxY+=(parallaxTargetY-parallaxY)*.045;if(sceneShell.value){sceneShell.value.style.backgroundPosition=`${50+parallaxX*7}% ${50+parallaxY*5}%`;sceneShell.value.style.backgroundSize=`${112+(zoom.value-1)*18}% auto`}centralCore.rotation.y=Math.sin(t*.25)*.025
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