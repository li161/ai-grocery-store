<script setup>
defineProps({
  detail: { type: Object, required: true },
  onClose: { type: Function, required: true },
  onOpenTool: { type: Function, required: true }
})
</script>

<template>
  <transition name="fade">
    <div class="detail-mask" @click.self="onClose">
      <article class="detail-page">
        <button class="detail-close" aria-label="关闭详情" @click="onClose">×</button>

        <header class="detail-hero">
          <span class="eyebrow">
            {{ detail.type === 'industry' ? 'INDUSTRY INTELLIGENCE' : 'READY-MADE AI KIT' }}
          </span>

          <div class="detail-title-row">
            <span class="detail-icon">{{ detail.icon || 'AI' }}</span>
            <div>
              <h2>{{ detail.name || detail.title }}</h2>
              <p>{{ detail.text || detail.flow || detail.audience }}</p>
            </div>
          </div>

          <p class="detail-headline">{{ detail.headline || detail.trigger }}</p>
        </header>

        <div class="detail-grid">
          <section class="detail-main">
            <div class="detail-block">
              <span class="detail-label">具体介绍</span>
              <p>{{ detail.summary || detail.trigger }}</p>
            </div>

            <div class="detail-block">
              <span class="detail-label">可以直接拿来做什么</span>
              <div class="action-list">
                <div v-for="(item, index) in (detail.actions || detail.steps || [])" :key="item">
                  <b>{{ String(index + 1).padStart(2, '0') }}</b>
                  <span>{{ item }}</span>
                </div>
              </div>
            </div>
          </section>

          <aside class="detail-side">
            <div v-if="detail.tools?.length" class="detail-block">
              <span class="detail-label">推荐工具</span>
              <div class="tool-chips">
                <button v-for="tool in detail.tools" :key="tool" @click="onOpenTool(tool)">
                  {{ tool }} ↗
                </button>
              </div>
            </div>

            <div v-if="detail.sources?.length" class="detail-block">
              <span class="detail-label">依据 / 来源</span>
              <a
                v-for="source in detail.sources"
                :key="source.url"
                class="source-item"
                :href="source.url"
                target="_blank"
                rel="noopener"
              >
                <strong>{{ source.title }}</strong>
                <small>{{ source.name }} · {{ source.date }} ↗</small>
              </a>
            </div>
          </aside>
        </div>
      </article>
    </div>
  </transition>
</template>
