import { createRouter, createWebHistory } from 'vue-router'

import HomeView from '../views/HomeView.vue'
import OAuthCallbackView from '../views/OAuthCallbackView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/oauth/callback',
      name: 'oauth-callback',
      component: OAuthCallbackView,
    },
  ],
})

export default router
