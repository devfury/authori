import { UserStatus } from '../../database/entities';
import {
  buildUserInfoClaims,
  resolveEffectiveScopes,
  type UserInfoProfile,
  type UserInfoUser,
} from './userinfo-claims';

describe('resolveEffectiveScopes', () => {
  it('profile:write는 profile 읽기를 함의한다', () => {
    const effective = resolveEffectiveScopes(['openid', 'profile:write']);
    expect(effective.has('profile')).toBe(true);
    expect(effective.has('profile:write')).toBe(true);
  });

  it('함의는 단방향이며 profile이 profile:write를 부여하지 않는다', () => {
    const effective = resolveEffectiveScopes(['openid', 'profile']);
    expect(effective.has('profile:write')).toBe(false);
  });

  it('원본 scope 집합을 변경하지 않는다', () => {
    const original = new Set(['profile:write']);
    resolveEffectiveScopes(original);
    expect([...original]).toEqual(['profile:write']);
  });
});

describe('buildUserInfoClaims', () => {
  const TENANT_ID = '1a2b3c4d-0000-0000-0000-000000000001';

  const user = (overrides: Partial<UserInfoUser> = {}): UserInfoUser => ({
    id: '8f3c0000-0000-0000-0000-000000000002',
    email: 'user@example.com',
    loginId: 'johnny',
    status: UserStatus.ACTIVE,
    ...overrides,
  });

  const profile = (profileJsonb: Record<string, unknown>): UserInfoProfile => ({ profileJsonb });

  it('scope가 없으면 sub와 tenant_id만 반환한다', () => {
    const claims = buildUserInfoClaims({
      user: user(),
      profile: profile({ department: '내과' }),
      tenantId: TENANT_ID,
      scopes: [],
    });

    expect(claims).toEqual({
      sub: '8f3c0000-0000-0000-0000-000000000002',
      tenant_id: TENANT_ID,
    });
  });

  it('email scope가 있으면 email과 email_verified를 반환한다', () => {
    const claims = buildUserInfoClaims({
      user: user(),
      profile: null,
      tenantId: TENANT_ID,
      scopes: ['email'],
    });

    expect(claims.email).toBe('user@example.com');
    expect(claims.email_verified).toBe(true);
  });

  it('ACTIVE가 아닌 사용자의 email_verified는 false다', () => {
    const claims = buildUserInfoClaims({
      user: user({ status: UserStatus.INACTIVE }),
      profile: null,
      tenantId: TENANT_ID,
      scopes: ['email'],
    });

    expect(claims.email_verified).toBe(false);
  });

  it('profile scope가 있으면 프로필 키를 최상위로 평탄화하고 preferred_username을 포함한다', () => {
    const claims = buildUserInfoClaims({
      user: user(),
      profile: profile({ department: '내과', organization: '본원' }),
      tenantId: TENANT_ID,
      scopes: ['profile'],
    });

    expect(claims).toEqual({
      sub: '8f3c0000-0000-0000-0000-000000000002',
      tenant_id: TENANT_ID,
      preferred_username: 'johnny',
      department: '내과',
      organization: '본원',
    });
  });

  it('profile scope가 없으면 프로필 키와 preferred_username을 모두 제외한다', () => {
    const claims = buildUserInfoClaims({
      user: user(),
      profile: profile({ department: '내과' }),
      tenantId: TENANT_ID,
      scopes: ['openid', 'email'],
    });

    expect(claims).not.toHaveProperty('department');
    expect(claims).not.toHaveProperty('preferred_username');
  });

  it('loginId가 null이면 preferred_username을 생략한다', () => {
    const claims = buildUserInfoClaims({
      user: user({ loginId: null }),
      profile: profile({ department: '내과' }),
      tenantId: TENANT_ID,
      scopes: ['profile'],
    });

    expect(claims).not.toHaveProperty('preferred_username');
    expect(claims.department).toBe('내과');
  });

  it('프로필 행이 없어도 preferred_username은 반환한다', () => {
    const claims = buildUserInfoClaims({
      user: user(),
      profile: null,
      tenantId: TENANT_ID,
      scopes: ['profile'],
    });

    expect(claims).toEqual({
      sub: '8f3c0000-0000-0000-0000-000000000002',
      tenant_id: TENANT_ID,
      preferred_username: 'johnny',
    });
  });

  it('프로필이 예약 클레임과 같은 키를 담고 있어도 인증 정보를 덮어쓰지 않는다', () => {
    // profile_jsonb는 사용자가 profile:write로 직접 쓸 수 있으므로
    // email/email_verified 위조를 통한 JIT 프로비저닝 계정 탈취를 차단해야 한다.
    const claims = buildUserInfoClaims({
      user: user(),
      profile: profile({
        sub: 'attacker-sub',
        tenant_id: 'attacker-tenant',
        email: 'victim@corp.com',
        email_verified: true,
        preferred_username: 'admin',
        department: '내과',
      }),
      tenantId: TENANT_ID,
      scopes: ['email', 'profile'],
    });

    expect(claims).toEqual({
      sub: '8f3c0000-0000-0000-0000-000000000002',
      tenant_id: TENANT_ID,
      email: 'user@example.com',
      email_verified: true,
      preferred_username: 'johnny',
      department: '내과',
    });
  });

  it('email scope 없이 프로필에 심어둔 email은 클레임으로 유출되지 않는다', () => {
    const claims = buildUserInfoClaims({
      user: user(),
      profile: profile({ email: 'victim@corp.com' }),
      tenantId: TENANT_ID,
      scopes: ['profile'],
    });

    expect(claims).not.toHaveProperty('email');
  });

  it('profile:write만 가진 토큰도 프로필 클레임을 되읽을 수 있다', () => {
    const claims = buildUserInfoClaims({
      user: user(),
      profile: profile({ department: '내과' }),
      tenantId: TENANT_ID,
      scopes: ['profile:write'],
    });

    expect(claims.department).toBe('내과');
    expect(claims.preferred_username).toBe('johnny');
  });

  it('값이 null인 프로필 항목은 키째로 생략한다', () => {
    // 소비자는 클레임이 있으면 값이 있다고 기대한다. null 을 그대로 내보내
    // ezDesk 로그인이 깨진 2026-09-02 장애의 회귀 방지 테스트.
    const claims = buildUserInfoClaims({
      user: user(),
      profile: profile({ department: '내과', telephone: null }),
      tenantId: TENANT_ID,
      scopes: ['profile'],
    });

    expect(claims).not.toHaveProperty('telephone');
    expect(claims.department).toBe('내과');
  });

  it('값이 undefined인 프로필 항목도 생략한다', () => {
    const claims = buildUserInfoClaims({
      user: user(),
      profile: profile({ telephone: undefined }),
      tenantId: TENANT_ID,
      scopes: ['profile'],
    });

    expect(claims).not.toHaveProperty('telephone');
  });

  it('false·0·빈 문자열은 유효한 값이므로 반환한다', () => {
    const claims = buildUserInfoClaims({
      user: user(),
      profile: profile({ agreed: false, visits: 0, memo: '' }),
      tenantId: TENANT_ID,
      scopes: ['profile'],
    });

    expect(claims.agreed).toBe(false);
    expect(claims.visits).toBe(0);
    expect(claims.memo).toBe('');
  });

  it('모든 프로필 값이 null이면 프로필 클레임이 하나도 나오지 않는다', () => {
    const claims = buildUserInfoClaims({
      user: user({ loginId: null }),
      profile: profile({ department: null, telephone: null }),
      tenantId: TENANT_ID,
      scopes: ['profile'],
    });

    expect(Object.keys(claims).sort()).toEqual(['sub', 'tenant_id']);
  });

  it('전체 scope에서 반환하는 클레임 키 집합을 고정한다', () => {
    // GET/PATCH가 이 빌더를 공유하므로 여기서 고정한 키 집합이 두 응답의 계약이다.
    const source = {
      user: user(),
      profile: profile({ department: '내과' }),
      tenantId: TENANT_ID,
      scopes: ['openid', 'email', 'profile', 'profile:write'],
    };

    expect(Object.keys(buildUserInfoClaims(source)).sort()).toEqual([
      'department',
      'email',
      'email_verified',
      'preferred_username',
      'sub',
      'tenant_id',
    ]);
  });
});
