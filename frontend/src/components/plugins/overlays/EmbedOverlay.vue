<template>
  <teleport to="body">
    <Dialog
      :model-value="true"
      label="Embedded page"
      size="full"
      scrim-blur
      @close="$emit('close')"
    >
      <div class="embed-overlay__frame">
        <IframeViewer :url="url" @error="$emit('fallback')" />
      </div>
    </Dialog>
  </teleport>
</template>

<script setup>
import Dialog from "@/components/ui/Dialog.vue";
import IframeViewer from "@/components/service/IframeViewer.vue";

// A plugin link that asks for an embed opens the one Dialog shell in its full
// size: scrim, focus trap, Escape, close button and the OSK layer all come from
// Dialog. The frame fills the body; IframeViewer keeps its own error fallback.
defineProps({ url: { type: String, required: true } });
defineEmits(["close", "fallback"]);
</script>

<style scoped>
.embed-overlay__frame {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
