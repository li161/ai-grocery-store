export const outcomeCategories = [
  { id:'all', label:'全部' },
  { id:'labor', label:'省人力' },
  { id:'loss', label:'降损耗' },
  { id:'space', label:'提坪效' },
  { id:'revenue', label:'增收入' }
]

export const retailCases = [
  {
    id:'hanshow-woolworths-smart-cart',
    outcome:'labor',
    outcomeLabel:'省人力',
    icon:'🛒',
    title:'汉朔 × 伍尔沃斯：AI 智能购物车',
    headline:'先看规模化落地，再看人效和收入有没有兑现',
    summary:'汉朔科技披露与澳大利亚伍尔沃斯签署销售意向协议，预计首期约 300 家门店交付 10,800 套智能购物车系统。公司后续公开信息显示，该业务进入规模化落地阶段；但公开披露仍不足以直接证明这 10,800 套已经全部交付、形成多少收入或带来多少人效提升。',
    metric:{ value:'10,800', unit:'套', label:'意向协议首期规模', note:'约 300 家门店' },
    status:'待验证',
    statusTone:'pending',
    verification:'目前能确认的是“销售意向 + 规模化推进”；不能把意向数量直接当成已交付量，也不能把方案功能直接当成经营结果。',
    next:'下一步对照订单/交付披露、定期报告中的收入确认，以及客户侧实际运营数据。',
    tags:['智能购物车','自助结算','门店数字化'],
    sources:[
      {date:'2026-01-05',source:'深圳证券交易所公告',title:'关于签署销售意向协议的自愿性信息披露公告',url:'https://disc.static.szse.cn/disc/disk03/finalpage/2026-01-05/ba9aa879-ee1d-480f-8e61-7cfe761fe154.PDF',state:'已披露',note:'披露预计首期约 300 家门店、10,800 套系统；公告同时明确协议为合作意向，实际经营影响取决于后续交易。'},
      {date:'2026-04-29',source:'汉朔科技',title:'完成对西安超嗨战略控股，深化 AI 智能购物车全球战略布局',url:'https://www.hanshow.com/zh-cn/news/%E6%B1%89%E6%9C%94%E7%A7%91%E6%80%9D%E5%AE%9E%E5%AE%8C%E6%88%90%E5%AF%B9%E8%A5%BF%E5%AE%89%E8%B6%85%E5%97%A8%E6%88%98%E7%95%A5%E6%8E%A7%E8%82%A1-%E6%B7%B1%E5%8C%96ai%E6%99%BA%E8%83%BD%E8%B4%AD%E7%89%A9%E8%BD%A6%E5%85%A8%E7%90%83%E6%88%98%E7%95%A5%E5%B8%83%E5%B1%80',state:'已推进',note:'公司披露智能购物车累计落地与储备规模突破 4 万台；这是公司整体业务信息，不等同于伍尔沃斯项目已交付 10,800 套。'},
      {date:'2026-09-18',source:'汉朔科技',title:'携手 shopreme、Lucky cart 发布全新智能购物车解决方案',url:'https://www.hanshow.com/zh-cn/news/%E6%B1%89%E6%9C%94%E7%A7%91%E6%8A%80%E6%90%BA%E6%89%8Bshopreme%E3%80%81Lucky%20cart%E5%8F%91%E5%B8%83%E5%85%A8%E6%96%B0%E6%99%BA%E8%83%BD%E8%B4%AD%E7%89%A9%E8%BB%8A%E8%A7%A3%E5%86%B3%E6%96%B9%E6%A1%88%EF%BC%8C%E5%8A%A9%E5%8A%9B%E9%96%80%E5%BA%97%E9%87%8D%E6%A7%8B%E9%A1%A7%E5%AE%A2%E8%B3%BC%E7%89%A9%E6%97%85%E7%A8%8B',state:'持续推进',note:'最新方案覆盖商品发现、自助结算、运营协同和品牌沟通；仍需后续客户运营数据验证经营结果。'}
    ]
  }
]
