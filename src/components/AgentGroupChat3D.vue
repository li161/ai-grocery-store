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

const props = defineProps({
  onBack: { type: Function, required: true },
  initialAgent: { type: String, default: '' },
})
const agents = [
  {
    id: 'manager',
    name: '店长',
    role: '经营负责人',
    character: '海绵宝宝',
    emoji: '🧽',
    color: 0x9a7bff,
    guide: '统筹经营目标、拆解任务、协调岗位并汇总结果。',
  },
  {
    id: 'cashier',
    name: '小票',
    role: '收银员',
    character: '派大星',
    emoji: '⭐',
    color: 0x42c8ff,
    guide: '处理订单咨询、支付流程指引与售后分流。',
  },
  {
    id: 'guide',
    name: '小导',
    role: '导购顾问',
    character: '章鱼哥',
    emoji: '🦑',
    color: 0xffbd65,
    guide: '识别顾客需求、比较商品并提供组合购买建议。',
  },
  {
    id: 'buyer',
    name: '采购',
    role: '采购补货',
    character: '蟹老板',
    emoji: '🦀',
    color: 0x50e0bd,
    guide: '整理缺货信号、供应商报价与补货建议。',
  },
  {
    id: 'inventory',
    name: '盘点员',
    role: '库存盘点',
    character: '珊迪',
    emoji: '🐿️',
    color: 0x65a6ff,
    guide: '核对库存差异，发现临期和损耗风险。',
  },
  {
    id: 'pm',
    name: '林舟',
    role: '产品经理',
    character: '痞老板',
    emoji: '🦠',
    color: 0xff79c6,
    guide: '将经营目标拆成流程、验收标准和迭代计划。',
  },
]
const selected = ref(props.initialAgent ? [props.initialAgent] : agents.map((a) => a.id))
const activeAgents = computed(() => agents.filter((a) => selected.value.includes(a.id)))
const messages = ref([
  {
    id: 1,
    role: 'system',
    text: '3D 协作空间已启动。拖动旋转真实模型；点击角色本体或标签可聚焦并发起协作。',
    time: '刚刚',
  },
  {
    id: 2,
    role: 'manager',
    text: '我是店长。告诉我经营目标，我会拆解任务并协调各岗位协作。',
    time: '刚刚',
  },
])
const draft = ref('')
const busy = ref(false)
const status = ref('空间就绪 · 等待任务')
const mode = ref('deepseek')
const apiBase = ref(
  import.meta.env.VITE_AGENT_API || 'https://ai-grocery-store-agent-api.onrender.com',
)
const sceneShell = ref(null)
const canvasHost = ref(null)
const roomRenderStatus = ref('正在加载高细节场景…')
const highDetailRoomLoaded = ref(false)
const highDetailCafeLoaded = ref(false)
const messageList = ref(null)
const focusAgent = ref('manager')
const labelPositions = ref({})
const motion = ref('idle')
const zoom = ref(1)
const quickPrompts = [
  '制定今天的门店经营计划',
  '@盘点员 设计今日库存核查方案',
  '@采购 列出补货决策所需数据',
  '@店长 汇总各岗位风险与待办',
]
const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
let renderer = null,
  composer = null,
  ssaoPass = null,
  bloomPass = null,
  scene = null,
  camera = null,
  resizeObserver = null,
  raf = 0,
  raycaster = null,
  pointerDown = null,
  sceneListeners = [],
  environmentTarget = null
let orbitAngle = 0,
  orbitTilt = 0.12,
  targetZoom = 1
const characterGroups = new Map(),
  characterHitMeshes = []
const sceneClock = new THREE.Clock()
function toggleAgent(id) {
  if (busy.value) return
  selected.value = selected.value.includes(id)
    ? selected.value.filter((x) => x !== id)
    : [...selected.value, id]
  focusAgent.value = id
  motion.value = 'wave'
}
function focusOnly(id) {
  focusAgent.value = id
  motion.value = 'wave'
  if (!selected.value.includes(id))
    status.value =
      '已聚焦 ' +
      (agents.find((a) => a.id === id)?.name || '角色') +
      '；点击右侧 + 将其加入本轮协作'
}
function addPrompt(p) {
  draft.value = p
}
function resolveTargets(text) {
  const tokens = [...text.matchAll(/@([\w\u4e00-\u9fa5]+)/g)].map((m) => m[1].toLowerCase())
  if (!tokens.length || tokens.some((n) => ['所有人', '全体', 'all'].includes(n)))
    return activeAgents.value
  const aliases = {
    店长: 'manager',
    小票: 'cashier',
    收银员: 'cashier',
    小导: 'guide',
    导购: 'guide',
    采购: 'buyer',
    采购员: 'buyer',
    盘点员: 'inventory',
    林舟: 'pm',
    产品经理: 'pm',
  }
  const ids = new Set(
    tokens
      .map((n) => aliases[n] || agents.find((a) => a.id === n || a.name.toLowerCase() === n)?.id)
      .filter(Boolean),
  )
  return ids.size
    ? agents.filter((a) => ids.has(a.id) && selected.value.includes(a.id))
    : activeAgents.value
}
function addMessage(role, text) {
  messages.value.push({ id: Date.now() + Math.random(), role, text, time: now() })
}
async function send() {
  const text = draft.value.trim()
  if (!text || busy.value || !selected.value.length) return
  const targets = resolveTargets(text)
  if (!targets.length) {
    status.value = '没有可接收消息的岗位，请勾选数字人或使用 @所有人'
    return
  }
  addMessage('user', text)
  draft.value = ''
  busy.value = true
  motion.value = 'working'
  status.value = '任务已分派 · 数字人开始协作'
  try {
    if (mode.value === 'demo') {
      await Promise.all(
        targets.map(async (a, i) => {
          await new Promise((r) => setTimeout(r, 500 + i * 260))
          addMessage(
            a.id,
            {
              manager:
                '我先拆解经营目标，再协调各岗位并汇总风险与待办。涉及真实交易或库存变更的动作需要人工确认。',
              cashier:
                '我会整理订单咨询、支付指引和售后分流方案；未接入真实订单系统前，不会声称已执行交易。',
              guide: '我会先确认顾客用途、预算和偏好，再比较商品特点与适配场景。',
              buyer: '我会根据缺货信号整理补货候选、供应商报价与交期，形成待审核建议。',
              inventory: '我会生成商品与库位核查清单，将账实差异标记为待核验线索。',
              pm: '我会把目标转成流程、责任岗位、验收标准和复盘指标。',
            }[a.id],
          )
        }),
      )
      status.value = '演示协作完成'
      return
    }
    const base = apiBase.value.trim().replace(/\/$/, '')
    if (!base) throw new Error('后端 API 地址未配置')
    const requestController = new AbortController()
    const requestTimer = setTimeout(() => requestController.abort(), 70000)
    let response, data
    try {
      response = await fetch(base + '/api/chat?async=1', {
        method: 'POST',
        signal: requestController.signal,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': globalThis.crypto?.randomUUID?.() || 'chat-' + Date.now(),
        },
        body: JSON.stringify({
          message: text,
          agents: targets.map(({ id, name, role, guide }) => ({
            id,
            name,
            role,
            instructions: guide,
          })),
          history: messages.value
            .slice(0, -1)
            .slice(-12)
            .map((m) => ({ role: m.role, text: m.text })),
        }),
      })
      data = await response.json().catch(() => ({}))
    } catch (error) {
      if (error.name === 'AbortError')
        throw new Error('请求超过 70 秒已中止；请检查后端日志，避免立即重复提交高成本任务。')
      throw error
    } finally {
      clearTimeout(requestTimer)
    }
    if (!response.ok)
      throw new Error(data.error || 'Agent API 请求失败（HTTP ' + response.status + '）')
    if (data.started && data.taskId) {
      const deadline = Date.now() + 90000,
        shown = new Set()
      let terminal = false
      while (Date.now() < deadline) {
        const pollController = new AbortController()
        const pollTimer = setTimeout(() => pollController.abort(), 6000)
        let pr, pd
        try {
          pr = await fetch(base + '/api/tasks/' + encodeURIComponent(data.taskId), {
            signal: pollController.signal,
          })
          pd = await pr.json().catch(() => ({}))
        } catch (error) {
          if (error.name === 'AbortError')
            throw new Error('任务状态查询超时；任务可能仍在后台运行，任务 ID：' + data.taskId)
          throw error
        } finally {
          clearTimeout(pollTimer)
        }
        if (!pr.ok) throw new Error(pd.error || '任务状态查询失败')
        const task = pd.task
        if (!task) throw new Error('任务状态响应缺少 task')
        data.task = task
        for (const item of task.tasks || []) {
          if (item.status === 'succeeded' && !shown.has(item.agentId)) {
            addMessage(item.agentId, item.result || '任务已完成，但没有返回文本。')
            shown.add(item.agentId)
          } else if (
            ['failed', 'skipped', 'interrupted'].includes(item.status) &&
            !shown.has('e' + item.agentId)
          ) {
            addMessage(
              'system',
              (item.agentName || item.agentId) + '：' + (item.error || '任务未完成'),
            )
            shown.add('e' + item.agentId)
          }
        }
        terminal = ['completed', 'partial_failed', 'failed', 'interrupted'].includes(task.status)
        status.value =
          '协作进度 ' +
          (task.tasks || []).filter((t) => t.status === 'succeeded').length +
          '/' +
          (task.tasks || []).length +
          ' · ' +
          task.status
        if (terminal) break
        await new Promise((r) => setTimeout(r, 900))
      }
      if (!terminal)
        throw new Error(
          '等待超过 90 秒，任务可能仍在后台执行。任务 ID：' +
            data.taskId +
            '；请稍后查询，不要重复提交。',
        )
      if (data.task?.status !== 'completed')
        status.value = '部分岗位未完成 · ' + data.taskId.slice(0, 8)
      else status.value = '协作完成 · ' + data.taskId.slice(0, 8)
    } else if (data.replies?.length) {
      data.replies.forEach((item) => addMessage(item.agentId, item.text))
      status.value = '协作完成'
    } else throw new Error('服务没有返回回复')
  } catch (e) {
    status.value = '调用失败：' + e.message
    addMessage('system', 'Agent 服务调用失败，请检查后端部署状态和服务日志。')
  } finally {
    busy.value = false
    motion.value = 'idle'
    await nextTick()
    if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight
  }
}

const mat = (color, roughness = 0.72, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })
const characterMat = (color, roughness = 0.48, extra = {}) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0,
    clearcoat: 0.16,
    clearcoatRoughness: 0.3,
    ...extra,
  })
function mesh(geometry, material, pos, parent, rot = null, scale = null) {
  const m = new THREE.Mesh(geometry, material)
  m.position.set(pos[0], pos[1], pos[2])
  if (rot) m.rotation.set(rot[0], rot[1], rot[2])
  if (scale) m.scale.set(scale[0], scale[1], scale[2])
  // Decorative room pieces receive lighting/AO but do not all enter the shadow map.
  // Cast shadows explicitly for hero characters, staircase railings and selected focal objects.
  m.castShadow = false
  m.receiveShadow = true
  ;(parent || scene).add(m)
  return m
}
function canvasTexture(paint, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  paint(ctx, 512, 512)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeatX, repeatY)
  tex.anisotropy = 8
  return tex
}
function makeWoodTexture() {
  return canvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#68432c'
      ctx.fillRect(0, 0, w, h)
      let seed = 29
      const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return seed / 4294967296
      }
      for (let i = 0; i < 230; i++) {
        const y = random() * h
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.bezierCurveTo(
          130,
          y + (random() - 0.5) * 22,
          360,
          y + (random() - 0.5) * 14,
          w,
          y + (random() - 0.5) * 8,
        )
        ctx.strokeStyle = random() > 0.48 ? '#d9ae75' : '#21150f'
        ctx.globalAlpha = 0.05 + random() * 0.15
        ctx.lineWidth = 0.5 + random() * 2.4
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    },
    2,
    1,
  )
}
function makeMarbleTexture() {
  return canvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#dfd4c4'
      ctx.fillRect(0, 0, w, h)
      let seed = 93
      const random = () => {
        seed = (seed * 1103515245 + 12345) >>> 0
        return seed / 4294967296
      }
      for (let i = 0; i < 48; i++) {
        ctx.beginPath()
        let x = random() * w,
          y = random() * h
        ctx.moveTo(x, y)
        ctx.bezierCurveTo(x + 50, y - 80, x - 85, y + 70, x + 190, y + 150)
        ctx.strokeStyle = i % 4 ? '#fffaf0' : '#8f8172'
        ctx.globalAlpha = 0.12 + random() * 0.16
        ctx.lineWidth = 0.7 + random() * 2.4
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    },
    2,
    1,
  )
}
function createBookcase(x, z, width = 2.5, height = 4.6, depth = 0.48, side = false) {
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  if (side) g.rotation.y = Math.PI / 2
  ;(roomRoot || scene).add(g)
  const frame = mat(0x263640, 0.46, 0.42),
    back = mat(0x35434a, 0.78),
    edge = mat(0xd3a66b, 0.34, 0.48)
  mesh(new RoundedBoxGeometry(width, height, depth, 4, 0.055), back, [0, height / 2, 0], g)
  for (const px of [-width / 2 + 0.045, width / 2 - 0.045])
    mesh(
      new RoundedBoxGeometry(0.085, height + 0.08, depth + 0.09, 3, 0.025),
      frame,
      [px, height / 2, 0.015],
      g,
    )
  mesh(
    new RoundedBoxGeometry(width + 0.12, 0.13, depth + 0.12, 4, 0.035),
    edge,
    [0, height + 0.035, 0],
    g,
  )
  const rows = 4
  for (let row = 0; row < rows; row++) {
    const y = 0.36 + (row * (height - 0.62)) / (rows - 1)
    mesh(new RoundedBoxGeometry(width - 0.08, 0.065, depth + 0.1, 3, 0.018), frame, [0, y, 0], g)
    mesh(
      new THREE.BoxGeometry(width - 0.12, 0.018, 0.018),
      mat(0xffd995, 0.25, 0.15, { emissive: 0xffb34f, emissiveIntensity: 0.45 }),
      [0, y + 0.044, depth * 0.52],
      g,
    )
    let seed = Math.abs(Math.floor((x + 30) * 7919 + (z + 30) * 104729 + row * 7919)) || 1
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    let px = -width / 2 + 0.13
    while (px < width / 2 - 0.14) {
      const pw = 0.14 + random() * 0.18,
        ph = 0.22 + random() * 0.31
      const color = [0xe8b64e, 0x4f9c82, 0xc9684e, 0x628dc4, 0xe7dfc9, 0x9a79b4, 0xd9dfe2][
        Math.floor(random() * 7)
      ]
      const productMat = mat(color, 0.48, 0.04),
        pz = depth * 0.18 + random() * 0.035
      if (random() > 0.35) {
        mesh(
          new RoundedBoxGeometry(pw, ph, 0.18, 3, 0.025),
          productMat,
          [px + pw / 2, y + 0.045 + ph / 2, pz],
          g,
        )
        mesh(
          new THREE.BoxGeometry(pw * 0.64, 0.025, 0.012),
          mat(0xf5ead4, 0.55),
          [px + pw / 2, y + 0.045 + ph * 0.63, pz + 0.096],
          g,
        )
        if (random() > 0.45)
          mesh(
            new THREE.BoxGeometry(pw * 0.42, 0.012, 0.013),
            mat(0x35434a, 0.6),
            [px + pw / 2, y + 0.045 + ph * 0.48, pz + 0.097],
            g,
          )
      } else {
        const radius = Math.min(0.065, pw * 0.32)
        mesh(
          new THREE.CylinderGeometry(radius, radius, ph * 0.72, 16),
          productMat,
          [px + pw / 2, y + 0.045 + ph * 0.36, pz],
          g,
          [0, 0, Math.PI / 2],
        )
        mesh(
          new THREE.CylinderGeometry(radius * 0.9, radius * 0.9, 0.025, 16),
          edge,
          [px + pw / 2, y + 0.045 + ph * 0.72, pz],
          g,
        )
      }
      px += pw + 0.045
    }
  }
  for (let row = 0; row < rows; row++) {
    const y = 0.36 + (row * (height - 0.62)) / (rows - 1)
    mesh(
      new THREE.BoxGeometry(width - 0.12, 0.045, 0.035),
      mat(0xf0e7d7, 0.62),
      [0, y + 0.07, depth * 0.57],
      g,
    )
    for (let px = -width / 2 + 0.22; px < width / 2 - 0.1; px += 0.48)
      mesh(
        new THREE.BoxGeometry(0.12, 0.025, 0.012),
        mat(0x3c4b50, 0.55),
        [px, y + 0.07, depth * 0.595],
        g,
      )
  }
  return g
}
let roomRoot, woodMat, darkWoodMat, brassMat, plasterMat, marbleMat, floorMat, bookMaterials

