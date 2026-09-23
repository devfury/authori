import { resolveDatabaseConnection } from './database-url';

/** process.env 를 건드리지 않도록 해석 함수에 env 를 직접 넘긴다. */
const env = (vars: Record<string, string>): NodeJS.ProcessEnv => vars;

describe('resolveDatabaseConnection — DATABASE_URL', () => {
  it('전체가 지정된 URL 을 해석한다', () => {
    expect(
      resolveDatabaseConnection(
        env({ DATABASE_URL: 'postgresql://ezdesk:secret@db.example.com:5000/ezdesk' }),
      ),
    ).toEqual({
      host: 'db.example.com',
      port: 5000,
      username: 'ezdesk',
      password: 'secret',
      database: 'ezdesk',
      ssl: false,
    });
  });

  it('postgres:// 스킴도 받는다', () => {
    expect(
      resolveDatabaseConnection(env({ DATABASE_URL: 'postgres://u:p@host:5432/db' })).host,
    ).toBe('host');
  });

  it('포트를 생략하면 5432 로 본다', () => {
    expect(resolveDatabaseConnection(env({ DATABASE_URL: 'postgresql://u:p@host/db' })).port).toBe(
      5432,
    );
  });

  it('비밀번호가 없어도 해석한다', () => {
    const result = resolveDatabaseConnection(env({ DATABASE_URL: 'postgresql://u@host/db' }));
    expect(result.username).toBe('u');
    expect(result.password).toBe('');
  });

  describe('퍼센트 인코딩', () => {
    it('비밀번호의 @ 를 디코딩한다 — 디코딩하지 않으면 인증이 실패한다', () => {
      expect(
        resolveDatabaseConnection(env({ DATABASE_URL: 'postgresql://u:p%40ss@host/db' })).password,
      ).toBe('p@ss');
    });

    it('비밀번호의 / 와 : 를 디코딩한다', () => {
      expect(
        resolveDatabaseConnection(env({ DATABASE_URL: 'postgresql://u:a%2Fb%3Ac@host/db' }))
          .password,
      ).toBe('a/b:c');
    });

    it('사용자명도 디코딩한다', () => {
      expect(
        resolveDatabaseConnection(env({ DATABASE_URL: 'postgresql://user%40corp:p@host/db' }))
          .username,
      ).toBe('user@corp');
    });
  });

  describe('sslmode', () => {
    it.each(['disable', 'allow', 'prefer'])('%s 는 비암호화로 접속한다', (mode) => {
      expect(
        resolveDatabaseConnection(env({ DATABASE_URL: `postgresql://u:p@host/db?sslmode=${mode}` }))
          .ssl,
      ).toBe(false);
    });

    it('지정이 없으면 비암호화다 — 기존 동작과 같다', () => {
      expect(resolveDatabaseConnection(env({ DATABASE_URL: 'postgresql://u:p@host/db' })).ssl).toBe(
        false,
      );
    });

    it.each(['require', 'no-verify'])('%s 는 암호화하되 인증서를 검증하지 않는다', (mode) => {
      expect(
        resolveDatabaseConnection(env({ DATABASE_URL: `postgresql://u:p@host/db?sslmode=${mode}` }))
          .ssl,
      ).toEqual({ rejectUnauthorized: false });
    });

    it.each(['verify-ca', 'verify-full'])('%s 는 인증서를 검증한다', (mode) => {
      expect(
        resolveDatabaseConnection(env({ DATABASE_URL: `postgresql://u:p@host/db?sslmode=${mode}` }))
          .ssl,
      ).toEqual({ rejectUnauthorized: true });
    });
  });

  describe('형식 오류는 조용히 넘어가지 않는다', () => {
    it.each([
      ['URL 이 아님', 'not-a-url'],
      ['지원하지 않는 스킴', 'mysql://u:p@host/db'],
      ['데이터베이스명 없음', 'postgresql://u:p@host'],
      ['호스트 없음', 'postgresql:///db'],
    ])('%s 이면 던진다', (_label, url) => {
      expect(() => resolveDatabaseConnection(env({ DATABASE_URL: url }))).toThrow(
        /DATABASE_URL 형식이 올바르지 않습니다/,
      );
    });

    it('오류 메시지에 비밀번호를 넣지 않는다 — 로그·스택트레이스에 남는다', () => {
      const secret = 'sup3rs3cr3t';
      let message = '';
      try {
        resolveDatabaseConnection(env({ DATABASE_URL: `mysql://user:${secret}@host/db` }));
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toContain('DATABASE_URL 형식이 올바르지 않습니다');
      expect(message).not.toContain(secret);
    });
  });
});

describe('resolveDatabaseConnection — 폴백', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  afterEach(() => warn.mockClear());
  afterAll(() => warn.mockRestore());

  it('DATABASE_URL 이 없으면 개별 DB_* 변수를 쓴다 — 기존 배포가 깨지지 않아야 한다', () => {
    expect(
      resolveDatabaseConnection(
        env({
          DB_HOST: 'legacy.example.com',
          DB_PORT: '5433',
          DB_USERNAME: 'legacy',
          DB_PASSWORD: 'pw',
          DB_NAME: 'legacy_db',
        }),
      ),
    ).toEqual({
      host: 'legacy.example.com',
      port: 5433,
      username: 'legacy',
      password: 'pw',
      database: 'legacy_db',
      ssl: false,
    });
  });

  it('개별 변수를 쓰면 폐기 예정 경고를 남긴다', () => {
    resolveDatabaseConnection(env({ DB_HOST: 'legacy.example.com' }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('폐기 예정'));
  });

  it('경고에 자격증명을 넣지 않는다', () => {
    resolveDatabaseConnection(env({ DB_HOST: 'h', DB_PASSWORD: 'sup3rs3cr3t' }));
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain('sup3rs3cr3t');
  });

  it('둘 다 없으면 로컬 개발 기본값을 쓴다', () => {
    expect(resolveDatabaseConnection(env({}))).toEqual({
      host: 'localhost',
      port: 5432,
      username: 'authori',
      password: '',
      database: 'authori_db',
      ssl: false,
    });
  });

  it('기본값일 때는 경고하지 않는다 — 폐기 대상 설정을 쓰고 있지 않다', () => {
    resolveDatabaseConnection(env({}));
    expect(warn).not.toHaveBeenCalled();
  });

  it('둘 다 있으면 DATABASE_URL 이 이긴다', () => {
    expect(
      resolveDatabaseConnection(
        env({ DATABASE_URL: 'postgresql://u:p@new.example.com/newdb', DB_HOST: 'old.example.com' }),
      ).host,
    ).toBe('new.example.com');
  });
});
