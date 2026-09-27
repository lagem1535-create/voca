// 화면 공통 도우미: 레이아웃(상단바·메뉴), 아이콘, 알림, 오류 화면
// 이 파일은 Firebase를 불러오지 않습니다. (Firebase 로딩 실패 화면도 여기서 그림)

import { locateTerm } from "../shared/text.js";

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const ICONS = {
  logo: '<rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" stroke="none"/><path d="M7.5 8 12 16.5 16.5 8" stroke="#fff"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v12h14V9"/><path d="M10 21v-6h4v6"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/><path d="M4 19.5A2 2 0 0 0 6 21h14"/><path d="M8.5 7.5h7M8.5 11h5"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  check: '<path d="M9 11.5 11.5 14 20 5.5"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sparkles: '<path d="M12 3.5 13.8 8 18.5 9.8 13.8 11.6 12 16.2 10.2 11.6 5.5 9.8 10.2 8z"/><path d="M18.5 15.5 19.3 17.4 21.2 18.2 19.3 19 18.5 20.9 17.7 19 15.8 18.2 17.7 17.4z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  google:
    '<g stroke="none"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></g>',
};

export function icon(name, className = "icon") {
  const viewBox = name === "google" ? "0 0 48 48" : "0 0 24 24";
  return `<svg class="${className}" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] ?? ""}</svg>`;
}

const NAV = [
  { key: "home", href: "/", label: "홈", icon: "home" },
  { key: "words", href: "/words/", label: "단어장", icon: "book" },
  { key: "add", href: "/words/add/", label: "단어 추가", icon: "plus" },
  { key: "test", href: "/test/", label: "시험", icon: "check" },
];

function appRoot() {
  return document.getElementById("app") ?? document.body;
}

/**
 * 로그인 후 화면의 공통 틀(상단바 + 메뉴)을 그리고 본문 영역(<main>)을 돌려줍니다.
 * @param {{ active: string, title: string, userName: string, userEmail?: string, onLogout: () => void }} options
 */
export function renderShell({ active, title, userName, userEmail = "", onLogout }) {
  document.title = title ? `${title} · Voca` : "Voca 단어장";
  appRoot().innerHTML = `
    <header class="topbar">
      <a class="brand" href="/">${icon("logo", "icon brand-mark")}<span>Voca</span></a>
      <nav class="nav" aria-label="주 메뉴">
        ${NAV.map(
          (item) => `<a class="nav-link${item.key === active ? " is-active" : ""}" href="${item.href}"${item.key === active ? ' aria-current="page"' : ""}>${icon(item.icon)}<span>${item.label}</span></a>`,
        ).join("")}
      </nav>
      <div class="account">
        <span class="account-name" title="${esc(userEmail)}">${esc(userName)}</span>
        <button type="button" class="icon-btn" data-action="logout" aria-label="로그아웃" title="로그아웃">${icon("logout")}</button>
      </div>
    </header>
    <main class="page" id="main" tabindex="-1"></main>`;
  const logoutButton = $('[data-action="logout"]');
  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
      await onLogout();
    } catch (err) {
      logoutButton.disabled = false;
      toast(err?.message || "로그아웃하지 못했습니다.", "error");
    }
  });
  showFlash();
  return $("#main");
}

/** 다음 페이지로 이동한 뒤에 보여줄 알림을 남깁니다. (예: 저장 후 목록으로 이동) */
export function flash(message, type = "success") {
  try {
    sessionStorage.setItem("voca:flash", JSON.stringify({ message, type }));
  } catch {
    // 저장 못 하면 알림만 생략
  }
}

function showFlash() {
  try {
    const raw = sessionStorage.getItem("voca:flash");
    if (!raw) return;
    sessionStorage.removeItem("voca:flash");
    const { message, type } = JSON.parse(raw);
    if (message) toast(message, type);
  } catch {
    // 무시
  }
}

/** 예문 속 목표 단어를 <mark>로 강조한 HTML */
export function highlight(sentence, word) {
  const text = String(sentence ?? "");
  const hit = locateTerm(text, word);
  if (!hit) return esc(text);
  return `${esc(text.slice(0, hit.index))}<mark>${esc(hit.text)}</mark>${esc(text.slice(hit.index + hit.text.length))}`;
}

export function exampleHtml(example, word) {
  return `<div class="example">
    <p class="example-sentence">${highlight(example.sentence, word)}</p>
    ${example.translation ? `<p class="example-translation">${esc(example.translation)}</p>` : ""}
  </div>`;
}

