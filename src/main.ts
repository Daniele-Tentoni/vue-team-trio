import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import vuetify from './vuetify'
import 'vuetify/styles'
import './md3.css'

createApp(App).use(createPinia()).use(vuetify).mount('#app')
