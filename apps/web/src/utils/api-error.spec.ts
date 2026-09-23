import { describe, it, expect } from 'vitest'
import { toApiErrorMessage, isRetryable, FORBIDDEN_MESSAGE } from './api-error'

function httpError(status: number) {
  return { response: { status }, request: {} }
}

describe('toApiErrorMessage', () => {
  it('403 은 권한 없음으로 안내한다', () => {
    expect(toApiErrorMessage(httpError(403))).toBe('권한이 없습니다.')
  })

  it('404 는 찾을 수 없음으로 안내한다', () => {
    expect(toApiErrorMessage(httpError(404))).toBe('찾을 수 없습니다.')
  })

  it.each([500, 502, 503])('%i 는 서버 오류로 안내한다', (status) => {
    expect(toApiErrorMessage(httpError(status))).toBe('서버 오류가 발생했습니다.')
  })

  it('요청은 보냈으나 응답이 없으면 연결 실패로 안내한다', () => {
    expect(toApiErrorMessage({ request: {} })).toBe('서버에 연결할 수 없습니다.')
  })

  it('분류되지 않는 상태 코드는 기본 문구로 안내한다', () => {
    expect(toApiErrorMessage(httpError(418))).toBe('불러오지 못했습니다.')
  })

  it.each([null, undefined, 'boom', 42, {}, new Error('boom')])(
    '비정형 입력(%s)에도 던지지 않고 기본 문구를 반환한다',
    (input) => {
      expect(toApiErrorMessage(input)).toBe('불러오지 못했습니다.')
    },
  )
})

describe('isRetryable', () => {
  it('권한 오류는 재시도 대상이 아니다 — 다시 호출해도 결과가 같다', () => {
    expect(isRetryable(FORBIDDEN_MESSAGE)).toBe(false)
  })

  it.each(['서버 오류가 발생했습니다.', '서버에 연결할 수 없습니다.', '불러오지 못했습니다.'])(
    '%s 는 재시도할 수 있다',
    (message) => {
      expect(isRetryable(message)).toBe(true)
    },
  )
})
