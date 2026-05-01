import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'

// 간단한 라우터 목업 생성
const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', component: { template: '<div>Home</div>' } }]
})

describe('App.vue', () => {
  it('renders successfully', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), router]
      }
    })
    expect(wrapper.exists()).toBe(true)
  })
})
