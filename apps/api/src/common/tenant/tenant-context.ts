export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
}

// Express Request에 tenant 컨텍스트를 붙이기 위한 타입 확장
declare module 'express' {
  interface Request {
    tenantContext?: TenantContext;
  }
}
