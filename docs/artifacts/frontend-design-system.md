# Authori Frontend Design System

Authori 프론트엔드의 디자인 시스템 정의 문서. Vue 3 + Tailwind CSS v4 기반으로 구성된 관리자 UI 및 OAuth 인증 UI에 적용되는 규칙을 정의한다.

---

## 1. 기술 스택

| 항목 | 버전 / 패키지 |
|---|---|
| CSS 프레임워크 | Tailwind CSS v4 (`@tailwindcss/vite`) |
| 아이콘 | `lucide-vue-next` v1.0.0 |
| 커스텀 테마 파일 | 없음 (Tailwind 기본 팔레트 사용) |
| CSS 진입점 | `@import "tailwindcss";` |

---

## 2. 색상 팔레트

### Primary

| 역할 | Tailwind 클래스 | Hex |
|---|---|---|
| 기본 CTA 버튼, 포커스 링, 활성 링크 | `indigo-600` | `#4f46e5` |
| 기본 버튼 hover | `indigo-700` | `#4338ca` |
| 활성 사이드바 배경 | `indigo-50` | `#eef2ff` |
| 활성 사이드바 텍스트 | `indigo-700` | `#4338ca` |

### Gray (Neutral)

| 역할 | Tailwind 클래스 | Hex |
|---|---|---|
| 주요 제목 | `gray-900` | `#111827` |
| 레이블, 본문 텍스트 | `gray-700` | `#374151` |
| 보조 본문 텍스트 | `gray-600` | `#4b5563` |
| 아이콘, 비활성 텍스트 | `gray-500` | `#6b7280` |
| Placeholder | `gray-400` | `#9ca3af` |
| 테두리, 구분선 | `gray-300` | `#d1d5db` |
| 보조 테두리 | `gray-200` | `#e5e7eb` |
| 호버 배경, 태그 배경 | `gray-100` | `#f3f4f6` |
| 테이블 헤더, 페이지 배경 | `gray-50` | `#f9fafb` |
| 카드 배경, 헤더 배경 | `white` | `#ffffff` |

### Semantic

| 의미 | 배경 | 텍스트 | 용도 |
|---|---|---|---|
| 성공 / Active | `green-100` | `green-700` | 상태 배지, 성공 메시지 |
| 오류 / Locked | `red-100` | `red-700` | 에러 배지, 삭제 확인 |
| 경고 / Draft | `yellow-100` | `yellow-700` | 상태 배지 |
| Deprecated | `orange-100` | `orange-700` | 상태 배지 |
| Inactive | `gray-100` | `gray-600` | 상태 배지 |

---

## 3. 타이포그래피

**기본 폰트**: `system-ui, 'Segoe UI', Roboto, sans-serif` (시스템 폰트 스택)

### 크기 계층

| 역할 | Tailwind 클래스 | 크기 / 두께 |
|---|---|---|
| 대시보드 통계 수치 | `text-3xl font-bold` | 30px / 700 |
| 페이지 제목 | `text-xl font-semibold` | 20px / 600 |
| 섹션 제목, 카드 헤더 | `text-lg font-semibold` | 18px / 600 |
| 기본 본문 | `text-sm` | 14px / 400 |
| 레이블 | `text-sm font-medium` | 14px / 500 |
| 배지, 타임스탬프, 보조 정보 | `text-xs` | 12px / 400 |
| ID, 기술 값 (모노스페이스) | `font-mono text-xs` | 12px / 400 |

### 색상 용도

```
text-gray-900  — 제목
text-gray-700  — 레이블, 기본 텍스트
text-gray-600  — 보조 본문
text-gray-500  — 아이콘 텍스트, 힌트
text-gray-400  — placeholder, 비활성
text-indigo-600 — 링크, 강조
text-red-600    — 에러 메시지
text-green-600  — 성공 메시지
```

---

## 4. 간격(Spacing) 및 레이아웃

### 레이아웃 구조

| 요소 | 값 |
|---|---|
| 사이드바 너비 | `w-64` (256px) |
| 상단 헤더 높이 | `h-16` (64px) |
| 메인 콘텐츠 기본 패딩 | `p-6` (24px) |
| 사이드바 열림 시 메인 여백 | `ml-64` |
| 사이드바 전환 애니메이션 | `transition-all duration-200` |

### 자주 쓰는 간격 패턴

