import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const ARCHIVE_URL = 'platform-actions-2026.json'
const REFRESH_MS = 5 * 60 * 1000

export function usePlatformActions() {
  const items = ref([])
  const meta = ref({ year: new Date().getFullYear(), generatedAt: null, coverageNote: '年度平台动作归档正在加载。' })
  const loading = ref(false)
  const error = ref('')
  async function refresh() {
    loading.value = true
    try {
      const response = await fetch(import.meta.env.BASE_URL + ARCHIVE_URL + '?t=' + Date.now(), { cache: 'no-store', headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const archive = await response.json()
      items.value = Array.isArray(archive.items) ? archive.items : []
      meta.value = { year: archive.year || new Date().getFullYear(), generatedAt: archive.generatedAt || null, coverageNote: archive.coverageNote || '', sourceHealth: archive.sourceHealth || {} }
      error.value = ''
    } catch (e) {
      error.value = '年度平台动作数据暂时无法更新，正在保留上次成功读取的数据。'
    } finally {
      loading.value = false
    }
  }
  onMounted(() => { refresh(); timer = window.setInterval(refresh, REFRESH_MS) })
  let timer
  onBeforeUnmount(() => window.clearInterval(timer))
  const byPlatform = computed(() => Object.fromEntries(['淘宝','京东','美团','拼多多'].map(platform => [platform, items.value.filter(item => (item.platform || item.lane) === platform)])))
  return { items, meta, loading, error, byPlatform, refresh }
}
