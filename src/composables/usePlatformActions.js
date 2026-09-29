import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const ARCHIVE_URL = 'platform-actions-' + new Date().getFullYear() + '.json'
const REFRESH_MS = 5 * 60 * 1000
const SOURCE_DIRECTORY = [{"platform":"淘宝","name":"阿里巴巴官方新闻","url":"https://www.alibabagroup.com/"},{"platform":"淘宝","name":"淘宝开放平台","url":"https://open.taobao.com/"},{"platform":"淘宝","name":"天猫规则中心","url":"https://rule.tmall.com/"},{"platform":"淘宝","name":"淘宝 App 版本记录","url":"https://apps.apple.com/cn/app/%E6%B7%98%E5%AE%9D/id387682726"},{"platform":"京东","name":"京东秒送开放平台公告","url":"https://opendj.jd.com/api/notice.htm"},{"platform":"京东","name":"京东开放平台","url":"https://open.jd.com/"},{"platform":"京东","name":"京东 App 版本记录","url":"https://apps.apple.com/vn/app/%E4%BA%AC%E4%B8%9C-%E5%8F%88%E5%A5%BD%E5%8F%88%E4%BE%BF%E5%AE%9C/id414245413"},{"platform":"京东","name":"京东 AI 购版本记录","url":"https://apps.apple.com/us/app/%E4%BA%AC%E4%B8%9Cai%E8%B4%AD/id6748010090"},{"platform":"美团","name":"美团商家生态新闻","url":"https://www.meituan.com/news?category=merchants-ecology"},{"platform":"美团","name":"美团规则中心","url":"https://rules-center.meituan.com/"},{"platform":"美团","name":"美团 App 版本记录","url":"https://apps.apple.com/cn/app/%E7%BE%8E%E5%9B%A2/id423084029"},{"platform":"拼多多","name":"拼多多商家版 App 版本记录","url":"https://apps.apple.com/mo/app/pinduoduo-seller-center/id1229469444"},{"platform":"拼多多","name":"拼多多开放平台","url":"https://open.pinduoduo.com/"},{"platform":"拼多多","name":"拼多多商家帮助中心","url":"https://mms.pinduoduo.com/"}]

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
      meta.value = { year: archive.year || new Date().getFullYear(), generatedAt: archive.generatedAt || null, coverageNote: archive.coverageNote || '', sourceHealth: archive.sourceHealth || {}, sourceDirectory: Array.isArray(archive.sourceDirectory) && archive.sourceDirectory.length ? archive.sourceDirectory : SOURCE_DIRECTORY }
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
