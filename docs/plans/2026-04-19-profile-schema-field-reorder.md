# Profile Schema Field Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로필 스키마 편집기에서 필드 순서를 위/아래 버튼으로 변경할 수 있게 하고, 그 순서가 발행 후에도 보존되도록 한다.

**Architecture:** JSON Schema 루트에 `x-order: string[]` 확장 필드를 추가해 필드 표시 순서를 명시적으로 저장한다. DB/백엔드 변경 없이 프론트엔드에서 `parseJsonSchema()` / `buildJsonSchema()` 유틸을 수정하여 순서를 읽고 쓴다. 두 뷰에서 복사된 유틸 함수를 공용 파일로 추출하여 중복을 제거한다.

**Tech Stack:** Vue 3, TypeScript, lucide-vue-next (ArrowUp/ArrowDown 아이콘 — 이미 설치됨)

---

## 설계 근거

**`x-order` 방식 선택 이유**
- JSON 객체 키는 명세상 순서가 없음 → 명시적 배열로 순서를 저장해야 신뢰할 수 있음
- `x-` 접두사는 JSON Schema 확장 관례 (AJV 기본 설정에서 unknown keyword 허용 → 백엔드 무변경)
- 스키마 루트에 두면 `parseJsonSchema` 한 곳에서만 읽으면 됨

**AJV 호환성 확인**
- `backend/src/profile-schema/profile-schema.service.ts` line 9: `const ajv = new Ajv()` — strict 옵션 없음 → `x-order` 키를 조용히 무시함. **백엔드 수정 불필요.**

---

## File Map

### Frontend — Created
- `frontend/src/utils/schema.ts` — `parseJsonSchema()`, `buildJsonSchema()` 공용 유틸 (x-order 지원)

### Frontend — Modified
- `frontend/src/views/tenant/schemas/SchemaPublishView.vue` — 공용 유틸 import, 위/아래 버튼 UI 추가
- `frontend/src/views/tenant/schemas/SchemaListView.vue` — 공용 유틸 import

---

## Task 1: 공용 스키마 유틸 추출 (`schema.ts`)

**Files:**
- Create: `frontend/src/utils/schema.ts`

현재 `SchemaPublishView.vue`의 `parseJsonSchema` / `buildJsonSchema` 함수를 추출하고, `x-order` 지원을 추가한다.

- [ ] **Step 1: `frontend/src/utils/schema.ts` 파일 작성**

```typescript
// frontend/src/utils/schema.ts

type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'enum'

export interface FieldDef {
  _id: string
  label: string
  key: string
  type: FieldType
  required: boolean
  minLength?: number | null
  maxLength?: number | null
  pattern?: string
  minimum?: number | null
  maximum?: number | null
  enumValues: string
}

export function newField(): FieldDef {
  return {
    _id: Math.random().toString(36).slice(2),
    label: '',
    key: '',
    type: 'string',
    required: false,
    enumValues: '',
  }
}

/**
 * JSON Schema → FieldDef[] 변환.
 * x-order 배열이 있으면 그 순서대로 정렬하고, 없으면 Object.entries 순서를 따른다.
 */
export function parseJsonSchema(schema: Record<string, unknown>): FieldDef[] {
  const props = (schema.properties as Record<string, Record<string, unknown>>) ?? {}
  const req = (schema.required as string[]) ?? []
  const order = (schema['x-order'] as string[]) ?? []

  const entries = Object.entries(props)
  if (order.length > 0) {
    entries.sort(([a], [b]) => {
      const ai = order.indexOf(a)
      const bi = order.indexOf(b)
      const an = ai === -1 ? Infinity : ai
      const bn = bi === -1 ? Infinity : bi
      return an - bn
    })
  }

  return entries.map(([key, def]) => {
    const f = newField()
    f.key = key
    f.label = (def.title as string) ?? key
    f.required = req.includes(key)
    if ('enum' in def) {
      f.type = 'enum'
      f.enumValues = (def.enum as unknown[]).join(', ')
    } else {
      f.type = (def.type as FieldType) ?? 'string'
      if (def.minLength != null) f.minLength = def.minLength as number
      if (def.maxLength != null) f.maxLength = def.maxLength as number
      if (def.pattern) f.pattern = def.pattern as string
      if (def.minimum != null) f.minimum = def.minimum as number
      if (def.maximum != null) f.maximum = def.maximum as number
    }
    return f
  })
}

/**
 * FieldDef[] → JSON Schema 변환.
 * fields 배열 순서를 x-order에 기록한다.
 */
export function buildJsonSchema(fields: FieldDef[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  const order: string[] = []

  for (const f of fields) {
    if (!f.key) continue
    order.push(f.key)
    if (f.type === 'enum') {
      const values = f.enumValues.split(',').map((v) => v.trim()).filter(Boolean)
      const prop: Record<string, unknown> = { enum: values }
      if (f.label) prop.title = f.label
      properties[f.key] = prop
    } else {
      const prop: Record<string, unknown> = { type: f.type }
      if (f.label) prop.title = f.label
      if (f.type === 'string') {
        if (f.minLength != null) prop.minLength = f.minLength
        if (f.maxLength != null) prop.maxLength = f.maxLength
        if (f.pattern) prop.pattern = f.pattern
      }
      if (f.type === 'number' || f.type === 'integer') {
        if (f.minimum != null) prop.minimum = f.minimum
        if (f.maximum != null) prop.maximum = f.maximum
      }
      properties[f.key] = prop
    }
    if (f.required) required.push(f.key)
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    ...(order.length > 0 ? { 'x-order': order } : {}),
  }
}
```

