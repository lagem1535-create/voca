// /login — Firebase 로그인 (Google · 이메일/비밀번호)
import {
  auth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "../firebase.js";
import { h, icon, toast, withBusy } from "../ui.js";

const SAME = "이메일 또는 비밀번호가 올바르지 않습니다.";
const MESSAGES = {
  "auth/invalid-credential": SAME,
  "auth/invalid-login-credentials": SAME,
  "auth/wrong-password": SAME,
  "auth/user-not-found": "가입되지 않은 이메일입니다. 회원가입을 해 주세요.",
  "auth/invalid-email": "이메일 형식이 올바르지 않습니다.",
  "auth/missing-email": "이메일을 입력하세요.",
  "auth/missing-password": "비밀번호를 입력하세요.",
  "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
  "auth/email-already-in-use": "이미 가입된 이메일입니다. 로그인해 주세요.",
  "auth/too-many-requests": "시도가 너무 많습니다. 잠시 후 다시 시도하세요.",
  "auth/network-request-failed": "네트워크 오류입니다. 인터넷 연결을 확인하세요.",
  "auth/user-disabled": "사용 중지된 계정입니다.",
  "auth/account-exists-with-different-credential": "같은 이메일이 다른 방식(예: 이메일/비밀번호)으로 가입되어 있어요. 그 방식으로 로그인하세요.",
  "auth/operation-not-allowed": "이 로그인 방식이 꺼져 있습니다. Firebase 콘솔 → Authentication → 로그인 방법에서 사용 설정하세요.",
  "auth/configuration-not-found": "Firebase Authentication 이 아직 설정되지 않았습니다. 콘솔에서 Authentication 을 시작하고 로그인 방법을 켜세요.",
  "auth/invalid-api-key": "FIREBASE_CONFIG 의 apiKey 가 올바르지 않습니다.",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "FIREBASE_CONFIG 의 apiKey 가 올바르지 않습니다.",
  "auth/web-storage-unsupported": "이 브라우저 설정에서는 로그인할 수 없어요. 쿠키·사이트 데이터 차단을 풀거나 다른 브라우저를 사용하세요.",
  "auth/operation-not-supported-in-this-environment": "이 브라우저에서는 Google 로그인을 할 수 없어요. 다른 브라우저로 열거나 이메일로 로그인하세요.",
};
const SILENT = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);

export function authMessage(err) {
  if (err?.code === "auth/unauthorized-domain") {
    return `이 주소(${location.hostname})가 Firebase 승인된 도메인에 없습니다. Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 추가하세요.`;
  }
  return MESSAGES[err?.code] || err?.message || "로그인에 실패했습니다.";
}

function inAppBrowser() {
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return "kakao";
  if (/NAVER\(inapp|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|everytimeApp|; wv\)/i.test(ua)) return /Android/i.test(ua) ? "android" : "ios";
  return null;
}

