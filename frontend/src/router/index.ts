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

  next()
})

export default router
