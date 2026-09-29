<script setup>
import { computed, ref } from 'vue'

const categories = ['全部','对话','编程','创作','研究','设计','效率']
const tools = [
{name:'ChatGPT',icon:'◉',category:'对话',desc:'写作、分析、头脑风暴',note:'全能货',accent:'mint',url:'https://chatgpt.com/'},
{name:'Claude',icon:'✦',category:'对话',desc:'长文、思考、知识工作',note:'新鲜货',accent:'cream',url:'https://claude.ai/'},
{name:'Cursor',icon:'◇',category:'编程',desc:'AI 编程与代码 Agent',note:'程序员',accent:'blue',url:'https://cursor.com/'},
{name:'即梦 AI',icon:'✺',category:'创作',desc:'图片、视频、创意生成',note:'国产',accent:'pink',url:'https://jimeng.jianying.com/'},
{name:'Midjourney',icon:'◒',category:'创作',desc:'视觉创意与概念设计',note:'热门',accent:'violet',url:'https://www.midjourney.com/'},
{name:'NotebookLM',icon:'◓',category:'研究',desc:'基于资料的阅读与问答',note:'研究',accent:'yellow',url:'https://notebooklm.google.com/'},
{name:'Perplexity',icon:'⌁',category:'研究',desc:'搜索、调研、引用整理',note:'省时间',accent:'cyan',url:'https://www.perplexity.ai/'},
{name:'Canva',icon:'C',category:'设计',desc:'海报、PPT、视觉设计',note:'设计',accent:'orange',url:'https://www.canva.com/'}
]
const industries = [
{icon:'🛒',name:'电商',text:'选品 · 商品图 · 文案 · 客服'},
{icon:'⌘',name:'程序员',text:'编码 · Debug · Review · Agent'},
{icon:'▶',name:'新媒体',text:'选题 · 脚本 · 封面 · 视频'},
{icon:'✦',name:'设计',text:'灵感 · 视觉 · 原型 · 排版'},
{icon:'▣',name:'教育',text:'备课 · 课件 · 题库 · 答疑'},
{icon:'▤',name:'企业办公',text:'会议 · 报告 · 知识库 · 自动化'},
{icon:'⌕',name:'研究',text:'检索 · 阅读 · 总结 · 写作'},
{icon:'⚙',name:'制造业',text:'知识 · 质检 · 流程 · 数据'}
]
const bundles = [
{label:'AI KIT 01',title:'小红书开店',flow:'选题 → 文案 → 图片 → 视频',tone:'rose'},
{label:'AI KIT 02',title:'程序员效率',flow:'编码 → 调试 → 文档 → Review',tone:'blue'},
{label:'AI KIT 03',title:'论文研究',flow:'检索 → 阅读 → 总结 → 写作',tone:'green'}
]
const activeCategory = ref('全部')
const keyword = ref('')
const drawerTool = ref(null)
const showSearch = ref(false)
const filteredTools = computed(()=>tools.filter(t=>{
 const q=keyword.value.trim().toLowerCase()
 return (activeCategory.value==='全部'||t.category===activeCategory.value)&&(!q||[t.name,t.category,t.desc].join(' ').toLowerCase().includes(q))
}))
function scrollTo(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})}
function openTool(t){drawerTool.value=t}
</script>

<template>
<div class="site">
<header class="nav">
<button class="brand" @click="scrollTo('home')"><span class="brand-mark">AI</span><span class="brand-copy"><strong>AI 杂货铺</strong><small>什么 AI 都有，进来逛逛。</small></span></button>
<nav class="nav-links"><button @click="scrollTo('tools')">工具货架</button><button @click="scrollTo('industry')">行业货架</button><button @click="scrollTo('bundles')">AI 套装</button><button @click="scrollTo('lab')">后院实验室</button></nav>
<button class="nav-search" @click="showSearch=!showSearch">⌕ <span>找点什么</span><kbd>⌘ K</kbd></button>
</header>

<main>
<section id="home" class="hero">
<div class="hero-photo"></div><div class="hero-vignette"></div>
<div class="hero-content"><div class="hero-kicker"><span></span>AI GROCERY STORE · OPEN TODAY</div><h1>AI 杂货铺</h1><p class="hero-subtitle">把 AI 当成货架上的工具，而不是一个抽象概念。</p><p class="hero-desc">挑一件趁手的，看看它能替你把哪件事办掉。</p><div class="hero-actions"><button class="btn-primary" @click="scrollTo('tools')">逛工具货架 <span>→</span></button><button class="btn-ghost" @click="scrollTo('industry')">按行业看看</button></div></div>
<div class="hero-side-note"><span class="note-line"></span><div><small>SHOP NOTE</small><strong>今天刚到一批<br>新的 AI。</strong></div></div>
<div class="hero-shelf"><div class="shelf-sign">TODAY'S PICK</div><div class="mini-products"><button v-for="tool in tools.slice(0,4)" :key="tool.name" class="mini-product" @click="openTool(tool)"><span class="mini-pack" :class="tool.accent">{{tool.icon}}</span><strong>{{tool.name}}</strong><small>{{tool.category}}</small></button></div><div class="shelf-beam"></div></div>
<div class="hero-stats"><div><strong>80<span>+</span></strong><small>AI 工具</small></div><div><strong>12</strong><small>行业场景</small></div><div><strong>24</strong><small>现成套装</small></div></div>
</section>