function openExternal(kind) {
  const url = location.href;
  if (kind === "kakao") location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
  else if (kind === "android") location.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;end`;
  else {
    navigator.clipboard?.writeText(url).then(
      () => toast("주소를 복사했어요. Safari 나 Chrome 에 붙여넣어 여세요."),
      () => toast("메뉴의 'Safari로 열기'를 눌러 주세요."),
    );
  }
}

const GOOGLE_LOGO =
  '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z"/></svg>';

export default function mount(root, { query }) {
  let mode = query.get("mode") === "signup" ? "signup" : "signin";

  const errorEl = h("div", { class: "alert error", role: "alert", hidden: true });
  const infoEl = h("div", { class: "alert success", role: "status", hidden: true });
  const showError = (err) => {
    if (SILENT.has(err?.code)) return;
    console.warn(err);
    infoEl.hidden = true;
    errorEl.textContent = authMessage(err);
    errorEl.hidden = false;
  };
  const showInfo = (text) => {
    errorEl.hidden = true;
    infoEl.textContent = text;
    infoEl.hidden = false;
  };

  // Google 로그인: 팝업 → 팝업이 막히면 페이지 이동(리다이렉트) 방식
  const googleBtn = h("button", { type: "button", class: "btn google block" });
  const googleLabel = h("span", {}, "Google 계정으로 계속하기");
  const googleLogo = h("span", { class: "icon" });
  googleLogo.innerHTML = GOOGLE_LOGO;
  googleBtn.append(googleLogo, googleLabel);
  googleBtn.addEventListener("click", () =>
    withBusy(googleBtn, "Google 로그인 중…", async () => {
      errorEl.hidden = true;
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        await signInWithPopup(auth(), provider);
      } catch (err) {
        if (err?.code === "auth/popup-blocked") await signInWithRedirect(auth(), provider).catch(showError);
        else showError(err);
      }
    }),
  );
  getRedirectResult(auth()).catch(showError);

  // 이메일 로그인 / 회원가입
  const email = h("input", { class: "input", type: "email", name: "email", autocomplete: "email", required: true, placeholder: "you@example.com" });
  const password = h("input", { class: "input", type: "password", name: "password", required: true, minlength: 6, placeholder: "6자 이상" });
  const submit = h("button", { type: "submit", class: "btn primary block" });
  const tabIn = h("button", { type: "button", role: "tab" }, "로그인");
  const tabUp = h("button", { type: "button", role: "tab" }, "회원가입");
  const resetBtn = h("button", { type: "button", class: "link-btn" }, "비밀번호를 잊으셨나요?");

  function setMode(next) {
    mode = next;
    tabIn.setAttribute("aria-selected", String(mode === "signin"));
    tabUp.setAttribute("aria-selected", String(mode === "signup"));
    submit.textContent = mode === "signup" ? "이메일로 회원가입" : "이메일로 로그인";
    password.autocomplete = mode === "signup" ? "new-password" : "current-password";
    resetBtn.hidden = mode === "signup";
    errorEl.hidden = true;
  }
  tabIn.addEventListener("click", () => setMode("signin"));
  tabUp.addEventListener("click", () => setMode("signup"));
  setMode(mode);

  const form = h(
    "form",
    { class: "stack", novalidate: true },
    h("div", { class: "seg", role: "tablist", "aria-label": "로그인 방식" }, tabIn, tabUp),
    h("label", { class: "field" }, h("span", { class: "field-label" }, "이메일"), email),
    h("label", { class: "field" }, h("span", { class: "field-label" }, "비밀번호"), password),
    submit,
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const address = email.value.trim();
    if (!address) return showError({ code: "auth/missing-email" });
    if (!password.value) return showError({ code: "auth/missing-password" });
    return withBusy(submit, mode === "signup" ? "가입하는 중…" : "로그인 중…", async () => {
      errorEl.hidden = true;
      try {
        if (mode === "signup") await createUserWithEmailAndPassword(auth(), address, password.value);
        else await signInWithEmailAndPassword(auth(), address, password.value);
      } catch (err) {
        showError(err);
      }
    });
  });

  resetBtn.addEventListener("click", async () => {
    const address = email.value.trim();
    if (!address) {
      email.focus();
      return showError({ code: "auth/missing-email" });
    }
    try {
      await sendPasswordResetEmail(auth(), address);
      showInfo(`${address} 로 비밀번호 재설정 메일을 보냈어요. (가입된 이메일인 경우)`);
    } catch (err) {
      showError(err);
    }
  });

  const inApp = inAppBrowser();
  const inAppNotice = inApp
    ? h(
        "div",
        { class: "alert warn stack-sm" },
        h("strong", {}, "앱 안의 브라우저에서는 Google 로그인이 막혀 있어요."),
        h("span", {}, "기본 브라우저로 열거나 이메일로 로그인하세요."),
        h("div", {}, h("button", { type: "button", class: "btn small", onclick: () => openExternal(inApp) }, icon("external", 16), inApp === "ios" ? "주소 복사하기" : "기본 브라우저로 열기")),
      )
    : null;

  root.classList.add("login-page");
  root.append(
    h(
      "section",
      { class: "login-hero" },
      h("img", { src: "/favicon.svg", alt: "", width: 64, height: 64 }),
      h("h1", {}, "AI 단어장 ", h("span", { class: "accent" }, "Voca")),
      h("p", { class: "muted" }, "단어만 입력하면 AI 가 뜻과 예문을 채워 주고, 5지선다와 AI 빈칸 시험으로 복습해요."),
      h(
        "ul",
        { class: "feature-list" },
        h("li", {}, icon("sparkles", 18), "AI 뜻 · 예문 자동 완성"),
        h("li", {}, icon("list", 18), "5지선다 시험"),
        h("li", {}, icon("edit", 18), "AI 빈칸 시험"),
      ),
    ),
    h(
      "section",
      { class: "card login-card stack" },
      inAppNotice,
      googleBtn,
      h("div", { class: "divider" }, h("span", {}, "또는 이메일")),
      form,
      resetBtn,
      errorEl,
      infoEl,
    ),
  );
}
