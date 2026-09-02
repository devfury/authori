import { BadRequestException, ConflictException } from '@nestjs/common';
import { ExternalAuthProvider } from '../database/entities';
import { ExternalAuthService } from './external-auth.service';

describe('ExternalAuthService provider persistence', () => {
  const repo = {
    create: jest.fn((value: Partial<ExternalAuthProvider>) => value),
    save: jest.fn(async (value: Partial<ExternalAuthProvider>) => ({
      id: 'provider-1',
      ...value,
    })),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findOne.mockResolvedValue(null);
    repo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });
  });

  it('stores requestMapping when creating a provider', async () => {
    const service = new ExternalAuthService(repo as never);

    await service.create('tenant-1', {
      providerUrl: 'https://legacy.example.com/auth',
      requestMapping: {
        email: 'login_id',
        password: 'passwd',
        tenantId: 'tenant',
        clientId: 'client',
        staticParams: { source: 'authori' },
      },
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestMapping: {
          email: 'login_id',
          password: 'passwd',
          tenantId: 'tenant',
          clientId: 'client',
          staticParams: { source: 'authori' },
        },
      }),
    );
  });

  it('rejects duplicate default providers before saving requestMapping', async () => {
    repo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: 'existing-provider', emailDomains: null }]),
    });
    const service = new ExternalAuthService(repo as never);

    await expect(
      service.create('tenant-1', {
        providerUrl: 'https://legacy.example.com/auth',
        requestMapping: { email: 'login_id' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('normalizes and persists email domains', async () => {
    const service = new ExternalAuthService(repo as never);

    await service.create('tenant-1', {
      providerUrl: 'https://legacy.example.com/auth',
      emailDomains: [' @Test1.COM ', '@test1.com', 'test1.co.kr'],
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ emailDomains: ['test1.com', 'test1.co.kr'] }),
    );
  });

  it('rejects malformed email domains', () => {
    const service = new ExternalAuthService(repo as never);

    expect(() => service.normalizeEmailDomains(['invalid'])).toThrow(BadRequestException);
    expect(() => service.normalizeEmailDomains(['*.example.com'])).toThrow(BadRequestException);
    expect(service.normalizeEmailDomains([' ', '@TEST.COM', 'test.com'])).toEqual(['test.com']);
    expect(service.normalizeEmailDomains([])).toBeNull();
  });

  it('extracts an email domain from the last at sign', () => {
    const service = new ExternalAuthService(repo as never);

    expect(service.extractEmailDomain('u@Test.COM')).toBe('test.com');
    expect(service.extractEmailDomain('no-at')).toBeNull();
    expect(service.extractEmailDomain('"a@b"@test.com')).toBe('test.com');
  });

  it('rejects overlapping domains but permits non-overlapping domains', async () => {
    repo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: 'existing', emailDomains: ['test1.com'] }]),
    });
    const service = new ExternalAuthService(repo as never);

    await expect(
      service.create('tenant-1', {
        providerUrl: 'https://legacy.example.com/auth',
        emailDomains: ['@TEST1.COM'],
      }),
    ).rejects.toThrow(/test1\.com/);

    await expect(
      service.create('tenant-1', {
        clientId: 'another-client',
        providerUrl: 'https://legacy.example.com/auth',
        emailDomains: ['test2.com'],
      }),
    ).resolves.toBeDefined();
  });

  it('does not treat the provider itself as a duplicate during update', async () => {
    const provider = {
      id: 'provider-1',
      tenantId: 'tenant-1',
      clientId: 'client-1',
      emailDomains: ['test1.com'],
    } as ExternalAuthProvider;
    repo.findOne.mockResolvedValue(provider);
    repo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });
    repo.save.mockResolvedValue(provider);
    const service = new ExternalAuthService(repo as never);

    await expect(
      service.update('tenant-1', 'provider-1', { emailDomains: ['test1.com'] }),
    ).resolves.toBe(provider);
  });
});

