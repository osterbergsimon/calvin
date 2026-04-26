<template>
  <figure class="image-caption">
    <img v-if="imageUrl" :src="imageUrl" :alt="title || ''" class="image-caption__img" />
    <figcaption v-if="title || caption || metadata" class="image-caption__text">
      <h3 v-if="title" class="image-caption__title">{{ title }}</h3>
      <p v-if="caption" class="image-caption__caption">{{ caption }}</p>
      <span v-if="metadata" class="image-caption__meta">{{ metadata }}</span>
    </figcaption>
  </figure>
</template>

<script setup>
import { computed } from "vue";
import { resolvePath } from "../../../utils/jsonPath";
import { applyFormat } from "../../../utils/formatters";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array, null], default: null },
});

function pick(pathKey, literalKey, formatKey) {
  const raw = props.schema[pathKey]
    ? resolvePath(props.data, props.schema[pathKey])
    : props.schema[literalKey];
  return formatKey ? applyFormat(raw, props.schema[formatKey]) : raw;
}

const imageUrl = computed(() => pick("image_url_path", "image_url"));
const title = computed(() => pick("title_path", "title", "title_format"));
const caption = computed(() => pick("caption_path", "caption"));
const metadata = computed(() => pick("metadata_path", "metadata", "metadata_format"));
</script>

<style scoped>
.image-caption {
  position: relative;
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: var(--bg-primary);
}

.image-caption__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.image-caption__text {
  position: absolute;
  inset: auto 0 0 0;
  padding: 1rem 1.25rem;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent);
  color: white;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.image-caption__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
}

.image-caption__caption {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.4;
  opacity: 0.9;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.image-caption__meta {
  font-size: 0.75rem;
  opacity: 0.7;
  letter-spacing: 0.05em;
}
</style>