- [ ] **Step 2: 빌드로 타입 오류 없는지 확인**

```bash
cd frontend && bun run build 2>&1 | head -30
```

Expected: `frontend/src/utils/schema.ts`는 아직 import되지 않아 빌드에 영향 없음. 오류 없음.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/schema.ts
git commit -m "feat: add shared schema utils with x-order support"
```

---

## Task 2: SchemaPublishView — 공용 유틸로 교체 및 reorder UI 추가

**Files:**
- Modify: `frontend/src/views/tenant/schemas/SchemaPublishView.vue`

- [ ] **Step 1: script — import 교체 및 로컬 함수 제거**

`<script setup>` 상단의 import 줄을 수정한다.

```typescript
// 추가
import { type FieldDef, newField, parseJsonSchema, buildJsonSchema } from '@/utils/schema'

// 제거 — lucide에서 ChevronDown, ChevronUp 대신 ArrowUp, ArrowDown 추가
import { ArrowUp, ArrowDown, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-vue-next'
```

그리고 `<script setup>` 내의 로컬 `FieldDef` 인터페이스, `newField()`, `parseJsonSchema()`, `buildJsonSchema()` 함수 정의를 전부 삭제한다.

- [ ] **Step 2: script — moveField 함수 추가**

`addField()` 함수 바로 아래에 추가:

```typescript
function moveField(index: number, direction: 'up' | 'down') {
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= fields.value.length) return
  const arr = [...fields.value]
  ;[arr[index], arr[target]] = [arr[target], arr[index]]
  fields.value = arr
}
```

- [ ] **Step 3: template — 헤더 그리드 컬럼 수정**

기존:
```html
<div class="grid grid-cols-[1fr_1fr_110px_52px_28px] gap-2 px-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
  <span>표시명</span>
  <span>키</span>
  <span>타입</span>
  <span class="text-center">필수</span>
  <span></span>
</div>
```

수정 후:
```html
<div class="grid grid-cols-[28px_1fr_1fr_110px_52px_28px] gap-2 px-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
  <span></span>
  <span>표시명</span>
  <span>키</span>
  <span>타입</span>
  <span class="text-center">필수</span>
  <span></span>
</div>
```

- [ ] **Step 4: template — 필드 행 그리드 및 reorder 버튼 추가**

기존 필드 행의 기본 행 div:
```html
<div class="grid grid-cols-[1fr_1fr_110px_52px_28px] gap-2 items-center p-2">
```

수정 후 (컬럼 수 맞추고 reorder 버튼 열 추가):
```html
<div class="grid grid-cols-[28px_1fr_1fr_110px_52px_28px] gap-2 items-center p-2">
  <!-- reorder 버튼 -->
  <div class="flex flex-col items-center gap-0.5">
    <button
      type="button"
      :disabled="fields.indexOf(field) === 0"
      class="text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-default transition-colors"
      @click="moveField(fields.indexOf(field), 'up')"
    >
      <ArrowUp class="w-3 h-3" />
    </button>
    <button
      type="button"
      :disabled="fields.indexOf(field) === fields.length - 1"
      class="text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-default transition-colors"
      @click="moveField(fields.indexOf(field), 'down')"
    >
      <ArrowDown class="w-3 h-3" />
    </button>
  </div>
  <!-- 나머지 기존 input 필드들 그대로 유지 -->
  <input v-model="field.label" ... />
  <input v-model="field.key" ... />
  <select v-model="field.type" ... />
  <div class="flex justify-center">
    <input v-model="field.required" type="checkbox" ... />
  </div>
  <button type="button" @click="removeField(field._id)">
    <Trash2 class="w-4 h-4" />
  </button>
