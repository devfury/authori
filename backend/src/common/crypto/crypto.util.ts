import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

export class CryptoUtil {
  /** 안전한 랜덤 토큰 생성 (URL-safe base64) */
  static generateToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  /** bcrypt 해시 */
  static async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  /** bcrypt 검증 */
  static async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /** SHA-256 해시 (hex) — refresh token 저장용 */
  static sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** PKCE S256 code_challenge 검증 */
  static verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
    const expected = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    return expected === codeChallenge;
  }

  /** UUID v4 */
  static generateUuid(): string {
    return crypto.randomUUID();
  }
}
