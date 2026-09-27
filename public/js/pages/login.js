// /login/ — Firebase 로그인 (Google · 이메일/비밀번호)

import {
  getFirebase,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from "../core/firebase.js";
import { getCurrentUser, safeNext, authErrorMessage } from "../core/auth.js";
import { $, $$, icon, setBusy, toast } from "../core/ui.js";

const SILENT_ERRORS = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request"]);

// 카카오톡 등 앱 안의 브라우저(WebView)에서는 Google이 로그인을 막습니다.
function inAppNotice() {
  const ua = navigator.userAgent || "";
  if (!/KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|; wv\)/i.test(ua)) return "";
  const kakao = /KAKAOTALK/i.test(ua)
    ? ` <a href="kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}">기본 브라우저로 열기</a>`
    : "";
  return `<p class="notice">앱 안의 브라우저에서는 Google 로그인이 막힐 수 있어요. 크롬·사파리 같은 기본 브라우저로 열거나 이메일로 로그인해 주세요.${kakao}</p>`;
}

export default async function mountLogin() {
  const next = safeNext(new URLSearchParams(location.search).get("next"));
  if (await getCurrentUser()) {
    location.replace(next);
    return;
  }
  const { auth } = await getFirebase();

  document.title = "로그인 · Voca";
  document.getElementById("app").innerHTML = `
    <div class="center-page">
      <section class="card auth-card">
        <div class="auth-brand">
          ${icon("logo")}
          <h1>Voca</h1>
          <p>AI가 뜻과 예문을 채워 주는 나만의 단어장</p>
        </div>
        ${inAppNotice()}
        <button type="button" class="btn btn-google btn-block btn-lg" data-action="google">${icon("google")}<span>Google로 계속하기</span></button>
        <div class="divider">또는 이메일로</div>
        <div class="tabs" role="tablist" aria-label="이메일 로그인 방식">
          <button type="button" role="tab" aria-selected="true" data-mode="login">로그인</button>
          <button type="button" role="tab" aria-selected="false" data-mode="signup">회원가입</button>
        </div>
        <form class="stack auth-form" novalidate>
          <label class="field" data-signup-only hidden>이름
            <input name="displayName" autocomplete="nickname" maxlength="30" placeholder="단어장에 표시될 이름 (선택)" />
          </label>
          <label class="field">이메일
            <input name="email" type="email" autocomplete="email" inputmode="email" required placeholder="you@example.com" />
          </label>
          <label class="field">비밀번호
            <input name="password" type="password" autocomplete="current-password" required minlength="6" placeholder="6자 이상" />
          </label>
          <p class="form-error" role="alert" hidden></p>
          <button type="submit" class="btn btn-primary btn-block btn-lg">로그인</button>
          <p class="auth-footer" data-login-only>
            <button type="button" class="link-btn" data-action="reset">비밀번호를 잊으셨나요?</button>
          </p>
        </form>
      </section>
    </div>`;

  const form = $(".auth-form");
  const field = (name) => form.elements.namedItem(name);
  const errorBox = $(".form-error", form);
  const submit = $('button[type="submit"]', form);
  let mode = "login";

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };
  const hideError = () => {
    errorBox.hidden = true;
  };

  function setMode(nextMode) {
    mode = nextMode;
    $$("[data-mode]").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.mode === mode)));
    $$("[data-signup-only]").forEach((el) => (el.hidden = mode !== "signup"));
    $$("[data-login-only]").forEach((el) => (el.hidden = mode !== "login"));
    field("password").autocomplete = mode === "signup" ? "new-password" : "current-password";
    submit.textContent = mode === "signup" ? "가입하고 시작하기" : "로그인";
    hideError();
  }

  $$("[data-mode]").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));

  $('[data-action="google"]').addEventListener("click", async (event) => {
    hideError();
    const done = setBusy(event.currentTarget, "Google 로그인 중…");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      location.replace(next);
    } catch (err) {
      done();
      if (!SILENT_ERRORS.has(err?.code)) showError(authErrorMessage(err));
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideError();
    const email = field("email").value.trim();
    const password = field("password").value;
    if (!email || !password) {
      showError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      showError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    const done = setBusy(submit, mode === "signup" ? "가입하는 중…" : "로그인하는 중…");
    try {
      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const displayName = field("displayName").value.trim();
        if (displayName) await updateProfile(credential.user, { displayName });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      location.replace(next);
    } catch (err) {
      done();
      showError(authErrorMessage(err));
    }
  });

  $('[data-action="reset"]').addEventListener("click", async (event) => {
    hideError();
    const email = field("email").value.trim();
    if (!email) {
      showError("비밀번호를 재설정할 이메일을 먼저 입력해 주세요.");
      field("email").focus();
      return;
    }
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await sendPasswordResetEmail(auth, email);
      toast("비밀번호 재설정 메일을 보냈어요. 메일함을 확인해 주세요.", "success");
    } catch (err) {
      showError(authErrorMessage(err));
    } finally {
      button.disabled = false;
    }
  });
}
