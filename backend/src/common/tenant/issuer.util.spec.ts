import { resolveTenantIssuer } from './issuer.util';

describe('resolveTenantIssuer', () => {
  const DEFAULT = 'https://auth.example.com/api';

  it('테넌트 issuer가 없으면 {defaultIssuer}/t/{slug}로 폴백한다', () => {
    expect(resolveTenantIssuer(DEFAULT, { issuer: null, slug: 'acme' })).toBe(
      'https://auth.example.com/api/t/acme',
    );
  });

  it('테넌트에 명시적 issuer가 있으면 그 값을 그대로 사용한다', () => {
    expect(
      resolveTenantIssuer(DEFAULT, { issuer: 'https://id.acme.com', slug: 'acme' }),
    ).toBe('https://id.acme.com');
  });

  it('API_PREFIX가 포함된 JWT_ISSUER의 prefix를 폴백 issuer에 보존한다', () => {
    // discovery의 issuer와 token의 iss가 이 동일 함수로 계산되어 항상 일치함을 보장
    const issuer = resolveTenantIssuer(DEFAULT, { issuer: null, slug: 'acme' });
    expect(issuer.startsWith('https://auth.example.com/api/')).toBe(true);
  });
});