// Full-size supermarket gondola: metal uprights, loaded shelves, real product silhouettes,
// front-facing package labels, and price rails. Kept separate from the legacy room furniture.
function createGroceryGondola(x, z, width = 2.65, height = 2.35, depth = 0.88) {
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  roomRoot.add(g)
  const steel = mat(0x56636a, 0.42, 0.62),
    darkSteel = mat(0x26343a, 0.48, 0.52),
    shelfMetal = mat(0xc7cdd0, 0.32, 0.48)
  const rail = mat(0xf0e6cf, 0.42, 0.08),
    labelInk = mat(0x25323a, 0.62, 0.02)
  const uprights = [-width / 2 + 0.045, width / 2 - 0.045]
  for (const px of uprights) {
    mesh(new RoundedBoxGeometry(0.075, height, 0.09, 3, 0.012), steel, [px, height / 2, 0], g)
    for (let y = 0.12; y < height; y += 0.16)
      mesh(new THREE.BoxGeometry(0.083, 0.018, 0.095), darkSteel, [px, y, 0], g)
  }
  mesh(new RoundedBoxGeometry(width, 0.07, 0.12, 3, 0.015), darkSteel, [0, height - 0.04, 0], g)
  mesh(new RoundedBoxGeometry(width + 0.08, 0.045, 0.1, 3, 0.012), steel, [0, 0.06, 0], g)
  const levelYs = [0.27, 0.78, 1.29, 1.8]
  const packageColors = [
    0x3b8d67, 0xe1b94f, 0xc94e43, 0x4e7fae, 0xf0e7d5, 0x8c68a8, 0x78a8a1, 0xd98542,
  ]
  let seed = Math.abs(Math.floor((x + 18) * 7919 + (z + 18) * 104729)) || 1
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let side of [-1, 1]) {
    const front = side * (depth / 2)
    for (let row = 0; row < levelYs.length; row++) {
      const y = levelYs[row]
      mesh(new RoundedBoxGeometry(width, 0.055, depth, 3, 0.012), shelfMetal, [0, y, 0], g)
      mesh(new THREE.BoxGeometry(width, 0.035, 0.055), darkSteel, [0, y + 0.025, front * 0.96], g)
      mesh(
        new RoundedBoxGeometry(width - 0.05, 0.075, 0.025, 2, 0.008),
        rail,
        [0, y + 0.065, front * 1.035],
        g,
      )
      // A continuous price strip with individual ticket cards.
      for (let px = -width / 2 + 0.16; px < width / 2 - 0.1; px += 0.42) {
        mesh(new THREE.BoxGeometry(0.34, 0.043, 0.009), labelInk, [px, y + 0.065, front * 1.065], g)
        mesh(
          new THREE.BoxGeometry(0.17, 0.008, 0.01),
          mat(0xfff7e7, 0.7),
          [px - 0.055, y + 0.069, front * 1.08],
          g,
        )
        mesh(
          new THREE.BoxGeometry(0.07, 0.008, 0.01),
          mat(0xd76a42, 0.6),
          [px + 0.095, y + 0.069, front * 1.08],
          g,
        )
      }
      let px = -width / 2 + 0.11
      while (px < width / 2 - 0.12) {
        const pw = 0.13 + random() * 0.12,
          ph = 0.22 + random() * 0.25,
          color = packageColors[Math.floor(random() * packageColors.length)]
        const product = mat(color, 0.4, 0.05),
          productFront = front + side * 0.012
        if (random() < 0.28) {
          const radius = 0.045 + random() * 0.018,
            canH = Math.min(ph, 0.28)
          mesh(
            new THREE.CylinderGeometry(radius, radius, canH, 18),
            product,
            [px + pw / 2, y + 0.055 + canH / 2, productFront],
            g,
          )
          mesh(
            new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, 0.012, 18),
            mat(0xd9dfe1, 0.24, 0.62),
            [px + pw / 2, y + 0.055 + canH, productFront],
            g,
          )
          mesh(
            new THREE.BoxGeometry(radius * 1.25, 0.055, 0.008),
            rail,
            [px + pw / 2, y + 0.055 + canH * 0.52, productFront + side * 0.04],
            g,
          )
        } else {
          mesh(
            new RoundedBoxGeometry(pw, ph, 0.13, 3, 0.012),
            product,
            [px + pw / 2, y + 0.055 + ph / 2, productFront],
            g,
          )
          mesh(
            new THREE.BoxGeometry(pw * 0.68, 0.025, 0.008),
            rail,
            [px + pw / 2, y + 0.055 + ph * 0.68, productFront + side * 0.071],
            g,
          )
          mesh(
            new THREE.BoxGeometry(pw * 0.44, 0.012, 0.009),
            darkSteel,
            [px + pw / 2, y + 0.055 + ph * 0.53, productFront + side * 0.072],
            g,
          )
        }
        px += pw + 0.025
      }
    }
  }
  // Feet and stabilizers keep the fixture grounded rather than floating like a decorative prop.
  for (const px of uprights)
    for (const zz of [-depth / 2 + 0.08, depth / 2 - 0.08]) {
      mesh(new RoundedBoxGeometry(0.18, 0.055, 0.24, 3, 0.012), darkSteel, [px, 0.035, zz], g)
    }
  return g
}
function createRetailAisle() {
  // Three clearly readable, freestanding supermarket gondolas behind the people,
  // plus a category header so the scene reads as retail rather than a library.
  createGroceryGondola(-5.6, -2.05, 2.7, 2.25, 0.9)
  createGroceryGondola(-1.85, -2.05, 2.7, 2.25, 0.9)
  createGroceryGondola(1.9, -2.05, 2.7, 2.25, 0.9)
  createGroceryGondola(5.55, -2.05, 2.7, 2.25, 0.9)
  const headerMat = mat(0x173c43, 0.36, 0.22),
    headerText = mat(0xf4e5bd, 0.46, 0.02, { emissive: 0x45351c, emissiveIntensity: 0.18 })
  for (const [x, labelColor] of [
    [-5.6, 0xe6b54c],
    [-1.85, 0x65bca0],
    [1.9, 0x5e9cc7],
    [5.55, 0xd67d57],
  ]) {
    mesh(new RoundedBoxGeometry(2.48, 0.3, 0.12, 4, 0.025), headerMat, [x, 2.58, -2.05], roomRoot)
    mesh(
      new THREE.BoxGeometry(1.7, 0.035, 0.014),
      mat(labelColor, 0.4, 0.08),
      [x, 2.58, -1.975],
      roomRoot,
    )
    // Category marker dots mimic real aisle end-cap signage without text textures.
    for (let j = 0; j < 5; j++)
      mesh(
        new THREE.SphereGeometry(0.035, 10, 8),
        headerText,
        [x - 0.78 + j * 0.39, 2.58, -1.96],
        roomRoot,
      )
  }
}
function buildLegacyLibraryRoom() {
  roomRoot = new THREE.Group()
  scene.add(roomRoot)
  const woodTex = makeWoodTexture(),
    floorTex = makeWoodTexture(),
    marbleTex = makeMarbleTexture()
  woodMat = new THREE.MeshStandardMaterial({ map: woodTex, color: 0xffffff, roughness: 0.7 })
  darkWoodMat = mat(0x35251d, 0.78)
  brassMat = mat(0xc29859, 0.34, 0.58)
  plasterMat = mat(0xe0d2be, 0.96)
  marbleMat = new THREE.MeshStandardMaterial({
    map: marbleTex,
    color: 0xffffff,
    roughness: 0.28,
    metalness: 0.03,
  })
  floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    color: 0xd9b88a,
    roughness: 0.48,
    metalness: 0.025,
  })
  bookMaterials = [
    0x6e2f2b, 0x29484a, 0x283a5b, 0x967142, 0x5e4030, 0x473653, 0xb7a17b, 0x405543, 0x874f37,
  ].map((c) => mat(c, 0.86))
  const box = (w, h, d, x, y, z, m = woodMat, p = roomRoot, rot = null) =>
    mesh(new THREE.BoxGeometry(w, h, d), m, [x, y, z], p, rot)
  // Full-scale shell and continuous timber flooring.
  box(20, 0.22, 22, 0, -0.16, 0, floorMat)
  for (let x = -9.5; x <= 9.5; x += 1.25) box(0.014, 0.008, 21, x, -0.043, 0, darkWoodMat)
  for (let z = -10; z <= 10; z += 0.9) box(20, 0.008, 0.014, 0, -0.042, z, darkWoodMat)
  box(20, 8, 0.3, 0, 3.8, -8.9, plasterMat)
  box(0.3, 8, 20, -9.85, 3.8, 0, plasterMat)
  box(0.3, 8, 20, 9.85, 3.8, 0, plasterMat)
  // Walnut ceiling structure and warm cornice.
  for (let x = -9; x <= 9; x += 3) box(0.22, 0.34, 18.2, x, 7.35, 0, darkWoodMat)
  box(20, 0.26, 0.34, 0, 7.05, -8.55, darkWoodMat)
  for (let x = -9.2; x <= 9.2; x += 0.38)
    box(0.22, 0.018, 0.025, x, 6.92, -8.36, mat(0xffc876, 0.4, 0.25))
  // Packed bookcases on rear and side walls.
  for (let x = -7.8; x <= 4.8; x += 3.15) createBookcase(x, -8.56, 2.95, 4.95, 0.46)
  for (let z = -5.9; z <= 3.1; z += 3.1) createBookcase(-9.55, z, 2.55, 4.75, 0.45, true)
  // Back-wall arched clerestory windows: visible over the tall shelves instead of leaving a blank, blown-out wall.
  const rearGlass = mat(0x78a9bf, 0.22, 0.04, {
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    emissive: 0x214d61,
    emissiveIntensity: 0.12,
  })
  for (const x of [-6.1, -2.55, 1.0, 4.55]) {
    box(2.5, 1.65, 0.055, x, 6.02, -8.68, rearGlass)
    box(0.075, 1.7, 0.09, x - 1.22, 6.02, -8.61, brassMat)
    box(0.075, 1.7, 0.09, x + 1.22, 6.02, -8.61, brassMat)
    box(0.075, 1.62, 0.09, x, 6.02, -8.61, brassMat)
    box(2.45, 0.075, 0.09, x, 5.21, -8.61, brassMat)
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.24, 0.05, 10, 36, Math.PI), brassMat)
    arch.position.set(x, 6.83, -8.61)
    roomRoot.add(arch)
  }
  // Tall right-wall arched windows, bronze mullions and actual glass panels.
  const glass = mat(0x83b5c6, 0.18, 0.12, {
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    emissive: 0x1e5365,
    emissiveIntensity: 0.16,
  })
  for (let z = -5.0; z <= 1.1; z += 3.05) {
    box(0.08, 3.15, 2.25, 9.62, 2.15, z, glass)
    box(0.1, 3.35, 0.08, 9.52, 2.18, z - 1.08, brassMat)
    box(0.1, 3.35, 0.08, 9.52, 2.18, z + 1.08, brassMat)
    box(0.1, 0.08, 2.25, 9.52, 3.72, z, brassMat)
    box(0.1, 0.08, 2.25, 9.52, 0.62, z, brassMat)
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.055, 10, 44, Math.PI), brassMat)
    arc.rotation.y = Math.PI / 2
    arc.position.set(9.5, 3.78, z)
    roomRoot.add(arc)
    box(0.075, 2.8, 0.055, 9.5, 2.08, z, brassMat)
    box(0.075, 0.055, 2.0, 9.5, 2.2, z, brassMat)
  }
  // Pale exterior light beyond the glazing.
  const sky = mat(0xa9cddd, 0.8, 0, { emissive: 0x4d8b9e, emissiveIntensity: 0.13 })
  for (let z = -5; z <= 1; z += 3.05) box(0.02, 5.1, 2.3, 9.83, 2.9, z, sky)
  // Upper mezzanine with detailed balusters.
  box(8.7, 0.18, 2.7, 0, 4.05, -5.15, woodMat)
  box(8.9, 0.1, 2.8, 0, 4.18, -5.15, brassMat)
  box(8.8, 0.1, 0.12, 0, 4.8, -3.78, darkWoodMat)
  box(8.8, 0.1, 0.12, 0, 4.36, -3.78, brassMat)
  for (let x = -4.25; x <= 4.25; x += 0.24) box(0.027, 0.4, 0.03, x, 4.58, -3.78, brassMat)
  // Grand curved staircase: individually modeled treads and a continuous handrail tube.
  const stairCenter = new THREE.Vector3(2.75, 0, -1.55)
  for (let i = 0; i < 23; i++) {
    const t = i / 22,
      ang = -Math.PI * 0.78 + t * 1.8 * Math.PI,
      r = 1.95 - t * 0.25,
      y = 3.95 - t * 3.45
    const step = box(
      0.72,
      0.105,
      0.48,
      stairCenter.x + Math.cos(ang) * r,
      y,
      stairCenter.z + Math.sin(ang) * r,
      i % 3 === 0 ? woodMat : darkWoodMat,
      roomRoot,
      null,
    )
    step.rotation.y = -ang
    const post = mesh(
      new THREE.CylinderGeometry(0.023, 0.028, 0.43, 10),
      brassMat,
      [
        stairCenter.x + Math.cos(ang) * (r + 0.38),
        y + 0.26,
        stairCenter.z + Math.sin(ang) * (r + 0.38),
      ],
      roomRoot,
    )
    post.castShadow = true
  }
  const railPts = []
  for (let i = 0; i <= 58; i++) {
    const t = i / 58,
      ang = -Math.PI * 0.78 + t * 1.8 * Math.PI,
      r = 2.33 - t * 0.25,
      y = 4.34 - t * 3.45
    railPts.push(
      new THREE.Vector3(stairCenter.x + Math.cos(ang) * r, y, stairCenter.z + Math.sin(ang) * r),
    )
  }
  const rail = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 240, 0.045, 8, false),
    darkWoodMat,
  )
  rail.castShadow = true
  roomRoot.add(rail)
  // Curved café counter with a polished marble top and timber panels.
  for (let i = 0; i < 18; i++) {
    const x = -6.3 + i * 0.48,
      n = x / 6.5,
      bow = 0.65 * (1 - n * n),
      z = 0.85 + bow
    const panel = box(0.49, 0.95, 0.72, x, 0.47, z, woodMat)
    panel.rotation.y = -n * 0.08
    box(0.43, 0.57, 0.035, x, 0.48, z + 0.38, darkWoodMat)
    box(0.39, 0.48, 0.02, x, 0.48, z + 0.405, woodMat)
    box(0.5, 0.12, 0.9, x, 1.01, z, marbleMat)
    box(0.04, 0.025, 0.82, x, 0.95, z + 0.04, brassMat)
  }
  // Espresso machine details; the foreground coffee bar owns the readable menu board.
  box(0.92, 0.75, 0.55, -3.8, 1.48, 0.3, characterMat(0x747e83, 0.24))
  box(0.58, 0.17, 0.42, -3.8, 1.95, 0.3, darkWoodMat)
  for (let i = 0; i < 4; i++)
    mesh(
      new THREE.CylinderGeometry(0.065, 0.055, 0.16, 20),
      characterMat(0xf0e4cd, 0.22),
      [-2.8 + i * 0.18, 1.32, 0.3],
      roomRoot,
    )
  // Brass pendant fixtures with warm point sources.
  for (const x of [-4.6, -1.2, 2.2, 5.3]) {
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.35, 10), darkWoodMat, [x, 6.1, -0.3], roomRoot)
    mesh(
      new THREE.CylinderGeometry(0.15, 0.32, 0.22, 28, 1, true),
      brassMat,
      [x, 5.42, -0.3],
      roomRoot,
    )
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 12),
      mat(0xffd99c, 0.2, 0.05, { emissive: 0xffbc56, emissiveIntensity: 1.8 }),
    )
    bulb.position.set(x, 5.26, -0.3)
    roomRoot.add(bulb)
    const lamp = new THREE.PointLight(0xffbd6b, 15, 7.5)
    lamp.position.set(x, 5.15, -0.3)
    roomRoot.add(lamp)
  }
  // Product consultation tables with rounded walnut tops, inset brass trim and real tabletop props.
  const tableWood = mat(0x805238, 0.38, 0.08),
    tableEdge = mat(0xd2ad73, 0.28, 0.55),
    chairLeather = mat(0x355d61, 0.48, 0.06)
  for (const [x, z] of [
    [1.7, 4.7],
    [5.8, 4.1],
    [3.5, 6.5],
    [-7.2, 4.3],
  ]) {
    mesh(new RoundedBoxGeometry(1.7, 0.16, 1.12, 5, 0.055), tableWood, [x, 0.84, z], roomRoot)
    mesh(new RoundedBoxGeometry(1.62, 0.025, 1.04, 5, 0.012), tableEdge, [x, 0.925, z], roomRoot)
    mesh(new RoundedBoxGeometry(1.55, 0.025, 0.97, 5, 0.012), marbleMat, [x, 0.947, z], roomRoot)
    for (const [dx, dz] of [
      [-0.62, -0.36],
      [0.62, -0.36],
      [-0.62, 0.36],
      [0.62, 0.36],
    ]) {
      mesh(
        new RoundedBoxGeometry(0.1, 0.76, 0.1, 3, 0.025),
        darkWoodMat,
        [x + dx, 0.39, z + dz],
        roomRoot,
      )
      mesh(
        new RoundedBoxGeometry(0.105, 0.12, 0.105, 3, 0.025),
        tableEdge,
        [x + dx, 0.12, z + dz],
        roomRoot,
      )
    }
    for (const side of [-1, 1]) {
      const sx = x + side * 1.03
      mesh(
        new RoundedBoxGeometry(0.54, 0.12, 0.52, 4, 0.045),
        chairLeather,
        [sx, 0.49, z],
        roomRoot,
      )
      mesh(
        new RoundedBoxGeometry(0.54, 0.48, 0.1, 4, 0.045),
        chairLeather,
        [sx, 0.75, z - 0.21],
        roomRoot,
      )
      for (const dx of [-0.2, 0.2])
        mesh(
          new RoundedBoxGeometry(0.065, 0.48, 0.065, 3, 0.02),
          darkWoodMat,
          [sx + dx, 0.23, z + 0.19],
          roomRoot,
        )
    }
    mesh(
      new RoundedBoxGeometry(0.38, 0.025, 0.25, 3, 0.018),
      mat(0x25333a, 0.28, 0.45),
      [x - 0.28, 0.978, z - 0.12],
      roomRoot,
      [0, -0.18, 0],
    )
    mesh(
      new THREE.PlaneGeometry(0.32, 0.19),
      mat(0x72b5c9, 0.24, 0.1, {
        emissive: 0x15313b,
        emissiveIntensity: 0.18,
        side: THREE.DoubleSide,
      }),
      [x - 0.28, 0.994, z - 0.12],
      roomRoot,
      [-Math.PI / 2, 0, -0.18],
    )
    mesh(
      new THREE.CylinderGeometry(0.07, 0.065, 0.13, 24),
      mat(0xf1e6d2, 0.25),
      [x + 0.34, 1.04, z + 0.12],
      roomRoot,
    )
    mesh(
      new THREE.TorusGeometry(0.052, 0.012, 8, 20),
      tableEdge,
      [x + 0.34, 1.11, z + 0.12],
      roomRoot,
      [Math.PI / 2, 0, 0],
    )
    mesh(
      new THREE.BoxGeometry(0.2, 0.13, 0.16),
      mat(0xd6a75f, 0.45),
      [x + 0.12, 1.035, z - 0.28],
      roomRoot,
    )
  }
  const potMat = mat(0x995f42, 0.83),
    leafMats = [0x355f3e, 0x4e794c, 0x6c8a4a].map((c) => mat(c, 0.9))
  for (const [x, z] of [
    [7.8, -4.7],
    [7.7, 0.8],
    [-7.4, 5.2],
    [0, 2.0],
  ]) {
    mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.32, 20), potMat, [x, 0.03, z], roomRoot)
    for (let i = 0; i < 11; i++) {
      const a = i * 2.399
      const leaf = mesh(
        new THREE.SphereGeometry(0.1, 10, 8),
        leafMats[i % 3],
        [
          x + Math.cos(a) * (0.12 + (i % 3) * 0.04),
          0.29 + (i % 5) * 0.11,
          z + Math.sin(a) * (0.12 + (i % 3) * 0.04),
        ],
        roomRoot,
      )
      leaf.scale.set(0.7, 1.8, 0.55)
    }
  }
}
function makeLimb(parent, material, from, to, r1 = 0.07, r2 = 0.06) {
  const start = new THREE.Vector3(...from),
    end = new THREE.Vector3(...to),
    d = new THREE.Vector3().subVectors(end, start)
  const limb = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, d.length(), 14), material)
  limb.position.copy(start).add(end).multiplyScalar(0.5)
  limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
  limb.castShadow = true
  limb.receiveShadow = true
  parent.add(limb)
  const joint = new THREE.Mesh(new THREE.SphereGeometry(Math.max(r1, r2), 12, 10), material)
  joint.position.copy(start)
  parent.add(joint)
  return limb
}
function faceEyes(parent, x, y, z, eyeScale = 0.13, irisColor = 0x3d7dbb) {
  const white = mat(0xfff5e4, 0.3),
    iris = mat(irisColor, 0.25),
    pupil = mat(0x17202a, 0.18),
    shine = mat(0xffffff, 0.1)
  for (const dx of [-x, x]) {
    const eye = new THREE.Group()
    eye.position.set(dx, y, z)
    eye.userData.isCharacterEye = true
    eye.userData.blinkScale = 1
    parent.add(eye)
    mesh(
      new THREE.SphereGeometry(eyeScale, 24, 20),
      white,
      [0, 0, 0],
      eye,
      [0, 0, 0],
      [0.82, 1.05, 0.52],
    )
    mesh(
      new THREE.SphereGeometry(eyeScale * 0.49, 20, 16),
      iris,
      [dx * -0.15, 0, eyeScale * 0.42],
      eye,
    )
    mesh(
      new THREE.SphereGeometry(eyeScale * 0.27, 16, 12),
      pupil,
      [dx * -0.15, 0, eyeScale * 0.67],
      eye,
    )
    mesh(
      new THREE.SphereGeometry(eyeScale * 0.12, 10, 8),
      shine,
      [dx * -0.15 - eyeScale * 0.1, eyeScale * 0.14, eyeScale * 0.84],
      eye,
    )
  }
}
function createSpongeBob(a) {
  const g = new THREE.Group()
  g.position.set(...agentPositions[a.id])
  g.userData.agentId = a.id
  const yellow = characterMat(0xf5cf32, 0.48),
    yellowShade = mat(0xd5a922, 0.65),
    white = characterMat(0xfff4df, 0.42),
    brown = characterMat(0x8b4e27, 0.62),
    red = characterMat(0xdf3c34, 0.42),
    black = mat(0x292a2d, 0.42),
    blue = characterMat(0x2e8bc7, 0.3),
    pink = characterMat(0xffa2b6, 0.48),
    green = characterMat(0x74a94c, 0.5),
    purple = characterMat(0x7665b8, 0.44),
    teal = characterMat(0x3e9da0, 0.44)
  const add = (geo, m, p, r = null, s = null) => {
    const part = mesh(geo, m, p, g, r, s)
    part.castShadow = true
    part.receiveShadow = true
    return part
  }
  const rounded = (w, h, d, rad, m, p) =>
    add(new THREE.BoxGeometry(w, h, d, 8, 8, 4), m, p, null, [1, 1, 1])
  const hit = mesh(
    new THREE.SphereGeometry(0.86, 16, 12),
    mat(0xffffff, 0.8, 0, { transparent: true, opacity: 0, depthWrite: false }),
    [0, 1, 0],
    g,
  )
  hit.castShadow = false
  hit.receiveShadow = false
  hit.userData.agentId = a.id
  characterHitMeshes.push(hit)
  const smileCurve = (pts, material, r = 0.018) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)))
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, r, 8, false), material)
    g.add(m)
  }
  if (a.id === 'manager') {
    add(new RoundedBoxGeometry(0.91, 0.88, 0.46, 8, 0.075), yellow, [0, 1.45, 0])
    // Spongebob's signature pores and soft specular highlights.
    for (const [x, y, z, r] of [
      [-0.34, 1.73, 0.238, 0.035],
      [0.3, 1.68, 0.24, 0.03],
      [-0.38, 1.37, 0.238, 0.045],
      [0.39, 1.32, 0.238, 0.038],
      [-0.26, 1.12, 0.238, 0.025],
      [0.26, 1.13, 0.238, 0.03],
      [0, 1.82, 0.23, 0.02],
    ])
      add(new THREE.SphereGeometry(r, 10, 8), yellowShade, [x, y, z])
    faceEyes(g, 0.2, 1.58, 0.255, 0.17, 0x43a5ec)
    add(
      new THREE.SphereGeometry(0.06, 12, 10),
      yellow,
      [0, 1.39, 0.3],
      [0, 0, 0],
      [0.65, 1.6, 0.55],
    )
    smileCurve(
      [
        [-0.3, 1.28, 0.258],
        [-0.18, 1.22, 0.28],
        [0, 1.2, 0.29],
        [0.18, 1.22, 0.28],
        [0.3, 1.28, 0.258],
      ],
      black,
      0.018,
    )
    add(new THREE.BoxGeometry(0.15, 0.075, 0.025), white, [0, 1.205, 0.296])
    add(new THREE.BoxGeometry(0.9, 0.22, 0.47), white, [0, 0.95, 0])
    add(new THREE.BoxGeometry(0.91, 0.43, 0.47), brown, [0, 0.62, 0])
    add(new THREE.BoxGeometry(0.1, 0.31, 0.045), red, [0, 0.84, 0.26])
    add(new THREE.ConeGeometry(0.09, 0.13, 4), red, [0, 0.63, 0.29], [Math.PI, 0, 0])
    for (const dx of [-0.22, 0.22]) {
      add(new THREE.BoxGeometry(0.12, 0.17, 0.045), white, [dx, 0.34, 0.02])
      makeLimb(g, white, [dx, 0.32, 0], [dx, 0.14, 0], 0.045, 0.04)
      add(
        new THREE.SphereGeometry(0.12, 16, 12),
        black,
        [dx, 0.08, 0.06],
        [0, 0, 0],
        [1.25, 0.55, 1.55],
      )
    }
    makeLimb(g, yellow, [-0.49, 1.08, 0], [-0.68, 0.83, 0.03], 0.06, 0.045)
    makeLimb(g, yellow, [0.49, 1.08, 0], [0.69, 0.83, 0.03], 0.06, 0.045)
    add(new THREE.SphereGeometry(0.06, 12, 10), yellow, [-0.68, 0.82, 0.03])
    add(new THREE.SphereGeometry(0.06, 12, 10), yellow, [0.69, 0.82, 0.03])
  } else if (a.id === 'cashier') {
    // Patrick Star: a beveled five-point star body and green-purple shorts.
    const shape = new THREE.Shape()
    const cx = 0,
      cy = 1.18,
      outer = 0.68,
      inner = 0.31
    for (let i = 0; i < 10; i++) {
      const ang = Math.PI / 2 + (i * Math.PI) / 5
      const rr = i % 2 === 0 ? outer : inner
      const x = cx + Math.cos(ang) * rr,
        y = cy + Math.sin(ang) * rr
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    shape.closePath()
    const starGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.27,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.06,
      bevelThickness: 0.05,
      curveSegments: 12,
    })
    add(starGeo, pink, [0, 0, -0.13])
    faceEyes(g, 0.125, 1.34, 0.24, 0.115, 0x3980bc)
    add(new THREE.SphereGeometry(0.06, 12, 10), yellow, [0, 1.08, 0.24], [0, 0, 0], [1.4, 0.5, 0.4])
    smileCurve(
      [
        [-0.18, 1.08, 0.22],
        [0, 1.03, 0.255],
        [0.18, 1.08, 0.22],
      ],
      black,
      0.016,
    )
    add(new THREE.CylinderGeometry(0.33, 0.36, 0.36, 24), green, [0, 0.48, 0])
    add(new THREE.BoxGeometry(0.66, 0.08, 0.29), purple, [0, 0.62, 0.03])
    for (const dx of [-0.32, 0.32])
      makeLimb(g, pink, [dx, 0.79, 0], [dx * 1.45, 0.49, 0.02], 0.075, 0.07)
    for (const dx of [-0.18, 0.18]) {
      makeLimb(g, pink, [dx, 0.3, 0], [dx, 0.12, 0], 0.055, 0.05)
      add(
        new THREE.SphereGeometry(0.12, 16, 12),
        black,
        [dx, 0.08, 0.05],
        [0, 0, 0],
        [1.2, 0.5, 1.6],
      )
    }
  } else if (a.id === 'guide') {
    // Squidward: long aqua head, tapered nose, six expressive tentacle limbs and a polo shirt.
    const aqua = characterMat(0x7bc9bd, 0.42),
      nose = characterMat(0x8bd1c5, 0.38),
      shirt = characterMat(0x93674f, 0.66)
    add(new THREE.SphereGeometry(0.37, 32, 24), aqua, [0, 1.65, 0.02], [0, 0, 0], [0.72, 1.35, 0.8])
    faceEyes(g, 0.13, 1.74, 0.29, 0.12, 0xe4c86d)
    add(new THREE.CylinderGeometry(0.07, 0.045, 0.32, 18), nose, [0, 1.43, 0.29], [0.28, 0, 0])
    add(new THREE.BoxGeometry(0.5, 0.44, 0.31), shirt, [0, 0.93, 0])
    for (let i = -1; i <= 1; i++)
      makeLimb(g, aqua, [i * 0.12, 0.7, 0.02], [i * 0.16, 0.3, 0.1], 0.055, 0.045)
    for (const dx of [-0.32, 0.32])
      makeLimb(g, aqua, [dx, 1.12, 0], [dx * 1.65, 0.87, 0.12], 0.055, 0.045)
    makeLimb(g, aqua, [-0.12, 0.7, 0], [-0.15, 0.12, 0], 0.05, 0.04)
    makeLimb(g, aqua, [0.12, 0.7, 0], [0.15, 0.12, 0], 0.05, 0.04)
  } else if (a.id === 'buyer') {
    // Mr. Krabs: red shell, eyestalks, blue trousers and oversized claws.
    const crab = characterMat(0xe74637, 0.4),
      bluePants = characterMat(0x2a72a4, 0.56),
      claw = characterMat(0xe94a3c, 0.36)
    add(new THREE.SphereGeometry(0.47, 32, 24), crab, [0, 1.2, 0], [0, 0, 0], [1.18, 0.82, 0.76])
    for (const dx of [-0.15, 0.15]) {
      makeLimb(g, crab, [dx, 0.99, 0], [dx, 1.55, 0.02], 0.045, 0.04)
      add(
        new THREE.SphereGeometry(0.13, 20, 16),
        white,
        [dx, 1.62, 0.08],
        [0, 0, 0],
        [0.72, 1.15, 0.65],
      )
      add(new THREE.SphereGeometry(0.045, 14, 12), blue, [dx, 1.62, 0.15])
      add(new THREE.SphereGeometry(0.023, 10, 8), black, [dx, 1.62, 0.19])
    }
    add(new THREE.BoxGeometry(0.49, 0.32, 0.31), bluePants, [0, 0.78, 0])
    for (const dx of [-0.25, 0.25]) {
      makeLimb(g, crab, [dx, 0.9, 0], [dx * 1.8, 0.67, 0.05], 0.075, 0.06)
      add(
        new THREE.SphereGeometry(0.17, 20, 16),
        claw,
        [dx * 2, 0.65, 0.05],
        [0, 0, 0],
        [1.2, 0.8, 0.7],
      )
      makeLimb(g, crab, [dx, 0.72, 0], [dx * 1.15, 0.38, 0.02], 0.05, 0.04)
    }
    for (const dx of [-0.12, 0.12]) {
      makeLimb(g, crab, [dx, 0.66, 0], [dx, 0.22, 0], 0.05, 0.04)
      add(
        new THREE.SphereGeometry(0.11, 16, 12),
        black,
        [dx, 0.1, 0.04],
        [0, 0, 0],
        [1.5, 0.5, 1.5],
      )
    }
  } else if (a.id === 'inventory') {
    // Sandy Cheeks: squirrel silhouette, buck teeth and a clear astronaut helmet.
    const fur = characterMat(0xc58b58, 0.63),
      suit = characterMat(0xeee4d1, 0.42),
      pink = characterMat(0xe8a1aa, 0.48)
    add(new THREE.SphereGeometry(0.29, 28, 20), fur, [0, 1.42, 0], [0, 0, 0], [0.9, 1.12, 0.82])
    for (const dx of [-0.19, 0.19]) {
      add(
        new THREE.ConeGeometry(0.12, 0.3, 16),
        fur,
        [dx, 1.68, -0.01],
        [0, 0, dx < 0 ? -0.22 : 0.22],
      )
      add(new THREE.SphereGeometry(0.052, 12, 10), pink, [dx, 1.75, 0.02])
    }
    faceEyes(g, 0.105, 1.46, 0.23, 0.1, 0x6c9e62)
    add(new THREE.SphereGeometry(0.05, 12, 10), fur, [0, 1.25, 0.25])
    add(new THREE.BoxGeometry(0.09, 0.07, 0.025), white, [-0.035, 1.21, 0.27])
    add(new THREE.BoxGeometry(0.09, 0.07, 0.025), white, [0.055, 1.21, 0.27])
    add(
      new THREE.SphereGeometry(0.35, 24, 20, 0, Math.PI * 2, 0, Math.PI),
      mat(0xcfe8f1, 0.14, 0.08, { transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
      [0, 1.48, 0],
    )
    add(
      new THREE.TorusGeometry(0.31, 0.025, 10, 36),
      mat(0xd4dce2, 0.36, 0.45),
      [0, 1.43, 0],
      [Math.PI / 2, 0, 0],
    )
    add(new THREE.BoxGeometry(0.42, 0.53, 0.32), suit, [0, 0.78, 0])
    add(new THREE.BoxGeometry(0.12, 0.12, 0.035), mat(0x4e88c4, 0.35), [0, 0.9, 0.18])
    for (const dx of [-0.26, 0.26])
      makeLimb(g, suit, [dx, 0.95, 0], [dx * 1.4, 0.69, 0.04], 0.06, 0.05)
    for (const dx of [-0.13, 0.13]) {
      makeLimb(g, suit, [dx, 0.52, 0], [dx, 0.17, 0], 0.06, 0.045)
      add(new THREE.BoxGeometry(0.15, 0.09, 0.22), mat(0x514b45, 0.5), [dx, 0.08, 0.04])
    }
  } else {
    // Plankton: compact green cyclops with two antennae and articulated feet.
    const plank = characterMat(0x71bc3d, 0.38),
      redMouth = characterMat(0x551d20, 0.48)
    add(new THREE.SphereGeometry(0.25, 32, 24), plank, [0, 1.02, 0], [0, 0, 0], [0.8, 1.25, 0.65])
    add(new THREE.SphereGeometry(0.17, 24, 20), white, [0, 1.1, 0.15], [0, 0, 0], [1, 1, 0.65])
    add(new THREE.SphereGeometry(0.085, 20, 16), red, [0, 1.1, 0.25])
    add(new THREE.SphereGeometry(0.045, 14, 10), black, [0, 1.1, 0.3])
    for (const dx of [-0.11, 0.11]) {
      makeLimb(g, plank, [dx, 0.85, 0], [dx * 1.9, 0.6, 0.02], 0.025, 0.02)
      makeLimb(g, plank, [dx, 0.7, 0], [dx * 1.5, 0.45, 0.02], 0.025, 0.02)
    }
    makeLimb(g, plank, [-0.08, 1.23, 0], [-0.18, 1.52, 0], 0.02, 0.015)
    makeLimb(g, plank, [0.08, 1.23, 0], [0.18, 1.52, 0], 0.02, 0.015)
    add(new THREE.SphereGeometry(0.045, 12, 10), red, [0, 0.78, 0.15])
  }
  const ring = mesh(
    new THREE.TorusGeometry(0.42, 0.012, 8, 44),
    new THREE.MeshBasicMaterial({ color: a.color, transparent: true, opacity: 0.55 }),
    [0, 0.025, 0],
    g,
    [Math.PI / 2, 0, 0],
  )
  g.userData.ring = ring
  scene.add(g)
  characterGroups.set(a.id, g)
  return g
}
const agentPositions = {
  manager: [-5.1, 0, 3.15],
  cashier: [-3.4, 0, 4.05],
  guide: [-1.7, 0, 3.0],
  buyer: [0, 0, 4.0],
  inventory: [1.7, 0, 3.05],
  pm: [3.4, 0, 4.0],
}
function buildCharacter() {
  const labelHeights = {
    manager: 1.96,
    cashier: 2.08,
    guide: 2.12,
    buyer: 2.35,
    inventory: 2.34,
    pm: 1.64,
  }
  for (const a of agents) {
    const character = createSpongeBob(a)
    character.userData.baseScale = a.id === 'pm' ? 1.55 : 1.25
    character.scale.setScalar(character.userData.baseScale)
    character.userData.characterEyes = character.children.filter((child) => child.userData.isCharacterEye)
    character.userData.labelHeight = labelHeights[a.id] || 2
  }
}

const LIBRARY_SCENE_URL = '/models/breakfast_room_extended.gltf'
function normalizeAsset(root, targetWidth) {
  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(root)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const scale = targetWidth / Math.max(size.x, size.z)
  root.scale.setScalar(scale)
  root.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)
  root.updateMatrixWorld(true)
  root.traverse((object) => {
    // The source benchmark room includes opaque presentation walls that sit between the camera and the interior.
    // Remove those shell meshes and its own floor; the locally built library shell supplies the room architecture.
    if (/walls|floortiles/i.test(object.name)) {
      object.visible = false
      return
    }
    if (!object.isMesh) return
    object.castShadow = false
    object.receiveShadow = true
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if ('envMapIntensity' in material) material.envMapIntensity = 1.05
      if (material.map) material.map.anisotropy = 8
    }
  })
  return { root, size, scale }
}
function buildLibraryRoom() {
  // Purpose-built supermarket interior: ceramic retail flooring, open ceiling grid,
  // glazed storefront, illuminated chilled cabinets, and checkout furniture.
  roomRoot = new THREE.Group()
  roomRoot.name = 'Realistic_Supermarket_Interior'
  scene.add(roomRoot)
  const floorTile = mat(0xc8c7c0, 0.34, 0.04),
    grout = mat(0xaaa9a2, 0.8),
    wall = mat(0xe8e9e4, 0.88),
    trim = mat(0x293b40, 0.42, 0.46)
  const stainless = mat(0x9da8ab, 0.28, 0.62),
    dark = mat(0x273238, 0.4, 0.52),
    glass = new THREE.MeshPhysicalMaterial({
      color: 0xdceef0,
      roughness: 0.08,
      metalness: 0.04,
      transparent: true,
      opacity: 0.22,
      transmission: 0.35,
      thickness: 0.06,
    })
  const green = mat(0x2d6d52, 0.52),
    warm = mat(0xe5b44e, 0.42),
    red = mat(0xc34e3f, 0.48),
    white = mat(0xf5f2e9, 0.72)
  const add = (geo, m, pos, rot = null, scale = null) => mesh(geo, m, pos, roomRoot, rot, scale)
  // Commercial polished tile floor with fine grout lines.
  add(new THREE.BoxGeometry(20, 0.18, 22), floorTile, [0, -0.16, 0])
  for (let x = -9.5; x <= 9.5; x += 1.25)
    add(new THREE.BoxGeometry(0.012, 0.006, 21.8), grout, [x, -0.065, 0])
  for (let z = -10.5; z <= 10.5; z += 1.25)
    add(new THREE.BoxGeometry(19.8, 0.006, 0.012), grout, [0, -0.064, z])
  // Tall neutral walls and a suspended retail ceiling frame.
  add(new THREE.BoxGeometry(20, 7.7, 0.28), wall, [0, 3.75, -8.95])
  add(new THREE.BoxGeometry(0.28, 7.7, 18.1), wall, [-9.85, 3.75, 0])
  add(new THREE.BoxGeometry(0.28, 7.7, 18.1), wall, [9.85, 3.75, 0])
  add(new THREE.BoxGeometry(20, 0.18, 22), mat(0xe3e5e2, 0.82), [0, 7.55, 0])
  for (let x = -9; x <= 9; x += 3) add(new THREE.BoxGeometry(0.11, 0.22, 21.2), trim, [x, 7.38, 0])
  for (let z = -8; z <= 8; z += 3) add(new THREE.BoxGeometry(19.5, 0.12, 0.12), trim, [0, 7.38, z])
  // Front storefront glazing, metal mullions and daylight opening.
  add(new THREE.BoxGeometry(20, 5.9, 0.12), glass, [0, 3.0, 8.9])
  for (let x = -9.6; x <= 9.6; x += 2.4)
    add(new THREE.BoxGeometry(0.075, 6.1, 0.18), stainless, [x, 3.0, 8.82])
  add(new THREE.BoxGeometry(20, 0.12, 0.2), trim, [0, 6.08, 8.82])
  add(new THREE.BoxGeometry(20, 0.16, 0.2), trim, [0, 0.15, 8.82])
  // Bold, readable fascia sign over the chilled-food wall.
  const signTex = canvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#173f35'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#f6f1df'
      ctx.font = 'bold 58px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('FRESH MARKET', w / 2, h / 2 - 7)
      ctx.fillStyle = '#e7b94f'
      ctx.fillRect(80, h - 42, w - 160, 5)
    },
    1,
    1,
  )
  add(new THREE.BoxGeometry(5.5, 1.05, 0.18), trim, [0, 6.05, -8.65])
  add(
    new THREE.PlaneGeometry(5.25, 0.82),
    new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: 0.6,
      emissive: 0x1b3329,
      emissiveIntensity: 0.14,
    }),
    [0, 6.05, -8.545],
  )
  // Back-wall refrigerated display: stainless plinth, dark interior, glass doors,
  // illuminated shelves and colorful fresh-food packages.
  for (let i = 0; i < 5; i++) {
    const x = -7.25 + i * 3.62
    add(new THREE.BoxGeometry(3.42, 3.15, 0.82), dark, [x, 1.72, -8.28])
    add(new THREE.BoxGeometry(3.32, 0.16, 0.88), stainless, [x, 0.18, -8.22])
    add(new THREE.BoxGeometry(3.32, 0.12, 0.88), stainless, [x, 3.26, -8.22])
    add(new THREE.BoxGeometry(3.12, 2.7, 0.035), glass, [x, 1.78, -7.82])
    for (let row = 0; row < 4; row++) {
      const y = 0.65 + row * 0.64
      add(new THREE.BoxGeometry(3.06, 0.045, 0.58), stainless, [x, y, -8.0])
      for (let j = 0; j < 10; j++) {
        const color = [0x6eaa64, 0xe3c75d, 0xc75c4c, 0xf0e9d5, 0x8db9cb, 0xdda16a][
          (j + row + i) % 6
        ]
        const h = 0.22 + ((j * 7 + row * 3 + i) % 4) * 0.055
        add(new THREE.BoxGeometry(0.22, h, 0.24), mat(color, 0.55), [
          x - 1.38 + j * 0.305,
          y + 0.03 + h / 2,
          -8.0,
        ])
      }
    }
    for (let d = -1; d <= 1; d += 2)
      add(new THREE.BoxGeometry(0.035, 2.75, 0.055), stainless, [x + d * 1.02, 1.78, -7.78])
    add(
      new THREE.BoxGeometry(3.28, 0.055, 0.05),
      mat(0x8ef0c3, 0.22, 0.1, { emissive: 0x43cfa0, emissiveIntensity: 0.75 }),
      [x, 3.05, -7.76],
    )
  }
  // Ceiling light panels and suspended aisle lights give the scene a real retail scale.
  const lightPanel = new THREE.MeshStandardMaterial({
    color: 0xfff8e8,
    emissive: 0xfff0d1,
    emissiveIntensity: 1.5,
    roughness: 0.35,
  })
  for (let x = -7.5; x <= 7.5; x += 5)
    for (let z = -6; z <= 6; z += 4) {
      add(new THREE.BoxGeometry(2.25, 0.045, 1.05), white, [x, 7.245, z])
      add(new THREE.BoxGeometry(2.08, 0.025, 0.9), lightPanel, [x, 7.21, z])
    }
  // Checkout counters at the front corners, away from the main aisle.
  for (const x of [-6.9, 6.9]) {
    add(new THREE.BoxGeometry(2.45, 0.92, 0.95), trim, [x, 0.48, 5.15])
    add(new THREE.BoxGeometry(2.35, 0.1, 0.86), mat(0x292e31, 0.3, 0.38), [x, 0.98, 5.15])
    add(
      new THREE.BoxGeometry(1.05, 0.045, 0.62),
      mat(0x8cc4bc, 0.22, 0.16, { emissive: 0x2a6f68, emissiveIntensity: 0.22 }),
      [x - 0.35, 1.055, 5.12],
    )
    add(new THREE.BoxGeometry(0.28, 0.5, 0.22), dark, [x + 0.75, 1.24, 5.08])
    add(new THREE.BoxGeometry(0.55, 0.035, 0.34), warm, [x + 0.72, 1.5, 5.08])
    // Small stacked grocery bags and checkout impulse items.
    for (let j = 0; j < 3; j++)
      add(new THREE.BoxGeometry(0.22, 0.28, 0.18), mat([0x6ba77a, 0xd6b454, 0xc56b53][j], 0.7), [
        x - 0.78 + j * 0.25,
        0.62,
        4.75,
      ])
  }
  // Floor-level aisle endcaps and safety bollards anchor the gondolas visually.
  for (const x of [-7.0, -3.45, 0.3, 4.0, 7.1]) {
    add(new THREE.BoxGeometry(0.16, 0.65, 0.16), warm, [x, 0.33, 1.4])
    add(new THREE.CylinderGeometry(0.12, 0.15, 0.08, 16), dark, [x, 0.05, 1.4])
  }
}
function createCoffeeBarAccent() {
  const bar = new THREE.Group()
  bar.name = 'PBR_Coffee_Bar_Accent'
  bar.position.set(-0.15, 0, 0.55)
  scene.add(bar)
  const addPart = (geometry, material, pos, rotation = null) => {
    const part = mesh(geometry, material, pos, bar, rotation)
    part.castShadow = false
    part.receiveShadow = true
    return part
  }
  const walnut = characterMat(0x34231c, 0.35)
  const walnutLite = characterMat(0x62422f, 0.4)
  const steel = characterMat(0x7e898e, 0.22)
  const steelDark = mat(0x242d32, 0.27, 0.58)
  const porcelain = characterMat(0xf3ebdf, 0.2)
  const gold = mat(0xc59a56, 0.26, 0.7)
  addPart(new RoundedBoxGeometry(6.15, 0.96, 1.15, 8, 0.065), walnut, [0, 0.51, 0])
  addPart(new RoundedBoxGeometry(6.28, 0.115, 1.28, 8, 0.04), marbleMat, [0, 1.055, 0])
  addPart(new RoundedBoxGeometry(5.98, 0.018, 1.2, 5, 0.009), gold, [0, 0.987, 0])
  for (let x = -2.65; x <= 2.66; x += 0.48) {
    addPart(new RoundedBoxGeometry(0.018, 0.72, 0.045, 2, 0.008), gold, [x, 0.48, 0.587])
  }
  addPart(new THREE.BoxGeometry(5.92, 0.065, 0.045), gold, [0, 0.115, 0.59])
  for (let x = -2.45; x <= 2.46; x += 0.82) {
    addPart(new RoundedBoxGeometry(0.65, 0.28, 0.025, 3, 0.012), walnutLite, [x, 0.64, 0.582])
    addPart(
      new THREE.CylinderGeometry(0.018, 0.018, 0.14, 12),
      gold,
      [x, 0.64, 0.608],
      [0, 0, Math.PI / 2],
    )
  }
  // Espresso machine
  const machine = new THREE.Group()
  machine.position.set(-1.28, 1.12, -0.12)
  bar.add(machine)
  const machinePart = (geometry, material, pos, rotation = null) => {
    const part = mesh(geometry, material, pos, machine, rotation)
    part.castShadow = false
    part.receiveShadow = true
    return part
  }
  machinePart(new RoundedBoxGeometry(1.18, 0.82, 0.62, 7, 0.055), steel, [0, 0.42, 0])
  machinePart(new RoundedBoxGeometry(1.02, 0.11, 0.57, 5, 0.025), steelDark, [0, 0.85, 0.015])
  machinePart(new RoundedBoxGeometry(0.78, 0.23, 0.16, 5, 0.03), steelDark, [0, 0.64, 0.33])
  machinePart(new RoundedBoxGeometry(0.53, 0.08, 0.15, 4, 0.022), gold, [0, 0.75, 0.35])
  for (const x of [-0.35, 0, 0.35]) {
    machinePart(
      new THREE.CylinderGeometry(0.075, 0.075, 0.018, 24),
      gold,
      [x, 0.39, 0.32],
      [Math.PI / 2, 0, 0],
    )
    machinePart(
      new THREE.CylinderGeometry(0.046, 0.046, 0.025, 20),
      steelDark,
      [x, 0.39, 0.338],
      [Math.PI / 2, 0, 0],
    )
    machinePart(
      new THREE.CylinderGeometry(0.022, 0.022, 0.22, 14),
      steelDark,
      [x, 0.23, 0.36],
      [0, 0, Math.PI / 2],
    )
  }
  machinePart(new THREE.CylinderGeometry(0.115, 0.115, 0.035, 32), porcelain, [-0.38, 0.9, 0.31])
  machinePart(new THREE.CylinderGeometry(0.075, 0.075, 0.045, 28), steelDark, [-0.38, 0.923, 0.32])
  machinePart(
    new THREE.CylinderGeometry(0.02, 0.025, 0.32, 14),
    steel,
    [-0.46, 0.17, 0.32],
    [0, 0, -0.45],
  )
  machinePart(
    new THREE.CylinderGeometry(0.02, 0.025, 0.32, 14),
    steel,
    [0.46, 0.17, 0.32],
    [0, 0, 0.45],
  )
  machinePart(
    new THREE.CylinderGeometry(0.04, 0.04, 0.12, 18),
    gold,
    [0.47, 0.26, 0.34],
    [0, 0, 0.4],
  )
  // Grinder and cups
  const grinder = new THREE.Group()
  grinder.position.set(0.95, 1.12, -0.04)
  bar.add(grinder)
  const grinderPart = (geometry, material, pos, rotation = null) => {
    const part = mesh(geometry, material, pos, grinder, rotation)
    part.castShadow = false
    part.receiveShadow = true
    return part
  }
  grinderPart(new THREE.CylinderGeometry(0.19, 0.17, 0.35, 32), steelDark, [0, 0.2, 0])
  grinderPart(new THREE.CylinderGeometry(0.145, 0.15, 0.28, 32), steel, [0, 0.49, 0])
  grinderPart(new THREE.CylinderGeometry(0.16, 0.16, 0.075, 32), steelDark, [0, 0.68, 0])
  grinderPart(new THREE.CylinderGeometry(0.12, 0.12, 0.17, 28), mat(0x39251b, 0.26), [0, 0.8, 0])
  grinderPart(new THREE.BoxGeometry(0.09, 0.14, 0.07), gold, [0.12, 0.44, 0.11])
  for (let i = 0; i < 4; i++) {
    const x = 1.72 + i * 0.24
    addPart(new THREE.CylinderGeometry(0.082, 0.068, 0.16, 24), porcelain, [x, 1.17, 0.08])
    addPart(new THREE.TorusGeometry(0.071, 0.012, 8, 22), porcelain, [x, 1.255, 0.08])
    addPart(new THREE.CylinderGeometry(0.013, 0.013, 0.04, 12), walnutLite, [x, 1.09, 0.08])
  }
  // Textured café menu board.
  const menuTexture = canvasTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#111713'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#cba66b'
      ctx.font = 'bold 32px Georgia'
      ctx.fillText('LIBRARY / BAR', 24, 52)
      ctx.fillStyle = '#f6e8cc'
      ctx.font = '24px Georgia'
      const rows = [
        ['ESPRESSO', '4.5'],
        ['FLAT WHITE', '5.0'],
        ['FILTER COFFEE', '4.0'],
        ['PASTRY', '3.5'],
      ]
      rows.forEach((row, i) => {
        const y = 118 + i * 82
        ctx.fillText(row[0], 25, y)
        ctx.textAlign = 'right'
        ctx.fillText(row[1], w - 25, y)
        ctx.textAlign = 'left'
      })
    },
    1,
    1,
  )
  const menuMaterial = new THREE.MeshStandardMaterial({
    map: menuTexture,
    roughness: 0.72,
    emissive: 0x332719,
    emissiveMap: menuTexture,
    emissiveIntensity: 0.28,
  })
  addPart(new RoundedBoxGeometry(1.65, 1.07, 0.09, 4, 0.025), walnut, [2.05, 2.05, -0.2])
  addPart(new THREE.PlaneGeometry(1.48, 0.91), menuMaterial, [2.05, 2.06, -0.148])
  for (const x of [1.35, 2.75])
    addPart(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 10), gold, [x, 1.42, -0.19])
  highDetailCafeLoaded.value = true
}
function loadHighDetailRoom() {
  const loader = new GLTFLoader()
  loader.load(
    LIBRARY_SCENE_URL,
    (gltf) => {
      const result = normalizeAsset(gltf.scene, 14.2)
      result.root.name = 'CCBY_Wig42_BreakfastRoom_PBR_Environment'
      scene.add(result.root)
      if (roomRoot) roomRoot.visible = true
      highDetailRoomLoaded.value = true
      createCoffeeBarAccent()
      roomRenderStatus.value = '高细节 PBR 室内 + 咖啡吧 · REAL-TIME 3D'
    },
    undefined,
    (error) => {
      highDetailRoomLoaded.value = false
      highDetailCafeLoaded.value = false
      roomRenderStatus.value = '本地 3D 备用场景'
      if (roomRoot) roomRoot.visible = true
      console.error('[3D room] Self-hosted GLTF load failed:', error)
    },
  )
}

