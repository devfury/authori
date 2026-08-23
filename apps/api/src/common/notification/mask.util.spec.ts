import { maskEmail } from './mask.util';

describe('maskEmail', () => {
  it('로컬파트 첫 글자만 남기고 마스킹한다', () => {
    expect(maskEmail('jinho@ez.com')).toBe('j***@ez.com');
  });

  it('로컬파트가 1자면 전부 가린다', () => {
    expect(maskEmail('a@ez.com')).toBe('***@ez.com');
  });

  it("'@'가 없으면 앞 1자만 남긴다", () => {
    expect(maskEmail('broken-value')).toBe('b***');
  });

  it('빈 값은 빈 문자열을 반환한다', () => {
    expect(maskEmail('')).toBe('');
    expect(maskEmail('   ')).toBe('');
  });

  it('로컬파트에 @가 여러 개면 마지막 @를 도메인 경계로 본다', () => {
    expect(maskEmail('a"b"@c@ez.com')).toBe('a***@ez.com');
  });
});
