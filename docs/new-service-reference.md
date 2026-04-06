# 새 서비스 개발 참고 문서

이 문서는 Authori 프로젝트와 **동일한 기술 아키텍처 · 디자인 시스템 · 멀티테넌트 컨셉**을 가진 새 서비스를 개발할 때 참고하는 설계 가이드다.

---

## 목차

1. [기술 스택 요약](#1-기술-스택-요약)
2. [프로젝트 초기 구조](#2-프로젝트-초기-구조)
3. [멀티테넌시 패턴](#3-멀티테넌시-패턴)
4. [백엔드 아키텍처 (NestJS)](#4-백엔드-아키텍처-nestjs)
5. [프론트엔드 아키텍처 (Vue 3)](#5-프론트엔드-아키텍처-vue-3)
6. [관리자 인증 패턴](#6-관리자-인증-패턴)
7. [감사 로그 패턴](#7-감사-로그-패턴)
8. [공통 UI 컴포넌트 / 디자인 시스템](#8-공통-ui-컴포넌트--디자인-시스템)
9. [환경변수 규격](#9-환경변수-규격)
10. [인프라 / Docker](#10-인프라--docker)
11. [개발 워크플로](#11-개발-워크플로)
12. [Authori 연동 — OAuth 클라이언트 등록](#12-authori-연동--oauth-클라이언트-등록)
13. [Access Token JWT 클레임 구조](#13-access-token-jwt-클레임-구조)

---

## 1. 기술 스택 요약

| 계층 | 기술 | 버전 |
|---|---|---|
| 백엔드 프레임워크 | NestJS | ^11 |
| ORM | TypeORM | ^0.3 |
| DB | PostgreSQL | 16 |
| 런타임 | Bun (개발/빌드) | latest |
| 백엔드 언어 | TypeScript | ~5.7 |
| 프론트엔드 프레임워크 | Vue 3 (`<script setup>`) | ^3.5 |
| 상태관리 | Pinia | ^3 |
| 라우팅 | Vue Router | 4 |
| HTTP 클라이언트 | axios | ^1 |
| 폼 검증 | vee-validate + zod | ^4 |
| 스타일링 | Tailwind CSS | v4 (Vite 플러그인) |
| 아이콘 | lucide-vue-next | ^1 |
| 빌드 도구 | Vite | ^8 |
| 인증 방식 | JWT (HS256, admin) | - |
| 패스워드 해시 | bcrypt | rounds=12 |

---

## 2. 프로젝트 초기 구조

### 2-1. 디렉터리 레이아웃

```
<service-root>/
├── backend/          # NestJS 백엔드
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── main.ts
│   │   ├── admin/          # 관리자 인증·가드
│   │   ├── common/         # 공통 유틸리티
│   │   │   ├── audit/
│   │   │   ├── config/
│   │   │   ├── crypto/
│   │   │   ├── security/
│   │   │   └── tenant/
│   │   ├── database/
│   │   │   ├── entities/
│   │   │   ├── migrations/
│   │   │   ├── data-source.ts
│   │   │   └── database.module.ts
│   │   └── <domain>/       # 도메인별 모듈 (e.g. users/, items/)
│   │       ├── dto/
│   │       ├── <domain>.controller.ts
│   │       ├── <domain>.service.ts
│   │       └── <domain>.module.ts
│   ├── .env.example
│   ├── nest-cli.json
│   └── package.json
├── frontend/         # Vue 3 프론트엔드
│   ├── src/
│   │   ├── api/            # axios 기반 API 모듈
│   │   ├── assets/
│   │   ├── components/
│   │   │   └── shared/     # 공용 UI 컴포넌트
│   │   ├── layouts/        # AdminLayout, AuthLayout
│   │   ├── router/
│   │   ├── stores/         # Pinia 스토어
│   │   ├── views/
│   │   │   ├── auth/       # 로그인, 부트스트랩
│   │   │   ├── platform/   # Platform Admin 전용
│   │   │   └── tenant/     # Tenant Admin
│   │   ├── App.vue
│   │   └── main.ts
│   ├── index.html
│   └── package.json
└── docker-compose.yml
```

### 2-2. 백엔드 `package.json` 핵심 의존성

```json
{
  "dependencies": {
    "@nestjs/common": "^11",
    "@nestjs/config": "^4",
    "@nestjs/core": "^11",
    "@nestjs/jwt": "^11",
    "@nestjs/platform-express": "^11",
    "@nestjs/swagger": "^11",
    "@nestjs/throttler": "^6",
    "@nestjs/typeorm": "^11",
    "bcrypt": "^6",
    "class-transformer": "^0.5",
    "class-validator": "^0.15",
    "pg": "^8",
    "reflect-metadata": "^0.2",
    "rxjs": "^7",
    "typeorm": "^0.3",
    "uuid": "^13"
  }
}
```

### 2-3. 프론트엔드 `package.json` 핵심 의존성

```json
{
  "dependencies": {
    "@vee-validate/zod": "^4",
    "axios": "^1",
    "lucide-vue-next": "^1",
    "pinia": "^3",
    "vee-validate": "^4",
    "vue": "^3.5",
    "vue-router": "4",
    "zod": "^4"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4",
    "@vitejs/plugin-vue": "^6",
    "tailwindcss": "^4",
    "typescript": "~5.9",
    "vite": "^8",
    "vue-tsc": "^3"
  }
}
```

---

## 3. 멀티테넌시 패턴

### 3-1. 컨셉

- **단일 DB 스키마** + 모든 테넌트 데이터 테이블에 `tenant_id` UUID 컬럼으로 **논리 격리**
- 테넌트별 경계는 1급 제약조건: 모든 쿼리에 `tenantId` 조건 필수
- 테넌트 상태: `ACTIVE` / `INACTIVE` / `SUSPENDED`

### 3-2. URL 경로 규칙

```
# 테넌트 리소스 (테넌트별 엔드유저 접근)
/t/:tenantSlug/*

# 관리자 API (플랫폼 전체)
/admin/tenants
/admin/tenants/:tenantId/*

# 테넌트 관리자 API
/admin/tenants/:tenantId/users
/admin/tenants/:tenantId/<domain>
```

### 3-3. `TenantMiddleware`

`/t/:tenantSlug/*` 경로에 적용. slug → tenantId resolve 후 `req.tenantContext`에 주입.

```typescript
// backend/src/common/tenant/tenant.middleware.ts 패턴

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const slug = this.extractSlugFromPath(req.path);
    if (!slug) return next();

    const tenant = await this.tenantRepo.findOne({ where: { slug } });
    if (!tenant) throw new NotFoundException(`Tenant '${slug}' not found`);
    if (tenant.status !== TenantStatus.ACTIVE)
      throw new NotFoundException(`Tenant '${slug}' is not active`);

    req.tenantContext = { tenantId: tenant.id, tenantSlug: slug };
    next();
  }

  private extractSlugFromPath(path: string): string | null {
    const match = /^\/t\/([^/]+)/.exec(path);
    return match ? match[1] : null;
  }
}
```

`AppModule`에 미들웨어 등록:

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: '/t/:tenantSlug/*path', method: RequestMethod.ALL });
  }
}
```

### 3-4. 핵심 엔티티: `Tenant`

```typescript
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) slug: string;   // URL 식별자
  @Column() name: string;
  @Column({ type: 'varchar', nullable: true }) issuer: string | null;
  @Column({ type: 'enum', enum: TenantStatus, default: TenantStatus.ACTIVE })
  status: TenantStatus;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;

  // 1:1 설정, 1:N 리소스 관계 추가
  @OneToOne(() => TenantSettings, (s) => s.tenant, { cascade: true })
  settings: TenantSettings;
}
```

### 3-5. 테넌트 리소스 엔티티 패턴

모든 테넌트 리소스 엔티티는 `tenantId` 컬럼 + 복합 유니크 인덱스를 가진다:

```typescript
@Entity('items')
@Index(['tenantId', 'code'], { unique: true })  // 테넌트 내 유일성 보장
export class Item {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // 도메인 필드들...

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
```

---

## 4. 백엔드 아키텍처 (NestJS)

### 4-1. `main.ts` 기본 설정

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS 설정 (환경변수 CORS_ORIGINS 쉼표 구분)
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // ValidationPipe 전역 적용 (whitelist + transform 필수)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger (비프로덕션)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('<Service Name>')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, DocumentBuilder.createDocument(app, config));
  }

  await app.listen(process.env.PORT ?? 3000);
}
```

### 4-2. 모듈 구조 패턴

각 도메인은 `module / controller / service / dto/` 4개 요소로 구성한다.

```
src/<domain>/
├── dto/
│   ├── create-<domain>.dto.ts
│   └── update-<domain>.dto.ts
├── <domain>.controller.ts
├── <domain>.module.ts
└── <domain>.service.ts
```

**Module 예시:**

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([Item, /* 관련 엔티티 */])],
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}
```

### 4-3. Controller 패턴

- Route 파라미터, Guard 적용, AuditContext 구성만 담당
- 비즈니스 로직은 Service에 위임

```typescript
@ApiTags('Admin / Items')
@ApiBearerAuth()
@UseGuards(TenantAdminGuard)
@Controller('admin/tenants/:tenantId/items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @ApiOperation({ summary: '아이템 생성' })
  create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateItemDto,
    @Req() req: Request,
  ) {
    return this.itemsService.create(tenantId, dto, {
      actorId: req.admin?.sub ?? null,
      actorType: req.admin ? 'admin' : null,
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId: (req.headers['x-request-id'] as string) ?? null,
    });
  }

  @Get()
  findAll(
    @Param('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.itemsService.findAll(tenantId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search: search || undefined,
    });
  }

  @Get(':id')
  findOne(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.itemsService.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
    @Req() req: Request,
  ) {
    return this.itemsService.update(tenantId, id, dto, { /* ctx */ });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.itemsService.deactivate(tenantId, id, { /* ctx */ });
  }
}
```

### 4-4. Service 패턴

```typescript
export interface ItemListQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface ItemPage {
  items: Item[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async create(tenantId: string, dto: CreateItemDto, ctx?: AuditContext): Promise<Item> {
    // 중복 검사
    const exists = await this.itemRepo.findOne({ where: { tenantId, code: dto.code } });
    if (exists) throw new ConflictException(`Code '${dto.code}' already exists`);

    const item = this.itemRepo.create({ tenantId, ...dto });
    const saved = await this.itemRepo.save(item);

    // 감사 로그는 저장 성공 후
    await this.auditService.record({
      tenantId,
      action: AuditAction.ITEM_CREATED,
      targetType: 'item',
      targetId: saved.id,
      ...ctx,
    });
    return saved;
  }

  async findAll(tenantId: string, query: ItemListQuery = {}): Promise<ItemPage> {
    const { page = 1, limit: rawLimit = 20, search } = query;
    const limit = Math.min(rawLimit, 100);
    const offset = (page - 1) * limit;

    const qb = this.itemRepo
      .createQueryBuilder('i')
      .where('i.tenantId = :tenantId', { tenantId })  // 엔티티 프로퍼티명 사용
      .orderBy('i.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (search) {
      qb.andWhere('i.name ILIKE :search', { search: `%${search}%` });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(tenantId: string, id: string): Promise<Item> {
    const item = await this.itemRepo.findOne({ where: { tenantId, id } });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  // 여러 엔티티 동시 변경 시 트랜잭션 사용
  async update(tenantId: string, id: string, dto: UpdateItemDto, ctx?: AuditContext): Promise<Item> {
    const item = await this.findOne(tenantId, id);
    Object.assign(item, dto);

    const saved = await this.dataSource.transaction(async (manager) => {
      return manager.save(Item, item);
    });

    await this.auditService.record({
      tenantId,
      action: AuditAction.ITEM_UPDATED,
      targetType: 'item',
      targetId: id,
      ...ctx,
    });
    return saved;
  }
}
```

### 4-5. DTO 패턴

```typescript
// create-item.dto.ts
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItemDto {
  @ApiProperty({ description: '아이템 코드 (테넌트 내 유일)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;

  @ApiProperty({ description: '이름' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: '설명' })
  @IsOptional()
  @IsString()
  description?: string;
}
```

```typescript
// update-item.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateItemDto } from './create-item.dto';

export class UpdateItemDto extends PartialType(CreateItemDto) {}
```

### 4-6. ConfigModule 패턴

```typescript
// src/common/config/app.config.ts
export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  platformAdminSecret: process.env.PLATFORM_ADMIN_SECRET ?? '',
  adminJwtSecret: process.env.JWT_ADMIN_SECRET ?? 'change_me',
  adminJwtExpiry: parseInt(process.env.JWT_ADMIN_EXPIRY ?? '86400', 10),
  corsOrigins: /* 환경변수 파싱 */,
}));

export const dbConfig = registerAs('db', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'app',
  password: process.env.DB_PASSWORD ?? '',
  name: process.env.DB_NAME ?? 'app_db',
}));
```

### 4-7. Rate Limiting

```typescript
// AppModule imports
ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])
```

### 4-8. Request ID 미들웨어

```typescript
// src/common/security/request-id.middleware.ts
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = (req.headers['x-request-id'] as string) ?? crypto.randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
```

### 4-9. 암호화 유틸리티 (`CryptoUtil`)

```typescript
// src/common/crypto/crypto.util.ts
export class CryptoUtil {
  static generateToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }
  static async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12);
  }
  static async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
  static sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
  static generateUuid(): string {
    return crypto.randomUUID();
  }
}
```

### 4-10. DB 마이그레이션

TypeORM CLI를 사용한 코드-first 마이그레이션:

```bash
# 마이그레이션 파일 생성
bun run migration:generate -- src/database/migrations/AddItemTable

