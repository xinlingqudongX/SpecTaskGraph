import { createApp } from 'vue'
import './style.css'
import './styles/logicflow.css'
import '@logicflow/core/dist/index.css'
import '@logicflow/extension/lib/index.css'
import Toast, { POSITION } from 'vue-toastification'
import 'vue-toastification/dist/index.css'
import App from './App.vue'

const app = createApp(App)
app.use(Toast, {
  position: POSITION.TOP_RIGHT,
  timeout: 3000,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: false,
  hideProgressBar: false,
  maxToasts: 5,
})
app.mount('#app')