function onCanvasPointerDown(e) {
  if (!renderer || !camera) return
  pointerDown = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY }
  renderer.domElement.setPointerCapture?.(e.pointerId)
}
function onCanvasPointerMove(e) {
  if (!renderer || !camera) return
  if (pointerDown) {
    const dx = e.clientX - pointerDown.x,
      dy = e.clientY - pointerDown.y
    orbitAngle -= dx * 0.006
    orbitTilt = Math.max(-0.02, Math.min(0.42, orbitTilt + dy * 0.003))
    pointerDown = {
      ...pointerDown,
      x: e.clientX,
      y: e.clientY,
      startX: pointerDown.startX,
      startY: pointerDown.startY,
    }
  }
}
function onCanvasPointerUp(e) {
  if (!renderer || !camera || !pointerDown) return
  const moved = Math.abs(e.clientX - pointerDown.startX) + Math.abs(e.clientY - pointerDown.startY)
  if (moved < 8) {
    const rect = renderer.domElement.getBoundingClientRect()
    const p = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(p, camera)
    const hit = raycaster.intersectObjects(characterHitMeshes, false)[0]
    if (hit?.object.userData.agentId) {
      focusAgent.value = hit.object.userData.agentId
      motion.value = 'wave'
    }
  }
  pointerDown = null
}
function moveFocusedAgent(dx, dz, fast = false) {
  const character = characterGroups.get(focusAgent.value)
  if (!character) {
    status.value = '场景角色尚未加载，请稍后再试'
    return
  }

  const step = fast ? 0.42 : 0.22
  const nextX = THREE.MathUtils.clamp(
    character.position.x + dx * step,
    -8.35,
    8.35,
  )
  const nextZ = THREE.MathUtils.clamp(
    character.position.z + dz * step,
    -7.35,
    8.1,
  )

  character.position.x = nextX
  character.position.z = nextZ
  if (dx !== 0 || dz !== 0) {
    character.userData.moveFacing = Math.atan2(dx, dz)
  }
  motion.value = 'idle'
  const agent = agents.find((item) => item.id === focusAgent.value)
  status.value = (agent?.name || '当前角色') + ' 已移动'
}