# 마이그레이션 실행
bun run migration:run

# 롤백
bun run migration:revert
```

`package.json` 스크립트:

```json
{
  "migration:generate": "NODE_OPTIONS='--dns-result-order=ipv4first' typeorm-ts-node-commonjs migration:generate -d src/database/data-source.ts",
  "migration:run": "NODE_OPTIONS='--dns-result-order=ipv4first' typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts",
  "migration:revert": "NODE_OPTIONS='--dns-result-order=ipv4first' typeorm-ts-node-commonjs migration:revert -d src/database/data-source.ts"
}
```

`data-source.ts`에 모든 엔티티를 등록해야 CLI가 감지한다:

```typescript
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'app',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'app_db',
  entities: [Tenant, TenantSettings, AdminUser, AuditLog, Item, /* ... */],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,  // 반드시 false (운영 환경 사고 방지)
});
```

---

## 5. 프론트엔드 아키텍처 (Vue 3)

### 5-1. `main.ts` 기본 설정

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
```

### 5-2. `App.vue` 레이아웃 분기

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AdminLayout from '@/layouts/AdminLayout.vue'
import AuthLayout from '@/layouts/AuthLayout.vue'

const route = useRoute()
const layout = computed(() => route.meta.layout === 'auth' ? 'auth' : 'admin')
</script>

