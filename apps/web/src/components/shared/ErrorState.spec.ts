import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ErrorState from './ErrorState.vue'

describe('ErrorState', () => {
  it('전달받은 메시지를 표시한다', () => {
    const wrapper = mount(ErrorState, { props: { message: '권한이 없습니다.' } })
    expect(wrapper.text()).toContain('권한이 없습니다.')
  })

  it('기본적으로 다시 시도 버튼을 보여준다', () => {
    const wrapper = mount(ErrorState, { props: { message: '서버 오류가 발생했습니다.' } })
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.text()).toContain('다시 시도')
  })

  it('retryable 이 false 면 다시 시도 버튼을 감춘다 — 재호출해도 결과가 같은 오류', () => {
    const wrapper = mount(ErrorState, {
      props: { message: '권한이 없습니다.', retryable: false },
    })
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('버튼을 누르면 retry 를 emit 한다', async () => {
    const wrapper = mount(ErrorState, { props: { message: '불러오지 못했습니다.' } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
