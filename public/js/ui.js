// 화면 공통: 상단 메뉴, 알림, HTML 이스케이프, 발음
import { currentUser, firebase, signOut } from "./firebase.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const NAV = [
  ["/", "홈"],
  ["/words/", "단어장"],
  ["/words/add/", "단어 추가"],
  ["/test/", "시험"],
];

/** 상단 메뉴를 그리고 로그인 상태를 표시합니다. */
export async function layout() {
  const header = $("#nav");
  const here = location.pathname;
  header.innerHTML = `
    <a class="brand" href="/">📘 Voca</a>
    <nav>${NAV.map(([href, label]) => `<a href="${href}"${here === href ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
    <span class="user"></span>`;
  try {
    const user = await currentUser();
    const slot = $(".user", header);
    if (user) {
      slot.innerHTML = `<button class="link" type="button">로그아웃</button>`;
      $("button", slot).onclick = async () => {
        await signOut((await firebase()).auth);
        location.href = "/login/";
      };
    } else if (here !== "/login/") {
      slot.innerHTML = `<a href="/login/">로그인</a>`;
    }
  } catch (err) {
    showSetupError(err);
    throw err;
  }
}

export function showSetupError(err) {
  $("#app").innerHTML = `<section class="card error">
    <h2>설정이 필요해요</h2><p>${esc(err.message)}</p>
    <p class="muted">Cloudflare → Workers → voca → 설정 → 변수 및 비밀에 <code>FIREBASE_CONFIG</code>, <code>AI_API</code>를 넣고
    <a href="/api/health">/api/health</a>에서 확인하세요.</p></section>`;
}

let toastTimer;
export function toast(message, type = "") {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.append(el);
  }
  el.textContent = message;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), 3000);
}

export function speak(text) {
  if (!text || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = /[가-힣]/.test(text) ? "ko-KR" : "en-US";
  speechSynthesis.speak(u);
}

/** 버튼을 잠시 "처리 중" 상태로 두고 작업을 실행 */
export async function busy(button, label, task) {
  const old = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.textContent = old;
  }
}

/** 페이지 시작: 메뉴 → (로그인 확인) → 본문 실행. 오류는 화면에 표시 */
export async function start(run) {
  try {
    await layout();
    await run();
  } catch (err) {
    console.error(err);
    if (!$("#app .error")) $("#app").innerHTML = `<section class="card error"><p>${esc(err.message)}</p></section>`;
  }
}