<template>
  <AuthLayout v-if="layout === 'auth'">
    <RouterView />
  </AuthLayout>
  <AdminLayout v-else>
    <RouterView />
  </AdminLayout>
</template>
```

### 5-3. 레이아웃

**AdminLayout** — 사이드바 + 헤더 + 메인 컨텐츠 영역:

```
┌──────────┬────────────────────────────────────────┐
│          │  AppHeader (이메일, 사이드바 토글)       │
│ AppSide  ├────────────────────────────────────────┤
│ bar      │                                        │
│ (w-64)   │  <slot /> (main content)               │
│          │                                        │
└──────────┴────────────────────────────────────────┘
```

```vue
<!-- layouts/AdminLayout.vue -->
<template>
  <div class="min-h-screen bg-gray-50 flex">
    <AppSidebar :is-open="ui.sidebarOpen" :is-platform-admin="auth.isPlatformAdmin" :tenant-id="tenantId" />
    <div class="flex-1 flex flex-col min-w-0 transition-all duration-200"
         :class="ui.sidebarOpen ? 'ml-64' : 'ml-0'">
      <AppHeader :email="auth.email ?? ''" @toggle-sidebar="ui.toggleSidebar" />
      <main class="flex-1 p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
```

**AuthLayout** — 중앙 카드 형태:

```vue
<!-- layouts/AuthLayout.vue -->
<template>
  <div class="min-h-screen flex items-center justify-center p-4 bg-gray-50">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-gray-900">서비스명</h1>
        <p class="text-sm text-gray-500 mt-1">부제목</p>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <slot />
      </div>
    </div>
  </div>
