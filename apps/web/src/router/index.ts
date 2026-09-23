import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: () => {
        const auth = useAuthStore()
        return auth.isAuthenticated ? '/admin' : '/admin/login'
      },
    },
    // ── OAuth 로그인 페이지 (end-user) ────────────────
    {
      path: '/login',
      name: 'oauth-login',
      component: () => import('@/views/oauth/OAuthLoginView.vue'),
      meta: { layout: 'auth', public: true },
    },
    {
      path: '/register',
      name: 'oauth-register',
      component: () => import('@/views/oauth/OAuthRegisterView.vue'),
      meta: { layout: 'auth', public: true },
    },
    {
      path: '/profile',
      name: 'oauth-profile',
      component: () => import('@/views/oauth/OAuthProfileView.vue'),
      meta: { layout: 'auth', public: true },
    },
    {
      path: '/verify-email',
      name: 'oauth-verify-email',
      component: () => import('@/views/oauth/VerifyEmailView.vue'),
      meta: { layout: 'auth', public: true },
    },
    {
      path: '/forgot-password',
      name: 'oauth-forgot-password',
      component: () => import('@/views/oauth/ForgotPasswordView.vue'),
      meta: { layout: 'auth', public: true },
    },
    {
      path: '/reset-password',
      name: 'oauth-reset-password',
      component: () => import('@/views/oauth/ResetPasswordView.vue'),
      meta: { layout: 'auth', public: true },
    },
    // ── 인증 ──────────────────────────────────────────
    {
      path: '/admin/login',
      name: 'login',
      component: () => import('@/views/auth/LoginView.vue'),
      meta: { layout: 'auth', public: true },
    },
    {
      path: '/admin/bootstrap',
      name: 'bootstrap',
      component: () => import('@/views/auth/BootstrapView.vue'),
      meta: { layout: 'auth', public: true },
    },
    {
      path: '/admin/select-tenant',
      name: 'tenant-select',
      component: () => import('@/views/auth/TenantSelectView.vue'),
      meta: { layout: 'auth', requiresAuth: true },
    },
    // ── Platform Admin ────────────────────────────────
    {
      path: '/admin',
      redirect: '/admin/tenants',
      meta: { requiresAuth: true, requiresPlatformAdmin: true },
    },
    {
      path: '/admin/tenants',
      name: 'tenant-list',
      component: () => import('@/views/platform/tenants/TenantListView.vue'),
      meta: { requiresAuth: true, requiresPlatformAdmin: true },
    },
    {
      path: '/admin/tenants/new',
      name: 'tenant-create',
      component: () => import('@/views/platform/tenants/TenantCreateView.vue'),
      meta: { requiresAuth: true, requiresPlatformAdmin: true },
    },
    {
      path: '/admin/tenants/:id',
      name: 'tenant-detail',
      component: () => import('@/views/platform/tenants/TenantDetailView.vue'),
      meta: { requiresAuth: true, requiresPlatformAdmin: true },
    },
    {
      path: '/admin/admins',
      name: 'admin-list',
      component: () => import('@/views/platform/admins/AdminListView.vue'),
      meta: { requiresAuth: true, requiresPlatformAdmin: true },
    },
    {
      path: '/admin/admins/new',
      name: 'admin-create',
      component: () => import('@/views/platform/admins/AdminCreateView.vue'),
      meta: { requiresAuth: true, requiresPlatformAdmin: true },
    },
    // ── Tenant Admin ──────────────────────────────────
    {
      path: '/admin/tenants/:tenantId/dashboard',
      name: 'tenant-dashboard',
      component: () => import('@/views/tenant/DashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/settings',
      name: 'tenant-settings',
      component: () => import('@/views/platform/tenants/TenantDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/clients',
      name: 'client-list',
      component: () => import('@/views/tenant/clients/ClientListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/clients/new',
      name: 'client-create',
      component: () => import('@/views/tenant/clients/ClientCreateView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/clients/:clientId',
      name: 'client-detail',
      component: () => import('@/views/tenant/clients/ClientDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/users',
      name: 'user-list',
      component: () => import('@/views/tenant/users/UserListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/users/new',
      name: 'user-create',
      component: () => import('@/views/tenant/users/UserCreateView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/users/:userId',
      name: 'user-detail',
      component: () => import('@/views/tenant/users/UserDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/users/:userId/edit',
      name: 'user-edit',
      component: () => import('@/views/tenant/users/UserEditView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/roles',
      name: 'role-list',
      component: () => import('@/views/tenant/rbac/RoleListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/permissions',
      name: 'permission-list',
      component: () => import('@/views/tenant/rbac/PermissionListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/schemas',
      name: 'schema-list',
      component: () => import('@/views/tenant/schemas/SchemaListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/schemas/new',
      name: 'schema-publish',
      component: () => import('@/views/tenant/schemas/SchemaPublishView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/scopes',
      name: 'scope-list',
      component: () => import('@/views/tenant/scopes/ScopeListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/audit',
      name: 'audit-log',
      component: () => import('@/views/tenant/audit/AuditLogView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/external-auth',
      name: 'external-auth-list',
      component: () => import('@/views/tenant/external-auth/ExternalAuthListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/external-auth/new',
      name: 'external-auth-create',
      component: () => import('@/views/tenant/external-auth/ExternalAuthFormView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tenants/:tenantId/external-auth/:id',
      name: 'external-auth-detail',
      component: () => import('@/views/tenant/external-auth/ExternalAuthFormView.vue'),
      meta: { requiresAuth: true },
    },
    // ── 403 ──────────────────────────────────────────
    {
      path: '/403',
      name: 'forbidden',
      component: () => import('@/views/ForbiddenView.vue'),
      meta: { layout: 'auth', public: true },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: () => {
        const auth = useAuthStore()
        return auth.isAuthenticated ? '/admin' : '/admin/login'
      },
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const auth = useAuthStore()

  if (to.meta.public) return next()

  if (!auth.isAuthenticated) return next({ name: 'login' })

  if (to.meta.requiresPlatformAdmin && !auth.isPlatformAdmin) {
    return next({ name: 'forbidden' })
  }

  // 경로가 특정 테넌트를 가리키면 그 테넌트의 관리자인지 확인한다.
  // 라우트 meta 플래그가 아니라 tenantId 파라미터의 존재 자체를 신호로 삼아,
  // 테넌트 범위 라우트를 추가할 때 플래그를 빠뜨려 구멍이 생기지 않게 한다.
  //
  // 이것은 UX 장치이지 보안 경계가 아니다. 실제 차단은 서버의 TenantAdminGuard 가
  // 하며, 여기서는 권한 없음을 알리고 실패할 것이 뻔한 요청을 막는 역할만 한다.
  const targetTenantId = to.params.tenantId
  if (typeof targetTenantId === 'string' && !auth.isPlatformAdmin) {
    if (!auth.tenantIds.includes(targetTenantId)) return next({ name: 'forbidden' })
  }

  next()
})

export default router
