// 앱 시작점: Firebase 준비 → 로그인 상태 확인 → 주소에 맞는 페이지 표시
import { initFirebase, auth, onAuthStateChanged, signOut, SetupError } from "./firebase.js";
import { setUser } from "./store.js";
import { startRouter, render } from "./router.js";
import { h, icon, toast } from "./ui.js";

const view = document.getElementById("view");
let currentUser = null;
let started = false;

function updateChrome(user) {
  for (const el of document.querySelectorAll("[data-signed-in]")) el.hidden = !user;
  document.body.classList.toggle("signed-in", Boolean(user));
  const name = document.querySelector("[data-account-name]");
  if (name) name.textContent = user ? user.displayName || user.email || "" : "";
}

function showStartError(err) {
  const setup = err instanceof SetupError;
  view.replaceChildren(
    h(
      "div",
      { class: "page" },
      h(
        "div",
        { class: "card stack" },
        h("h1", { class: "page-title" }, setup ? "설정이 필요해요" : "앱을 시작하지 못했어요"),
        h("div", { class: "alert error" }, err.message),
        setup
          ? h(
              "ol",
              { class: "steps" },
              h("li", {}, "Cloudflare 대시보드 → Workers & Pages → voca → 설정 → 변수 및 비밀"),
              h("li", {}, "FIREBASE_CONFIG 에 Firebase 웹 앱의 firebaseConfig(JSON 또는 콘솔 코드 그대로), AI_API 에 Gemini API 키를 넣고 배포"),
              h("li", {}, h("a", { href: "/api/health", target: "_blank", rel: "noopener" }, "/api/health"), " 에서 설정 상태를 확인할 수 있어요."),
            )
          : null,
        h("div", {}, h("button", { type: "button", class: "btn primary", onclick: () => location.reload() }, icon("refresh", 18), "다시 시도")),
      ),
    ),
  );
}

async function boot() {
  try {
    await initFirebase();
  } catch (err) {
    console.error(err);
    showStartError(err);
    return;
  }

  document.querySelector("[data-logout]")?.addEventListener("click", async () => {
    try {
      await signOut(auth());
      toast("로그아웃했어요.");
    } catch (err) {
      toast(err.message, "error");
    }
  });

  onAuthStateChanged(auth(), (user) => {
    currentUser = user;
    setUser(user);
    updateChrome(user);
    if (!started) {
      started = true;
      startRouter({ view, getUser: () => currentUser });
    } else {
      render();
    }
  });
}

boot();