describe('ExternalAuthService active provider selection', () => {
  const repo = { createQueryBuilder: jest.fn() };

  function serviceWith(candidates: Partial<ExternalAuthProvider>[]) {
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(candidates),
    };
    repo.createQueryBuilder.mockReturnValue(query);
    return new ExternalAuthService(repo as never);
  }

  it.each([
    ['client domain', 'client-domain', 'client-default', 'tenant-domain', 'tenant-default'],
    ['client default', undefined, 'client-default', 'tenant-domain', 'tenant-default'],
    ['tenant domain', undefined, undefined, 'tenant-domain', 'tenant-default'],
    ['tenant default', undefined, undefined, undefined, 'tenant-default'],
  ])(
    '%s has the expected priority',
    async (_, clientDomain, clientDefault, tenantDomain, tenantDefault) => {
      const candidates = [
        clientDomain && { id: clientDomain, clientId: 'client-1', emailDomains: ['example.com'] },
        clientDefault && { id: clientDefault, clientId: 'client-1', emailDomains: null },
        tenantDomain && { id: tenantDomain, clientId: null, emailDomains: ['example.com'] },
        tenantDefault && { id: tenantDefault, clientId: null, emailDomains: null },
      ].filter(Boolean) as Partial<ExternalAuthProvider>[];
      const service = serviceWith(candidates);

      const result = await service.findActive('tenant-1', 'client-1', 'u@example.com');
      expect(result?.id).toBe(clientDomain ?? clientDefault ?? tenantDomain ?? tenantDefault);
    },
  );

  it('returns null when the domain does not match and no default exists', async () => {
    const service = serviceWith([
      { id: 'provider', clientId: 'client-1', emailDomains: ['other.com'] },
    ]);
    await expect(service.findActive('tenant-1', 'client-1', 'u@example.com')).resolves.toBeNull();
  });

  it('does not select a domain provider when email is omitted', async () => {
    const service = serviceWith([
      { id: 'provider', clientId: 'client-1', emailDomains: ['example.com'] },
    ]);
    await expect(service.findActive('tenant-1', 'client-1')).resolves.toBeNull();
  });
});

describe('ExternalAuthService request body mapping', () => {
  const repo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  };

  it('builds the default request body when requestMapping is missing', () => {
    const service = new ExternalAuthService(repo as never);

    expect(
      service.buildProviderRequestBody(null, 'user@example.com', 'secret', 'tenant-1', 'client-1'),
    ).toEqual({
      email: 'user@example.com',
      password: 'secret',
    });
  });

  it('maps credentials and context into configured flat fields', () => {
    const service = new ExternalAuthService(repo as never);

    expect(
      service.buildProviderRequestBody(
        {
          email: 'login_id',
          password: 'passwd',
          tenantId: 'tenant',
          clientId: 'client',
          staticParams: { source: 'authori' },
        },
        'user@example.com',
        'secret',
        'tenant-1',
        'client-1',
      ),
    ).toEqual({
      login_id: 'user@example.com',
      passwd: 'secret',
      tenant: 'tenant-1',
      client: 'client-1',
      source: 'authori',
    });
  });

  it('supports dotted request paths', () => {
    const service = new ExternalAuthService(repo as never);

    expect(
      service.buildProviderRequestBody(
        {
          email: 'credentials.email',
          password: 'credentials.password',
          tenantId: 'context.tenantId',
          clientId: 'context.clientId',
          staticParams: { 'context.source': 'authori' },
        },
        'user@example.com',
        'secret',
        'tenant-1',
        'client-1',
      ),
    ).toEqual({
      credentials: {
        email: 'user@example.com',
        password: 'secret',
      },
      context: {
        tenantId: 'tenant-1',
        clientId: 'client-1',
        source: 'authori',
      },
    });
  });
});

describe('ExternalAuthService provider request headers', () => {
  const repo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  };

  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue({
      status: 200,
      json: jest.fn().mockResolvedValue({ authenticated: false, reason: 'invalid_credentials' }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends legacy and additional credential headers to the external provider', async () => {
    const service = new ExternalAuthService(repo as never);

    await service.callProvider(
      {
        id: 'provider-1',
        providerUrl: 'https://legacy.example.com/auth',
        credentialHeader: 'X-Api-Key',
        credentialValue: 'legacy-secret',
        credentialHeaders: {
          Authorization: 'Bearer token-1',
          'X-Tenant-Code': 'demo',
        },
      } as unknown as ExternalAuthProvider,
      'doctor001@example.com',
      'secret',
      'tenant-1',
      'client-1',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://legacy.example.com/auth',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': 'legacy-secret',
          Authorization: 'Bearer token-1',
          'X-Tenant-Code': 'demo',
        },
      }),
    );
  });
});

