export const categories = ['全部', '对话', '编程', '创作', '研究', '设计', '效率']

export const tools = [
  { name:'ChatGPT', icon:'◉', category:'对话', desc:'写作、分析、头脑风暴', note:'全能货', accent:'mint', url:'https://chatgpt.com/' },
  { name:'Claude', icon:'✦', category:'对话', desc:'长文、思考、知识工作', note:'新鲜货', accent:'cream', url:'https://claude.ai/' },
  { name:'Cursor', icon:'◇', category:'编程', desc:'AI 编程与代码 Agent', note:'程序员', accent:'blue', url:'https://cursor.com/' },
  { name:'即梦 AI', icon:'✺', category:'创作', desc:'图片、视频、创意生成', note:'国产', accent:'pink', url:'https://jimeng.jianying.com/' },
  { name:'Midjourney', icon:'◒', category:'创作', desc:'视觉创意与概念设计', note:'热门', accent:'violet', url:'https://www.midjourney.com/' },
  { name:'NotebookLM', icon:'◓', category:'研究', desc:'基于资料的阅读与问答', note:'研究', accent:'yellow', url:'https://notebooklm.google.com/' },
  { name:'Perplexity', icon:'⌁', category:'研究', desc:'搜索、调研、引用整理', note:'省时间', accent:'cyan', url:'https://www.perplexity.ai/' },
  { name:'Canva', icon:'C', category:'设计', desc:'海报、PPT、视觉设计', note:'设计', accent:'orange', url:'https://www.canva.com/' }
]

const sources = {
  walmart: { name:'Walmart Data Ventures', date:'2026-09-16', title:'Scintilla 向 Commerce Intelligence 演进', url:'https://corporate.walmart.com/news/2026/09/walmart-data-ventures-commerce-intelligence' },
  amazon: { name:'Reuters', date:'2026-09-24', title:'Amazon 将向印度快速商业投入 30 亿美元', url:'https://www.reuters.com/business/retail-consumer/amazon-bets-3-billion-indias-fast-delivery-boom-2026-09-24/' },
  walmartPricing: { name:'Financial Times', date:'2026-09-25', title:'Walmart 承诺不按消费者画像做个性化定价', url:'https://www.ft.com/content/632e21a3-b889-4423-a1d9-be16b3e680bd' },
  alibaba: { name:'Alibaba Group', date:'2026-05-11', title:'Qwen 与淘宝打通 AI 购物全链路', url:'https://www.alibabagroup.com/en-US/document-1991231293551017984' },
  china: { name:'中国政府网', date:'2026-06-18', title:'发布“人工智能+消费”实施意见', url:'https://english.www.gov.cn/news/202606/18/content_WS6a33e5a0c6d00ca5f9a0bb00.html' },
  jd: { name:'JD.com IR', date:'2026-08-13', title:'2026 年第二季度及上半年业绩', url:'https://ir.jd.com/news-releases/news-release-details/jdcom-announces-second-quarter-and-interim-2026-results' }
}

