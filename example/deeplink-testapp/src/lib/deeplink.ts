import { bridgeConfig, forwardedParams, type ForwardedParam } from '../config/app'

export interface OAuthCallbackPayload {
  code: string | null
  state: string | null
  error: string | null
  errorDescription: string | null
}

function getStringParam(params: URLSearchParams, key: ForwardedParam): string | null {
  const value = params.get(key)
  return value && value.length > 0 ? value : null
}

export function parseCallbackQuery(search: string): OAuthCallbackPayload {
  const params = new URLSearchParams(search)

  return {
    code: getStringParam(params, 'code'),
    state: getStringParam(params, 'state'),
    error: getStringParam(params, 'error'),
    errorDescription: getStringParam(params, 'error_description'),
  }
}

export function hasValidCallbackPayload(payload: OAuthCallbackPayload): boolean {
  return Boolean(payload.code || payload.error)
}

export function buildDeepLinkUrl(payload: OAuthCallbackPayload): string {
  const deepLink = new URL(bridgeConfig.customSchemeUrl)

  for (const key of forwardedParams) {
    const value =
      key === 'error_description'
        ? payload.errorDescription
        : payload[key === 'error' ? 'error' : key]

    if (value) {
      deepLink.searchParams.set(key, value)
    }
  }

  return deepLink.toString()
}

export function truncateCode(code: string | null): string {
  if (!code) {
    return ''
  }

  if (code.length <= 24) {
    return code
  }

  return `${code.slice(0, 12)}...${code.slice(-8)}`
}
