<script setup>
import { ref, computed } from 'vue'
const props = defineProps({
  onOpenAgent: { type: Function, required: true },
  onOpenModule: { type: Function, required: true },
})
const agents = [
  {
    id: 'manager',
    name: '店长 · 经营负责人',
    role: '经营中枢',
    icon: '♙',
    code: 'CEO / OPS',
    tone: 'mint',
    desc: '统筹销售、库存与任务，分配工作并跟踪结果。',
    tasks: ['经营简报', '异常升级', '任务验收'],
  },
  {
    id: 'cashier',
    name: '收银员数字人',
    role: '交易服务',
    icon: '▤',
    code: 'FRONT DESK',
    tone: 'blue',
    desc: '订单咨询、支付流程指引、售后分流与常见问题处理。',
    tasks: ['订单问答', '售后分流', '服务话术'],
  },
  {
    id: 'guide',
    name: '导购数字人',
    role: '销售转化',
    icon: '✳',
    code: 'SALES GUIDE',
    tone: 'violet',
    desc: '理解顾客需求、比较商品、推荐组合并解释卖点。',
    tasks: ['需求识别', '商品推荐', '连带购'],
  },
  {
    id: 'buyer',
    name: '采购 / 补货数字人',
    role: '供应链',
    icon: '⇄',
    code: 'PROCUREMENT',
    tone: 'amber',
    desc: '汇总缺货信号、供应商报价与补货建议，等待负责人确认。',
    tasks: ['缺货清单', '报价比较', '补货建议'],
  },
  {
    id: 'inventory',
    name: '库存盘点数字人',
    role: '库存与损耗',
    icon: '▦',
    code: 'INVENTORY',
    tone: 'cyan',
    desc: '协助盘点、核对库存差异，生成待核验的损耗线索。',
    tasks: ['盘点清单', '差异核对', '临期提醒'],
  },
  {
    id: 'pm',
    name: '产品经理数字人',
    role: '流程与系统负责人',
    icon: '⌘',
    code: 'PRODUCT LEAD',
    tone: 'rose',
    desc: '把经营目标拆成流程、工具需求、验收标准与迭代计划。',
    tasks: ['需求拆解', '流程编排', '效果复盘'],
  },
]
const tabs = ['全部', '经营', '销售', '供应链', '产品']
const tab = ref('全部')
const group = (id) =>
  ({
    manager: '经营',
    cashier: '销售',
    guide: '销售',
    buyer: '供应链',
    inventory: '供应链',
    pm: '产品',
  })[id]
const visibleAgents = computed(() =>
  tab.value === '全部' ? agents : agents.filter((a) => group(a.id) === tab.value),
)
function openAgent(a) {
  props.onOpenAgent(a.id)
}
</script>
<template>
  <section class="ops-home">
    <div class="ops-glow"></div>
    <header class="ops-head">
      <div>
        <div class="ops-kicker"><i></i> AI RETAIL OPERATING SYSTEM <span>MVP / 01</span></div>
        <h1>让每个岗位，都有自己的数字员工。</h1>
        <p>从接待顾客、成交转化，到采购库存与经营决策；一个负责人统筹，多位 Agent 分工协作。</p>
      </div>
      <button class="ops-primary" @click="props.onOpenAgent('manager')">
        ◉ 进入经营协作室 <b>↗</b>
      </button>
    </header>
    <div class="ops-status">
      <div>
        <i></i><span><b>经营系统</b><small>数字岗位已配置</small></span>
      </div>
      <em></em>
      <div>
        <strong>06</strong><span><b>岗位角色</b><small>各司其职</small></span>
      </div>
      <em></em>
      <div>
        <strong>01</strong><span><b>共享任务空间</b><small>统一消息与上下文</small></span>
      </div>
      <small class="ops-disclaimer">当前为可交互 MVP · 尚未接入真实经营数据</small>
    </div>
    <div class="ops-section-head">
      <div>
        <span>01 / DIGITAL WORKFORCE</span>
        <h2>数字员工组织架构</h2>
        <p>点击岗位直接进入协作室。负责人拆解任务，岗位 Agent 分工讨论。</p>
      </div>
      <nav>
        <button v-for="t in tabs" :key="t" :class="{ active: tab === t }" @click="tab = t">
          {{ t }}
        </button>
      </nav>
    </div>
    <div class="ops-grid">
      <button
        v-for="a in visibleAgents"
        :key="a.id"
        class="ops-agent"
        :class="'tone-' + a.tone"
        @click="openAgent(a)"
      >
        <div class="ops-agent-top">
          <span class="ops-icon">{{ a.icon }}</span
          ><span class="ops-code">{{ a.code }}</span
          ><b>↗</b>
        </div>
        <small class="ops-role">{{ a.role }}</small>
        <h3>{{ a.name }}</h3>
        <p>{{ a.desc }}</p>
        <div class="ops-tasks">
          <span v-for="task in a.tasks" :key="task">{{ task }}</span>
        </div>
        <footer>
          <span><i></i> 待命 · 可分配任务</span><b>打开岗位</b>
        </footer>
      </button>
    </div>
    <section class="ops-flow-panel">
      <div class="ops-flow-title">
        <span>02 / ONE OPERATING LOOP</span>
        <h2>从顾客需求，到经营结果</h2>
      </div>
      <div class="ops-flow">
        <div>
          <small>01</small><b>接待与成交</b><span>收银员 / 导购</span>
          <p>识别需求 · 服务顾客</p>
        </div>
        <i>→</i>
        <div>
          <small>02</small><b>履约与库存</b><span>采购 / 盘点</span>
          <p>补货建议 · 风险核验</p>
        </div>
        <i>→</i>
        <div>
          <small>03</small><b>经营调度</b><span>店长负责人</span>
          <p>拆分任务 · 协调执行</p>
        </div>
        <i>→</i>
        <div>
          <small>04</small><b>流程迭代</b><span>产品经理</span>
          <p>验收结果 · 优化流程</p>
        </div>
      </div>
      <footer>
        <div>
          <b>岗位协作，而不是六个孤立聊天框。</b>
          <p>
            同一任务可拆分、分派、并行处理，再由负责人汇总。支付、下单、改库存等高影响操作应由人授权。
          </p>
        </div>
        <div class="ops-actions">
          <button @click="props.onOpenAgent('manager')">发起跨岗位任务 ↗</button
          ><button class="secondary" @click="props.onOpenModule('retail-news')">
            查看零售情报
          </button>
        </div>
      </footer>
    </section>
  </section>