</div>
```

- [ ] **Step 5: 빌드 확인**

```bash
cd frontend && bun run build 2>&1 | grep -E "error|warning" | head -20
```

Expected: 오류 없음. `FieldDef`가 공용 유틸에서 import되고 로컬 정의가 제거되었으므로 타입이 일치해야 함.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/tenant/schemas/SchemaPublishView.vue
git commit -m "feat: add field reorder buttons to SchemaPublishView"
```

---

## Task 3: SchemaListView — 공용 유틸로 교체

**Files:**
- Modify: `frontend/src/views/tenant/schemas/SchemaListView.vue`

`SchemaListView.vue`에도 로컬 `parseJsonSchema()`가 중복 정의되어 있다. 공용 유틸로 교체한다.

- [ ] **Step 1: SchemaListView.vue 열기**

```bash
head -30 frontend/src/views/tenant/schemas/SchemaListView.vue
```

- [ ] **Step 2: script — import 추가 및 로컬 parseJsonSchema 제거**

파일 상단 import 블록에 추가:
```typescript
import { parseJsonSchema } from '@/utils/schema'
```

그리고 파일 내 로컬 `parseJsonSchema()` 함수 정의 전체를 삭제한다. (이 함수는 `x-order`를 모르는 구버전이므로 삭제해야 함.)

- [ ] **Step 3: 빌드 확인**

```bash
cd frontend && bun run build 2>&1 | grep -E "error" | head -10
```

Expected: 오류 없음.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/tenant/schemas/SchemaListView.vue
git commit -m "feat: use shared parseJsonSchema in SchemaListView (x-order support)"
```

---

## Task 4: 수동 검증

- [ ] **Step 1: 개발 서버 시작**

터미널 1:
```bash
cd backend && bun run start:dev
```

터미널 2:
```bash
cd frontend && bun run dev
```

- [ ] **Step 2: 스키마 편집기에서 순서 변경 테스트**

브라우저에서 `/admin/tenants/:tenantId/schemas/publish` 접속.

1. 필드 3개 추가: `nickname` (문자열), `phone` (문자열), `birthYear` (정수)
2. `phone`의 ▲ 버튼 클릭 → `phone`이 첫 번째로 이동하는지 확인
3. `birthYear`의 ▼ 버튼이 비활성(마지막 항목)인지 확인
4. 첫 번째 항목의 ▲ 버튼이 비활성인지 확인
5. "JSON Schema 미리보기" 펼쳐서 `x-order` 배열이 현재 순서대로 있는지 확인:
   ```json
   "x-order": ["phone", "nickname", "birthYear"]
   ```
6. "발행" 클릭

- [ ] **Step 3: 발행 후 순서 유지 확인**

스키마 목록 페이지(`/admin/tenants/:tenantId/schemas`)로 이동하여 발행된 스키마의 필드 목록이 발행 시 순서(`phone`, `nickname`, `birthYear`)와 동일한지 확인.

- [ ] **Step 4: 재편집 시 순서 복원 확인**

다시 "새 스키마 발행" 접속 → 이전 스키마를 불러올 때 `x-order`에 따라 `phone`, `nickname`, `birthYear` 순으로 필드가 표시되는지 확인.

- [ ] **Step 5: JSON 직접 편집 모드 확인**

"JSON으로 직접 편집" 전환 → `x-order` 배열이 JSON에 포함되어 있는지 확인. 시각적 편집기로 복귀 시 순서가 유지되는지 확인.

- [ ] **Step 6: x-order 잔존 참조 확인**

```bash
grep -r "x-order" frontend/src backend/src
```

Expected: `frontend/src/utils/schema.ts`에만 나타남 (SchemaPublishView/SchemaListView에 직접 참조 없음).
