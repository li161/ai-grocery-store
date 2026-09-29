import { computed, ref } from 'vue'
import { retailNews, retailNewsLastSyncedAt } from '../data/retailNews.generated'

const lanes = ['全部', 'AI 导购', 'Agentic Commerce', '零售运营', '中国零售', '平台博弈', '风险与治理', '零售治理']

export function useRetailNews() {
  const activeLane = ref('全部')
  const keyword = ref('')
  const filteredNews = computed(() => {
    const q = keyword.value.trim().toLowerCase()
    return retailNews
      .filter(item => activeLane.value === '全部' || item.lane === activeLane.value)
      .filter(item => !q || [item.title, item.summary, item.source, ...(item.tags || [])].join(' ').toLowerCase().includes(q))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  })
  const syncLabel = computed(() => {
    if (!retailNewsLastSyncedAt) return '自动同步已启用'
    const date = new Date(retailNewsLastSyncedAt)
    if (Number.isNaN(date.getTime())) return '自动同步已启用'
    return '最近同步 ' + date.toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })
  })
  return { lanes, activeLane, keyword, filteredNews, syncLabel }
}