</template>
<style>
.ops-home {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-height: 100vh;
  padding: 132px max(5vw, 24px) 72px;
  color: #e8f2ee;
  background:
    radial-gradient(ellipse at 78% 0%, #164b43 0%, transparent 36%),
    radial-gradient(ellipse at 5% 48%, #162c34 0%, transparent 35%),
    linear-gradient(135deg, #0b1518, #0b1114 64%, #111b1a);
  font-family: 'DM Sans', 'Noto Sans SC', sans-serif;
}
.ops-home:before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.16;
  pointer-events: none;
  background-image:
    linear-gradient(#94c7b41c 1px, transparent 1px),
    linear-gradient(90deg, #94c7b41c 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: linear-gradient(#000, transparent 90%);
}
.ops-glow {
  position: absolute;
  z-index: -1;
  right: -180px;
  top: 170px;
  width: 420px;
  height: 420px;
  border: 1px solid #8ee5c614;
  border-radius: 50%;
  box-shadow:
    0 0 0 42px #8ee5c607,
    0 0 0 85px #8ee5c604;
  pointer-events: none;
}
.ops-head,
.ops-status,
.ops-section-head,
.ops-grid,
.ops-flow-panel {
  max-width: 1440px;
  margin-left: auto;
  margin-right: auto;
}
.ops-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
  margin-bottom: 27px;
}
.ops-kicker,
.ops-section-head > div > span,
.ops-flow-title > span {
  font-size: 10px;
  letter-spacing: 0.2em;
  color: #8be2c6;
  font-weight: 800;
}
.ops-kicker i,
.ops-status > div > i {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 8px;
  border-radius: 50%;
  background: #6ee7bc;
  box-shadow: 0 0 13px #6ee7bc;
}
.ops-kicker span {
  margin-left: 12px;
  color: #617d76;
  border: 1px solid #34534d;
  padding: 4px 7px;
  border-radius: 4px;
  font-size: 8px;
}
.ops-head h1 {
  font-size: clamp(32px, 4.2vw, 57px);
  letter-spacing: -0.065em;
  line-height: 1.16;
  margin: 20px 0 12px;
  color: #eff8f3;
}
.ops-head p {
  max-width: 710px;
  font-size: 13px;
  line-height: 1.9;
  color: #9db6ae;
  margin: 0;
}
.ops-primary {
  flex-shrink: 0;
  padding: 14px 18px;
  border: 1px solid #9bf1d3;
  background: linear-gradient(130deg, #a5f0d5, #5db99f);
  border-radius: 5px;
  color: #0c2925;
  font-size: 12px;
  font-weight: 800;
  transition: transform 0.2s;
}
.ops-primary:hover {
  transform: translateY(-3px);
}
.ops-primary b {
  margin-left: 14px;
}
.ops-status {
  display: flex;
  align-items: center;
  gap: 23px;
  padding: 16px 20px;
  margin-bottom: 54px;
  border: 1px solid #52796d52;
  background: #0d1d1dba;
  backdrop-filter: blur(12px);
}
.ops-status > div {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}
.ops-status > div span b,
.ops-status > div span small {
  display: block;
}
.ops-status b {
  font-size: 11px;
  color: #dcece5;
}
.ops-status small {
  font-size: 9px;
  color: #75938a;
  margin-top: 4px;
}
.ops-status > div > strong {
  font-size: 21px;
  color: #9af0d1;
}
.ops-status > em {
  height: 30px;
  width: 1px;
  background: #2d4a43;
}
.ops-disclaimer {
  margin-left: auto !important;
  text-align: right;
}
.ops-section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
  margin-bottom: 20px;
}
.ops-section-head h2,
.ops-flow-title h2 {
  font-size: 27px;
  letter-spacing: -0.045em;
  margin: 9px 0 7px;
  color: #edf6f1;
}
.ops-section-head p {
  font-size: 11px;
  line-height: 1.7;
  color: #8da69e;
  margin: 0;
}
.ops-section-head nav {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.ops-section-head nav button {
  border: 1px solid #34534c;
  border-radius: 4px;
  background: #10201f;
  color: #90a89f;
  padding: 8px 13px;
  font-size: 10px;
}
.ops-section-head nav button.active,
.ops-section-head nav button:hover {
  background: #a2ead0;
  color: #102b25;
  border-color: #a2ead0;
}
.ops-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 54px;
}
.ops-agent {
  position: relative;
  overflow: hidden;
  min-width: 0;
  text-align: left;
  padding: 19px;
  border: 1px solid #31534b;
  background: linear-gradient(145deg, #132322f5, #10191bf5 75%);
  color: #e2eee8;
  border-radius: 8px;
  cursor: pointer;
  transition:
    transform 0.25s,
    border-color 0.25s,
    box-shadow 0.25s;
}
.ops-agent:before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: var(--accent);
}
.ops-agent:hover {
  transform: translateY(-5px);
  border-color: var(--accent);
  box-shadow: 0 18px 38px #0004;
}
.tone-mint {
  --accent: #82e9c3;
}
.tone-blue {
  --accent: #83bfff;
}
.tone-violet {
  --accent: #b8a4ff;
}
.tone-amber {
  --accent: #e6c17d;
}
.tone-cyan {
  --accent: #70dfdf;
}
.tone-rose {
  --accent: #f3a5b9;
}
.ops-agent-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ops-icon {
  width: 43px;
  height: 43px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  border-radius: 11px;
  background: #111c1c;
  font-size: 23px;
  color: var(--accent);
}
.ops-code {
  font-size: 8px;
  letter-spacing: 0.14em;
  color: #75938a;
}
.ops-agent-top > b {
  margin-left: auto;
  color: var(--accent);
  font-size: 18px;
}
.ops-role {
  display: block;
  font-size: 10px;
  color: var(--accent);
  margin-top: 17px;
  font-weight: 700;
}
.ops-agent h3 {
  font-size: 17px;
  letter-spacing: -0.035em;
  margin: 6px 0 9px;
  color: #eff8f3;
}
.ops-agent > p {
  min-height: 38px;
  margin: 0;
  font-size: 10px;
  line-height: 1.8;
  color: #94aaa2;
}
.ops-tasks {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin: 15px 0 16px;
}
.ops-tasks span {
  border: 1px solid #31433f;
  background: #182422;
  color: #a3b9b0;
  padding: 5px 7px;
  border-radius: 3px;
  font-size: 9px;
}
.ops-agent footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #29403a;
  padding-top: 12px;
  font-size: 9px;
  color: #78958a;
}
.ops-agent footer span {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ops-agent footer i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}
.ops-agent footer b {
  color: var(--accent);
  font-size: 9px;
}
.ops-flow-panel {
  border: 1px solid #34524b;
  background: linear-gradient(125deg, #10201fdd, #11191be8);
  padding: 24px 25px 0;
  border-radius: 8px;
}
.ops-flow-title h2 {
  margin-bottom: 22px;
}
.ops-flow {
  display: grid;
  grid-template-columns: 1fr 20px 1fr 20px 1fr 20px 1fr;
  gap: 7px;
  align-items: center;
}
.ops-flow > div {
  min-height: 105px;
  padding: 13px;
  border: 1px solid #2f4c44;
  background: #12201f;
  border-radius: 5px;
}
.ops-flow > div > small {
  font-size: 9px;
  color: #75c9ad;
}
.ops-flow > div > b,
.ops-flow > div > span,
.ops-flow > div > p {
  display: block;
}
.ops-flow > div > b {
  margin: 10px 0 5px;
  font-size: 12px;
  color: #e0eee7;
}
.ops-flow > div > span {
  font-size: 10px;
  color: #9ce6c9;
}
.ops-flow > div > p {
  font-size: 9px;
  color: #77948a;
  margin: 6px 0 0;
}
.ops-flow > i {
  text-align: center;
  color: #6fc9ad;
  font-size: 17px;
  font-style: normal;
}
.ops-flow-panel > footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin: 23px -25px 0;
  padding: 18px 25px;
  background: #0b1718;
  border-top: 1px solid #29443d;
}
.ops-flow-panel > footer b {
  font-size: 11px;
  color: #dcece5;
}
.ops-flow-panel > footer p {
  font-size: 10px;
  line-height: 1.7;
  color: #79958b;
  margin: 6px 0 0;
  max-width: 700px;
}
.ops-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.ops-actions button {
  border: 1px solid #8de3c4;
  background: #8de3c4;
  color: #102b25;
  padding: 11px 13px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 800;
}
.ops-actions .secondary {
  background: transparent;
  color: #a1c1b5;
  border-color: #45655b;
}
@media (max-width: 1050px) {
  .ops-home {
    padding-top: 118px;
  }
  .ops-status {
    gap: 12px;
    margin-bottom: 40px;
  }
  .ops-disclaimer {
    display: none !important;
  }
  .ops-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ops-flow {
    grid-template-columns: 1fr 16px 1fr;
  }
  .ops-flow > i:nth-of-type(3) {
    display: none;
  }
  .ops-flow > div:nth-of-type(3) {
    grid-column: 1;
  }
  .ops-flow > div:nth-of-type(4) {
    grid-column: 3;
  }
}
@media (max-width: 650px) {
  .ops-home {
    padding: 104px 13px 35px;
  }
  .ops-head {
    display: block;
  }
  .ops-head h1 {
    font-size: 33px;
    margin-top: 15px;
  }
  .ops-head p {
    font-size: 11px;
  }
  .ops-primary {
    margin-top: 18px;
    width: 100%;
  }
  .ops-status {
    padding: 11px 9px;
    gap: 8px;
    justify-content: space-between;
    margin-bottom: 34px;
  }
  .ops-status > div {
    gap: 5px;
  }
  .ops-status b {
    font-size: 9px;
  }
  .ops-status small {
    font-size: 8px;
  }
  .ops-status > div > strong {
    font-size: 17px;
  }
  .ops-status > em {
    height: 24px;
  }
  .ops-section-head {
    display: block;
  }
  .ops-section-head h2,
  .ops-flow-title h2 {
    font-size: 23px;
  }
  .ops-section-head nav {
    margin-top: 14px;
  }
  .ops-section-head nav button {
    padding: 7px 10px;
  }
  .ops-grid {
    grid-template-columns: 1fr;
    gap: 9px;
    margin-bottom: 35px;
  }
  .ops-agent {
    padding: 15px;
  }
  .ops-agent > p {
    min-height: 0;
  }
  .ops-flow-panel {
    padding: 18px 12px 0;
  }
  .ops-flow {
    grid-template-columns: 1fr;
    gap: 7px;
  }
  .ops-flow > div {
    min-height: 0;
    padding: 12px;
  }
  .ops-flow > div > b {
    margin: 6px 0 4px;
  }
  .ops-flow > i {
    transform: rotate(90deg);
    height: 14px;
  }
  .ops-flow > i:nth-of-type(3) {
    display: block;
  }
  .ops-flow > div:nth-of-type(3),
  .ops-flow > div:nth-of-type(4) {
    grid-column: auto;
  }
  .ops-flow-panel > footer {
    display: block;
    margin: 20px -12px 0;
    padding: 16px 12px;
  }
  .ops-actions {
    margin-top: 14px;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .ops-actions button {
    padding: 11px 7px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ops-agent,
  .ops-primary {
    transition: none;
  }
  .ops-agent:hover,
  .ops-primary:hover {
    transform: none;
  }
}
</style>
