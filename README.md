# Voca — AI 단어장

단어만 입력하면 **Gemini AI 가 뜻·품사·발음·예문을 채워 주고**, **5지선다**와 **AI 빈칸 시험**으로 복습하는 단어장입니다.
Cloudflare Workers 에서 동작하고, 로그인과 저장은 Firebase(Authentication · Realtime Database)를 씁니다.

- **로그인** — Firebase Authentication: Google 계정 또는 이메일/비밀번호 (카카오톡 등 앱 안 브라우저에서는 외부 브라우저 열기 안내)
- **저장** — Realtime Database `users/{uid}/voca` 에 사용자별로 저장, 본인만 읽고 쓰기
- **AI 뜻·예문** — 한 단어씩, 또는 여러 단어(최대 30개)를 한 번에. 철자가 틀리면 AI 가 바로잡음
- **시험 선택** — 종류(5지선다 / AI 빈칸) · 범위(전체 / 복습 필요 / 안 본 단어 / 최근 추가 / 별표) · 문제 수 · 방향(단어→뜻 / 뜻→단어 / 섞어서)
- **5지선다** — 보기 5개(같은 품사 오답을 먼저 섞음), 키보드 1~5 로 선택, 틀린 단어만 다시 풀기
- **AI 빈칸** — AI 가 매번 새 예문을 만들고 단어 자리를 비움 → 직접 입력. 활용형·기본형 모두 정답, 한 글자 오타는 한 번 더 기회, 힌트(첫 글자·글자 수·뜻). AI 가 실패하면 저장된 예문으로 출제
- **단어장** — 검색 · 필터(별표/복습 필요/안 본 단어/외운 단어) · 정렬 · 발음 듣기 · 별표 · 수정 · 삭제, 단어별 맞힘/틀림/연속 정답 기록
- 모바일 하단 탭, 다크 모드

## 기능별 경로

| 경로 | 기능 | 코드 |
| --- | --- | --- |
| `/` | 홈 — 학습 요약, 복습할 단어, 최근 시험 | `public/js/pages/home.js` |
| `/login` | 로그인 · 회원가입 · 비밀번호 재설정 | `public/js/pages/login.js` |
| `/words` | 단어장 (`?filter=review` 처럼 필터 지정 가능) | `public/js/pages/words.js` |
| `/words/add` | 단어 추가 + AI 뜻·예문 (`?mode=bulk` 여러 단어) | `public/js/pages/word-add.js` |
| `/words/edit?id=…` | 단어 수정 · 삭제 | `public/js/pages/word-edit.js` |
| `/test` | 시험 선택 | `public/js/pages/test-select.js` |
| `/test/choice?scope=&count=&dir=` | 5지선다 시험 | `public/js/pages/test-choice.js` |
| `/test/blank?scope=&count=` | AI 빈칸 시험 | `public/js/pages/test-blank.js` |

각 경로는 주소창에 바로 입력하거나 새로고침해도 열립니다. (Cloudflare 가 파일이 없는 경로에 `index.html` 을 돌려주고 `public/js/router.js` 가 해당 페이지를 띄움)

| API (Worker) | 설명 | 코드 |
| --- | --- | --- |
| `GET /api/config` | 브라우저용 Firebase 설정 (`FIREBASE_CONFIG`) | `src/routes/config.js` |
| `GET /api/health` | 환경변수 설정 상태 (비밀 값은 보여주지 않음) | `src/routes/health.js` |
| `POST /api/ai/word` | AI 뜻·품사·발음·예문 — 로그인 필요 | `src/routes/ai-word.js` |
| `POST /api/ai/blank` | AI 빈칸 문제 — 로그인 필요 | `src/routes/ai-blank.js` |

AI API 는 브라우저가 보낸 Firebase 로그인 토큰(ID 토큰)을 Worker 에서 Google 공개키로 검증한 뒤에만 Gemini 를 호출합니다.
Gemini 키(`AI_API`)는 Worker 안에만 있고 브라우저로 전달되지 않습니다.

## 폴더 구조

```
public/                  정적 파일 (Cloudflare 가 그대로 서비스)
  index.html             앱 틀 (상단 메뉴 · 하단 탭)
  css/app.css
  js/app.js              시작점: Firebase 준비 → 로그인 확인 → 라우터
  js/router.js           기능별 경로 → 페이지 모듈
  js/pages/              기능(경로)별 페이지
  js/components/         단어 입력 폼, 시험 화면 조각
  js/firebase.js         Firebase SDK(CDN) 초기화
  js/store.js            Realtime Database 읽기·쓰기
  js/api.js              Worker AI API 호출
  js/quiz.js             시험 로직 (범위, 5지선다 보기, 빈칸 대체 문제)
  js/shared/text.js      채점·빈칸 도우미 (Worker 와 함께 사용)
src/                     Worker (/api/*)
  index.js               API 라우터
  routes/                API 기능별 처리
  ai/                    Gemini 프롬프트 · 응답 정리
  lib/                   FIREBASE_CONFIG 해석, 로그인 토큰 검증, Gemini 호출
test/                    단위 테스트 (npm test)
database.rules.json      Realtime Database 규칙 (voca 부분)
wrangler.jsonc           Cloudflare Worker 설정 (이름: voca)
```

## 설정

### 1. Cloudflare — Workers & Pages → `voca` → 설정 → 변수 및 비밀