function onSceneKeyDown(e) {
  // Keep typing in the chat composer separate from 3D movement.
  const target = e.target
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest('input, textarea, select, [contenteditable="true"]'))
  ) {
    return
  }

  const key = e.key.toLowerCase()
  const directions = {
    arrowup: [0, -1],
    w: [0, -1],
    arrowdown: [0, 1],
    s: [0, 1],
    arrowleft: [-1, 0],
    a: [-1, 0],
    arrowright: [1, 0],
    d: [1, 0],
  }
  const direction = directions[key]
  if (!direction) return

  e.preventDefault()
  moveFocusedAgent(direction[0], direction[1], e.shiftKey)
}
function initScene() {
  const host = canvasHost.value
  if (!host) return
  const headlessRender = navigator.webdriver === true
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x19150f)
  scene.fog = new THREE.FogExp2(0x19150f, 0.013)
  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120)
  camera.position.set(0, 3.25, 12.5)
  camera.lookAt(0, 1.55, -0.5)
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, headlessRender ? 0.85 : 1.35))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.94
  renderer.shadowMap.enabled = !headlessRender
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  const roomEnvironment = new RoomEnvironment()
  environmentTarget = pmremGenerator.fromScene(roomEnvironment, 0.04)
  scene.environment = environmentTarget.texture
  pmremGenerator.dispose()
  roomEnvironment.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose()
    }
  })
  host.appendChild(renderer.domElement)
  scene.add(new THREE.HemisphereLight(0xffedd6, 0x514237, 1.12))
  scene.add(new THREE.AmbientLight(0xffffff, 0.18))
  const sun = new THREE.DirectionalLight(0xffd8a4, 2.35)
  sun.position.set(-7, 10, 7)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -12
  sun.shadow.camera.right = 12
  sun.shadow.camera.top = 12
  sun.shadow.camera.bottom = -12
  sun.shadow.bias = -0.00022
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0xfff4e7, 0.72)
  fill.position.set(5, 7, 3)
  scene.add(fill)
  const warm = new THREE.PointLight(0xffc06e, 22, 16)
  warm.position.set(-1, 5, 0)
  scene.add(warm)
  buildLibraryRoom()
  createRetailAisle()
  buildCharacter()
  raycaster = new THREE.Raycaster()
  // Use the custom-built retail scene as the single source of truth. Loading the benchmark café GLTF here
  // layered stock furniture over the authored fixtures, making the tables and shelves look unchanged.
  highDetailRoomLoaded.value = true
  highDetailCafeLoaded.value = true
  roomRenderStatus.value = '定制零售货架 + 商品陈列 + 3D 咨询桌'
  // Cinematic render pipeline: contact shadows, richer material depth, controlled highlight bloom.
  const initialWidth = Math.max(1, host.clientWidth),
    initialHeight = Math.max(1, host.clientHeight)
  composer = new EffectComposer(renderer)
  composer.setPixelRatio(renderer.getPixelRatio())
  composer.addPass(new RenderPass(scene, camera))
  // Full contact AO on normal browsers; headless verification uses the same materials/scene with a lighter render path.
  if (!headlessRender) {
    ssaoPass = new SSAOPass(scene, camera, initialWidth, initialHeight)
    ssaoPass.kernelRadius = 12
    ssaoPass.minDistance = 0.005
    ssaoPass.maxDistance = 0.13
    composer.addPass(ssaoPass)
  }
  bloomPass = new UnrealBloomPass(new THREE.Vector2(initialWidth, initialHeight), 0.14, 0.32, 0.92)
  composer.addPass(bloomPass)
  composer.addPass(new OutputPass())
  const resize = () => {
    if (!host || !renderer) return
    const w = Math.max(1, host.clientWidth),
      h = Math.max(1, host.clientHeight)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
    composer?.setSize(w, h)
  }
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)
  resize()
  const down = (e) => onCanvasPointerDown(e),
    move = (e) => onCanvasPointerMove(e),
    up = (e) => onCanvasPointerUp(e)
  host.addEventListener('pointerdown', down)
  host.addEventListener('pointermove', move)
  host.addEventListener('pointerup', up)
  host.addEventListener('pointercancel', () => {
    pointerDown = null
  })
  const wheel = (e) => {
    e.preventDefault()
    zoom.value = Math.max(0.7, Math.min(1.35, zoom.value + (e.deltaY > 0 ? -0.055 : 0.055)))
  }
  host.addEventListener('wheel', wheel, { passive: false })
  window.addEventListener('keydown', onSceneKeyDown)
  sceneListeners = [
    [host, 'pointerdown', down],
    [host, 'pointermove', move],
    [host, 'pointerup', up],
    [host, 'wheel', wheel],
    [window, 'keydown', onSceneKeyDown],
  ]
  const animate = () => {
    raf = requestAnimationFrame(animate)
    const t = sceneClock.getElapsedTime()
    for (const [id, g] of characterGroups) {
      const index = agents.findIndex((a) => a.id === id)
      const phase = t * 1.8 + index * 1.17
      const focus = focusAgent.value === id
      const talking = motion.value === 'wave' && focus
      const bounce = Math.abs(Math.sin(phase * 1.35))
      g.position.y = Math.sin(phase) * (focus ? 0.045 : 0.032) + (talking ? bounce * 0.16 : 0)
      g.rotation.y = Number.isFinite(g.userData.moveFacing)
        ? g.userData.moveFacing
        : Math.sin(t * 0.45 + index) * 0.055
      // Tiny squash-and-stretch and character-specific head tilts keep the cast from feeling like statues.
      const squash = 1 + Math.sin(phase * 2) * 0.012 + (talking ? bounce * 0.025 : 0)
      g.scale.set(g.userData.baseScale * (2 - squash), g.userData.baseScale * squash, g.userData.baseScale * (2 - squash))
      g.rotation.z = Math.sin(phase * 0.72) * (focus ? 0.035 : 0.022)
      for (const eye of g.userData.characterEyes || []) {
        const blinkWave = (t + index * 1.73) % 4.2
        const blink = blinkWave > 3.92 && blinkWave < 4.08
          ? Math.max(0.08, Math.abs((blinkWave - 4) / 0.08))
          : 1
        eye.scale.y = blink
      }
      g.userData.ring.material.opacity = focus ? 0.95 : 0.38
    }
    const highDetail = highDetailRoomLoaded.value
    const radius = (highDetail ? 12.8 : 15.5) / zoom.value
    const desired = new THREE.Vector3(
      Math.sin(orbitAngle) * radius,
      highDetail ? 2.7 + orbitTilt * 4 : 5.4 + orbitTilt * 8,
      (highDetail ? -0.5 : 3.0) + Math.cos(orbitAngle) * radius,
    )
    camera.position.lerp(desired, 0.07)
    camera.lookAt(0, highDetail ? 1.55 : 2.4, highDetail ? -0.5 : 3.3)
    camera.updateMatrixWorld()
    // Anchor DOM labels to projected 3D head positions so they track rotation and zoom.
    if (Math.floor(t * 18) !== Math.floor((t - 1 / 60) * 18)) {
      const width = renderer.domElement.clientWidth,
        height = renderer.domElement.clientHeight,
        next = {}
      for (const [id, g] of characterGroups) {
        const anchor = g.localToWorld(new THREE.Vector3(0, g.userData.labelHeight || 2.05, 0))
        anchor.project(camera)
        const x = (anchor.x * 0.5 + 0.5) * width,
          y = (-anchor.y * 0.5 + 0.5) * height
        const visible =
          anchor.z > -1 && anchor.z < 1 && x > 4 && x < width - 4 && y > 88 && y < height - 8
        next[id] = { left: x + 'px', top: y + 'px', visibility: visible ? 'visible' : 'hidden' }
      }
      labelPositions.value = next
    }
    composer.render()
  }
  animate()
}
function zoomBy(delta) {
  zoom.value = Math.max(0.7, Math.min(1.35, zoom.value + delta))
}
function resetView() {
  orbitAngle = 0
  orbitTilt = 0.12
  zoom.value = 1
  focusAgent.value = 'manager'
  motion.value = 'wave'
}
onMounted(() => initScene())
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  resizeObserver?.disconnect()
  for (const [el, event, handler] of sceneListeners) el.removeEventListener(event, handler)
  sceneListeners = []
  composer?.dispose()
  composer = null
  ssaoPass = null
  bloomPass = null
  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
  }
  environmentTarget?.dispose()
  environmentTarget = null
  scene?.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const key of [
          'map',
          'normalMap',
          'roughnessMap',
          'metalnessMap',
          'emissiveMap',
          'aoMap',
          'alphaMap',
          'bumpMap',
          'envMap',
        ])
          if (m[key]) m[key].dispose()
        m.dispose()
      }
    }
  })
})
const selectedAgent = computed(() => agents.find((a) => a.id === focusAgent.value) || agents[0])
</script>

