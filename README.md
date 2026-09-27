# Voca — AI 단어장

단어만 입력하면 **Gemini가 뜻·품사·발음·예문을 채워 주고**, **5지선다**와 **AI 빈칸 시험**으로 복습하는 단어장입니다.
Cloudflare Workers에서 동작하고, 로그인과 데이터 저장은 Firebase(Authentication · Realtime Database)를 사용합니다.

- Firebase 로그인: Google 계정 또는 이메일/비밀번호
- 단어는 로그인한 사용자별로 Realtime Database의 `users/{uid}/voca`에 저장 (다른 사람은 볼 수 없음)
- AI 뜻·예문: 한 단어씩 또는 여러 단어(최대 50개)를 한 번에 생성 → 확인 후 저장
- 시험 선택: 종류(5지선다 / AI 빈칸) · 범위(전체 / 최근 추가 / 자주 틀린 단어 / 아직 안 푼 단어) · 문제 수 · 방향(단어→뜻 / 뜻→단어 / 섞어서)
- 5지선다: 보기 5개, 키보드 1~5 선택, 틀린 문제 다시 풀기
- AI 빈칸: AI가 매번 새 예문을 만들고 빈칸에 들어갈 단어를 직접 입력 (활용형·원형 모두 정답, 뜻·첫 글자 힌트). AI가 실패하면 저장된 예문으로 대신 출제
- 단어별 맞음/틀림 기록, 홈에서 복습이 필요한 단어와 최근 시험 기록 확인
- 발음 듣기(브라우저 음성), 모바일 하단 탭 · 다크 모드

## 기능별 경로

| 경로 | 기능 | 코드 |
| --- | --- | --- |
| `/` | 홈 (요약 · 복습할 단어 · 최근 시험) | `public/js/pages/home.js` |
| `/login/` | 로그인 · 회원가입 | `public/js/pages/login.js` |
| `/words/` | 단어장 (검색 · 정렬 · 발음 · 수정 · 삭제) | `public/js/pages/words.js` |
| `/words/add/` | 단어 추가 + AI 뜻·예문 (한 단어 / 여러 단어) | `public/js/pages/word-form.js` |
| `/words/edit/?id=…` | 단어 수정 · 삭제 | `public/js/pages/word-form.js` |
| `/test/` | 시험 선택 | `public/js/pages/test-select.js` |
| `/test/choice/` | 5지선다 시험 | `public/js/pages/test-choice.js` |
| `/test/blank/` | AI 빈칸 시험 | `public/js/pages/test-blank.js` |

| API | 설명 | 코드 |
| --- | --- | --- |
| `GET /api/config` | 브라우저용 Firebase 설정 (`FIREBASE_CONFIG`) | `src/routes/config.js` |
| `GET /api/health` | 환경변수 설정 상태 확인 (비밀 값은 보여주지 않음) | `src/routes/health.js` |
| `POST /api/ai/word` | AI 뜻·품사·발음·예문 생성 (로그인 필요) | `src/routes/ai-word.js` |
| `POST /api/ai/blank` | AI 빈칸 문제 생성 (로그인 필요) | `src/routes/ai-blank.js` |

AI API는 브라우저가 보낸 Firebase 로그인 토큰(ID 토큰)을 Worker에서 Google 공개키로 검증한 뒤에만 Gemini를 호출합니다.
Gemini 키(`AI_API`)는 Worker 안에만 있고 브라우저로 전달되지 않습니다.

## 폴더 구조

```
public/                 정적 파일 (Cloudflare가 그대로 서비스)
  index.html, login/, words/, words/add/, words/edit/, test/, test/choice/, test/blank/
  css/app.css
  js/main.js            페이지 시작점 (<body data-page="…">에 맞는 모듈 실행)
  js/pages/             기능(페이지)별 코드
  js/core/              공통: Firebase 초기화, 로그인, Realtime Database, AI 호출, 화면 도우미, 시험 로직
  js/shared/text.js     서버와 브라우저가 함께 쓰는 텍스트 도우미
src/                    Worker (/api/*)
  index.js              API 라우터
  routes/               API 기능별 처리
  lib/                  FIREBASE_CONFIG 해석, 로그인 토큰 검증, Gemini 호출
test/                   단위 테스트 (npm test)
database.rules.json     Realtime Database 보안 규칙 (voca 부분)
wrangler.jsonc          Cloudflare Worker 설정 (이름: voca)
```

## 설정하기

### 1. Firebase

