import { User, UserProfile, UserStatus } from '../../database/entities';

/**
 * UserInfo 응답이 직접 관리하는 클레임.
 * profile_jsonb 의 키가 이 목록과 충돌하면 프로필 값을 버린다.
 */
export const RESERVED_USERINFO_CLAIMS = [
  'sub',
  'tenant_id',
  'email',
  'email_verified',
  'preferred_username',
] as const;

const RESERVED = new Set<string>(RESERVED_USERINFO_CLAIMS);

export type UserInfoUser = Pick<User, 'id' | 'email' | 'loginId' | 'status'>;
export type UserInfoProfile = Pick<UserProfile, 'profileJsonb'>;

export interface UserInfoClaimSource {
  user: UserInfoUser;
  profile: UserInfoProfile | null;
  tenantId: string;
  scopes: Iterable<string>;
}

/**
 * profile:write 는 프로필 필드에 대한 쓰기 권한이므로 되읽기를 함의한다.
 * 함의는 단방향이다 — profile 만 가진 토큰에 쓰기 권한을 주지 않는다.
 */
export function resolveEffectiveScopes(scopes: Iterable<string>): Set<string> {
  const effective = new Set(scopes);
  if (effective.has('profile:write')) effective.add('profile');
  return effective;
}

/**
 * GET/PATCH /oauth/userinfo 가 공유하는 단일 클레임 빌더.
 *
 * 두 엔드포인트가 서로 다른 응답 스키마를 내보내던 회귀(ffa5d97)를 막기 위해
 * 조립 로직을 컨트롤러에서 분리했다. 응답 계약은 userinfo-claims.spec.ts 가 고정한다.
 */
export function buildUserInfoClaims({
  user,
  profile,
  tenantId,
  scopes,
}: UserInfoClaimSource): Record<string, unknown> {
  const effective = resolveEffectiveScopes(scopes);

  const claims: Record<string, unknown> = {
    sub: user.id,
    tenant_id: tenantId,
  };

  if (effective.has('email')) {
    claims.email = user.email;
    claims.email_verified = user.status === UserStatus.ACTIVE;
  }

  if (effective.has('profile')) {
    if (user.loginId !== null) claims.preferred_username = user.loginId;

    // OIDC Core 5.1 은 표준 클레임을 최상위에 두도록 규정한다.
    // profile_jsonb 는 사용자가 직접 쓸 수 있으므로 예약 클레임 위조를 막아야 한다.
    for (const [key, value] of Object.entries(profile?.profileJsonb ?? {})) {
      if (RESERVED.has(key)) continue;
      claims[key] = value;
    }
  }

  return claims;
}