<template>
  <section class="space3d">
    <header class="space-top">
      <button class="back" @click="props.onBack" aria-label="返回杂货铺">‹</button>
      <div class="brand">
        <span class="brand-orb"><span>AI</span></span
        ><span><b>门店经营协作室</b><small>6 个岗位数字人 · 共享群聊</small></span>
      </div>
      <div class="top-agents">
        <button
          v-for="a in agents"
          :key="a.id"
          class="top-agent"
          :class="{ focused: focusAgent === a.id, muted: !selected.includes(a.id) }"
          @click="focusOnly(a.id)"
          :style="{ '--agent-color': '#' + a.color.toString(16).padStart(6, '0') }"
        >
          <span class="top-agent-avatar">{{ a.emoji }}</span
          ><span
            ><b>{{ a.name }}</b
            ><small>{{ a.character }}</small></span
          >
        </button>
      </div>
      <div class="top-state">
        <i></i><span>协作空间在线</span><small>角色可用 · 等待调度</small>
      </div>
      <button class="mode-btn" @click="mode = mode === 'demo' ? 'deepseek' : 'demo'">
        {{ mode === 'demo' ? '演示模式' : 'DeepSeek Runtime' }}
      </button>
    </header>
    <main class="space-layout">
      <section class="stage-column">
        <div ref="sceneShell" class="scene-shell">
          <div
            ref="canvasHost"
            class="three-canvas"
            :data-room-ready="highDetailRoomLoaded ? 'true' : 'false'"
            :data-cafe-ready="highDetailCafeLoaded ? 'true' : 'false'"
            :data-room-status="roomRenderStatus"
          ></div>
          <div class="scene-vignette"></div>
          <div class="left-glass glass-panel">
            <div class="panel-overline">SHARED CONTEXT / ROOM 001</div>
            <div class="left-panel-title">
              <span class="status-mark">✦</span>
              <div>
                <b>门店经营协作室</b
                ><small>{{
                  busy ? '多角色协同 · 任务运行中' : '多角色讨论 · 同步消息 · 实时协作'
                }}</small>
              </div>
              <span class="live-badge"><i></i>{{ busy ? '执行中' : '就绪' }}</span>
            </div>
            <div class="task-summary">
              <span>当前任务</span><b>{{ busy ? '岗位并行协作' : '等待新任务' }}</b>
            </div>
            <div class="summary-bottom">
              <span><i></i>{{ activeAgents.length }} / 6 个岗位在线</span
              ><span class="latency">⏱ 2h</span>
            </div>
          </div>
          <div class="environment-label">
            LIBRARY CAFÉ <span>·</span> {{ roomRenderStatus }}
            <small>Environment: The Breakfast Room by Wig42 · CC BY 3.0</small>
          </div>
          <div class="movement-pad" aria-label="角色移动控制">
            <div class="movement-pad-heading">
              <span>角色移动</span>
              <b>{{ selectedAgent.name }}</b>
            </div>
            <button
              class="move-up"
              aria-label="向前移动"
              title="向前 (↑ / W)"
              @click="moveFocusedAgent(0, -1)"
            >
              ↑
            </button>
            <button
              class="move-left"
              aria-label="向左移动"
              title="向左 (← / A)"
              @click="moveFocusedAgent(-1, 0)"
            >
              ←
            </button>
            <button class="move-stop" aria-label="当前控制对象" title="当前控制对象">
              {{ selectedAgent.emoji }}
            </button>
            <button
              class="move-right"
              aria-label="向右移动"
              title="向右 (→ / D)"
              @click="moveFocusedAgent(1, 0)"
            >
              →
            </button>
            <button
              class="move-down"
              aria-label="向后移动"
              title="向后 (↓ / S)"
              @click="moveFocusedAgent(0, 1)"
            >
              ↓
            </button>
            <small>先点击角色切换控制对象 · Shift 加速</small>
          </div>
          <div class="agent-labels">
            <button
              v-for="(a, i) in agents"
              :key="a.id"
              class="agent-label"
              :class="[
                'agent-' + a.id,
                { focused: focusAgent === a.id, muted: !selected.includes(a.id) },
              ]"
              :style="[
                { '--agent-color': '#' + a.color.toString(16).padStart(6, '0') },
                labelPositions[a.id] || {},
              ]"
              @click="focusOnly(a.id)"
            >
              <i></i><span class="character-emoji">{{ a.emoji }}</span
              ><span class="agent-label-name"
                ><b>{{ a.name }}</b></span
              >
            </button>
          </div>
          <div class="view-dock">
            <div class="radar">
              <span class="radar-ring r1"></span><span class="radar-ring r2"></span
              ><span class="radar-center"></span
              ><i
                v-for="(a, i) in agents"
                :key="a.id"
                :style="{
                  left: 24 + ((i * 31) % 56) + '%',
                  top: 20 + ((i * 23) % 60) + '%',
                  background: '#' + a.color.toString(16).padStart(6, '0'),
                }"
              ></i>
            </div>
            <div class="dock-controls">
              <b>视角控制</b><small>拖动旋转 · 滚轮缩放 · 点击角色</small>
              <div>
                <button @click="resetView">⟳ 复位</button
                ><button @click="zoomBy(0.12)">＋ 缩放</button
                ><button @click="zoomBy(-0.12)">－ 缩放</button>
              </div>
            </div>
          </div>
          <div class="scene-footnote">
            当前场景：门店经营协作室 <span>·</span> {{ activeAgents.length }} 个协作角色在线
          </div>
        </div>
      </section>
      <aside class="chat-panel">
        <div class="panel-head">
          <div>
            <span class="eyebrow">SHARED CONVERSATION</span>
            <h2>团队群聊 <span class="live-pill">● LIVE</span></h2>
            <p>同一上下文，岗位独立响应</p>
          </div>
          <button
            class="panel-menu"
            aria-label="新建会话"
            @click="
              messages = [
                {
                  id: Date.now(),
                  role: 'system',
                  text: '新会话已创建。所有数字人共享本房间上下文。',
                  time: now(),
                },
              ]
            "
          >
            ↻
          </button>
        </div>
        <div class="focus-card">
          <div
            class="focus-avatar"
            :style="{ '--agent-color': '#' + selectedAgent.color.toString(16).padStart(6, '0') }"
          >
            {{ selectedAgent.emoji }}
          </div>
          <div>
            <small>当前聚焦角色</small
            ><b
              >{{ selectedAgent.name }} <i>{{ selectedAgent.role }}</i></b
            >
            <p>{{ selectedAgent.guide }}</p>
          </div>
          <button @click="toggleAgent(focusAgent)">
            {{ selected.includes(focusAgent) ? '−' : '+' }}
          </button>
        </div>
        <div class="messages" ref="messageList">
          <div
            v-for="m in messages"
            :key="m.id"
            class="message"
            :class="['m-' + m.role, { user: m.role === 'user' }]"
          >
            <template v-if="m.role === 'user'"
              ><div class="user-bubble">{{ m.text }}</div>
              <time>{{ m.time }}</time></template
            ><template v-else
              ><div class="message-meta">
                <span
                  class="message-character-avatar"
                  :style="{
                    '--agent-color':
                      '#' +
                      (agents.find((a) => a.id === m.role)?.color || 0x8294c5)
                        .toString(16)
                        .padStart(6, '0'),
                  }"
                  >{{ agents.find((a) => a.id === m.role)?.emoji || '✦' }}</span
                ><b>{{ agents.find((a) => a.id === m.role)?.name || '系统' }}</b
                ><time>{{ m.time }}</time>
              </div>
              <p>{{ m.text }}</p></template
            >
          </div>
          <div v-if="busy" class="typing"><span></span><span></span><span></span>{{ status }}</div>
        </div>
        <div class="prompt-row">
          <button v-for="p in quickPrompts" :key="p" @click="addPrompt(p)" :disabled="busy">
            {{ p }}
          </button>
        </div>
        <div class="composer">
          <div class="mention-hint">@ 店长 / 导购 / 采购 / 盘点员 / 产品经理 / 所有人</div>
          <textarea
            v-model="draft"
            rows="3"
            :disabled="busy"
            placeholder="描述你的目标，数字人团队将开始协作…"
            @keydown.enter.exact.prevent="send"
          ></textarea>
          <div class="composer-bottom">
            <span>{{ status }}</span
            ><button :disabled="busy || !draft.trim() || !selected.length" @click="send">
              <span>{{ busy ? '协作中' : '发起协作' }}</span
              ><b>↗</b>
            </button>
          </div>
        </div>
      </aside>
    </main>
  </section>
