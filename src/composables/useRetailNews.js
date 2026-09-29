import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { retailNews as seedNews, retailNewsLastSyncedAt as seedSyncedAt } from '../data/retailNews.generated'

const lanes = ['全部', 'AI 导购', 'Agentic Commerce', '零售运营', '中国零售', '平台博弈', '风险与治理', '零售治理']
const DATA_URL = 'retail-news.json'
const EVENTS_URL = 'retail-events.json'
const DIGEST_URL = 'retail-daily.json'
const REFRESH_MS = 30 * 1000

export function useRetailNews() {
  const activeLane = ref('全部')
  const keyword = ref('')
  const liveNews = ref(seedNews)
  const eventHistory = ref([])
  const lastSyncedAt = ref(seedSyncedAt)
  const liveState = ref('fallback')
  const dailyDigest = ref({ title:'AI 零售日报', lead:'等待首次雷达同步', bullets:[], method:'信源抓取 → AI 零售影响评分 → 事件聚簇 → 热度排序 → 日报' })
  let timer

  async function refresh() {
    try {
      const [digestResponse, eventsResponse, newsResponse] = await Promise.all([
        fetch(import.meta.env.BASE_URL + DIGEST_URL + '?t=' + Date.now(), { cache:'no-store', headers:{accept:'application/json'} }),
        fetch(import.meta.env.BASE_URL + EVENTS_URL + '?t=' + Date.now(), { cache:'no-store', headers:{accept:'application/json'} }),
        fetch(import.meta.env.BASE_URL + DATA_URL + '?t=' + Date.now(), { cache:'no-store', headers:{accept:'application/json'} })
      ])
      if (digestResponse.ok) dailyDigest.value = await digestResponse.json()
      if (eventsResponse.ok) {
        const eventPayload = await eventsResponse.json()
        eventHistory.value = Array.isArray(eventPayload.events) ? eventPayload.events : []
      }
      if (!newsResponse.ok) throw new Error('HTTP ' + newsResponse.status)
      const payload = await newsResponse.json()
      if (!Array.isArray(payload.items)) throw new Error('invalid payload')
      if (payload.items.length) {
        liveNews.value = payload.items
        lastSyncedAt.value = payload.generatedAt || seedSyncedAt
        liveState.value = 'live'
      }
    } catch {
      liveState.value = 'fallback'
    }
  }

  const filteredNews = computed(() => {
    const q = keyword.value.trim().toLowerCase()
    return liveNews.value.slice().filter(item => activeLane.value === '全部' || item.lane === activeLane.value)
      .filter(item => !q || [item.title, item.summary, item.source, ...(item.tags || [])].join(' ').toLowerCase().includes(q))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  })

  const syncLabel = computed(() => {
    const date = new Date(lastSyncedAt.value)
    const stamp = Number.isNaN(date.getTime()) ? '等待首次同步' : '最近信源同步 ' + date.toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' })
    return liveState.value === 'live' ? stamp + ' · 近实时雷达' : stamp + ' · 本地快照'
  })

  onMounted(() => { refresh(); timer = window.setInterval(refresh, REFRESH_MS) })
  onBeforeUnmount(() => window.clearInterval(timer))

  return { lanes, activeLane, keyword, filteredNews, eventHistory, syncLabel, dailyDigest, refresh }
}