describe('ExternalAuthService applyValueTransforms', () => {
  const repo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  };

  it('returns original value when transforms is empty', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('hello', [])).toBe('hello');
  });

  it('applies base64 encoding', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('1234', ['base64'])).toBe('MTIzNA==');
  });

  it('applies base64url encoding without padding', () => {
    const service = new ExternalAuthService(repo as never);
    const result = service.applyValueTransforms('a+b/c', ['base64url']);
    expect(result).not.toContain('+');
    expect(result).not.toContain('/');
    expect(result).not.toContain('=');
  });

  it('applies email_prefix to extract local part', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('test1@ezcaretech.com', ['email_prefix'])).toBe('test1');
  });

  it('returns original value when email has no @ for email_prefix', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('noemail', ['email_prefix'])).toBe('noemail');
  });

  it('applies email_domain to extract domain part', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('test1@ezcaretech.com', ['email_domain'])).toBe(
      'ezcaretech.com',
    );
  });

  it('applies md5 hash', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('pass', ['md5'])).toBe('1a1dc91c907325c69271ddf0c944bc72');
  });

  it('applies sha256 hash', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('pass', ['sha256'])).toHaveLength(64);
  });

  it('applies uppercase', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('hello', ['uppercase'])).toBe('HELLO');
  });

  it('applies lowercase', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('HELLO', ['lowercase'])).toBe('hello');
  });

  it('applies trim', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('  hi  ', ['trim'])).toBe('hi');
  });

  it('applies pipeline in order', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('test1@example.com', ['email_prefix', 'uppercase'])).toBe(
      'TEST1',
    );
  });

  it('applies parameterized prefix transform', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('1234', [{ type: 'prefix', value: 'ENC:' }])).toBe(
      'ENC:1234',
    );
  });

  it('applies parameterized suffix transform', () => {
    const service = new ExternalAuthService(repo as never);
    expect(service.applyValueTransforms('user', [{ type: 'suffix', value: '@corp.com' }])).toBe(
      'user@corp.com',
    );
  });

  it('applies template transform with {value} placeholder', () => {
    const service = new ExternalAuthService(repo as never);
    expect(
      service.applyValueTransforms('tok123', [{ type: 'template', pattern: 'Bearer {value}' }]),
    ).toBe('Bearer tok123');
  });

  it('applies regex_extract transform', () => {
    const service = new ExternalAuthService(repo as never);
    expect(
      service.applyValueTransforms('test1@ezcaretech.com', [
        { type: 'regex_extract', pattern: '([^@]+)@', group: 1 },
      ]),
    ).toBe('test1');
  });

  it('returns original value when regex_extract has no match', () => {
    const service = new ExternalAuthService(repo as never);
    expect(
      service.applyValueTransforms('noemail', [
        { type: 'regex_extract', pattern: '([^@]+)@', group: 1 },
      ]),
    ).toBe('noemail');
  });

  it('applies substring transform', () => {
    const service = new ExternalAuthService(repo as never);
    expect(
      service.applyValueTransforms('abcdefgh', [{ type: 'substring', start: 0, end: 4 }]),
    ).toBe('abcd');
  });

  it('applies pipeline: prefix then base64', () => {
    const service = new ExternalAuthService(repo as never);
    const result = service.applyValueTransforms('1234', [
      { type: 'prefix', value: 'ENC:' },
      'base64',
    ]);
    expect(result).toBe(Buffer.from('ENC:1234').toString('base64'));
  });
});

describe('ExternalAuthService request body transform integration', () => {
  const repo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  };

  it('applies email_prefix transform before mapping field', () => {
    const service = new ExternalAuthService(repo as never);

    expect(
      service.buildProviderRequestBody(
        {
          email: 'loginId',
          transforms: { email: ['email_prefix'] },
        },
        'test1@ezcaretech.com',
        'secret',
        'tenant-1',
        'client-1',
      ),
    ).toEqual({
      loginId: 'test1',
      password: 'secret',
    });
  });

  it('applies base64 transform to password', () => {
    const service = new ExternalAuthService(repo as never);

    expect(
      service.buildProviderRequestBody(
        {
          transforms: { password: ['base64'] },
        },
        'user@example.com',
        '1234',
        'tenant-1',
        'client-1',
      ),
    ).toEqual({
      email: 'user@example.com',
      password: 'MTIzNA==',
    });
  });

  it('applies pipeline: email_prefix + uppercase, and trim + base64 to password', () => {
    const service = new ExternalAuthService(repo as never);

    const result = service.buildProviderRequestBody(
      {
        email: 'loginId',
        password: 'passwd',
        transforms: {
          email: ['email_prefix', 'uppercase'],
          password: ['trim', 'base64'],
        },
      },
      'test1@ezcaretech.com',
      ' 1234 ',
      'tenant-1',
      'client-1',
    );

    expect(result).toEqual({
      loginId: 'TEST1',
      passwd: Buffer.from('1234').toString('base64'),
    });
  });

  it('does not transform when transforms field is absent', () => {
    const service = new ExternalAuthService(repo as never);

    expect(
      service.buildProviderRequestBody(
        { email: 'loginId' },
        'test1@ezcaretech.com',
        'secret',
        'tenant-1',
        'client-1',
      ),
    ).toEqual({
      loginId: 'test1@ezcaretech.com',
      password: 'secret',
    });
  });
});