| 이름 | 값 |
| --- | --- |
| `AI_API` | Gemini API 키 ([Google AI Studio](https://aistudio.google.com/apikey)). 유형은 **비밀(Secret)** 권장 |
| `FIREBASE_CONFIG` | Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)의 `firebaseConfig`. JSON 이나 `const firebaseConfig = { … };` 코드를 그대로 붙여넣어도 됩니다 |

선택 변수:

| 이름 | 설명 |
| --- | --- |
| `GEMINI_MODEL` | 쓸 모델(쉼표로 여러 개). 기본: `gemini-3.6-flash` → `gemini-flash-latest` → `gemini-3.5-flash-lite` → `gemini-flash-lite-latest` (모델이 없거나 한도 초과면 다음 모델로 자동 전환) |
| `ALLOWED_EMAILS` | AI 기능을 쓸 수 있는 이메일(쉼표 구분, Google 로그인 또는 인증된 이메일). 비우면 로그인한 모든 사용자 |
| `FIREBASE_DATABASE_URL` | Realtime Database 주소를 직접 지정할 때. `FIREBASE_CONFIG` 에 `databaseURL` 이 없으면 기본 주소에 물어 다른 지역 주소를 자동으로 찾습니다 |
| `GEMINI_BASE_URL` | Gemini API 주소 변경 (예: Cloudflare AI Gateway) |

`wrangler.jsonc` 에 `"keep_vars": true` 가 있어서 대시보드에 넣은 변수가 배포 때 지워지지 않습니다.

**배포**: Worker 가 이 저장소(`main` 브랜치)와 Git 연결되어 있으면 `main` 에 병합될 때 자동 배포됩니다. (빌드 명령 비움, 배포 명령 `npx wrangler deploy`)
직접 배포하려면 `npm install` → `npx wrangler deploy`.

### 2. Firebase

1. **Authentication → 로그인 방법**: `Google`, `이메일/비밀번호` 사용 설정
2. **Authentication → 설정 → 승인된 도메인**: Worker 주소(예: `voca.<계정>.workers.dev`)와 커스텀 도메인 추가
3. **Realtime Database → 규칙**: 로그인한 본인이 `users/{uid}/voca` 를 읽고 쓸 수 있어야 합니다.
   다른 앱이 같은 데이터베이스를 쓰고 있다면 **규칙 전체를 바꾸지 말고** `users` → `$uid` 안에 `voca` 부분만 추가하세요.
   (`users/$uid` 전체를 이미 본인에게 허용하고 있다면 그대로 두면 됩니다)

   ```json
   {
     "rules": {
       "users": {
         "$uid": {
           "voca": {
             ".read": "auth != null && auth.uid === $uid",
             ".write": "auth != null && auth.uid === $uid"
           }
         }
       }
     }
   }
   ```

### 3. 확인

배포 후 `https://<워커 주소>/api/health` 가 `"ok": true` 인지 확인하고, 앱에서 로그인 → 단어 추가 → 시험을 해 보세요.

## 로컬 개발

```bash
npm install
cp .dev.vars.example .dev.vars   # AI_API, FIREBASE_CONFIG 채우기
npm run dev                      # http://localhost:8787
npm test                         # 단위 테스트
```

Firebase 에뮬레이터로 개발하려면 `.dev.vars` 에 `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, `FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000` 을 넣고
`npx firebase-tools emulators:start --only auth,database --project demo-voca` 를 함께 실행하세요.
(이때 `FIREBASE_CONFIG` 의 projectId 는 `demo-voca`, 규칙은 `database.rules.json` 을 에뮬레이터에 올려 사용)

## 데이터 구조 (Realtime Database)

```
users/{uid}/voca/words/{id}
  word, meaning, pos(품사), pronunciation, lang, examples: [{ sentence, translation }], memo,
  starred, correct, wrong, streak(연속 정답), lastResult, lastTestedAt, createdAt, updatedAt   (시각은 밀리초)
users/{uid}/voca/results/{id}
  type ("choice" | "blank"), scope, dir, total, correct, wrong: [틀린 단어], createdAt
```

- **복습 필요**: 틀린 적이 있고 그 뒤로 2번 연속 맞히지 못한 단어
- **외운 단어**: 3번 이상 연속으로 맞힌 단어

## 문제 해결

| 증상 | 해결 |
| --- | --- |
| "설정이 필요해요" 화면 | Worker 변수 `FIREBASE_CONFIG` 를 확인하고 `/api/health` 결과를 보세요 |
| Google 로그인 시 승인된 도메인 안내 | Firebase → Authentication → 설정 → 승인된 도메인에 Worker 주소 추가 |
| "로그인 방식이 꺼져 있습니다" | Firebase → Authentication → 로그인 방법에서 Google / 이메일 사용 설정 |
| "Realtime Database 규칙 때문에…" | 위의 `voca` 규칙을 `users` → `$uid` 안에 추가하고 게시 |
| "Realtime Database 에 연결하지 못했어요" | `FIREBASE_CONFIG` 의 `databaseURL`(또는 `FIREBASE_DATABASE_URL`)이 콘솔의 Realtime Database 주소와 같은지 확인 |
| "AI_API 키가 올바르지 않습니다" / "권한이 없습니다" | Gemini 키 값 확인. 키에 웹사이트(리퍼러) 제한이 있으면 서버에서 쓸 수 없으니 제한을 풀거나 API 제한만 사용 |
| "AI 사용량 한도를 넘었습니다" | 잠시 후 다시 시도하거나 `GEMINI_MODEL` 을 바꾸세요 |
| "현재 서버 위치에서는 Gemini API 를 쓸 수 없습니다" | `wrangler.jsonc` 에 `"placement": { "region": "gcp:us-central1" }` 을 추가해 미국 근처에서 실행 |
| 카카오톡에서 Google 로그인이 안 됨 | 로그인 화면의 "기본 브라우저로 열기"를 누르거나 이메일로 로그인 |