/** 오른쪽 아래(모바일은 위)에 잠깐 뜨는 알림 */
export function toast(message, type = "info") {
  let region = $(".toast-region");
  if (!region) {
    region = document.createElement("div");
    region.className = "toast-region";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
  }
  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.textContent = message;
  region.append(item);
  setTimeout(() => {
    item.classList.add("is-leaving");
    setTimeout(() => item.remove(), 300);
  }, type === "error" ? 5000 : 2800);
}

/** 버튼을 "처리 중" 상태로 바꾸고, 되돌리는 함수를 돌려줍니다. */
export function setBusy(button, label = "처리 중…") {
  if (!button) return () => {};
  const original = button.innerHTML;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${esc(label)}</span>`;
  return () => {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.innerHTML = original;
  };
}

export function loadingHtml(text = "불러오는 중…") {
  return `<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span><span>${esc(text)}</span></div>`;
}

/** 안내/빈 화면 카드 (actions는 HTML 문자열) */
export function messageHtml({ title, body = "", actions = "", tone = "" }) {
  return `<section class="card message ${tone ? `message-${tone}` : ""}">
    <h2>${esc(title)}</h2>
    ${body ? `<p>${esc(body)}</p>` : ""}
    ${actions ? `<div class="actions">${actions}</div>` : ""}
  </section>`;
}

/** 본문 영역에 오류 안내와 "다시 시도" 버튼을 그립니다. */
export function renderError(container, title, body, extraActions = "") {
  container.innerHTML = messageHtml({
    title,
    body,
    tone: "error",
    actions: `<button type="button" class="btn btn-primary" data-action="reload">${icon("refresh")}<span>다시 시도</span></button>${extraActions}`,
  });
  $('[data-action="reload"]', container).addEventListener("click", () => location.reload());
}

const dateTime = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
const timeOnly = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" });

export function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return `오늘 ${timeOnly.format(date)}`;
  if (date.toDateString() === yesterday.toDateString()) return `어제 ${timeOnly.format(date)}`;
  return dateTime.format(date);
}

/** localStorage 읽기/쓰기 (사생활 보호 모드 등에서 실패해도 무시) */
export const prefs = {
  get(key, fallback = null) {
    try {
      const value = localStorage.getItem(`voca:${key}`);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`voca:${key}`, JSON.stringify(value));
    } catch {
      // 저장 못 해도 동작에는 문제 없음
    }
  },
};

/** 시작 단계에서 복구할 수 없는 오류가 나면 전체 화면에 안내합니다. */
export function renderFatal(err) {
  const setup = err?.name === "SetupError";
  const moduleLoad = /import|module|fetch/i.test(String(err?.message || "")) && !setup;
  const title = setup ? "설정이 필요해요" : "화면을 불러오지 못했어요";
  const detail = err?.message || String(err);
  const help = setup
    ? `<ol class="help-list">
        <li>Cloudflare 대시보드 → Workers &amp; Pages → <b>voca</b> → 설정 → 변수 및 비밀</li>
        <li><code>FIREBASE_CONFIG</code>(Firebase 웹 설정, databaseURL 포함)와 <code>AI_API</code>(Gemini API 키)를 추가</li>
        <li>저장(배포) 후 이 페이지를 새로고침</li>
      </ol>
      <p class="muted">설정 상태는 <a href="/api/health" target="_blank" rel="noopener">/api/health</a>에서 확인할 수 있어요.</p>`
    : moduleLoad
      ? '<p class="muted">인터넷 연결을 확인해 주세요. 광고 차단 확장 프로그램이 Firebase(gstatic.com) 로딩을 막고 있을 수도 있어요.</p>'
      : "";
  document.title = `${title} · Voca`;
  appRoot().innerHTML = `
    <div class="center-page">
      <section class="card fatal">
        ${icon("logo", "icon fatal-logo")}
        <h1>${esc(title)}</h1>
        <p class="fatal-detail">${esc(detail)}</p>
        ${help}
        <div class="actions">
          <button type="button" class="btn btn-primary" data-action="reload">${icon("refresh")}<span>다시 시도</span></button>
          <a class="btn" href="/">홈으로</a>
        </div>
      </section>
    </div>`;
  $('[data-action="reload"]').addEventListener("click", () => location.reload());
}