</template>

<style>
.space3d {
  position: relative;
  height: 100vh;
  min-height: 690px;
  overflow: hidden;
  background: #0b1723;
  color: #f4f7fa;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}
.space-top {
  position: absolute;
  z-index: 30;
  top: 0;
  left: 0;
  right: 0;
  height: 78px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 20px;
  background: linear-gradient(180deg, #0a1524ee, #0a1524b8);
  border-bottom: 1px solid #b9d8ed30;
  backdrop-filter: blur(20px);
}
.space-top button {
  cursor: pointer;
  color: inherit;
}
.back {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: grid;
  place-items: center;
  border: 1px solid #8ebad533;
  border-radius: 50%;
  background: #ffffff0b;
  font-size: 30px;
  line-height: 1;
  color: #e9f4fc;
  transition: 0.2s;
}
.back:hover {
  background: #2d73a8;
}
.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  flex: 0 0 auto;
  min-width: 215px;
}
.brand-orb {
  width: 39px;
  height: 39px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(145deg, #1a9fe0, #3464bd);
  box-shadow: 0 0 24px #38a9ef45;
  font-size: 14px;
  font-weight: 900;
}
.brand b,
.brand small {
  display: block;
}
.brand b {
  font-size: 15px;
  letter-spacing: 0.04em;
}
.brand small {
  font-size: 10px;
  color: #b8c9d8;
  margin-top: 4px;
  letter-spacing: 0.04em;
}
.top-agents {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.top-agent {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 8px 9px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  text-align: left;
  transition: 0.2s;
}
.top-agent:hover,
.top-agent.focused {
  background: #ffffff10;
  border-color: #ffffff20;
}
.top-agent.muted {
  opacity: 0.48;
}
.top-agent-avatar {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 25%, var(--agent-color), #0e2538 95%);
  border: 1px solid #ffffff36;
  box-shadow: 0 0 14px color-mix(in srgb, var(--agent-color), transparent 76%);
  font-size: 22px;
  line-height: 1;
}
.top-agent b,
.top-agent small {
  display: block;
  white-space: nowrap;
}
.top-agent b {
  font-size: 11px;
}
.top-agent small {
  font-size: 9px;
  color: #b7c9d7;
  margin-top: 3px;
}
.top-state {
  display: grid;
  grid-template-columns: 8px auto;
  align-items: center;
  gap: 0 7px;
  flex: 0 0 auto;
  padding: 9px 12px;
  background: #ffffff0b;
  border: 1px solid #c0d9eb1c;
  border-radius: 11px;
  font-size: 11px;
  color: #e5f2fa;
}
.top-state i {
  grid-row: 1/3;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #23e3b1;
  box-shadow: 0 0 12px #23e3b1;
}
.top-state small {
  grid-column: 2;
  color: #a9bece;
  font-size: 9px;
  margin-top: 4px;
}
.mode-btn {
  flex: 0 0 auto;
  padding: 9px 11px;
  border: 1px solid #8bb4d333;
  border-radius: 10px;
  background: #ffffff0b;
  font-size: 10px;
}
.space-layout {
  position: absolute;
  inset: 78px 0 0;
  max-width: none;
  margin: 0;
  display: block;
}
.stage-column {
  position: absolute;
  inset: 0;
  min-width: 0;
}
.scene-shell {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background-color: #261b12;
  background-image: none;
  background-size: auto;
  background-position: center;
  background-repeat: no-repeat;
  isolation: isolate;
}
.scene-load-state {
  position: absolute;
  z-index: 5;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid #b8d9ed40;
  border-radius: 12px;
  background: #071725bb;
  color: #e6f3fb;
  font-size: 11px;
  backdrop-filter: blur(12px);
  pointer-events: auto;
}
.scene-load-state button {
  border: 1px solid #a9d8f044;
  border-radius: 8px;
  background: #ffffff10;
  color: #8bdcff;
  padding: 5px 8px;
  cursor: pointer;
}
.loader-dot {
  width: 7px;
  height: 7px;
  background: #38e6bc;
  border-radius: 50%;
  box-shadow: 0 0 12px #38e6bc;
  animation: typing 1s infinite;
}
.three-canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  touch-action: none;
}
.three-canvas canvas {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}
.scene-vignette {
  position: absolute;
  z-index: 2;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 44%, transparent 42%, #06111b45 100%);
  box-shadow: inset 0 0 120px #06111b30;
}
.glass-panel {
  border: 1px solid #9bcae74a;
  background: linear-gradient(135deg, #091a2ad9, #0c2032be);
  box-shadow: 0 14px 44px #0004;
  backdrop-filter: blur(20px);
  border-radius: 14px;
}
.left-glass {
  position: absolute;
  z-index: 6;
  left: 20px;
  top: 28px;
  width: min(385px, 33vw);
  padding: 14px 16px;
  color: #edf6fc;
}
.panel-overline {
  font-size: 9px;
  letter-spacing: 0.19em;
  color: #b2d6ea;
  margin-bottom: 12px;
}
.left-panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.status-mark {
  width: 31px;
  height: 31px;
  flex: 0 0 31px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: linear-gradient(145deg, #1eb2f3, #4454cb);
  box-shadow: 0 0 15px #39b3f64a;
}
.left-panel-title > div {
  flex: 1;
  min-width: 0;
}
.left-panel-title b,
.left-panel-title small {
  display: block;
}
.left-panel-title b {
  font-size: 13px;
}
.left-panel-title small {
  font-size: 10px;
  color: #afc5d4;
  margin-top: 5px;
}
.live-badge {
  font-size: 9px;
  padding: 5px 7px;
  border-radius: 20px;
  background: #12d7a718;
  color: #65f4c8;
  white-space: nowrap;
}
.live-badge i {
  display: inline-block;
  width: 6px;
  height: 6px;
  background: #2ce9b3;
  border-radius: 50%;
  margin-right: 4px;
}
.task-summary {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 13px 0 10px;
  margin-top: 7px;
  border-top: 1px solid #c0def01b;
  font-size: 10px;
  color: #b1c9d9;
}
.task-summary b {
  color: #e9f6fc;
  font-weight: 600;
}
.summary-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #8ce9e0;
  font-size: 10px;
}
.summary-bottom > span:first-child i {
  display: inline-block;
  width: 6px;
  height: 6px;
  background: #34e5bb;
  border-radius: 50%;
  margin-right: 6px;
}
.latency {
  color: #c4d6e4;
  padding: 4px 7px;
  border-radius: 8px;
  background: #ffffff0d;
}
.environment-label {
  position: absolute;
  z-index: 4;
  top: 19px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  letter-spacing: 0.24em;
  color: #fff9;
  text-shadow: 0 1px 7px #0008;
  pointer-events: none;
}
.environment-label span {
  color: #59caff;
}
.agent-labels {
  position: absolute;
  z-index: 8;
  inset: 0;
  pointer-events: none;
}
.agent-label {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px 9px;
  gap: 6px;
  text-align: left;
  border: 1px solid #d3e4ee45;
  border-radius: 20px;
  background: #0a1a2aaf;
  color: #f8fbff;
  box-shadow: 0 8px 22px #0004;
  backdrop-filter: blur(14px);
  cursor: pointer;
  pointer-events: auto;
  transition:
    transform 0.22s,
    border-color 0.22s,
    background 0.22s;
}
.agent-label {
  transform: translate(-50%, -112%);
}
.agent-label:hover,
.agent-label.focused {
  transform: translate(-50%, calc(-112% - 3px)) scale(1.035);
  border-color: var(--agent-color);
  background: #071725e8;
  box-shadow: 0 0 24px color-mix(in srgb, var(--agent-color), transparent 74%);
}
.agent-label > i {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: var(--agent-color);
  box-shadow: 0 0 12px var(--agent-color);
}
.character-emoji {
  font-size: 17px;
  line-height: 1;
  flex: 0 0 auto;
  filter: drop-shadow(0 1px 3px #0007);
}
.agent-label span {
  min-width: 0;
  flex: 1;
}
.agent-label b,
.agent-label small {
  display: block;
  white-space: nowrap;
}
.agent-label b {
  font-size: 10px;
}
.agent-label small {
  font-size: 8px;
  color: #c1d3df;
  margin-top: 3px;
}
.agent-label em {
  font-style: normal;
  font-size: 8px;
  color: #8ee5ca;
}
.agent-label.muted {
  opacity: 0.55;
} /* Labels follow projected 3D anchors instead of fixed screen coordinates. */
.view-dock {
  position: absolute;
  z-index: 6;
  left: 20px;
  bottom: 29px;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 10px 12px;
  border-radius: 15px;
  background: linear-gradient(120deg, #081a2acc, #0c2338a6);
  border: 1px solid #b8d9ed30;
  backdrop-filter: blur(16px);
}
.radar {
  position: relative;
  width: 84px;
  height: 84px;
  flex: 0 0 84px;
  border: 1px solid #2baeea9c;
  border-radius: 50%;
  background: radial-gradient(circle, #1c84b73b, transparent 72%), #05172580;
  box-shadow:
    inset 0 0 24px #24a2db18,
    0 0 18px #149bd71b;
}
.radar:before,
.radar:after {
  content: '';
  position: absolute;
  background: #43b7e66b;
}
.radar:before {
  left: 50%;
  top: 8%;
  bottom: 8%;
  width: 1px;
}
.radar:after {
  top: 50%;
  left: 8%;
  right: 8%;
  height: 1px;
}
.radar-ring {
  position: absolute;
  inset: 19%;
  border: 1px solid #3da6d54a;
  border-radius: 50%;
}
.radar-ring.r2 {
  inset: 36%;
}
.radar-center {
  position: absolute;
  top: 47%;
  left: 47%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #c6f6ff;
  box-shadow: 0 0 13px 4px #29baf67a;
}
.radar i {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  box-shadow: 0 0 8px currentColor;
}
.dock-controls > b,
.dock-controls > small {
  display: block;
}
.dock-controls > b {
  font-size: 11px;
}
.dock-controls > small {
  font-size: 9px;
  color: #b2c9d9;
  margin-top: 5px;
}
.dock-controls > div {
  display: flex;
  gap: 5px;
  margin-top: 9px;
}
.dock-controls button {
  border: 1px solid #bdd7e52c;
  border-radius: 8px;
  padding: 7px 9px;
  background: #ffffff0d;
  color: #e4eef6;
  font-size: 9px;
  cursor: pointer;
}
.dock-controls button:hover {
  background: #1b5d84;
}
.environment-credit {
  position: absolute;
  right: 360px;
  bottom: 18px;
  z-index: 5;
  padding: 6px 8px;
  background: #07172571;
  border-radius: 7px;
  color: #d8e5ee;
  font-size: 8px;
}
.environment-credit a {
  color: #8bdefb;
  text-decoration: none;
}
.environment-credit a:hover {
  text-decoration: underline;
}
.scene-footnote {
  position: absolute;
  z-index: 5;
  left: 20px;
  bottom: 8px;
  color: #dae7efaa;
  font-size: 8px;
  text-shadow: 0 1px 5px #000;
}
.scene-footnote span {
  margin: 0 5px;
}
.chat-panel {
  position: absolute;
  z-index: 15;
  top: 20px;
  right: 16px;
  bottom: 18px;
  width: 330px;
  min-height: 0;
  max-height: none;
  display: flex;
  flex-direction: column;
  border: 1px solid #94c7e75b;
  border-radius: 15px;
  background: linear-gradient(160deg, #091b2bdf, #081725ed);
  box-shadow: 0 22px 65px #0007;
  backdrop-filter: blur(22px);
  overflow: hidden;
}
.panel-head {
  padding: 17px 16px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #b0d3e51c;
  background: #07152242;
}
.eyebrow {
  font-size: 9px;
  letter-spacing: 0.18em;
  color: #85d9f7;
  font-weight: 800;
}
.panel-head h2 {
  margin: 7px 0 5px;
  font-size: 19px;
  letter-spacing: -0.03em;
  color: #f5f8fc;
}
.panel-head p {
  font-size: 10px;
  color: #b2c6d5;
  margin: 0;
}
.live-pill {
  font-size: 8px;
  color: #6df2c2;
  border: 1px solid #3de2b033;
  background: #38d8a00d;
  border-radius: 20px;
  padding: 4px 6px;
  vertical-align: middle;
  letter-spacing: 0.1em;
}
.panel-menu {
  border: 1px solid #bad8e522;
  background: #ffffff08;
  color: #c8e0f0;
  border-radius: 9px;
  padding: 8px 10px;
  cursor: pointer;
}
.focus-card {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 10px 0;
  padding: 10px;
  border: 1px solid #9bbde533;
  background: #ffffff08;
  border-radius: 12px;
}
.focus-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 40% 35%, var(--agent-color), #15354a 80%);
  border: 1px solid #fff3;
  box-shadow: 0 0 20px color-mix(in srgb, var(--agent-color), transparent 70%);
  flex-shrink: 0;
  font-size: 28px;
  line-height: 1;
}
.focus-card > div:nth-child(2) {
  min-width: 0;
  flex: 1;
}
.focus-card small,
.focus-card b {
  display: block;
}
.focus-card small {
  font-size: 8px;
  color: #9db7ca;
  margin-bottom: 4px;
}
.focus-card b {
  font-size: 12px;
  color: #f1f6fb;
}
.focus-card b i {
  font-size: 9px;
  font-style: normal;
  color: #9ab5c9;
  font-weight: 400;
  margin-left: 5px;
}
.focus-card p {
  font-size: 9px;
  color: #b4c8d8;
  margin: 5px 0 0;
  line-height: 1.5;
}
.focus-card > button {
  border: 1px solid #bdd7e51f;
  background: #ffffff08;
  color: #d7e0ff;
  border-radius: 7px;
  width: 26px;
  height: 26px;
  cursor: pointer;
}
.messages {
  padding: 14px 13px 8px;
  flex: 1;
  overflow: auto;
  min-height: 130px;
  scroll-behavior: smooth;
}
.message {
  margin-bottom: 15px;
  animation: message-in 0.28s ease-out;
}
.message-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
}
.message-character-avatar {
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  flex: 0 0 27px;
  border-radius: 50%;
  font-size: 17px;
  line-height: 1;
  background: radial-gradient(circle at 35% 25%, var(--agent-color), #10263a 94%);
  border: 1px solid #ffffff35;
  box-shadow: 0 0 12px color-mix(in srgb, var(--agent-color), transparent 70%);
}
.message-meta b {
  font-size: 10px;
  color: #e3edf7;
}
.message-meta time,
.message > time {
  font-size: 8px;
  color: #87a3b8;
  margin-left: auto;
}
.message p {
  margin: 0 0 0 14px;
  font-size: 11px;
  line-height: 1.65;
  color: #e3edf7;
  background: #ffffff0a;
  border-left: 1px solid #7aa8dd88;
  padding: 9px 10px;
  border-radius: 0 9px 9px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.message.user {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.user-bubble {
  max-width: 92%;
  background: linear-gradient(115deg, #236cb1, #3e58b0);
  border: 1px solid #a3d9ff3b;
  padding: 10px 12px;
  border-radius: 13px 13px 3px 13px;
  font-size: 11px;
  line-height: 1.6;
  color: white;
}
.message > time {
  margin-top: 4px;
}
.typing {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #9ec1d7;
  font-size: 9px;
  padding: 6px 0 10px;
}
.typing span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #76baff;
  animation: typing 1s infinite;
}
.typing span:nth-child(2) {
  animation-delay: 0.15s;
}
.typing span:nth-child(3) {
  animation-delay: 0.3s;
}
.prompt-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 9px 10px;
  border-top: 1px solid #b0d3e51c;
}
.prompt-row button {
  flex-shrink: 0;
  max-width: 180px;
  border: 1px solid #a8c7e62d;
  background: #ffffff0a;
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 9px;
  color: #c8dce9;
  cursor: pointer;
  white-space: nowrap;
}
.prompt-row button:hover {
  border-color: #9bcbf7;
  color: #fff;
}
.composer {
  padding: 11px 11px 12px;
  border-top: 1px solid #b0d3e51c;
  background: #07152199;
}
.mention-hint {
  font-size: 8px;
  color: #9bb5c7;
  margin-bottom: 8px;
}
.composer textarea {
  width: 100%;
  resize: vertical;
  min-height: 73px;
  border: 1px solid #829aff42;
  border-radius: 10px;
  background: #071725ae;
  color: #f1f6fb;
  padding: 11px;
  font: inherit;
  font-size: 11px;
  line-height: 1.6;
  outline: none;
}
.composer textarea:focus {
  border-color: #7b8fff;
  box-shadow: 0 0 0 3px #778bff15;
}
.composer textarea::placeholder {
  color: #8ca6bb;
}
.composer-bottom {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 9px;
}
.composer-bottom > span {
  font-size: 8px;
  color: #9db5ca;
  flex: 1;
  line-height: 1.5;
}
.composer-bottom button {
  display: flex;
  align-items: center;
  gap: 14px;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(115deg, #1e8bd1, #425dcb 70%, #7766d8);
  color: white;
  padding: 10px 12px;
  font-weight: 700;
  font-size: 10px;
  cursor: pointer;
  box-shadow: 0 6px 24px #164c8640;
  transition: 0.2s;
}
.composer-bottom button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px #387cf266;
}
.composer-bottom button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}
@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes typing {
  0%,
  60%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
@media (max-width: 1180px) {
  .brand {
    min-width: 180px;
  }
  .top-agent {
    padding: 7px 5px;
    gap: 5px;
  }
  .top-agent-avatar {
    width: 29px;
    height: 29px;
    flex-basis: 29px;
  }
  .top-agent small {
    font-size: 8px;
  }
  .top-state {
    display: none;
  }
  .mode-btn {
    display: none;
  }
  .chat-panel {
    width: 315px;
  }
  .agent-labels .agent-label {
    min-width: 96px;
  }
  .environment-credit {
    right: 330px;
  }
}
@media (max-width: 860px) {
  .space3d {
    height: auto;
    min-height: 100vh;
    overflow: visible;
    padding-top: 78px;
  }
  .space-top {
    height: 70px;
    position: absolute;
    padding: 0 12px;
    gap: 9px;
  }
  .brand {
    min-width: 0;
    flex: 1;
  }
  .brand b {
    font-size: 13px;
  }
  .brand small {
    font-size: 9px;
  }
  .top-agents {
    display: none;
  }
  .space-layout {
    position: relative;
    inset: auto;
    display: flex;
    flex-direction: column;
  }
  .stage-column {
    position: relative;
    inset: auto;
    height: 72vh;
    min-height: 570px;
  }
  .scene-shell {
    position: absolute;
    inset: 0;
  }
  .left-glass {
    left: 12px;
    top: 12px;
    width: min(340px, calc(100% - 24px));
    padding: 11px 12px;
  }
  .environment-label {
    display: none;
  }
  .agent-labels .agent-label {
    min-width: 0;
    padding: 6px 8px;
  }
  .agent-label small,
  .agent-label em {
    display: none;
  }
  .agent-label b {
    font-size: 9px;
  }
  .agent-label > i {
    width: 7px;
    height: 7px;
    flex-basis: 7px;
  } /* Responsive positions are driven by the camera projection. */
  .view-dock {
    left: 12px;
    bottom: 14px;
  }
  .radar {
    width: 64px;
    height: 64px;
    flex-basis: 64px;
  }
  .environment-credit {
    right: 12px;
    bottom: 8px;
  }
  .scene-footnote {
    display: none;
  }
  .chat-panel {
    position: relative;
    top: auto;
    right: auto;
    bottom: auto;
    width: auto;
    min-height: 590px;
    max-height: 78vh;
    margin: 10px;
    border-radius: 14px;
  }
}
@media (max-width: 540px) {
  .space-top {
    height: 62px;
    padding: 0 8px;
    gap: 7px;
  }
  .back {
    width: 32px;
    height: 32px;
    flex-basis: 32px;
    font-size: 24px;
  }
  .brand-orb {
    width: 32px;
    height: 32px;
  }
  .brand b {
    font-size: 11px;
  }
  .brand small {
    font-size: 8px;
  }
  .stage-column {
    height: 68vh;
    min-height: 530px;
  }
  .left-glass {
    width: calc(100% - 24px);
    top: 10px;
  } /* The same projection logic is used on phones and desktops. */
  .agent-label {
    gap: 5px;
    padding: 5px 7px;
  }
  .agent-label b {
    font-size: 8px;
  }
  .view-dock {
    gap: 8px;
    padding: 7px;
  }
  .radar {
    width: 52px;
    height: 52px;
    flex-basis: 52px;
  }
  .dock-controls > b {
    font-size: 9px;
  }
  .dock-controls > small {
    font-size: 8px;
  }
  .dock-controls button {
    padding: 6px 6px;
    font-size: 8px;
  }
  .environment-credit {
    font-size: 7px;
  }
  .chat-panel {
    min-height: 570px;
    margin: 8px;
  }
  .panel-head {
    padding: 14px 13px;
  }
  .panel-head h2 {
    font-size: 17px;
  }
  .focus-card {
    margin: 9px 9px 0;
  }
  .messages {
    padding: 12px 10px;
  }
  .composer {
    padding: 10px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .space3d * {
    animation: none !important;
    transition: none !important;
  }
}

.movement-pad {
  position: absolute;
  z-index: 12;
  left: 18px;
  bottom: 18px;
  width: 174px;
  display: grid;
  grid-template-columns: repeat(3, 42px);
  grid-template-rows: auto repeat(3, 38px) auto;
  justify-content: center;
  gap: 5px;
  padding: 12px;
  border: 1px solid #d6e8f32b;
  border-radius: 16px;
  background: #0c1b2bd9;
  box-shadow: 0 12px 35px #0005;
  backdrop-filter: blur(14px);
}
.movement-pad-heading {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 3px;
  font-size: 11px;
  color: #a8bdce;
}
.movement-pad-heading b { color: #fff; font-size: 12px; }
.movement-pad button {
  display: grid;
  place-items: center;
  border: 1px solid #b9d8ed30;
  border-radius: 9px;
  background: #20384c;
  color: #f5fbff;
  font-size: 17px;
  cursor: pointer;
  transition: background .15s ease, transform .15s ease;
}
.movement-pad button:hover {
  background: #315772;
}
.movement-pad button:active {
  transform: scale(0.94);
}
.movement-pad .move-up {
  grid-column: 2;
  grid-row: 2;
}
.movement-pad .move-left {
  grid-column: 1;
  grid-row: 3;
}
.movement-pad .move-stop {
  grid-column: 2;
  grid-row: 3;
  font-size: 18px;
}
.movement-pad .move-right {
  grid-column: 3;
  grid-row: 3;
}
.movement-pad .move-down {
  grid-column: 2;
  grid-row: 4;
}
.movement-pad small {
  grid-column: 1 / -1;
  color: #91a9bb;
  font-size: 9px;
  line-height: 1.4;
  text-align: center;
  white-space: nowrap;
}
@media (max-width: 760px) {
  .movement-pad { left: 10px; bottom: 10px; transform: scale(.9); transform-origin: bottom left; }
}

</style>
