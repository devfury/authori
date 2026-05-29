/**
 * 테넌트의 OIDC issuer 식별자를 결정한다.
 *
 * 이 값은 두 곳에서 반드시 동일해야 한다:
 *  - Discovery 문서의 `issuer` 필드 및 엔드포인트 base URL
 *  - 발급된 access token의 `iss` 클레임
 * 두 값이 다르면 openid-client 등 엄격한 클라이언트가 토큰 검증에 실패한다.
 *
 * defaultIssuer(JWT_ISSUER)는 외부에서 보이는 전체 base여야 하며, API_PREFIX가
 * 적용된 경우 그 prefix까지 포함해야 한다(예: https://auth.example.com/api).
 * issuer는 라우팅 경로가 아니라 안정적 식별자이므로, prefix를 코드에서 조합하지
 * 않고 JWT_ISSUER에 한 번만 박아 둔다.
 */
export function resolveTenantIssuer(
  defaultIssuer: string,
  tenant: { issuer: string | null; slug: string },
): string {
  return tenant.issuer ?? `${defaultIssuer}/t/${tenant.slug}`;
}