describe('ExternalAuthService response field mapping', () => {
  const repo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  };

  it('maps loginId and profile fields from root and user response paths', () => {
    const service = new ExternalAuthService(repo as never);

    const mapped = service.applyFieldMapping(
      {
        authenticated: true,
        tenantCode: 'demo',
        hospitalCode: 'demo',
        solutionCode: 'mobile-emr',
        user: {
          id: 'doctor001',
          loginId: 'doctor001',
          loginIdType: 'EMPLOYEE_ID',
          name: '홍길동',
          hospitalCode: 'EZCT1000',
          employeeNo: '12345',
          departmentCode: 'IM',
          departmentName: '내과',
          pathName: '진료부문 > 내과',
          positionCode: 'P01',
          positionName: '책임',
          dutyCode: 'D01',
          dutyName: '진료',
          mainWork: 'EMR 연동',
          telePhoneNumber: '02-1234-5678',
          mobilePhoneNumber: '010-5678-1234',
          email: 'doctor001@example.com',
        },
      },
      {
        loginId: 'user.loginId',
        profile: {
          tenantCode: 'tenantCode',
          solutionCode: 'solutionCode',
          'user.hospitalCode': 'hospitalCode',
          'user.employeeNo': 'employeeNo',
          'user.departmentCode': 'departmentCode',
          'user.departmentName': 'departmentName',
          'user.pathName': 'pathName',
          'user.positionName': 'positionName',
          'user.dutyName': 'dutyName',
          'user.mainWork': 'mainWork',
          'user.telePhoneNumber': 'telePhoneNumber',
          'user.mobilePhoneNumber': 'mobilePhoneNumber',
        },
      },
    );

    expect(mapped).toEqual({
      loginId: 'doctor001',
      profile: {
        tenantCode: 'demo',
        solutionCode: 'mobile-emr',
        hospitalCode: 'EZCT1000',
        employeeNo: '12345',
        departmentCode: 'IM',
        departmentName: '내과',
        pathName: '진료부문 > 내과',
        positionName: '책임',
        dutyName: '진료',
        mainWork: 'EMR 연동',
        telePhoneNumber: '02-1234-5678',
        mobilePhoneNumber: '010-5678-1234',
      },
    });
  });

  it('상류가 null로 준 필드는 프로필에 담지 않는다', () => {
    // 전화번호 미등록 사용자에게 상류가 null 을 주면 그대로 저장돼
    // UserInfo 소비자를 깨뜨렸다(2026-09-02 장애). 키를 빼서 기존 값을 보존한다.
    const service = new ExternalAuthService(repo as never);

    const mapped = service.applyFieldMapping(
      {
        authenticated: true,
        user: {
          loginId: 'doctor001',
          departmentName: '내과',
          telePhoneNumber: null,
          mobilePhoneNumber: '010-5678-1234',
        },
      },
      {
        loginId: 'user.loginId',
        profile: {
          'user.departmentName': 'department',
          'user.telePhoneNumber': 'telephone',
          'user.mobilePhoneNumber': 'mobilephone',
        },
      },
    );

    expect(mapped.profile).toEqual({
      department: '내과',
      mobilephone: '010-5678-1234',
    });
    expect(mapped.profile).not.toHaveProperty('telephone');
  });

  it('매핑을 지정하지 않은 경로에서도 null 필드를 제외한다', () => {
    const service = new ExternalAuthService(repo as never);

    const mapped = service.applyFieldMapping(
      {
        authenticated: true,
        user: {
          loginId: 'doctor001',
          profile: {
            department: '내과',
            telephone: null,
            agreed: false,
          },
        },
      },
      null,
    );

    expect(mapped.profile).toEqual({ department: '내과', agreed: false });
  });

  it('keeps existing user.profile mapping behavior for unqualified profile keys', () => {
    const service = new ExternalAuthService(repo as never);

    const mapped = service.applyFieldMapping(
      {
        authenticated: true,
        user: {
          email: 'doctor001@example.com',
          loginId: 'doctor001',
          profile: {
            dept: 'IM',
            empNo: '12345',
          },
        },
      },
      {
        profile: {
          dept: 'departmentCode',
          empNo: 'employeeNo',
        },
      },
    );

    expect(mapped).toEqual({
      loginId: 'doctor001',
      profile: {
        departmentCode: 'IM',
        employeeNo: '12345',
      },
    });
  });
});
