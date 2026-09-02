import { omitNullValues } from './profile-value.util';

describe('omitNullValues', () => {
  it('null 값 키를 제거한다', () => {
    expect(omitNullValues({ department: '내과', telephone: null })).toEqual({
      department: '내과',
    });
  });

  it('undefined 값 키를 제거한다', () => {
    expect(omitNullValues({ department: '내과', telephone: undefined })).toEqual({
      department: '내과',
    });
  });

  it('false·0·빈 문자열은 유효한 값으로 남긴다', () => {
    expect(omitNullValues({ agreed: false, visits: 0, memo: '' })).toEqual({
      agreed: false,
      visits: 0,
      memo: '',
    });
  });

  it('중첩 객체와 배열 값은 그대로 보존한다', () => {
    const nested = { inner: null };
    expect(omitNullValues({ nested, tags: ['a'] })).toEqual({ nested, tags: ['a'] });
  });

  it('원본 객체를 변경하지 않는다', () => {
    const source = { department: '내과', telephone: null };
    omitNullValues(source);
    expect(source).toEqual({ department: '내과', telephone: null });
  });

  it('모든 값이 null이면 빈 객체를 돌려준다', () => {
    expect(omitNullValues({ a: null, b: null })).toEqual({});
  });

  it('빈 객체를 그대로 돌려준다', () => {
    expect(omitNullValues({})).toEqual({});
  });
});