export const industries = [
  {
    icon:'🛒', name:'电商', text:'选品 · 商品图 · 文案 · 客服',
    headline:'AI 正从“推荐商品”走向“直接购物”',
    summary:'阿里已将 Qwen 与淘宝商品库、下单和履约链路打通；中国“人工智能+消费”政策也明确提出推动智能零售和电商与 AI 深度融合。',
    actions:['商品/竞品研究','批量商品内容','客服知识库','AI 导购与转化'],
    tools:['Perplexity','ChatGPT','Canva'],
    sources:[sources.alibaba,sources.china]
  },
  {
    icon:'⌘', name:'程序员', text:'编码 · Debug · Review · Agent',
    headline:'软件开发正在从“写代码”转向“管理 Agent”',
    summary:'AI 编程工具的价值重点已经从单次代码补全扩展到 Agent、Review、文档和任务执行，适合把重复开发流程产品化。',
    actions:['需求拆解','代码生成','测试与 Debug','Review 与文档'],
    tools:['Cursor','Claude','ChatGPT'],
    sources:[sources.jd]
  },
  {
    icon:'▶', name:'新媒体', text:'选题 · 脚本 · 封面 · 视频',
    headline:'内容生产链正在被 AI 压缩成一条流水线',
    summary:'从热点研究到脚本、视觉和发布素材，可以把“一个选题”拆成连续的 AI 工作流，而不是分别使用几个孤立工具。',
    actions:['热点扫描','选题与脚本','封面/视觉','多平台改写'],
    tools:['ChatGPT','即梦 AI','Canva'],
    sources:[sources.china,sources.alibaba]
  },
  {
    icon:'✦', name:'设计', text:'灵感 · 视觉 · 原型 · 排版',
    headline:'设计的瓶颈正在从制作转向判断',
    summary:'生成式视觉工具适合承担探索和变体生产，人仍负责品牌、审美、选型和最终决策。',
    actions:['概念探索','视觉变体','PPT/海报','品牌素材'],
    tools:['Midjourney','即梦 AI','Canva'],
    sources:[sources.china]
  },
  {
    icon:'▣', name:'教育', text:'备课 · 课件 · 题库 · 答疑',
    headline:'AI 更适合进入教师工作流，而不是只做聊天机器人',
    summary:'“人工智能+消费”实施意见明确鼓励 AI 在教育等服务消费场景中的应用，适合从备课、资料整理和个性化答疑切入。',
    actions:['资料整理','课程设计','题目生成','答疑与反馈'],
    tools:['ChatGPT','NotebookLM','Canva'],
    sources:[sources.china]
  },
  {
    icon:'▤', name:'企业办公', text:'会议 · 报告 · 知识库 · 自动化',
    headline:'企业 AI 的核心正在从聊天走向“知识→行动”',
    summary:'Walmart 正将数据、AI 洞察和行动系统连接起来，让用户从发现库存或营销机会直接进入执行环节，这也是企业 Copilot 的重要方向。',
    actions:['会议/报告','企业知识库','经营分析','任务自动化'],
    tools:['ChatGPT','Claude','NotebookLM'],
    sources:[sources.walmart]
  },
  {
    icon:'⌕', name:'研究', text:'检索 · 阅读 · 总结 · 写作',
    headline:'研究型 AI 的关键是“有来源的结论”',
    summary:'研究场景应优先把检索、资料阅读、证据追踪和写作串起来，减少在多个工具之间复制粘贴。',
    actions:['文献检索','资料问答','证据整理','研究写作'],
    tools:['Perplexity','NotebookLM','Claude'],
    sources:[sources.jd,sources.china]
  },
  {
    icon:'⚙', name:'制造业', text:'知识 · 质检 · 流程 · 数据',
    headline:'AI 正从单点助手进入供应链和工业流程',
    summary:'京东披露其工业业务已部署 70+ AI agents 覆盖采购到履约，并推出 AI 智能采购助手；制造业更适合从流程节点和企业知识入手。',
    actions:['设备知识库','采购比价','质检辅助','流程 Agent'],
    tools:['ChatGPT','Claude','NotebookLM'],
    sources:[sources.jd]
  }
]

export const bundles = [
  {
    label:'AI KIT 01', title:'零售增长套装', flow:'资讯 → 选品 → 内容 → 转化', tone:'rose',
    audience:'电商运营、品牌市场、零售商家',
    trigger:'以 AI 购物、智能零售和快速商业为切口，把行业新闻转成当天可执行的运营动作。',
    steps:['每天抓取零售/AI 新闻','提取对业务有影响的变化','生成商品与内容实验方案','沉淀可复用工作流'],
    tools:['Perplexity','ChatGPT','Canva'],
    sources:[sources.alibaba,sources.amazon,sources.china]
  },
  {
    label:'AI KIT 02', title:'程序员效率', flow:'需求 → 编码 → Debug → Review', tone:'blue',
    audience:'独立开发者、研发团队、AI 产品团队',
    trigger:'把一次开发任务拆成 Agent 可以持续推进的工作链，减少在 IDE、文档和对话之间反复搬运上下文。',
    steps:['需求拆解与技术方案','Cursor Agent 编码','自动测试与 Debug','Review、文档与交付'],
    tools:['Cursor','Claude','ChatGPT'],
    sources:[sources.jd]
  },
  {
    label:'AI KIT 03', title:'行业研究', flow:'资讯 → 检索 → 证据 → 简报', tone:'green',
    audience:'研究人员、咨询、投资研究、产品经理',
    trigger:'把最新行业新闻作为入口，快速定位原始来源、关键事实和对业务的影响，而不是只读二手摘要。',
    steps:['扫描最新行业资讯','回溯官方/原始来源','整理事实与变化','生成一页行业简报'],
    tools:['Perplexity','NotebookLM','Claude'],
    sources:[sources.walmart,sources.jd,sources.alibaba]
  }
]
