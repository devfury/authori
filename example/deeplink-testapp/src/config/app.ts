export const bridgeConfig = {
  callbackPath: '/oauth/callback',
  customSchemeUrl: 'authori://oauth/callback',
  autoOpenDelayMs: 1200,
  debugCodeFallback: true,
} as const

export const forwardedParams = ['code', 'state', 'error', 'error_description'] as const

export type ForwardedParam = (typeof forwardedParams)[number]
