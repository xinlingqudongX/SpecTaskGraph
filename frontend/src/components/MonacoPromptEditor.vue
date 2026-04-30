<template>
  <div class="prompt-editor" :class="{ 'is-fallback': fallbackMode }">
    <div v-if="!fallbackMode" ref="editorContainerRef" class="prompt-editor__surface" />
    <el-input
      v-else
      :model-value="modelValue"
      type="textarea"
      :rows="12"
      resize="none"
      class="prompt-editor__fallback"
      :placeholder="placeholder"
      :disabled="disabled"
      @update:model-value="handleFallbackInput"
    />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type * as Monaco from 'monaco-editor';

const props = withDefaults(defineProps<{
  modelValue: string;
  language?: string;
  placeholder?: string;
  disabled?: boolean;
}>(), {
  language: 'markdown',
  placeholder: '请输入 Prompt',
  disabled: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const editorContainerRef = ref<HTMLDivElement | null>(null);
const fallbackMode = ref(false);

let monacoApi: typeof Monaco | null = null;
let editorInstance: Monaco.editor.IStandaloneCodeEditor | null = null;
let textModel: Monaco.editor.ITextModel | null = null;
let workerReadyPromise: Promise<void> | null = null;

function ensureMonacoEnvironment(): Promise<void> {
  if (workerReadyPromise) {
    return workerReadyPromise;
  }

  workerReadyPromise = import('monaco-editor/esm/vs/editor/editor.worker?worker').then(({ default: EditorWorker }) => {
    const monacoGlobal = globalThis as typeof globalThis & {
      MonacoEnvironment?: {
        getWorker: (_moduleId: string, _label: string) => Worker;
      };
    };

    if (!monacoGlobal.MonacoEnvironment) {
      monacoGlobal.MonacoEnvironment = {
        getWorker: () => new EditorWorker(),
      };
    }
  });

  return workerReadyPromise;
}

function syncEditorValue(nextValue: string): void {
  if (!editorInstance || !textModel) {
    return;
  }

  if (editorInstance.getValue() === nextValue) {
    return;
  }

  textModel.setValue(nextValue);
}

function syncEditorOptions(): void {
  if (!editorInstance) {
    return;
  }

  editorInstance.updateOptions({
    readOnly: props.disabled,
  });
}

function initEditor(): void {
  if (!editorContainerRef.value || editorInstance || fallbackMode.value) {
    return;
  }

  Promise.all([ensureMonacoEnvironment(), import('monaco-editor')])
    .then(([, monaco]) => {
      if (!editorContainerRef.value) {
        return;
      }

      monacoApi = monaco;
      textModel = monaco.editor.createModel(props.modelValue ?? '', props.language);
      editorInstance = monaco.editor.create(editorContainerRef.value, {
        model: textModel,
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false },
        wordWrap: 'on',
        fontSize: 13,
        lineHeight: 22,
        scrollBeyondLastLine: false,
        tabSize: 2,
        roundedSelection: false,
        renderLineHighlight: 'line',
        scrollbar: {
          alwaysConsumeMouseWheel: false,
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
        },
        readOnly: props.disabled,
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        padding: {
          top: 14,
          bottom: 14,
        },
      });

      editorInstance.onDidChangeModelContent(() => {
        const nextValue = editorInstance?.getValue() ?? '';
        if (nextValue !== props.modelValue) {
          emit('update:modelValue', nextValue);
        }
      });
    })
    .catch((error) => {
      console.error('Monaco 初始化失败，已回退到文本域', error);
      fallbackMode.value = true;
    });
}

function handleFallbackInput(value: string | number): void {
  emit('update:modelValue', String(value ?? ''));
}

onMounted(() => {
  nextTick(() => {
    initEditor();
  });
});

onBeforeUnmount(() => {
  editorInstance?.dispose();
  textModel?.dispose();
  editorInstance = null;
  textModel = null;
});

watch(
  () => props.modelValue,
  (value) => {
    syncEditorValue(value ?? '');
  },
);

watch(
  () => props.language,
  (language) => {
    if (monacoApi && textModel) {
      monacoApi.editor.setModelLanguage(textModel, language);
    }
  },
);

watch(
  () => props.disabled,
  () => {
    syncEditorOptions();
  },
);
</script>

<style scoped>
.prompt-editor {
  position: relative;
  width: 100%;
  min-height: 320px;
  border: 1px solid #2d3148;
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(34, 38, 58, 0.96) 0%, rgba(20, 23, 42, 0.98) 100%),
    linear-gradient(135deg, rgba(64, 158, 255, 0.12) 0%, rgba(102, 177, 255, 0.04) 100%);
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 10px 30px rgba(0, 0, 0, 0.2);
}

.prompt-editor::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(64, 158, 255, 0.08), transparent 24%);
}

.prompt-editor__surface {
  position: relative;
  z-index: 1;
  width: 100%;
  min-height: 320px;
}

.prompt-editor__fallback {
  position: relative;
  z-index: 1;
}

.is-fallback {
  padding: 10px;
}

:deep(.monaco-editor),
:deep(.monaco-editor .margin),
:deep(.monaco-editor .monaco-editor-background) {
  background: transparent !important;
}

:deep(.monaco-editor .current-line),
:deep(.monaco-editor .margin-view-overlays .current-line-margin) {
  background: rgba(64, 158, 255, 0.08) !important;
}

:deep(.monaco-editor .line-numbers) {
  color: #5a6a82 !important;
}

:deep(.el-textarea__inner) {
  min-height: 320px !important;
  border: none;
  border-radius: 10px;
  background: #14172a;
  color: #c8d0e0;
  box-shadow: inset 0 0 0 1px #2d3148;
}
</style>
