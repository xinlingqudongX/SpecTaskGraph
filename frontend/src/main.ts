import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
// LogicFlow 官方 CSS 必须先于自定义样式，确保自定义规则能覆盖默认值
import '@logicflow/core/dist/index.css'
// import '@logicflow/extension/lib/index.css'
import '@logicflow/extension/lib/style/index.css'
import './style.css'
import './styles/logicflow.css'
import App from './App.vue'

const app = createApp(App)

app.use(ElementPlus)

// 批量注册所有图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.mount('#app')
