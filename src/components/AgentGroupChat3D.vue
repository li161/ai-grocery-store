<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
    character: '门店负责人',
    emoji: '🧽',
    color: 0x9a7bff,
    guide: '统筹经营目标、拆解任务、协调岗位并汇总结果。',
  },
  {
    id: 'cashier',
    name: '小票',
    role: '收银员',
    character: '收银专员',
    emoji: '⭐',
    color: 0x42c8ff,
    guide: '处理订单咨询、支付流程指引与售后分流。',
  },
  {
    id: 'guide',
    name: '小导',
    role: '导购顾问',
    character: '导购顾问',
    emoji: '🦑',
    color: 0xffbd65,
    guide: '识别顾客需求、比较商品并提供组合购买建议。',
  },
  {
    id: 'buyer',
    name: '采购',
    role: '采购补货',
    character: '采购专员',
    emoji: '🦀',
    color: 0x50e0bd,
    guide: '整理缺货信号、供应商报价与补货建议。',
  },
  {
    id: 'inventory',
    name: '盘点员',
    role: '库存盘点',
    character: '库存专员',
    emoji: '🐿️',
    color: 0x65a6ff,
    guide: '核对库存差异，发现临期和损耗风险。',
  },
  {
    id: 'pm',
    name: '林舟',
    role: '产品经理',
    character: '产品经理',
    emoji: '🦠',
    color: 0xff79c6,
    guide: '将经营目标拆成流程、验收标准和迭代计划。',
  },
]
const selected = ref(props.initialAgent ? [props.initialAgent] : agents.map((a) => a.id))
const activeAgents = computed(() => agents.filter((a) => selected.value.includes(a.id)))
const CHAT_HISTORY_KEY = 'ai-grocery-agent-chat-history-v1'
const CONVERSATIONS_KEY = 'ai-grocery-agent-conversations-v2'
const initialMessages = [
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
]
function makeConversation(messages = initialMessages, title = '新对话') {
  const timestamp = Date.now()
  return {
    id: 'chat-' + timestamp + '-' + Math.random().toString(36).slice(2, 8),
    title,
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: messages.slice(-500),
  }
}
function isValidMessages(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (message) =>
        message &&
        typeof message.id !== 'undefined' &&
        typeof message.role === 'string' &&
        typeof message.text === 'string',
    )
  )
}
function loadConversationState() {
  try {
    const savedSessions = window.localStorage.getItem(CONVERSATIONS_KEY)
    if (savedSessions) {
      const parsed = JSON.parse(savedSessions)
      if (Array.isArray(parsed.conversations) && parsed.conversations.length) {
        const conversations = parsed.conversations
          .filter((item) => item && typeof item.id === 'string' && isValidMessages(item.messages))
          .map((item) => ({ ...item, messages: item.messages.slice(-500) }))
        if (conversations.length) {
          const activeId = conversations.some((item) => item.id === parsed.activeConversationId)
            ? parsed.activeConversationId
            : conversations[0].id
          return { conversations, activeId }
        }
      }
    }
    // Migrate the single-chat history saved by the previous version.
    const legacy = JSON.parse(window.localStorage.getItem(CHAT_HISTORY_KEY) || 'null')
    if (isValidMessages(legacy)) {
      const migrated = makeConversation(legacy, '历史对话')
      return { conversations: [migrated], activeId: migrated.id }
    }
  } catch (error) {
    console.warn('无法恢复本地对话记录，将创建新对话。', error)
  }
  const first = makeConversation()
  return { conversations: [first], activeId: first.id }
}
const initialConversationState = loadConversationState()
const conversations = ref(initialConversationState.conversations)
const activeConversationId = ref(initialConversationState.activeId)
const activeConversation = computed(
  () => conversations.value.find((item) => item.id === activeConversationId.value) || null,
)
const messages = ref(activeConversation.value?.messages || initialMessages)
const showConversationManager = ref(false)
const conversationSearch = ref('')
const filteredConversations = computed(() => {
  const query = conversationSearch.value.trim().toLowerCase()
  return [...conversations.value]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((item) => !query || item.title.toLowerCase().includes(query))
})
function persistChatHistory() {
  try {
    const current = conversations.value.find((item) => item.id === activeConversationId.value)
    if (current) {
      current.messages = messages.value.slice(-500)
      current.updatedAt = Date.now()
      const firstUserMessage = current.messages.find((message) => message.role === 'user')
      if (firstUserMessage && current.title === '新对话') {
        current.title = firstUserMessage.text.trim().slice(0, 32) || '新对话'
      }
    }
    window.localStorage.setItem(
      CONVERSATIONS_KEY,
      JSON.stringify({
        activeConversationId: activeConversationId.value,
        conversations: conversations.value,
      }),
    )
    // Keep the old key in sync for backward compatibility with older builds.
    window.localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages.value.slice(-500)))
  } catch (error) {
    console.warn('群聊记录暂时无法写入本地存储。', error)
  }
}
function createConversation() {
  if (busy.value) return
  const conversation = makeConversation([
    {
      id: Date.now(),
      role: 'system',
      text: '新会话已创建。所有数字人共享本房间上下文。',
      time: now(),
    },
  ])
  conversations.value.unshift(conversation)
  activeConversationId.value = conversation.id
  messages.value = conversation.messages
  showConversationManager.value = false
  persistChatHistory()
}
function switchConversation(id) {
  if (busy.value || id === activeConversationId.value) return
  persistChatHistory()
  const conversation = conversations.value.find((item) => item.id === id)
  if (!conversation) return
  activeConversationId.value = id
  messages.value = conversation.messages.slice(-500)
  showConversationManager.value = false
  nextTick(() => {
    if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight
  })
}
function deleteConversation(id) {
  if (busy.value) return
  const conversation = conversations.value.find((item) => item.id === id)
  if (!conversation || !window.confirm('确定删除对话「' + conversation.title + '」吗？此操作无法撤销。'))
    return
  conversations.value = conversations.value.filter((item) => item.id !== id)
  if (activeConversationId.value === id) {
    if (!conversations.value.length) {
      const replacement = makeConversation()
      conversations.value.push(replacement)
    }
    activeConversationId.value = conversations.value[0].id
    messages.value = conversations.value[0].messages.slice(-500)
  }
  persistChatHistory()
}
watch(messages, persistChatHistory, { deep: true })
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
const businessMode = ref(true)
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
  // Persist synchronously as well, so an in-flight response is retained even if
  // the chat component is unmounted by switching to another submenu.
  persistChatHistory()
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
function createProfessionalHuman(a) {
  const g = new THREE.Group()
  g.position.set(...agentPositions[a.id])
  g.userData.agentId = a.id
  const skinTone = { manager: 0xc98f6d, cashier: 0xe0b08b, guide: 0xb97955, buyer: 0xd8a17c, inventory: 0xb77e5e, pm: 0xe2b999 }[a.id] || 0xc98f6d
  const shirtTone = { manager: 0x243b4a, cashier: 0x202b34, guide: 0x384e48, buyer: 0x6a3d2e, inventory: 0xeee6d8, pm: 0x454b5c }[a.id] || 0x243b4a
  const skin = characterMat(skinTone, 0.72), shirt = characterMat(shirtTone, 0.78)
  const trousers = characterMat(a.id === 'inventory' ? 0x303b43 : 0x292e35, 0.84)
  const hair = characterMat(({manager:0x30231d,cashier:0x211b19,guide:0x29201b,buyer:0x3c2920,inventory:0x4b3426,pm:0x302721})[a.id], 0.9)
  const shoe = mat(0x17191c, 0.62)
  const add = (geo, material, position, parent = g, rotation = null, scale = null) => {
    const part = mesh(geo, material, position, parent, rotation, scale)
    part.castShadow = true; part.receiveShadow = true
    return part
  }
  const limb = (from, to, radiusA, radiusB, material) => makeLimb(g, material, from, to, radiusA, radiusB)
  const hit = mesh(new THREE.CapsuleGeometry(0.43, 1.05, 5, 10), mat(0xffffff, 0.8, 0, { transparent: true, opacity: 0, depthWrite: false }), [0, 1.02, 0], g)
  hit.castShadow = false; hit.receiveShadow = false; hit.userData.agentId = a.id; characterHitMeshes.push(hit)
  for (const x of [-0.13, 0.13]) {
    add(new THREE.BoxGeometry(0.19, 0.11, 0.34), shoe, [x, 0.08, 0.07])
    add(new THREE.CylinderGeometry(0.075, 0.095, 0.48, 16), trousers, [x, 0.34, 0])
  }
  add(new RoundedBoxGeometry(0.53, 0.66, 0.3, 5, 0.045), shirt, [0, 0.91, 0])
  add(new THREE.CylinderGeometry(0.095, 0.105, 0.16, 18), skin, [0, 1.31, 0])
  add(new THREE.SphereGeometry(0.155, 24, 20), skin, [0, 1.56, 0.015], g, null, [0.88, 1.12, 0.82])
  add(new THREE.SphereGeometry(0.16, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), hair, [0, 1.65, -0.006], g, null, [0.94, 0.8, 0.9])
  for (const x of [-0.135, 0.135]) {
    add(new THREE.SphereGeometry(0.035, 12, 10), hair, [x, 1.58, -0.015])
    add(new THREE.SphereGeometry(0.027, 12, 10), skin, [x, 1.55, 0.01])
    add(new THREE.SphereGeometry(0.014, 10, 8), mat(0x292522, 0.8), [x * 0.47, 1.57, 0.145])
    add(new THREE.BoxGeometry(0.045, 0.012, 0.018), hair, [x * 0.47, 1.602, 0.14])
  }
  add(new THREE.SphereGeometry(0.022, 10, 8), skin, [0, 1.525, 0.15], g, null, [0.7, 0.85, 0.8])
  for (const side of [-1, 1]) {
    limb([side * 0.25, 1.14, 0], [side * 0.34, 0.78, 0.045], 0.075, 0.055, shirt)
    limb([side * 0.34, 0.78, 0.045], [side * 0.31, 0.58, 0.09], 0.052, 0.038, skin)
    add(new THREE.SphereGeometry(0.045, 12, 10), skin, [side * 0.31, 0.56, 0.09])
  }
  if (['manager','cashier','guide','buyer'].includes(a.id)) {
    add(new THREE.BoxGeometry(0.105, 0.14, 0.018), mat(a.color, 0.42, 0.16), [0.105, 0.99, 0.158])
    add(new THREE.BoxGeometry(0.055, 0.018, 0.012), mat(0xf4e8d0, 0.7), [0.105, 1.015, 0.17])
  }
  const ring = mesh(new THREE.TorusGeometry(0.42, 0.012, 8, 44), new THREE.MeshBasicMaterial({ color: a.color, transparent: true, opacity: 0.45 }), [0, 0.025, 0], g, [Math.PI / 2, 0, 0])
  g.userData.ring = ring; scene.add(g); characterGroups.set(a.id, g)
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
function createBusinessArchitecture() {
  // Dedicated architectural layer inspired by the supplied upscale cafe reference.
  const root = new THREE.Group()
  root.name = 'Business_Cafe_Architecture'
  root.visible = false
  scene.add(root)
  const material = (color, roughness = 0.55, metalness = 0.05) => new THREE.MeshStandardMaterial({ color, roughness, metalness })
  const walnut = material(0x573725, 0.42), walnutEdge = material(0x9a6b43, 0.36)
  const darkMetal = material(0x252b2e, 0.3, 0.68), brass = material(0xc79b58, 0.27, 0.72)
  const plaster = material(0xe7d9c5, 0.86)
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xd9ecf4, roughness: 0.08, metalness: 0.02, transmission: 0.52, transparent: true, opacity: 0.24, thickness: 0.06, side: THREE.DoubleSide })
  const add = (geometry, mat, x, y, z, parent = root) => {
    const object = new THREE.Mesh(geometry, mat)
    object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; parent.add(object)
    return object
  }
  const line = (points, radius, mat, parent = root) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)))
    const object = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, points.length * 8), radius, 8, false), mat)
    object.castShadow = true; parent.add(object); return object
  }
  // Raised mezzanine with a bowed front edge and brass balustrade.
  add(new THREE.BoxGeometry(15.8, 0.22, 3.1), walnut, 0, 4.15, -3.7)
  add(new THREE.BoxGeometry(15.5, 0.09, 3.0), walnutEdge, 0, 4.29, -3.7)
  const balcony = []
  for (let i=0;i<=48;i++) { const t=i/48; balcony.push([-7.7+t*15.4,4.85,-2.25-0.9*Math.sin(t*Math.PI)]) }
  line(balcony,0.055,darkMetal); line(balcony.map(([x,y,z])=>[x,y-0.62,z]),0.025,brass)
  for(let i=0;i<=32;i++){const t=i/32,x=-7.6+t*15.2,z=-2.25-0.9*Math.sin(t*Math.PI);line([[x,4.24,z],[x,4.84,z]],0.018,darkMetal)}
  // Tall right-side window wall, dark mullions and arched transoms.
  const windows = new THREE.Group(); windows.position.set(9.15,0,-0.2); root.add(windows)
  add(new THREE.BoxGeometry(0.12,5.9,14.5),plaster,0,2.95,-0.2,windows)
  for(const z of [-5.7,-2.1,1.5,5.1]){
    add(new THREE.BoxGeometry(0.08,4.4,2.9),glass,-0.09,3.0,z,windows)
    for(const dz of [-1.48,1.48]) add(new THREE.BoxGeometry(0.12,4.45,0.09),darkMetal,-0.17,3.0,z+dz,windows)
    add(new THREE.BoxGeometry(0.12,0.09,2.95),darkMetal,-0.17,0.78,z,windows)
    add(new THREE.BoxGeometry(0.12,0.09,2.95),darkMetal,-0.17,4.62,z,windows)
    add(new THREE.BoxGeometry(0.12,4.2,0.06),darkMetal,-0.18,2.9,z,windows)
    const arc=[]; for(let i=0;i<=24;i++){const a=Math.PI+Math.PI*i/24;arc.push([-0.17,4.55+0.78*Math.sin(a),z+1.48*Math.cos(a)])}
    line(arc,0.045,darkMetal,windows)
  }
  // Curved stair climbing toward the gallery, with handrail.
  const stair = new THREE.Group(); stair.name='Curved_Mezzanine_Stair'; root.add(stair)
  for(let i=0;i<22;i++){const t=i/21,a=-Math.PI*0.48+t*Math.PI*0.72,r=3.05,x=5.9+Math.cos(a)*r,z=2.2+Math.sin(a)*r;const step=add(new THREE.BoxGeometry(0.78,0.12,0.48),walnutEdge,x,0.3+t*3.8,z,stair);step.rotation.y=-a}
  const rail=[];for(let i=0;i<=40;i++){const t=i/40,a=-Math.PI*0.48+t*Math.PI*0.72;rail.push([5.9+Math.cos(a)*3.05,1+t*3.8,2.2+Math.sin(a)*3.05])}
  line(rail,0.055,darkMetal,stair);line(rail.map(([x,y,z])=>[x,y-0.45,z]),0.025,brass,stair)
  // Walnut pastry counter with pale stone top, glass guard and display pieces.
  add(new THREE.BoxGeometry(7.2,1.0,1.55),walnut,-5,0.62,2.4)
  add(new THREE.BoxGeometry(7.35,0.14,1.68),material(0xe5d9c8,0.22),-5,1.19,2.4)
  add(new THREE.BoxGeometry(6.7,0.72,0.05),glass,-5,1.62,1.72)
  for(let i=0;i<6;i++) add(new THREE.BoxGeometry(0.72,0.12,0.42),material([0xc88b48,0x8b4a30,0xe7c58d][i%3],0.55),-7.7+i*1.08,1.36,2.35)
  // Cafe tables and upholstered lounge chairs.
  for(const [x,z] of [[-1.8,4.4],[2,4.9],[4,-0.1]]){
    add(new THREE.CylinderGeometry(0.58,0.62,0.12,32),walnutEdge,x,0.86,z)
    add(new THREE.CylinderGeometry(0.07,0.09,0.82,12),darkMetal,x,0.42,z)
    for(const dx of [-0.95,0.95]){add(new THREE.BoxGeometry(0.72,0.9,0.72),walnut,x+dx,0.48,z);add(new THREE.BoxGeometry(0.72,0.12,0.72),material(0x6e5140,0.85),x+dx,0.98,z)}
  }
  // Warm brass pendant lamps.
  for(const [x,z] of [[-6.5,-1.4],[-3.4,-1.4],[-0.2,-1.4],[3,-1.4],[6,-1.4]]){
    line([[x,7.35,z],[x,6.35,z]],0.018,darkMetal)
    add(new THREE.CylinderGeometry(0.34,0.55,0.22,24),brass,x,6.3,z)
    const bulbMat=new THREE.MeshStandardMaterial({color:0xffe2a5,emissive:0xffb34d,emissiveIntensity:2.2,roughness:0.25})
    add(new THREE.SphereGeometry(0.16,16,12),bulbMat,x,6.05,z)
    const light=new THREE.PointLight(0xffc777,10,7,1.8);light.position.set(x,6,z);root.add(light)
  }
  return root
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
    const character = createProfessionalHuman(a)
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
  const floorPattern = canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#eee7d9'
    ctx.fillRect(0, 0, w, h)
    const tile = 128
    for (let y = 0; y < h; y += tile) {
      for (let x = 0; x < w; x += tile) {
        ctx.fillStyle = ((x / tile + y / tile) % 2) ? '#e9e1d2' : '#f8f3e9'
        ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4)
        ctx.save()
        ctx.translate(x + tile / 2, y + tile / 2)
        ctx.rotate(Math.PI / 4)
        ctx.fillStyle = '#a95e4e'
        ctx.fillRect(-18, -18, 36, 36)
        ctx.fillStyle = '#657a78'
        ctx.fillRect(-8, -48, 16, 96)
        ctx.fillRect(-48, -8, 96, 16)
        ctx.fillStyle = '#f8f2e8'
        ctx.fillRect(-6, -6, 12, 12)
        ctx.restore()
      }
    }
    ctx.strokeStyle = '#b9ab98'
    ctx.lineWidth = 3
    for (let p = 0; p <= w; p += tile) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke()
    }
  }, 5, 5)
  const floorTile = new THREE.MeshStandardMaterial({ map: floorPattern, color: 0xffffff, roughness: 0.34, metalness: 0.015 }),
    grout = mat(0x75614d, 0.8),
    wall = mat(0xe8e9e4, 0.88),
    brickTexture = canvasTexture((ctx, w, h) => {
      ctx.fillStyle = '#d5c5ad'; ctx.fillRect(0, 0, w, h)
      const bh = 38, bw = 78
      for (let row = 0; row < h / bh; row++) {
        const offset = row % 2 ? -bw / 2 : 0
        for (let x = offset; x < w + bw; x += bw) {
          const shade = ['#8d4935', '#a9563c', '#b76447', '#984b38', '#c07454'][(row * 7 + Math.floor((x + bw) / bw) * 3) % 5]
          ctx.fillStyle = shade; ctx.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4)
          ctx.fillStyle = '#d9c9b6'; ctx.fillRect(x, row * bh, bw, 3); ctx.fillRect(x, row * bh + bh - 3, bw, 3)
        }
      }
    }, 3, 2),
    brickMat = new THREE.MeshStandardMaterial({ map: brickTexture, color: 0xffffff, roughness: 0.92 }),
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
  const green = mat(0x4b9b83, 0.38),
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
  // Richly zoned flooring: a teal central aisle, terracotta checkout bays, and brass inlay.
  const aisleTeal = mat(0x356d68, 0.36, 0.12)
  const checkoutClay = mat(0xb86f4e, 0.4, 0.06)
  const brassInlay = mat(0xe0b65e, 0.28, 0.42)
  add(new THREE.BoxGeometry(3.05, 0.018, 10.2), aisleTeal, [0, -0.061, 0.2])
  add(new THREE.BoxGeometry(4.2, 0.018, 3.2), checkoutClay, [-6.85, -0.061, 5.35])
  add(new THREE.BoxGeometry(4.2, 0.018, 3.2), checkoutClay, [6.85, -0.061, 5.35])
  for (const x of [-1.58, 1.58]) {
    add(new THREE.BoxGeometry(0.045, 0.02, 10.2), brassInlay, [x, -0.05, 0.2])
  }
  for (const z of [4.95, 5.75]) {
    add(new THREE.BoxGeometry(4.0, 0.02, 0.035), brassInlay, [-6.85, -0.05, z])
    add(new THREE.BoxGeometry(4.0, 0.02, 0.035), brassInlay, [6.85, -0.05, z])
  }
  // Tall neutral walls and a suspended retail ceiling frame.
  add(new THREE.BoxGeometry(20, 7.7, 0.28), brickMat, [0, 3.75, -8.95])
  add(new THREE.BoxGeometry(0.28, 7.7, 18.1), brickMat, [-9.85, 3.75, 0])
  add(new THREE.BoxGeometry(0.28, 7.7, 18.1), brickMat, [9.85, 3.75, 0])
  // Timber pilasters and warm wood framing echo the reference deli shop.
  const oak = mat(0x9b693d, 0.48, 0.06), oakHighlight = mat(0xc08a50, 0.42, 0.04)
  for (const x of [-9.35, -6.2, -3.1, 0, 3.1, 6.2, 9.35]) {
    add(new THREE.BoxGeometry(0.18, 6.9, 0.2), oak, [x, 3.6, -8.73])
    add(new THREE.BoxGeometry(0.055, 6.7, 0.035), oakHighlight, [x + 0.065, 3.6, -8.61])
  }
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
  // Arched industrial windows with brick reveals and black steel muntins.
  const windowGlass = new THREE.MeshPhysicalMaterial({ color: 0xd8e8e9, roughness: 0.1, metalness: 0.02, transparent: true, opacity: 0.18, transmission: 0.3, side: THREE.DoubleSide })
  const windowFrame = mat(0x252c2b, 0.3, 0.55)
  for (const wx of [-7.3, -3.8, 3.8, 7.3]) {
    const wz = 8.68
    add(new THREE.BoxGeometry(2.0, 3.8, 0.12), mat(0x9c533c, 0.85), [wx, 3.0, wz])
    add(new THREE.BoxGeometry(1.68, 3.42, 0.035), windowGlass, [wx, 3.0, wz - 0.08])
    // Vertical jambs and arch built from a smooth half-circle tube.
    add(new THREE.BoxGeometry(0.075, 3.35, 0.11), windowFrame, [wx - 0.82, 3.0, wz - 0.14])
    add(new THREE.BoxGeometry(0.075, 3.35, 0.11), windowFrame, [wx + 0.82, 3.0, wz - 0.14])
    const arc = new THREE.EllipseCurve(wx, 4.67, 0.82, 0.82, Math.PI, 0, false, 0)
    const arcPoints = arc.getPoints(40).map(p => new THREE.Vector3(p.x, p.y, wz - 0.14))
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPoints), 40, 0.045, 8, false), windowFrame, [0, 0, 0])
    add(new THREE.BoxGeometry(1.62, 0.055, 0.1), windowFrame, [wx, 3.0, wz - 0.16])
    add(new THREE.BoxGeometry(0.055, 3.2, 0.1), windowFrame, [wx, 3.0, wz - 0.16])
    add(new THREE.BoxGeometry(1.58, 0.055, 0.1), windowFrame, [wx, 4.0, wz - 0.16])
  }
  // Tall oak-framed specialty shelves: bottles, jars and paper-wrapped goods.
  const shelfOak = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), color: 0xb17c49, roughness: 0.5 })
  for (const sideX of [-9.35, 9.35]) {
    for (let level = 0; level < 5; level++) {
      const y = 1.0 + level * 1.05
      add(new THREE.BoxGeometry(0.62, 0.095, 13.6), shelfOak, [sideX * 0.985, y, -0.15])
      for (let n = 0; n < 13; n++) {
        const z = -6.2 + n * 1.0
        const bottleMat = mat([0x293d31, 0x4c2523, 0x7d4a28, 0x263b4b][(n + level) % 4], 0.24, 0.28)
        add(new THREE.CylinderGeometry(0.105, 0.13, 0.48, 12), bottleMat, [sideX * 0.95, y + 0.29, z])
        add(new THREE.CylinderGeometry(0.045, 0.06, 0.16, 10), bottleMat, [sideX * 0.95, y + 0.6, z])
        add(new THREE.BoxGeometry(0.13, 0.13, 0.012), mat([0xd6bd87, 0xe5dfcf, 0xb55b43][(n + level) % 3], 0.75), [sideX * 0.945, y + 0.28, z + 0.132])
      }
    }
    add(new THREE.BoxGeometry(0.78, 5.55, 0.22), shelfOak, [sideX * 0.985, 3.45, -7.0])
    add(new THREE.BoxGeometry(0.78, 5.55, 0.22), shelfOak, [sideX * 0.985, 3.45, 6.7])
  }
  // Warm pendant lamps with brass shades, glowing bulbs and dark suspension cords.
  const brass = mat(0x80602d, 0.28, 0.68)
  const lampShade = mat(0x6d552b, 0.32, 0.52)
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe4a4, emissive: 0xffc96b, emissiveIntensity: 1.8, roughness: 0.2 })
  for (const lx of [-7.0, -3.5, 0, 3.5, 7.0]) {
    const lz = -1.7
    add(new THREE.CylinderGeometry(0.018, 0.018, 1.2, 8), dark, [lx, 6.55, lz])
    add(new THREE.CylinderGeometry(0.14, 0.52, 0.48, 24, 1, true), lampShade, [lx, 5.88, lz])
    add(new THREE.SphereGeometry(0.22, 18, 12), bulbMat, [lx, 5.65, lz])
    add(new THREE.TorusGeometry(0.47, 0.025, 8, 24), brass, [lx, 5.66, lz], [Math.PI / 2, 0, 0])
  }
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
  // Signature green-framed deli counter with a real glass sneeze guard and food display.
  const deli = new THREE.Group()
  deli.name = 'Photorealistic_Green_Deli_Counter'
  deli.position.set(2.05, 0, 3.65)
  roomRoot.add(deli)
  const deliPart = (geo, material, pos, rot = null) => mesh(geo, material, pos, deli, rot)
  const enamelGreen = mat(0x397d68, 0.34, 0.08)
  const oakTop = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), color: 0xc49a68, roughness: 0.42, metalness: 0.015, envMapIntensity: 0.55 })
  const deliSteel = mat(0xb9c0bf, 0.26, 0.55)
  const deliGlass = new THREE.MeshPhysicalMaterial({ color: 0xe8f4f1, roughness: 0.045, metalness: 0.025, transparent: true, opacity: 0.2, transmission: 0.72, thickness: 0.08, ior: 1.48, envMapIntensity: 1.35, side: THREE.DoubleSide, depthWrite: false })
  deliPart(new RoundedBoxGeometry(6.8, 0.9, 1.25, 6, 0.045), enamelGreen, [0, 0.48, 0])
  deliPart(new RoundedBoxGeometry(6.92, 0.12, 1.36, 6, 0.035), oakTop, [0, 0.99, 0])
  deliPart(new THREE.BoxGeometry(6.55, 0.035, 0.04), oak, [0, 0.82, 0.635])
  for (const x of [-2.35, -0.8, 0.8, 2.35]) {
    deliPart(new RoundedBoxGeometry(1.15, 0.5, 0.025, 4, 0.015), mat(0x2c6857, 0.45), [x, 0.47, 0.635])
    deliPart(new THREE.BoxGeometry(1.0, 0.025, 0.02), oakHighlight, [x, 0.62, 0.655])
  }
  deliPart(new THREE.BoxGeometry(6.5, 0.055, 0.9), deliSteel, [0, 1.12, -0.05])
  deliPart(new THREE.BoxGeometry(6.5, 0.05, 0.9), mat(0xf0e9dc, 0.28), [0, 1.17, -0.05])
  // Glass planes lean slightly inward; slim metal posts and top rail catch the warm lighting.
  for (const x of [-3.1, -1.55, 0, 1.55, 3.1]) {
    deliPart(new THREE.BoxGeometry(0.035, 0.88, 0.04), deliSteel, [x, 1.68, -0.44])
    deliPart(new THREE.BoxGeometry(0.035, 0.88, 0.04), deliSteel, [x, 1.68, 0.36])
  }
  deliPart(new THREE.BoxGeometry(6.35, 0.035, 0.04), deliSteel, [0, 2.12, -0.44])
  deliPart(new THREE.BoxGeometry(6.35, 0.035, 0.04), deliSteel, [0, 2.12, 0.36])
  deliPart(new THREE.PlaneGeometry(6.25, 0.86), deliGlass, [0, 1.68, -0.43])
  deliPart(new THREE.PlaneGeometry(6.25, 0.86), deliGlass, [0, 1.68, 0.35])
  // Cheese wheels, deli tubs and produce arranged in distinct display trays.
  for (let i = 0; i < 6; i++) {
    const x = -2.55 + i * 1.02
    deliPart(new THREE.BoxGeometry(0.76, 0.16, 0.52), mat(0xddd3bd, 0.62), [x, 1.29, -0.16])
    deliPart(new THREE.CylinderGeometry(0.19, 0.19, 0.18, 32), mat([0xd8b65b, 0xe7d39b, 0xc89c4b][i % 3], 0.48), [x, 1.43, -0.14])
    deliPart(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 32), mat(0xf2df9d, 0.5), [x, 1.53, -0.14])
    for (let k = 0; k < 3; k++) {
      deliPart(new THREE.SphereGeometry(0.095, 14, 10), mat([0x9f3f35, 0x6c8e4b, 0xd1a14b][(i + k) % 3], 0.42), [x - 0.18 + k * 0.18, 1.35, 0.13])
    }
  }
  // Recessed warm LED strip inside the case.
  deliPart(new THREE.BoxGeometry(6.2, 0.025, 0.025), mat(0xffd9a0, 0.24, 0.04, { emissive: 0xffb65b, emissiveIntensity: 1.15 }), [0, 2.02, 0.31])
  // Floor-level aisle endcaps and safety bollards anchor the gondolas visually.
  for (const x of [-7.0, -3.45, 0.3, 4.0, 7.1]) {
    add(new THREE.BoxGeometry(0.16, 0.65, 0.16), warm, [x, 0.33, 1.4])
    add(new THREE.CylinderGeometry(0.12, 0.15, 0.08, 16), dark, [x, 0.05, 1.4])
  }
}
function createCoffeeBarAccent() {
  const bar = new THREE.Group()
  bar.name = 'PBR_Coffee_Bar_Accent'
  bar.position.set(0, 0, -5.05)
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
  const barMarble = mat(0xe5ded1, 0.22, 0.14)
  addPart(new RoundedBoxGeometry(6.15, 0.96, 1.15, 8, 0.065), walnut, [0, 0.51, 0])
  addPart(new RoundedBoxGeometry(6.28, 0.115, 1.28, 8, 0.04), barMarble, [0, 1.055, 0])
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
  camera.position.set(0, 4.15, 14.6)
  camera.lookAt(0, 1.65, -1.25)
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, headlessRender ? 0.85 : 1.35))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.useLegacyLights = false
  renderer.shadowMap.enabled = !headlessRender
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.physicallyCorrectLights = true
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
  scene.add(new THREE.HemisphereLight(0xffedd6, 0x514237, 1.28))
  scene.add(new THREE.AmbientLight(0xffffff, 0.24))
  // Warm practicals layered over neutral fill produce the amber-lit deli reference look.
  const practicalLights = new THREE.Group()
  practicalLights.name = 'Warm_Deli_Practical_Lights'
  for (const [x, z, intensity] of [[-7, -1.7, 28], [-3.5, -1.7, 32], [0, -1.7, 34], [3.5, -1.7, 32], [7, -1.7, 28]]) {
    const lamp = new THREE.PointLight(0xffc77a, intensity, 8, 1.8)
    lamp.position.set(x, 5.45, z)
    lamp.castShadow = false
    practicalLights.add(lamp)
  }
  scene.add(practicalLights)
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
  const coolGlassFill = new THREE.DirectionalLight(0xd8efff, 0.42)
  coolGlassFill.position.set(0, 4, 8)
  scene.add(coolGlassFill)
  const warm = new THREE.PointLight(0xffc06e, 22, 16)
  warm.position.set(-1, 5, 0)
  scene.add(warm)
  buildLibraryRoom()
  createBusinessArchitecture()
  createRetailAisle()
  createCoffeeBarAccent()
  const cafeArchitecture = scene.getObjectByName('Business_Cafe_Architecture')
  if (cafeArchitecture) cafeArchitecture.visible = true
  if (roomRoot) roomRoot.visible = false
  buildCharacter()
  raycaster = new THREE.Raycaster()
  // Use the custom-built retail scene as the single source of truth. Loading the benchmark café GLTF here
  // layered stock furniture over the authored fixtures, making the tables and shelves look unchanged.
  highDetailRoomLoaded.value = true
  highDetailCafeLoaded.value = true
  roomRenderStatus.value = '熟食店空间 · PBR 材质 · 实时阴影与暖光'
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
function toggleBusinessMode() {
  businessMode.value = !businessMode.value
  if (scene) {
    const businessArchitecture = scene.getObjectByName('Business_Cafe_Architecture')
    if (businessArchitecture) businessArchitecture.visible = businessMode.value
    const business = businessMode.value
    scene.background = new THREE.Color(business ? 0x17222b : 0x19150f)
    if (scene.fog) {
      scene.fog.color.setHex(business ? 0x17222b : 0x19150f)
      scene.fog.density = business ? 0.009 : 0.013
    }
    if (renderer) renderer.toneMappingExposure = business ? 1.02 : 1.08
    scene.traverse((object) => {
      if (object.isLight && object.name === 'Warm_Deli_Practical_Lights') object.intensity = business ? 0 : object.intensity
    })
    const practicals = scene.getObjectByName('Warm_Deli_Practical_Lights')
    if (practicals) {
      practicals.children.forEach((light) => {
        if (light.isLight) light.intensity = business ? 20 : 28
      })
    }
  }
  status.value = businessMode.value ? '商务写实主题已启用' : '童话主题已启用'
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
  <section class="space3d" :class="{ 'business-theme': businessMode }">
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
      <button class="scene-mode-btn" @click="toggleBusinessMode" :aria-pressed="businessMode">
        {{ businessMode ? '✦ 商务写实版' : '◈ 童话场景版' }}
      </button>
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
            <p>{{ conversations.length }} 个本地对话 · 自动保存</p>
          </div>
          <div class="conversation-head-actions">
            <button class="panel-menu" aria-label="管理对话记录" :aria-expanded="showConversationManager" @click="showConversationManager = !showConversationManager">
              ☷ 记录
            </button>
            <button class="panel-menu new-chat-button" aria-label="新建会话" :disabled="busy" @click="createConversation">
              ＋ 新建
            </button>
          </div>
        </div>
        <section v-if="showConversationManager" class="conversation-manager">
          <div class="conversation-manager-title">
            <b>对话记录</b>
            <span>{{ conversations.length }} 条</span>
          </div>
          <input v-model="conversationSearch" class="conversation-search" placeholder="搜索对话标题…" aria-label="搜索对话标题" />
          <div v-if="!filteredConversations.length" class="conversation-empty">没有匹配的对话记录</div>
          <div v-for="conversation in filteredConversations" :key="conversation.id" class="conversation-item" :class="{ active: conversation.id === activeConversationId }">
            <button class="conversation-open" :disabled="busy" @click="switchConversation(conversation.id)">
              <b>{{ conversation.title }}</b>
              <small>{{ conversation.messages.length }} 条消息 · {{ new Date(conversation.updatedAt).toLocaleString() }}</small>
              <span>{{ conversation.messages.find((message) => message.role === 'user')?.text || '尚未发送消息' }}</span>
            </button>
            <button class="conversation-delete" :disabled="busy" :aria-label="'删除对话 ' + conversation.title" title="删除对话" @click="deleteConversation(conversation.id)">×</button>
          </div>
          <p class="conversation-storage-note">记录仅保存在当前浏览器；清除浏览器站点数据会删除这些记录。</p>
        </section>
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

/* Scene presets: keep the interactive 3D canvas, role controls and chat state intact. */
.scene-mode-btn {
  flex: 0 0 auto;
  border: 1px solid #e7c28a66;
  border-radius: 10px;
  padding: 9px 12px;
  color: #f8e6c7;
  background: linear-gradient(135deg, #76502bdb, #282a2bcc);
  box-shadow: 0 4px 18px #0003, inset 0 1px #ffffff1c;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: transform .2s ease, border-color .2s ease, background .2s ease;
}
.scene-mode-btn:hover { transform: translateY(-1px); border-color: #f6d7a4; }
.business-theme .space-top {
  background: linear-gradient(180deg, #101b24f5, #14212bd9);
  border-bottom-color: #c5a16b66;
}
.business-theme .brand-orb {
  background: radial-gradient(circle at 35% 25%, #f4d5a0, #9c6a36 72%);
  box-shadow: 0 0 24px #d4a15c40;
}
.business-theme .glass-panel,
.business-theme .chat-panel {
  border-color: #d4b17a88;
  background: linear-gradient(155deg, #17242bea, #101a23f2);
  box-shadow: 0 20px 60px #0008, inset 0 1px #f2d5a02b;
}
.business-theme .left-glass { border-radius: 8px; }
.business-theme .chat-panel { border-radius: 10px; }
.business-theme .live-badge { color: #c6e7d2; border-color: #79c7a35c; }
.business-theme .scene-mode-btn {
  color: #17212a;
  border-color: #f4d7a4;
  background: linear-gradient(135deg, #f1d8aa, #c79b5b);
}
.business-theme .agent-label {
  border-radius: 8px;
  background: #17232bdc;
  border-color: #ddc18c75;
}
.business-theme .agent-label.focused {
  background: #26353edc;
  box-shadow: 0 0 18px #e0b87335;
}
.business-theme .view-dock {
  border-color: #d7b77c5c;
  background: linear-gradient(120deg, #17232be8, #202b32df);
}
.business-theme .radar { border-color: #c5a16b9c; background: radial-gradient(circle, #d5ac6d30, transparent 72%), #101a20c9; }
@media (max-width: 1180px) {
  .scene-mode-btn { padding: 8px 9px; font-size: 10px; }
}
@media (max-width: 860px) {
  .scene-mode-btn { display: none; }
}

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
  gap: 8px;
  border-bottom: 1px solid #b0d3e51c;
  background: #07152242;
}
.conversation-head-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
.panel-menu:disabled,
.conversation-open:disabled,
.conversation-delete:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.conversation-manager {
  padding: 10px;
  max-height: 245px;
  overflow-y: auto;
  border-bottom: 1px solid #b0d3e51c;
  background: #071522d9;
}
.conversation-manager-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  color: #eaf5ff;
  font-size: 11px;
}
.conversation-manager-title span,
.conversation-storage-note {
  color: #8ca9bd;
  font-size: 9px;
}
.conversation-search {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid #91bad02b;
  border-radius: 8px;
  outline: none;
  background: #ffffff08;
  color: #f3f8fc;
  font: inherit;
  font-size: 11px;
}
.conversation-search:focus {
  border-color: #67c8f0a6;
}
.conversation-search::placeholder {
  color: #7997ad;
}
.conversation-item {
  display: flex;
  align-items: stretch;
  gap: 4px;
  margin-bottom: 5px;
  border: 1px solid #91bad018;
  border-radius: 8px;
  background: #ffffff05;
}
.conversation-item.active {
  border-color: #6ccdf077;
  background: #56b9e514;
}
.conversation-open {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 0;
  background: transparent;
  color: #e9f5ff;
  text-align: left;
  cursor: pointer;
}
.conversation-open b,
.conversation-open small,
.conversation-open span {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conversation-open b {
  font-size: 10px;
  font-weight: 650;
}
.conversation-open small {
  color: #8ca9bd;
  font-size: 8px;
}
.conversation-open span {
  color: #b2c8d8;
  font-size: 9px;
}
.conversation-delete {
  align-self: center;
  margin-right: 5px;
  width: 25px;
  height: 25px;
  border: 1px solid #ff8a8a30;
  border-radius: 6px;
  background: #ff77770a;
  color: #ffaaaa;
  cursor: pointer;
}
.conversation-empty {
  padding: 14px 5px;
  color: #9bb3c5;
  font-size: 10px;
  text-align: center;
}
.conversation-storage-note {
  line-height: 1.5;
  margin: 8px 2px 0;
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

</style>