</template>
```

### 5-4. 라우터 패턴

```typescript
// src/router/index.ts
const router = createRouter({
  history: createWebHistory(),
  routes: [
    // 공개 라우트 (인증 불필요)
    {
      path: '/admin/login',
      name: 'login',
      component: () => import('@/views/auth/LoginView.vue'),
      meta: { layout: 'auth', public: true },
    },
    // Platform Admin 전용
    {
      path: '/admin/tenants',
      name: 'tenant-list',
      component: () => import('@/views/platform/tenants/TenantListView.vue'),
      meta: { requiresAuth: true, requiresPlatformAdmin: true },
    },
    // Tenant 레벨 (Platform Admin 또는 해당 Tenant Admin)
    {
      path: '/admin/tenants/:tenantId/items',
      name: 'item-list',
      component: () => import('@/views/tenant/items/ItemListView.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

// 전역 네비게이션 가드
router.beforeEach((to, _from, next) => {
  const auth = useAuthStore()
  if (to.meta.public) return next()
  if (!auth.isAuthenticated) return next({ name: 'login' })
  if (to.meta.requiresPlatformAdmin && !auth.isPlatformAdmin)
    return next({ name: 'forbidden' })
  next()
})
```

**Route meta 필드:**

| meta 키 | 설명 |
|---|---|
| `public: true` | 인증 없이 접근 가능 |
| `layout: 'auth'` | AuthLayout 사용 (기본: AdminLayout) |
| `requiresAuth: true` | 로그인 필요 |
| `requiresPlatformAdmin: true` | PLATFORM_ADMIN 역할 필요 |

### 5-5. 공통 axios 인스턴스

```typescript
// src/api/http.ts
const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
})

// 요청 인터셉터: 토큰 자동 첨부
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 응답 인터셉터: 401 → 자동 로그아웃
http.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore().logout()
    }
    return Promise.reject(error)
  },
)

export default http
```

> **주의**: 관리자 세션과 분리된 엔드포인트(예: 일반 사용자용 API)는 별도 `axios.create()` 인스턴스를 사용한다. 공통 인스턴스의 401 인터셉터가 관리자 로그아웃을 유발하지 않도록 한다.

### 5-6. API 모듈 패턴

```typescript
// src/api/items.ts
import http from './http'

export interface Item {
  id: string
  tenantId: string
  code: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateItemPayload {
  code: string
  name: string
  description?: string
}

export interface UpdateItemPayload {
  name?: string
  description?: string | null
}

export interface ItemListQuery {
  page?: number
  limit?: number
  search?: string
}

export interface ItemPage {
  items: Item[]
  total: number
  page: number
  limit: number
}

export const itemsApi = {
  findAll(tenantId: string, query?: ItemListQuery) {
    return http.get<ItemPage>(`/admin/tenants/${tenantId}/items`, { params: query })
  },
  findOne(tenantId: string, itemId: string) {
    return http.get<Item>(`/admin/tenants/${tenantId}/items/${itemId}`)
  },
  create(tenantId: string, payload: CreateItemPayload) {
    return http.post<Item>(`/admin/tenants/${tenantId}/items`, payload)
  },
  update(tenantId: string, itemId: string, payload: UpdateItemPayload) {
    return http.patch<Item>(`/admin/tenants/${tenantId}/items/${itemId}`, payload)
  },
  deactivate(tenantId: string, itemId: string) {
    return http.delete(`/admin/tenants/${tenantId}/items/${itemId}`)
  },
  activate(tenantId: string, itemId: string) {
    return http.post(`/admin/tenants/${tenantId}/items/${itemId}/activate`)
  },
}
```

### 5-7. Pinia 스토어 패턴

```typescript
// src/stores/auth.store.ts
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('admin_token'))
  const payload = ref<JwtPayload | null>(token.value ? parseJwt(token.value) : null)

  const isAuthenticated = computed(() => !!token.value)
  const isPlatformAdmin = computed(() => payload.value?.role === 'PLATFORM_ADMIN')
  const tenantId = computed(() => payload.value?.tenantId ?? null)

  async function login(email: string, password: string) {
    const { data } = await authApi.login({ email, password })
    token.value = data.access_token
    payload.value = parseJwt(data.access_token)
    localStorage.setItem('admin_token', data.access_token)
    // 역할별 리다이렉트
  }

  function logout() {
    token.value = null
    payload.value = null
    localStorage.removeItem('admin_token')
    router.push('/admin/login')
  }

  return { token, isAuthenticated, isPlatformAdmin, tenantId, login, logout }
})
```

---

## 6. 관리자 인증 패턴

### 6-1. AdminUser 엔티티

```typescript
export enum AdminRole {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  TENANT_ADMIN = 'TENANT_ADMIN',
}

