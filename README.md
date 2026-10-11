# Poom — NFC 키링 추억상자

소중한 사람이 떠오른 순간을 NFC 키링별로 모아두었다가, 직접 만났을 때 그 키링의 모든 추억을 한 번만 전달합니다. 수령한 추억은 수신자의 2D 세계에 주제별 장소로 열립니다.

## Stack

- Vite, React, TypeScript, React Router
- Tailwind CSS v4, TanStack Query
- Supabase Anonymous Auth, Postgres, Private Storage, Edge Functions
- Vercel SPA hosting

## Local setup

```sh
npm install
cp .env.example .env.local
```

`.env.local`에 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_PUBLISHABLE_KEY`를 설정합니다. 브라우저에는 publishable 또는 legacy anon key만 사용하세요. `service_role` 등 서버 비밀키를 `VITE_` 변수에 넣지 마세요.

Supabase Auth의 Anonymous Sign-In이 활성화되어 있어야 합니다. 프로젝트 설정은 `auth.enable_anonymous_sign_ins = true`입니다. 기존 브라우저 세션은 재사용되고 새 방문자는 익명 UUID를 받습니다. 브라우저 데이터를 지우거나 기기를 바꾸면 연결되지 않은 익명 계정의 추억을 복구하지 못할 수 있습니다. 카카오 연결은 선택 사항이며 현재 UUID를 유지합니다. 기존 계정에 이미 연결된 카카오는 자동 병합하지 않습니다.

```sh
npm run dev
```

## NFC 키링 흐름

1. 관리자가 `/admin/keyrings`에서 실물 키링을 발급하고 `/k/{publicId}` URL을 NFC 태그에 기록합니다. 일반 사용자는 키링을 만들지 않습니다.
2. 키링은 아직 비활성 상태입니다. 사용자가 실물 키링을 처음 태그하고 활성화를 누르면 해당 익명 UUID가 소유자로 등록되고 상태가 `active`가 됩니다. URL을 전달받은 사람도 먼저 활성화할 수 있으므로, 실물 키링을 받은 뒤 활성화해야 합니다.
3. 소유자는 `active` 상태에서 추억을 기록합니다. 사진 경로는 `keyring_uuid/memory_uuid/photo.ext`이며 `memory-photos` 비공개 버킷에 저장됩니다.
4. 소유자가 전달 준비를 누르면 키링 상태가 `transfer_ready`가 되고 키링의 모든 추억이 잠깁니다. 받는 사람이 동일한 NFC 키링을 태그하고 확인하면 이전됩니다.
5. 확인 처리는 하나의 Postgres 트랜잭션에서 수신자 UUID, 추억 전체, 키링 상태, 월드 지역을 함께 변경합니다. 키링은 `transferred`가 되어 다시 활성화하거나 전달할 수 없습니다.

사진 RLS는 Storage 폴더명만으로 권한을 주지 않고 현재 Auth UUID, memory row, keyring 상태를 함께 확인합니다. 사진 URL은 60초 후 만료됩니다. 기존 사진은 keyring UUID 경로로 복사·크기 확인 후 DB 경로를 바꾸고 이전 객체를 정리했습니다. 키링에 연결되지 않았던 기존 추억은 삭제하거나 임의 배정하지 않고 별도 보관함에 남깁니다.

새 수령 묶음은 각 추억 글을 규칙으로 분류해 카페·정원·공원·거리 지역을 만들고 기존 월드에 추가합니다. AI 또는 Croche 생성 기능은 연결되어 있지 않습니다.

NFC 태그에는 URL만 저장합니다. NFC URL을 아는 것만으로 첫 활성화 또는 전달 수령을 시도할 수 있으므로, 실물 키링을 건네는 상황에서 사용하세요. NFC 태그는 실제 만남을 암호학적으로 증명하지 않습니다.

## Routes

- `/` 및 `/home` — 홈
- `/keyring` — 활성화한 키링 목록
- `/admin/keyrings` — 관리자 전용 실물 키링 발급
- `/k/:publicId` — 첫 활성화, 소유자, 전달 준비, 수령 확인, 사용 종료 화면
- `/k/:publicId/new` — 해당 키링에 기록
- `/k/:publicId/memories` — 해당 키링 보관함
- `/k/:publicId/transfer` — 키링 전체 전달 준비
- `/world` — 수령한 장소와 추억 탐험
- `/memories` — 키링별 보관함과 미연결 레거시 기록

Vercel의 `vercel.json`은 모든 SPA 경로를 `index.html`로 rewrite합니다. 프로젝트 설정은 Vite preset, 저장소 root, `npm run build`, `dist` output입니다.

## Supabase schema and functions

마이그레이션은 기존 `profiles`, `memory_entries`, `keyrings`, transfer, Storage 데이터를 보존하며 제약·RLS·키링 상태를 확장합니다. `owner_id`는 키링 수령 후 수신자 UUID로 바뀝니다.

JWT 검증이 켜진 Edge Functions:

- `create-transfer` — 현재 키링 소유권·상태를 확인하고 키링의 모든 draft 추억에 pending 세션 생성
- `receive-transfer` — 수신자의 확인을 받아 원자적으로 소유권을 이전
- `memory-photo-url` — 현재 소유권을 확인하고 60초 서명 URL 발급
- `home-summary` — 온보딩을 요구하지 않는 익명 사용자 홈 요약

키링 발급은 `app_metadata.role = "admin"`이 서버에서 설정된 계정만 할 수 있습니다. `user_metadata`는 사용자가 직접 수정할 수 있으므로 관리자 판정에 쓰지 않습니다. 현재 개발 프로젝트에는 관리자 역할 계정이 없으므로 Supabase Dashboard의 Auth user 관리 기능 또는 신뢰할 수 있는 서버 Admin API로 지정 계정의 `app_metadata`에 역할을 부여한 뒤 `/admin/keyrings`를 사용하세요. 브라우저에서 관리자 역할을 설정하거나 service role key를 클라이언트에 넣지 마세요.

로컬 Supabase 개발:

```sh
npm run supabase:start
npx supabase db reset
npx supabase functions serve
```

## Checks and deploy

```sh
npm run lint
npm run build
vercel --prod
```

Build warning: the minified client bundle is larger than 500 KB. Mobile UI was checked at 360×640, 375×667, 390×844, and 430×932. Physical NFC tag scanning still needs a real-device check.
