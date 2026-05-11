# 사용자 계정 삭제 기능 설계

**날짜**: 2026-05-11  
**상태**: 승인됨

## 개요

테넌트 관리자가 사용자 계정을 영구 삭제할 수 있는 기능을 추가한다. 기존 `DELETE /admin/tenants/:tenantId/users/:id` 엔드포인트가 비활성화(`status=INACTIVE`)로 매핑되어 있던 것을 실제 Hard Delete로 변경한다.

## 요구사항

- 삭제 방식: Hard Delete (DB에서 레코드 완전 제거)
- 연관 데이터(OAuth 토큰, 콤센트): 사용자와 함께 삭제
- API: `DELETE /admin/tenants/:tenantId/users/:id` 엔드포인트 용도 변경
- 감사 로그: 삭제 전 `USER.DELETED` 이벤트 기록

## 백엔드 설계

### 1. AuditAction 추가

`backend/src/database/entities/audit-log.entity.ts`의 `AuditAction` enum에 추가:

```typescript
USER_DELETED = 'USER.DELETED',
```

### 2. UsersService.delete()

```typescript
async delete(tenantId: string, id: string, ctx?: AuditContext): Promise<void> {
  const user = await this.findOne(tenantId, id); // NotFoundException if not found

  await this.dataSource.transaction(async (manager) => {
    await manager.delete(Consent, { tenantId, userId: id });
    await manager.delete(AccessToken, { tenantId, userId: id });
    await manager.delete(RefreshToken, { tenantId, userId: id });
    await manager.delete(AuthorizationCode, { tenantId, userId: id });
    await manager.remove(User, user); // UserProfile: cascade:true, UserRole: DB CASCADE
  });

  await this.auditService.record({
    tenantId,
    action: AuditAction.USER_DELETED,
    targetType: 'user',
    targetId: id,
    metadata: { email: user.email },
    ...ctx,
  });
}
```

**주의**: AuditLog는 users 테이블에 FK가 없으므로 삭제 후 기록해도 참조 무결성 문제 없음.

### 3. 모듈 등록

`UsersModule`에 `Consent`, `AccessToken`, `RefreshToken` 엔티티 리포지토리 추가:

```typescript
TypeOrmModule.forFeature([User, UserProfile, Consent, AccessToken, RefreshToken, AuthorizationCode])
```

`UsersService` 생성자에 해당 리포지토리 주입.

### 4. UsersController 변경

`DELETE :id` 핸들러를 `deactivate()` 대신 `delete()` 호출로 변경:

```typescript
@Delete(':id')
@HttpCode(HttpStatus.NO_CONTENT)
@ApiOperation({ summary: '사용자 영구 삭제' })
remove(@Param('tenantId') tenantId: string, @Param('id') id: string, @Req() req: Request) {
  return this.usersService.delete(tenantId, id, { /* ctx */ });
}
```

비활성화는 기존 `PATCH :id` + `{ status: 'INACTIVE' }` 로 처리 가능하므로 별도 엔드포인트 불필요.

## 프론트엔드 설계

### 1. `frontend/src/api/users.ts`

- `deactivate()` 메서드: `http.delete(...)` → `http.patch(..., { status: 'INACTIVE' })` 로 변경
- `delete()` 메서드 추가: `http.delete(...)`

```typescript
deactivate(tenantId: string, userId: string) {
  return http.patch(`/admin/tenants/${tenantId}/users/${userId}`, { status: 'INACTIVE' })
},
delete(tenantId: string, userId: string) {
  return http.delete(`/admin/tenants/${tenantId}/users/${userId}`)
},
```

### 2. `frontend/src/views/tenant/users/UserDetailView.vue`

- "삭제" 버튼 추가 (danger 스타일, 기존 비활성화 버튼과 구분)
- `ConfirmDialog` 재사용, `danger` 모드
  - 제목: `사용자 영구 삭제`
  - 메시지: `'${user.email}' 사용자를 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
  - 확인 버튼 레이블: `삭제`
- 삭제 완료 후 `router.push({ name: 'user-list', params: { tenantId } })`로 이동

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `backend/src/database/entities/audit-log.entity.ts` | `USER_DELETED` AuditAction 추가 |
| `backend/src/users/users.service.ts` | `delete()` 메서드 추가, 리포지토리 주입 추가 |
| `backend/src/users/users.module.ts` | `Consent`, `AccessToken`, `RefreshToken` 엔티티 등록 |
| `backend/src/users/users.controller.ts` | `DELETE :id` 핸들러 변경 |
| `frontend/src/api/users.ts` | `deactivate()` 변경, `delete()` 추가 |
| `frontend/src/views/tenant/users/UserDetailView.vue` | 삭제 버튼 및 확인 다이얼로그 추가 |

## 데이터 흐름

```
관리자 → DELETE /admin/tenants/:tenantId/users/:id
  → TenantAdminGuard 통과
  → UsersService.delete()
    → findOne() (없으면 404)
    → transaction:
        DELETE consents (userId = :id)
        DELETE access_tokens (userId = :id)
        DELETE refresh_tokens (userId = :id)
        DELETE authorization_codes (userId = :id)
        remove(User) → cascade: UserProfile, UserRole
    → auditService.record(USER_DELETED)
  → 204 No Content
```