@Entity('admin_users')
export class AdminUser {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) email: string;
  @Column({ type: 'varchar', nullable: true }) name: string | null;
  @Column({ name: 'password_hash' }) passwordHash: string;
  @Column({ type: 'enum', enum: AdminRole }) role: AdminRole;
  /** TENANT_ADMIN인 경우 접근 가능한 tenantId */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true }) tenantId: string | null;
}
```

### 6-2. JWT 페이로드 구조

```typescript
export interface AdminJwtPayload {
  sub: string;       // AdminUser.id
  email: string;
  role: AdminRole;
  tenantId: string | null;
  type: 'admin';     // 타입 검증용 클레임
}
```

### 6-3. 가드 계층

```
AdminJwtGuard          → JWT 서명 검증 + type:'admin' 확인 → req.admin 주입
  └── PlatformAdminGuard  → role === PLATFORM_ADMIN 검사
  └── TenantAdminGuard    → role === PLATFORM_ADMIN 또는
                            (TENANT_ADMIN && tenantId === :tenantId 파라미터)
```

**AdminJwtGuard:**

```typescript
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Admin token required');
    }
    const token = authHeader.slice(7);
    try {
      const payload = this.jwtService.verify<AdminJwtPayload>(token);
      if (payload.type !== 'admin') throw new Error();
      request.admin = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired admin token');
    }
  }
}
```

**TenantAdminGuard:**

```typescript
@Injectable()
export class TenantAdminGuard implements CanActivate {
  constructor(private readonly jwtGuard: AdminJwtGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.jwtGuard.canActivate(context);
    const req = context.switchToHttp().getRequest<Request>();
    const admin = req.admin!;
    if (admin.role === AdminRole.PLATFORM_ADMIN) return true;
    if (admin.role === AdminRole.TENANT_ADMIN) {
      const paramTenantId = req.params['tenantId'];
      if (admin.tenantId && admin.tenantId === paramTenantId) return true;
    }
    throw new UnauthorizedException('Tenant admin access required');
  }
}
```

### 6-4. Bootstrap 플로우

최초 서비스 초기화 시 Platform Admin 계정 생성:

1. `POST /admin/bootstrap` — `PLATFORM_ADMIN_SECRET` 환경변수 확인 후 최초 관리자 생성
2. 이후 Platform Admin이 Tenant Admin 계정을 생성

### 6-5. 로그인 API

```
POST /admin/auth/login
Body: { email, password }
Response: { access_token: string }
```

프론트엔드에서 `localStorage.setItem('admin_token', token)`으로 저장.

---

## 7. 감사 로그 패턴

### 7-1. AuditLog 엔티티

```typescript
@Entity('audit_logs')
@Index(['tenantId', 'createdAt'])
@Index(['actorId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true }) tenantId: string | null;
  @Column({ name: 'actor_id', type: 'varchar', nullable: true }) actorId: string | null;
  @Column({ name: 'actor_type', type: 'varchar', nullable: true }) actorType: string | null;
  @Column({ type: 'enum', enum: AuditAction }) action: AuditAction;
  @Column({ name: 'target_type', type: 'varchar', nullable: true }) targetType: string | null;
  @Column({ name: 'target_id', type: 'varchar', nullable: true }) targetId: string | null;
  @Column({ default: true }) success: boolean;
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, unknown> | null;
  @Column({ name: 'ip_address', type: 'varchar', nullable: true }) ipAddress: string | null;
  @Column({ name: 'user_agent', type: 'varchar', nullable: true }) userAgent: string | null;
  @Column({ name: 'request_id', type: 'varchar', nullable: true }) requestId: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
```

### 7-2. AuditAction 열거형

서비스 도메인에 맞게 확장:

```typescript
export enum AuditAction {
  // 인증
  LOGIN_SUCCESS = 'LOGIN.SUCCESS',
  LOGIN_FAILURE = 'LOGIN.FAILURE',
  LOGOUT = 'LOGOUT',
  // 테넌트/관리
  TENANT_CREATED = 'TENANT.CREATED',
  TENANT_UPDATED = 'TENANT.UPDATED',
  // 도메인별 이벤트 추가
  ITEM_CREATED = 'ITEM.CREATED',
  ITEM_UPDATED = 'ITEM.UPDATED',
  ITEM_DEACTIVATED = 'ITEM.DEACTIVATED',
}
```

### 7-3. AuditService 사용 패턴

```typescript
// Controller에서 AuditContext 구성
const ctx: AuditContext = {
  actorId: req.admin?.sub ?? null,
  actorType: req.admin ? 'admin' : null,
  ipAddress: req.ip ?? null,
  userAgent: (req.headers['user-agent'] as string) ?? null,
  requestId: (req.headers['x-request-id'] as string) ?? null,
};

// Service에서 기록 (트랜잭션 커밋 후)
await this.auditService.record({
  tenantId,
  action: AuditAction.ITEM_CREATED,
  targetType: 'item',
  targetId: saved.id,
  metadata: { name: saved.name },
  ...ctx,
});
```

> **규칙**: `auditService.record()`는 항상 트랜잭션 바깥(커밋 이후)에서 호출한다. 감사 로그 실패가 비즈니스 로직을 중단시키지 않도록 `AuditService` 내부에서 에러를 catch한다.

---

## 8. 공통 UI 컴포넌트 / 디자인 시스템

### 8-1. Tailwind CSS v4 설정

`vite.config.ts`:

```typescript
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
})
```

`src/style.css`:

```css
@import 'tailwindcss';
```

### 8-2. 디자인 토큰 (기준 색상)

| 역할 | 클래스 | 색상 |
|---|---|---|
| 주요 액션 버튼 | `bg-indigo-600 hover:bg-indigo-700` | Indigo |
| 활성 사이드바 링크 | `bg-indigo-50 text-indigo-700` | Indigo |
| 위험 액션 | `bg-red-600 hover:bg-red-700` | Red |
| 보조 텍스트 | `text-gray-500` | Gray |
| 배경 | `bg-gray-50` | Light Gray |
| 카드/패널 | `bg-white rounded-xl border border-gray-200` | White |
| 구분선 | `border-gray-200` | Gray |

### 8-3. 공용 컴포넌트 목록

| 컴포넌트 | 경로 | 용도 |
|---|---|---|
| `AppHeader` | `components/shared/AppHeader.vue` | 상단 헤더 (이메일 표시, 사이드바 토글) |
| `AppSidebar` | `components/shared/AppSidebar.vue` | 좌측 네비게이션 |
| `PageHeader` | `components/shared/PageHeader.vue` | 페이지 제목 + 액션 버튼 영역 |
| `StatusBadge` | `components/shared/StatusBadge.vue` | 상태 표시 뱃지 (ACTIVE/INACTIVE/etc) |
| `ConfirmDialog` | `components/shared/ConfirmDialog.vue` | 확인 다이얼로그 (삭제/비활성화 등) |
| `CopyableField` | `components/shared/CopyableField.vue` | 클립보드 복사 필드 |

**PageHeader 사용 예:**

```vue
<PageHeader title="아이템 관리" description="테넌트 아이템을 관리합니다.">
  <template #actions>
    <RouterLink
      :to="{ name: 'item-create', params: { tenantId } }"
      class="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
    >
      <Plus class="w-4 h-4" />
      아이템 생성
    </RouterLink>
  </template>