1. [Firebase 콘솔](https://console.firebase.google.com/)의 프로젝트에서 **웹 앱**의 `firebaseConfig`를 복사해 둡니다.
   (프로젝트 설정 → 내 앱 → SDK 설정 및 구성) **`databaseURL`(Realtime Database 주소)이 들어 있어야 합니다.**
   없으면 Realtime Database 화면 위쪽의 `https://…firebasedatabase.app` 주소를 `databaseURL`로 추가하거나 Worker 변수 `FIREBASE_DATABASE_URL`로 넣으세요.
2. **Authentication → 로그인 방법**에서 `Google`과 `이메일/비밀번호`를 사용 설정합니다.
3. **Authentication → 설정 → 승인된 도메인**에 Worker 주소를 추가합니다.
   예: `voca.lagem1535.workers.dev` (Cloudflare 대시보드의 Worker 개요에서 실제 주소 확인, 커스텀 도메인을 쓰면 그 도메인도 추가)
4. **Realtime Database → 규칙**에서 로그인한 본인이 `users/{uid}/voca`를 읽고 쓸 수 있는지 확인합니다.
   **기존 규칙을 통째로 바꾸지 말고**, `users` → `$uid` 안에 아래 `voca` 부분만 추가하세요. (다른 앱이 쓰는 규칙은 그대로 둡니다)
   이미 `users/$uid` 전체를 본인에게 허용하고 있다면 추가하지 않아도 됩니다.

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

### 2. Gemini API 키

[Google AI Studio](https://aistudio.google.com/apikey)에서 API 키를 발급합니다.
키에 "웹사이트(리퍼러) 제한"을 걸면 Worker에서 호출할 수 없으니 제한 없이 두거나 API 제한(Generative Language API)만 거세요.

### 3. Cloudflare Worker (`voca`)

Cloudflare 대시보드 → **Workers & Pages → voca → 설정**

1. **변수 및 비밀**에 추가
   - `AI_API` : Gemini API 키 (유형 **비밀(Secret)** 권장)
   - `FIREBASE_CONFIG` : Firebase `firebaseConfig`
     - JSON(`{"apiKey":"…","authDomain":"…","projectId":"…",…}`)이나 콘솔의 `const firebaseConfig = { … };` 코드를 그대로 붙여넣어도 됩니다.
2. **빌드 → Git 리포지토리 연결**에서 `lagem1535-create/voca`, 프로덕션 브랜치 `main`을 연결합니다.
   빌드 명령은 비워 두고 배포 명령은 기본값 `npx wrangler deploy`를 그대로 씁니다. 이후 `main`에 올라가면 자동 배포됩니다.
   - 직접 배포하려면: `npm install` → `npx wrangler deploy`
3. 배포 후 `https://<워커 주소>/api/health`에서 `"ok": true`인지 확인합니다.

`wrangler.jsonc`에 `"keep_vars": true`가 있어서 대시보드에 넣은 변수가 배포할 때 지워지지 않습니다.

### 선택 환경변수

| 이름 | 설명 |
| --- | --- |
| `GEMINI_MODEL` | 사용할 모델 (예: `gemini-3.5-flash-lite`). 쉼표로 여러 개를 적으면 순서대로 시도합니다. 기본값: `gemini-3.8-flash` → `gemini-3.6-flash` → `gemini-3.5-flash` → `gemini-3.5-flash-lite` → `gemini-flash-latest` (모델이 없거나 한도 초과면 다음 모델로 자동 전환) |
| `ALLOWED_EMAILS` | AI 기능을 쓸 수 있는 이메일 목록 (쉼표 구분). 비우면 로그인한 모든 사용자가 사용 가능 |
| `GEMINI_BASE_URL` | Gemini API 주소를 바꿀 때 (예: Cloudflare AI Gateway의 `…/google-ai-studio` 주소) |
| `FIREBASE_DATABASE_URL` | `FIREBASE_CONFIG`에 `databaseURL`이 없거나 다른 Realtime Database를 쓸 때 주소 (`https://…firebasedatabase.app`) |

## 로컬 개발

```bash
npm install
cp .dev.vars.example .dev.vars   # AI_API, FIREBASE_CONFIG 채우기
npm run dev                      # http://localhost:8787
npm test                         # 단위 테스트
```

Firebase 에뮬레이터로 개발하려면 `.dev.vars`에 `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, `FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000`을 넣고
`npx firebase-tools emulators:start --only auth,database --project demo-voca`를 함께 실행하세요.
(`FIREBASE_CONFIG`의 projectId는 `demo-voca`, databaseURL은 `https://demo-voca-default-rtdb.firebaseio.com`)

## 데이터 구조 (Realtime Database)

```
users/{uid}/voca/words/{단어ID}
  word, wordLower, meaning, partOfSpeech, pronunciation, language,
  examples: [{ sentence, translation }], memo,
  correct, wrong, lastTestedAt, createdAt, updatedAt   (시각은 밀리초 숫자)
users/{uid}/voca/results/{기록ID}
  type ("choice" | "blank"), direction, scope, total, correct, wrong: [{ id, word, meaning }], createdAt
```

## 문제 해결

| 증상 | 해결 |
| --- | --- |
| "설정이 필요해요" 화면 | Worker 변수에 `FIREBASE_CONFIG`가 있는지, `/api/health` 결과(`firebaseConfig`, `database`, `ai`)를 확인하세요. |
| Google 로그인 시 `승인된 도메인에 추가` 안내 | Firebase → Authentication → 설정 → 승인된 도메인에 Worker 주소를 추가하세요. |
| "로그인 방식이 꺼져 있습니다" | Firebase → Authentication → 로그인 방법에서 Google/이메일을 사용 설정하세요. |
| "Realtime Database 규칙 때문에 거부되었습니다" | Realtime Database 규칙의 `users` → `$uid` 안에 위의 `voca` 규칙을 추가하고 게시하세요. |
| "databaseURL(Realtime Database 주소)이 없습니다" | `FIREBASE_CONFIG`에 `databaseURL`을 넣거나 `FIREBASE_DATABASE_URL` 변수를 추가하세요. |
| "AI_API … 올바르지 않습니다" / "권한이 없습니다" | Gemini 키 값과 키 제한 설정을 확인하세요. |
| "Gemini 사용량 한도를 넘었습니다" | 잠시 후 다시 시도하거나 `GEMINI_MODEL`을 `gemini-3.5-flash-lite` 등으로 바꾸세요. |
| "현재 서버 위치를 지원하지 않습니다" | `wrangler.jsonc`에 `"placement": { "region": "gcp:us-central1" }`을 추가해 Worker를 미국 리전 근처에서 실행하세요. |
| 카카오톡에서 Google 로그인이 안 됨 | 앱 안 브라우저는 Google이 막습니다. 로그인 화면의 "기본 브라우저로 열기"를 누르거나 이메일로 로그인하세요. |
