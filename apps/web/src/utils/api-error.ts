/**
 * HTTP 오류를 사용자에게 보여줄 한 줄 문구로 바꾼다.
 *
 * 401은 다루지 않는다. `api/http.ts` 의 응답 인터셉터가 로그아웃으로 처리하므로
 * 401 문구가 화면에 남을 일이 없다.
 *
 * axios 에 의존하지 않고 status 만 안전하게 읽는다. 테스트에서 axios 오류 객체를
 * 만들 필요가 없고, HTTP 클라이언트를 바꿔도 깨지지 않는다.
 */

export const FORBIDDEN_MESSAGE = '권한이 없습니다.'

const MESSAGES = {
  forbidden: FORBIDDEN_MESSAGE,
  notFound: '찾을 수 없습니다.',
  server: '서버 오류가 발생했습니다.',
  offline: '서버에 연결할 수 없습니다.',
  unknown: '불러오지 못했습니다.',
} as const

/** 어떤 형태의 값이 와도 던지지 않고 status 를 꺼낸다. */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const response = (error as { response?: unknown }).response
  if (typeof response !== 'object' || response === null) return undefined
  const status = (response as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

/** 응답 자체가 없었는지(네트워크 단절·타임아웃) 판정한다. */
function hasResponse(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  return (error as { response?: unknown }).response != null
}

export function toApiErrorMessage(error: unknown): string {
  const status = statusOf(error)

  if (status === 403) return MESSAGES.forbidden
  if (status === 404) return MESSAGES.notFound
  if (status !== undefined && status >= 500) return MESSAGES.server

  // 요청은 보냈으나 응답이 오지 않은 경우. 비정형 입력(null·문자열 등)은
  // 네트워크 문제라고 단정할 수 없으므로 여기 해당하지 않는다.
  if (!hasResponse(error) && isRequestError(error)) return MESSAGES.offline

  return MESSAGES.unknown
}

/** axios 가 요청을 실제로 보냈다는 흔적(request)이 있는지 확인한다. */
function isRequestError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  return (error as { request?: unknown }).request != null
}

/** 다시 시도해도 결과가 같은 오류인지. 권한 오류에서는 재시도 버튼을 감춘다. */
export function isRetryable(message: string): boolean {
  return message !== FORBIDDEN_MESSAGE
}