</PageHeader>
```

**ConfirmDialog 사용 예:**

```vue
<ConfirmDialog
  :open="!!deleteTarget"
  title="아이템 삭제"
  :message="`'${deleteTarget?.name}' 아이템을 삭제하시겠습니까?`"
  confirm-label="삭제"
  danger
  @confirm="confirmDelete"
  @cancel="deleteTarget = null"
/>
```

### 8-4. 목록 화면 표준 구조

목록 화면의 전체 UI 패턴 (상세 규칙은 `docs/guidelines-list-view.md` 참조):

```
┌──────────────────────────────────────────────────────────┐
│  PageHeader (제목 + 생성 버튼)                             │
├──────────────────────────────────────────────────────────┤
│  [검색 input]  [상태 select]  [🔄 새로고침]                │
├──────────────────────────────────────────────────────────┤
│  bg-white rounded-xl border                               │
│  ├── overflow-x-auto                                      │
│  │   └── table (min-w-[640px~800px])                      │
│  │       ├── thead (bg-gray-50)                           │
│  │       └── tbody (:class="{ 'opacity-50': loading }")   │
│  └── pagination (grid-cols-3, bg-gray-50 border-t)        │
│      총 N건 | 이전/번호/다음 | 20/50/100건씩               │
└──────────────────────────────────────────────────────────┘
```

### 8-5. 버튼 스타일 기준

```html
<!-- Primary -->
<button class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
  생성
</button>

<!-- Secondary / Outline -->
<button class="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
  취소
</button>

<!-- Danger -->
<button class="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
  삭제
</button>

<!-- Icon-only -->
<button class="p-2 rounded-lg border border-gray-300 bg-white text-gray-500 hover:bg-gray-50">
  <RefreshCw class="w-4 h-4" />