```
p-6          — 카드, 메인 영역 패딩
p-5          — 컴팩트 카드
px-3 py-2   — 입력 필드, 버튼
px-4 py-2   — 버튼 (조금 더 넓음)
space-y-4   — 폼 필드 간격
gap-4       — 그리드/플렉스 간격 (기본)
gap-3       — 버튼 그룹 간격
gap-2       — 인라인 요소 간격
mb-6        — 섹션 하단 여백
mb-1        — 레이블 하단 여백
```

### 그리드 패턴

```html
grid grid-cols-2 gap-4          <!-- 2컬럼 폼 레이아웃 -->
grid grid-cols-3 items-center   <!-- 페이지네이션 3구역 -->
flex flex-col sm:flex-row gap-3 <!-- 반응형 버튼 그룹 -->
```

---

## 5. 컴포넌트

### 버튼

```html
<!-- Primary -->
<button class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
  확인
</button>

<!-- Secondary (Outlined) -->
<button class="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
  취소
</button>

<!-- Icon button -->
<button class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
  <PlusIcon class="w-4 h-4" />
</button>

<!-- Text link -->
<button class="text-indigo-600 text-sm hover:underline">
  링크 텍스트
</button>

<!-- Danger -->
<button class="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
  삭제
</button>
```

### 폼 요소

```html
<!-- 레이블 -->
<label class="block text-sm font-medium text-gray-700 mb-1">
  필드명 <span class="text-red-500">*</span>
</label>

<!-- 텍스트 입력 -->
<input class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400" />

<!-- 에러 상태 입력 -->
<input class="w-full px-3 py-2 border border-red-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent" />

<!-- 에러 메시지 -->
<p class="text-sm text-red-600 mt-1">에러 메시지</p>

<!-- Select -->
<select class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
  <option value="">선택하세요</option>
</select>

<!-- Textarea -->
<textarea class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" rows="3"></textarea>

<!-- JSON 에디터 -->
<textarea class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"></textarea>

<!-- Checkbox -->
<input type="checkbox" class="w-4 h-4 accent-indigo-600" />
```

### 카드

```html
<!-- 기본 카드 -->
<div class="bg-white rounded-xl border border-gray-200 p-6">
  ...
</div>

<!-- 컴팩트 카드 -->
<div class="bg-white rounded-xl border border-gray-200 p-5">
  ...
</div>
```

### 상태 배지

```html
<!-- 템플릿 -->
<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {상태별 색상}">
  상태 텍스트
</span>
```

| 상태 | 색상 클래스 |
|---|---|
| Active / Published | `bg-green-100 text-green-700` |
| Inactive | `bg-gray-100 text-gray-600` |
| Locked / Error | `bg-red-100 text-red-700` |
| Draft | `bg-yellow-100 text-yellow-700` |
| Deprecated | `bg-orange-100 text-orange-700` |

### 테이블

```html
<table class="w-full">
  <thead>
    <tr class="bg-gray-50 border-b border-gray-200">
      <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
        컬럼명
      </th>
    </tr>
  </thead>
  <tbody class="divide-y divide-gray-100">
    <tr class="hover:bg-gray-50 transition-colors">
      <td class="px-4 py-3 text-sm text-gray-700">값</td>
    </tr>
  </tbody>
</table>
```

### 모달 / 다이얼로그

```html
<!-- 오버레이 + 컨테이너 -->
<Teleport to="body">
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div class="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
      <h3 class="text-base font-semibold text-gray-900 mb-2">제목</h3>
      <p class="text-sm text-gray-600 mb-5">내용</p>
      <div class="flex gap-3 justify-end">
        <!-- 버튼 그룹 -->
      </div>
    </div>
  </div>
</Teleport>
```

### 사이드바 내비게이션 링크

```html
<!-- 활성 상태 -->
<a class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-700">
  <IconComponent class="w-4 h-4" />
  메뉴명
</a>

<!-- 비활성 상태 -->
<a class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
  <IconComponent class="w-4 h-4" />
  메뉴명
</a>
```

### 페이지네이션

```html
<!-- 현재 페이지 -->
<button class="px-3 py-1 rounded-md text-xs font-medium bg-indigo-600 text-white">1</button>

<!-- 다른 페이지 -->
<button class="px-3 py-1 rounded-md text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors">2</button>

<!-- 비활성 (이전/다음) -->
<button class="px-3 py-1 text-xs text-gray-400 disabled:cursor-not-allowed" disabled>이전</button>
```

### 검색 입력

```html
<div class="relative">
  <SearchIcon class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
  <input class="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="검색..." />
</div>
```

---

## 6. 아이콘

라이브러리: **`lucide-vue-next`**

### 아이콘 크기 규칙

