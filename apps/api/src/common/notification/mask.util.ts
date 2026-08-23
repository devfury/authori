/**
 * 이메일을 부분 마스킹한다. 알림은 서비스 외부(ezAria 채팅방)에 남으므로
 * 원문 대신 마스킹된 값만 보낸다.
 *
 * jinho@ez.com  → j***@ez.com
 * a@ez.com      → ***@ez.com   (로컬파트가 1자면 첫 글자도 가린다)
 * broken-value  → b***         ('@'가 없으면 앞 1자만 남긴다)
 */
export function maskEmail(email: string): string {
  const value = email?.trim() ?? '';
  if (!value) return '';

  const at = value.lastIndexOf('@');
  if (at < 0) {
    return `${value.slice(0, 1)}***`;
  }

  const local = value.slice(0, at);
  const domain = value.slice(at);
  if (local.length <= 1) {
    return `***${domain}`;
  }
  return `${local.slice(0, 1)}***${domain}`;
}