</button>
```

### 8-6. 폼 입력 스타일 기준

```html
<!-- 텍스트 입력 -->
<input
  type="text"
  class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
         placeholder-gray-400 focus:outline-none focus:ring-1
         focus:ring-indigo-500 focus:border-indigo-500"
/>

<!-- Select -->
<select
  class="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
         focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
>
</select>

<!-- Label -->
<label class="block text-sm font-medium text-gray-700 mb-1">필드명</label>

<!-- Error 메시지 -->
<p class="mt-1 text-xs text-red-600">오류 메시지</p>
```

### 8-7. 사이드바 네비게이션 추가

새 도메인 메뉴를 `AppSidebar.vue`의 `tenantLinks`에 추가:

```typescript
import { Box } from 'lucide-vue-next'  // lucide-vue-next 아이콘 사용

const tenantLinks = computed(() => {
  if (!props.tenantId) return []
  return [
    { name: 'tenant-dashboard', label: '대시보드', icon: LayoutDashboard, params: { tenantId: props.tenantId } },
    // 새 메뉴 추가
    { name: 'item-list', label: '아이템', icon: Box, params: { tenantId: props.tenantId } },
  ]
})
```

---

## 9. 환경변수 규격

### 9-1. 백엔드 `.env.example`

```env
# Application
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=app
DB_PASSWORD=app_password
DB_NAME=app_db

# Admin JWT
PLATFORM_ADMIN_SECRET=change_me_in_production
JWT_ADMIN_SECRET=change_me_admin_secret
JWT_ADMIN_EXPIRY=86400

# CORS (쉼표로 여러 origin 구분)
CORS_ORIGINS=http://localhost:5173
```

### 9-2. 프론트엔드 `.env.example`

```env
VITE_API_BASE_URL=http://localhost:3000
```

---

## 10. 인프라 / Docker

### 10-1. `docker-compose.yml` 기본 템플릿

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app_password
      POSTGRES_DB: app_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app_db"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USERNAME: app
      DB_PASSWORD: app_password
      DB_NAME: app_db
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./backend:/app
      - /app/node_modules

volumes:
  postgres_data:
```

### 10-2. 백엔드 Dockerfile 패턴

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main"]
```

---

## 11. 개발 워크플로

### 11-1. 새 도메인 추가 체크리스트

**백엔드:**

- [ ] `src/database/entities/<domain>.entity.ts` — 엔티티 정의 (`tenantId` 필수)
- [ ] `src/database/entities/index.ts` — export 추가
- [ ] `src/database/data-source.ts` — AppDataSource 엔티티 목록에 추가
- [ ] `bun run migration:generate -- src/database/migrations/Add<Domain>` — 마이그레이션 생성
- [ ] `src/<domain>/dto/create-<domain>.dto.ts` — 생성 DTO
- [ ] `src/<domain>/dto/update-<domain>.dto.ts` — 수정 DTO
- [ ] `src/<domain>/<domain>.service.ts` — 서비스 (CRUD + tenantId 필터 + audit)
- [ ] `src/<domain>/<domain>.controller.ts` — 컨트롤러 (적절한 Guard 적용)
- [ ] `src/<domain>/<domain>.module.ts` — 모듈
- [ ] `src/app.module.ts` — AppModule imports에 추가
- [ ] `src/common/audit/audit-log.entity.ts` — AuditAction 열거형 확장

**프론트엔드:**

- [ ] `src/api/<domain>.ts` — API 모듈 (타입 + 함수)
- [ ] `src/views/tenant/<domain>/` — 뷰 파일들
  - [ ] `<Domain>ListView.vue`
  - [ ] `<Domain>CreateView.vue`
  - [ ] `<Domain>DetailView.vue`
  - [ ] `<Domain>EditView.vue` (필요 시)
- [ ] `src/router/index.ts` — 라우트 등록 (meta 포함)
- [ ] `src/components/shared/AppSidebar.vue` — `tenantLinks`에 메뉴 추가

### 11-2. 개발 서버 실행

```bash
# 백엔드
cd backend && bun run start:dev   # port 3000

# 프론트엔드
cd frontend && bun run dev        # port 5173

