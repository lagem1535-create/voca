# Voca — AI 단어장

Cloudflare Workers + Firebase(로그인 · Realtime Database) + Gemini AI 단어장입니다.

- **로그인**: Firebase Authentication (Google / 이메일·비밀번호)
- **저장**: Realtime Database `users/{uid}/voca` (본인만 읽기·쓰기)
- **AI 뜻·예문**: 단어를 입력하면 Gemini가 뜻·품사·발음·예문을 채움 (한 단어 / 여러 단어 한 번에)
- **시험 선택**: 종류(5지선다 / AI 빈칸) · 범위(전체 / 최근 / 틀린 단어 / 안 푼 단어) · 문제 수 · 방향
- **5지선다**: 보기 5개, 키보드 1~5, 틀린 문제 다시 풀기
- **AI 빈칸**: AI가 매번 새 예문을 만들어 빈칸 출제 (활용형·원형 모두 정답, 힌트). AI 실패 시 저장된 예문으로 출제

## 기능별 경로

| 경로 | 기능 | 코드 |
| --- | --- | --- |
| `/` | 홈 (요약 · 복습할 단어 · 최근 시험) | `public/js/pages/home.js` |
| `/login/` | 로그인 · 회원가입 | `public/js/pages/login.js` |
| `/words/` | 단어장 (검색 · 정렬 · 발음 · 삭제) | `public/js/pages/words.js` |
| `/words/add/` | 단어 추가 + AI 뜻·예문, `?id=…`이면 수정 | `public/js/pages/word-form.js` |
| `/test/` | 시험 선택 | `public/js/pages/test-select.js` |
| `/test/choice/` | 5지선다 시험 | `public/js/pages/test-choice.js` |
| `/test/blank/` | AI 빈칸 시험 | `public/js/pages/test-blank.js` |

| API (Worker) | 설명 |
| --- | --- |
| `GET /api/config` | 브라우저용 Firebase 설정 (`FIREBASE_CONFIG`) |
| `GET /api/health` | 환경변수 설정 확인 |
| `POST /api/ai/word` | AI 뜻·예문 (로그인 토큰 필요) |
| `POST /api/ai/blank` | AI 빈칸 문제 (로그인 토큰 필요) |

Gemini 키(`AI_API`)는 Worker 안에만 있고, AI API는 Firebase ID 토큰을 검증한 뒤에만 호출됩니다.

## 설정

### Cloudflare (Workers & Pages → voca → 설정 → 변수 및 비밀)

| 이름 | 값 |
| --- | --- |
| `AI_API` | Gemini API 키 ([Google AI Studio](https://aistudio.google.com/apikey)), 비밀(Secret) 권장 |
| `FIREBASE_CONFIG` | Firebase 콘솔의 `firebaseConfig` (JSON 또는 `const firebaseConfig = {…}` 코드 그대로) |
| `GEMINI_MODEL` (선택) | 사용할 모델, 쉼표로 여러 개. 기본: `gemini-flash-latest` → `gemini-2.5-flash` → `gemini-flash-lite-latest` |

Git 연결로 배포: 빌드 명령 비움, 배포 명령 `npx wrangler deploy`. `keep_vars`가 켜져 있어 대시보드 변수가 유지됩니다.
배포 후 `/api/health`가 `"ok": true`인지 확인하세요.

### Firebase

1. Authentication → 로그인 방법: Google, 이메일/비밀번호 사용 설정
2. Authentication → 설정 → 승인된 도메인: Worker 주소(예: `voca.<계정>.workers.dev`) 추가
3. Realtime Database → 규칙: `users/$uid/voca`를 본인만 읽고 쓰도록 (`database.rules.json` 참고, 기존 규칙에 `voca` 부분만 추가)
4. `FIREBASE_CONFIG`에 `databaseURL`이 없으면 `https://<projectId>-default-rtdb.firebaseio.com`을 씁니다. 다른 지역이면 `databaseURL`을 꼭 넣으세요.

## 데이터 구조

```
users/{uid}/voca/words/{id}    word, meaning, partOfSpeech, pronunciation, examples[{sentence, translation}], memo,
                               correct, wrong, lastTestedAt, createdAt, updatedAt
users/{uid}/voca/results/{id}  type(choice|blank), total, correct, createdAt
```

## 개발

```bash
npm install
cp .dev.vars.example .dev.vars   # AI_API, FIREBASE_CONFIG 채우기
npm run dev                      # http://localhost:8787
npm test
```