<section id="tools" class="section tools-section">
<div class="section-head"><div><span class="eyebrow">AISLE 01 · AI TOOLS</span><h2>工具货架</h2><p>像逛便利店一样挑 AI。点击商品，直接去官网。</p></div><div class="receipt"><span>OPEN</span><strong>09:00—24:00</strong><small>营业中 · 随时补货</small></div></div>
<div class="filter-bar"><div class="category-tabs"><button v-for="c in categories" :key="c" :class="{active:activeCategory===c}" @click="activeCategory=c">{{c}}</button></div><label class="search-box">⌕<input v-model="keyword" placeholder="搜索货架上的工具..."><kbd>⌘ K</kbd></label></div>
<div class="physical-shelf"><div class="shelf-top"><div class="shelf-label"><span class="label-icon">AI</span><div><strong>精选工具</strong><small>THE AI TOOL AISLE</small></div></div><span class="stock">{{filteredTools.length}} 件在架</span></div>
<div class="product-row"><button v-for="tool in filteredTools" :key="tool.name" class="product" @click="openTool(tool)"><span class="product-tag">{{tool.note}}</span><span class="product-pack" :class="tool.accent">{{tool.icon}}</span><span class="product-name">{{tool.name}}</span><span class="product-desc">{{tool.desc}}</span><span class="product-footer"><small>{{tool.category}}</small><b>查看 ↗</b></span></button></div><div class="wood-beam"></div><div class="shelf-floor"></div></div>
</section>

<section id="industry" class="section industry-section"><div class="section-head compact"><div><span class="eyebrow">AISLE 02 · AI × INDUSTRY</span><h2>行业货架</h2></div><p>不讲“AI 是什么”，直接摆出来：在你的工作里，它能拿来干什么。</p></div><div class="industry-store"><article v-for="item in industries" :key="item.name" class="industry-card"><div class="industry-shelf-label">{{item.name}}</div><div class="industry-body"><span class="industry-icon">{{item.icon}}</span><div><strong>{{item.name}}</strong><small>{{item.text}}</small></div><span class="industry-arrow">↗</span></div><div class="industry-beam"></div></article></div></section>

<section id="bundles" class="section bundle-section"><div class="section-head compact"><div><span class="eyebrow">AISLE 03 · READY-MADE</span><h2>老板配好的 AI 套装</h2></div><p>不想一件件挑？按一件事情，把需要的工具直接装进购物篮。</p></div><div class="bundle-grid"><article v-for="b in bundles" :key="b.title" class="bundle-card" :class="b.tone"><div class="bundle-head"><span>{{b.label}}</span><span>READY</span></div><div class="bundle-body"><div class="bundle-bag">AI</div><div><h3>{{b.title}}</h3><p>{{b.flow}}</p></div></div><div class="bundle-foot">打开套装 <span>→</span></div></article></div></section>

<section id="lab" class="lab-section"><div class="lab-copy"><span class="eyebrow">BACK ROOM · EXPERIMENTS</span><h2>后院实验室</h2><p>这里不卖单个工具，专门研究怎么把 Prompt、Agent、Workflow 和 MCP 串成真正能工作的东西。</p><button @click="scrollTo('tools')">去看看货架里的工具 <span>→</span></button></div><div class="lab-shelf"><div class="lab-item"><b>⌘</b><strong>Prompt</strong><small>提示词配方</small></div><div class="lab-item"><b>✦</b><strong>Agent</strong><small>自动干活</small></div><div class="lab-item"><b>↯</b><strong>Workflow</strong><small>工作流</small></div><div class="lab-item"><b>∞</b><strong>MCP</strong><small>工具连接</small></div></div></section>
</main>

<footer><strong>AI 杂货铺</strong><span>不是什么都懂，但尽量让你少走几步。</span><small>AI Grocery Store · Tools, workflows & real use cases.</small></footer>

<transition name="fade"><div v-if="drawerTool" class="drawer-mask" @click.self="drawerTool=null"><aside class="drawer"><button class="drawer-close" @click="drawerTool=null">×</button><div class="drawer-photo" :class="drawerTool.accent">{{drawerTool.icon}}</div><span class="drawer-kicker">{{drawerTool.category}} · {{drawerTool.note}}</span><h2>{{drawerTool.name}}</h2><p>{{drawerTool.desc}}。打开官网了解最新能力、价格和使用方式。</p><div class="drawer-meta"><span>AI TOOL</span><span>OFFICIAL</span></div><a :href="drawerTool.url" target="_blank" rel="noopener" class="drawer-cta">去官网看看 <span>↗</span></a></aside></div></transition>
<transition name="fade"><div v-if="showSearch" class="search-overlay" @click.self="showSearch=false"><div class="global-search">⌕<input v-model="keyword" autofocus placeholder="搜索 AI 工具，例如 Cursor、论文、设计..." @keyup.enter="showSearch=false;scrollTo('tools')"><button @click="showSearch=false;scrollTo('tools')">进入货架 →</button></div></div></transition>
</div>
</template>