# DB (Docker)
docker compose up postgres -d
```

### 11-3. 코딩 컨벤션 핵심 요약

상세 규칙은 `docs/conventions.md` 참조.

- Controller는 파싱·가드·ctx 구성만. 비즈니스 로직은 Service.
- 여러 테이블 동시 write → `dataSource.transaction()`
- 감사 로그 → 트랜잭션 커밋 **후** `auditService.record()`
- QueryBuilder 조건: DB 컬럼명(`tenant_id`)이 아닌 **엔티티 프로퍼티명**(`tenantId`)
- `as any` / `@ts-ignore` 사용 금지
- 목록 API: 반드시 `{ items, total, page, limit }` 형태로 반환

### 11-4. 서비스 메서드 이름 규칙

| 패턴 | 용도 |
|---|---|
| `create` | 생성 |
| `findAll` | 목록 조회 (페이지) |
| `findOne` | 단건 조회 |
| `update` | 수정 |
| `activate` / `deactivate` | 상태 전환 |
| `remove` / `revoke` | 삭제/폐기 |
| 도메인 동사 | `publish`, `exchange`, `bootstrap` 등 |

---

---

## 12. Authori 연동 — OAuth 클라이언트 등록

새 서비스가 Authori를 인증 서버로 사용하려면 먼저 Authori 관리자 화면에서 **OAuth 클라이언트**를 등록해야 한다.

> 상세 연동 구현 가이드는 `docs/authori-integration-guide.md` 참조.

### 12-1. 클라이언트 등록 경로

Authori 관리자 화면: `/admin/tenants/:tenantId/clients/new`

### 12-2. 클라이언트 타입 선택 기준

| 서비스 유형 | 클라이언트 타입 | Grant Type | 비고 |
|---|---|---|---|
| Vue/React SPA | `PUBLIC` | `authorization_code` + PKCE | client_secret 없음, code_challenge 필수 |
| 서버사이드 웹앱 (NestJS BFF) | `CONFIDENTIAL` | `authorization_code` | client_secret을 Basic Auth로 전달 |
| 서버 간 M2M | `CONFIDENTIAL` | `client_credentials` | 사용자 없음, client_secret 필수 |

### 12-3. 등록 시 입력 항목

| 항목 | 설명 | 예시 |
|---|---|---|
| 이름 | 클라이언트 식별용 표시 이름 | `My Service Frontend` |
| 타입 | `CONFIDENTIAL` / `PUBLIC` | 위 표 참조 |
| Redirect URIs | 인가 코드를 받을 URI (정확히 일치해야 함) | `https://myservice.com/callback` |
| Allowed Scopes | 요청 가능한 스코프 목록 | `openid profile email` |
| Allowed Grants | 허용할 grant type 목록 | `authorization_code refresh_token` |

### 12-4. 클라이언트 생성 결과

- **clientId**: UUID 형식. 모든 OAuth 요청에 사용. 공개 값.
- **clientSecret**: CONFIDENTIAL 타입만 발급. **최초 생성 시에만 평문 노출**, 이후 재조회 불가. 즉시 안전한 곳에 저장할 것.

### 12-5. 연동에 필요한 Authori 정보

새 서비스의 환경변수에 아래 값을 설정한다:

```env
AUTHORI_BASE_URL=https://auth.example.com   # Authori 서버 주소
AUTHORI_TENANT_SLUG=my-tenant               # 테넌트 슬러그
OAUTH_CLIENT_ID=<등록된 clientId>
OAUTH_CLIENT_SECRET=<등록된 clientSecret>   # CONFIDENTIAL만
```

---

## 13. Access Token JWT 클레임 구조

Authori가 발급하는 access token은 **RS256 서명 JWT**다. 새 서비스 백엔드에서 이 토큰을 직접 검증할 때 페이로드 클레임 구조를 알아야 한다.

### 13-1. 페이로드 클레임

```json
{
  "sub":       "<userId (authorization_code) | clientId (client_credentials)>",
  "tenant_id": "<tenantId UUID>",
  "client_id": "<clientId UUID>",
  "scope":     "openid profile email",
  "jti":       "<UUID, 토큰 고유 ID>",
  "iss":       "https://auth.example.com/t/<tenantSlug>",
  "aud":       "<clientId>",
  "iat":       1700000000,
  "exp":       1700003600
}
```

### 13-2. 클레임 의미

| 클레임 | 타입 | 의미 |
|---|---|---|
| `sub` | string | 사용자 ID (authorization_code) 또는 clientId (client_credentials) |
| `tenant_id` | string (UUID) | 토큰이 속한 테넌트 ID |
| `client_id` | string (UUID) | 토큰을 발급받은 클라이언트 ID |
| `scope` | string | 공백 구분 스코프 목록 |
| `jti` | string (UUID) | JWT 고유 ID. 폐기 여부 확인에 사용 |
| `iss` | string | `<baseUrl>/t/<tenantSlug>` 형식 |
| `aud` | string | clientId와 동일 |
| `iat` | number (Unix) | 발급 시각 |
| `exp` | number (Unix) | 만료 시각 |

### 13-3. TypeScript 타입 정의

```typescript
export interface AuthoriJwtPayload {
  sub: string;         // userId 또는 clientId
  tenant_id: string;
  client_id: string;
  scope: string;
  jti: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}
```

> 새 서비스 백엔드에서 JWT를 검증하고 보호된 리소스에 접근을 통제하는 전체 구현 방법은  
> `docs/authori-integration-guide.md` — **섹션 5. 새 서비스 백엔드 JWT 검증** 참조.

---

## 관련 문서

- `docs/conventions.md` — 전체 코딩 컨벤션
- `docs/guidelines-list-view.md` — 목록 화면 상세 규칙
- `docs/backend-development-artifacts.md` — 백엔드 개발 산출물 템플릿
- `docs/frontend-development-artifacts.md` — 프론트엔드 개발 산출물 템플릿
- `docs/authori-integration-guide.md` — Authori OAuth 연동 상세 구현 가이드
