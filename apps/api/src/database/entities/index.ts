export { Tenant, TenantStatus } from './tenant.entity';
export { TenantSettings } from './tenant-settings.entity';
export { TenantScope } from './tenant-scope.entity';
export { TenantRole } from './tenant-role.entity';
export { TenantPermission } from './tenant-permission.entity';
export { RolePermission } from './role-permission.entity';
export { UserRole } from './user-role.entity';
export { User, UserStatus } from './user.entity';
export { UserProfile } from './user-profile.entity';
export { ProfileSchemaVersion, SchemaStatus } from './profile-schema-version.entity';
export { OAuthClient, ClientType, ClientStatus } from './oauth-client.entity';
export { OAuthClientRedirectUri } from './oauth-client-redirect-uri.entity';
export { AuthorizationCode, CodeChallengeMethod } from './authorization-code.entity';
export { AccessToken } from './access-token.entity';
export { RefreshToken } from './refresh-token.entity';
export { Consent } from './consent.entity';
export { SigningKey, KeyAlgorithm, KeyStatus } from './signing-key.entity';
export { AuditLog, AuditAction } from './audit-log.entity';
export { AdminUser, AdminRole, AdminStatus } from './admin-user.entity';
export { AdminUserTenant } from './admin-user-tenant.entity';
export { ExternalAuthProvider } from './external-auth-provider.entity';
export type {
  ExternalAuthFieldMapping,
  ExternalAuthRequestMapping,
  SimpleTransform,
  ParameterizedTransform,
  TransformSpec,
} from './external-auth-provider.entity';
export type { LoginBranding } from './oauth-client.entity';
export { PendingOAuthRequest } from './pending-oauth-request.entity';
export { EmailVerificationToken } from './email-verification-token.entity';
export { PasswordResetToken } from './password-reset-token.entity';

// `export ... from` 은 재export 라 로컬 바인딩을 만들지 않는다. 배열에 넣으려면 import 가 필요하다.
import { Tenant } from './tenant.entity';
import { TenantSettings } from './tenant-settings.entity';
import { TenantScope } from './tenant-scope.entity';
import { TenantRole } from './tenant-role.entity';
import { TenantPermission } from './tenant-permission.entity';
import { RolePermission } from './role-permission.entity';
import { UserRole } from './user-role.entity';
import { User } from './user.entity';
import { UserProfile } from './user-profile.entity';
import { ProfileSchemaVersion } from './profile-schema-version.entity';
import { OAuthClient } from './oauth-client.entity';
import { OAuthClientRedirectUri } from './oauth-client-redirect-uri.entity';
import { AuthorizationCode } from './authorization-code.entity';
import { AccessToken } from './access-token.entity';
import { RefreshToken } from './refresh-token.entity';
import { Consent } from './consent.entity';
import { SigningKey } from './signing-key.entity';
import { AuditLog } from './audit-log.entity';
import { AdminUser } from './admin-user.entity';
import { AdminUserTenant } from './admin-user-tenant.entity';
import { ExternalAuthProvider } from './external-auth-provider.entity';
import { PendingOAuthRequest } from './pending-oauth-request.entity';
import { EmailVerificationToken } from './email-verification-token.entity';
import { PasswordResetToken } from './password-reset-token.entity';

/**
 * DataSource 에 등록할 전체 엔티티.
 *
 * 런타임(`DatabaseModule`)과 마이그레이션 CLI(`data-source.ts`)가 함께 참조한다.
 * 두 곳이 목록을 각각 들고 있던 탓에 AdminUserTenant 가 런타임에서만 누락돼
 * "No metadata for AdminUserTenant was found" 로 실패한 전례가 있다(2026-09-23).
 * 엔티티를 새로 만들면 위의 export 와 함께 이 배열에도 반드시 추가한다.
 */
export const ALL_ENTITIES = [
  Tenant,
  TenantSettings,
  TenantScope,
  TenantRole,
  TenantPermission,
  User,
  UserProfile,
  RolePermission,
  UserRole,
  ProfileSchemaVersion,
  OAuthClient,
  OAuthClientRedirectUri,
  PendingOAuthRequest,
  AuthorizationCode,
  AccessToken,
  RefreshToken,
  Consent,
  SigningKey,
  AuditLog,
  AdminUser,
  AdminUserTenant,
  ExternalAuthProvider,
  EmailVerificationToken,
  PasswordResetToken,
];