| 용도 | 크기 클래스 |
|---|---|
| 버튼 내 아이콘 | `w-4 h-4` |
| 사이드바 아이콘 | `w-4 h-4` |
| 강조 아이콘 | `w-5 h-5` |
| 로딩 스피너 | `w-4 h-4 animate-spin` |

### 자주 쓰는 아이콘

| 아이콘 | 용도 |
|---|---|
| `Menu` | 사이드바 토글 |
| `LayoutDashboard` | 대시보드 |
| `Building2` | 테넌트 |
| `Users` | 사용자 |
| `UserCog` | 관리자 |
| `AppWindow` | 클라이언트 앱 |
| `FileJson` | 프로필 스키마 |
| `ClipboardList` | 감사 로그 |
| `Link2` | URL, 링크 |
| `ShieldCheck` | 보안, 권한 |
| `Plus` | 항목 추가 |
| `Search` | 검색 |
| `RefreshCw` | 새로고침 |
| `LogOut` | 로그아웃 |
| `Copy` | 복사 |
| `Check` | 복사 완료, 확인 |

---

## 7. CSS 커스텀 프로퍼티

현재 정의된 CSS 변수:

| 변수명 | 기본값 | 용도 |
|---|---|---|
| `--auth-bg-color` | `#f9fafb` (gray-50) | OAuth 로그인 페이지 배경색. 테넌트 브랜딩으로 오버라이드 가능 |

---

## 8. 상태 / 인터랙션 패턴

### 로딩

```html
<!-- 버튼 로딩 상태 -->
<button :disabled="loading" class="... disabled:opacity-50 disabled:cursor-not-allowed">
  <RefreshCwIcon v-if="loading" class="w-4 h-4 animate-spin" />
  {{ loading ? '처리 중...' : '저장' }}
</button>
```

### 포커스 링

모든 인터랙티브 요소에 통일된 포커스 링 적용:

```
focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
```

### 호버 전환

```
transition-colors   — 색상 전환 (버튼, 링크, 테이블 행)
transition-all duration-200  — 사이드바 슬라이드
```

### 비활성(Disabled) 상태

```
disabled:opacity-50 disabled:cursor-not-allowed
```

---

## 9. 레이아웃 패턴

### 관리자 레이아웃 (AdminLayout)

```
min-h-screen
├── header (h-16, bg-white, border-b border-gray-200, fixed top-0)
├── aside (w-64, bg-white, border-r border-gray-200, fixed left-0 top-16 bottom-0)
└── main (ml-64 pt-16, min-h-screen bg-gray-50)
     └── div.p-6 (콘텐츠 영역)
```

### 인증 레이아웃 (AuthLayout)

```
min-h-screen flex flex-col
  background: var(--auth-bg-color, #f9fafb)
└── main.flex-1.flex.items-center.justify-center.p-4
     └── div (max-w-md w-full, 또는 max-w-lg)
          └── 로그인 카드 (bg-white rounded-xl border border-gray-200 p-8)
```

### 리스트 뷰 (목록 페이지) 패턴

```
div.space-y-6
├── 헤더 (flex justify-between items-start)
│    ├── h1.text-xl.font-semibold.text-gray-900 + p.text-sm.text-gray-500
│    └── 액션 버튼 그룹
├── 필터/검색 영역 (bg-white rounded-xl border p-4)
└── 테이블 카드 (bg-white rounded-xl border overflow-hidden)
     ├── table
     └── 페이지네이션 (px-4 py-3 border-t border-gray-200, grid grid-cols-3)
```

---

## 10. 규칙 요약

1. **Primary 색상은 indigo**. 버튼, 포커스 링, 활성 상태 모두 `indigo-*`.
2. **텍스트 기본 크기는 `text-sm`** (14px). `text-xs`는 배지/메타 정보에만.
3. **카드 모서리는 `rounded-xl`**, 버튼/입력은 `rounded-lg`.
4. **모든 인터랙티브 요소에 `transition-colors`** 적용.
5. **폼 필드 간격은 `space-y-4`** 기본, 밀집된 경우 `space-y-3`.
6. **에러는 `red-*`, 성공은 `green-*`, 경고는 `yellow-*`** 의미색 사용.
7. **아이콘 크기는 `w-4 h-4`** 기본, 강조 시 `w-5 h-5`.
8. **모달은 항상 `<Teleport to="body">`** 로 렌더링.
9. **로딩 중 버튼은 `disabled` + `opacity-50`** 처리.
10. **ID, 코드, 기술 값은 `font-mono`** 사용.
