import { computed, ref } from 'vue'
import { tools } from '../data/catalog'

export function useCatalog() {
  const activeCategory = ref('全部')
  const keyword = ref('')

  const filteredTools = computed(() => {
    const query = keyword.value.trim().toLowerCase()
    return tools.filter((tool) => {
      const categoryMatch = activeCategory.value === '全部' || tool.category === activeCategory.value
      const queryMatch = !query || [tool.name, tool.category, tool.desc, tool.note]
        .join(' ')
        .toLowerCase()
        .includes(query)
      return categoryMatch && queryMatch
    })
  })

  return { activeCategory, keyword, filteredTools }
}
