// 기능별 경로 → 페이지 모듈 (public/js/pages/*.js)
// 서버는 파일이 없는 경로에 index.html 을 돌려주고(wrangler.jsonc: single-page-application),
// 여기서 주소에 맞는 페이지를 띄웁니다.
import { errorBox } from "./ui.js";

export const routes = [
  { path: "/", title: "홈", load: () => import("./pages/home.js") },
  { path: "/login", title: "로그인", guest: true, load: () => import("./pages/login.js") },
  { path: "/words", title: "단어장", load: () => import("./pages/words.js") },
  { path: "/words/add", title: "단어 추가", load: () => import("./pages/word-add.js") },
  { path: "/words/edit", title: "단어 수정", load: () => import("./pages/word-edit.js") },
  { path: "/test", title: "시험 선택", load: () => import("./pages/test-select.js") },
  { path: "/test/choice", title: "5지선다 시험", load: () => import("./pages/test-choice.js") },
  { path: "/test/blank", title: "AI 빈칸 시험", load: () => import("./pages/test-blank.js") },
];
const notFound = { path: null, title: "페이지 없음", open: true, load: () => import("./pages/not-found.js") };

let view = null;
let getUser = () => null;
let current = null;

export function normalizePath(pathname) {
  const p = pathname.replace(/\/{2,}/g, "/").replace(/\/index\.html$/, "/");
  return p.length > 1 ? p.replace(/\/+$/, "") : "/";
}

/** 로그인 후 돌아갈 주소 — 같은 사이트 경로만 허용 */
export function safeNext(next) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export function navigate(to, { replace = false } = {}) {
  const url = new URL(to, location.origin);
  if (url.origin !== location.origin) {
    location.href = url.href;
    return;
  }
  const target = url.pathname + url.search + url.hash;
  if (replace) history.replaceState(null, "", target);
  else if (target !== location.pathname + location.search + location.hash) history.pushState(null, "", target);
  render({ scrollTop: !replace });
}

function markActive(path) {
  for (const a of document.querySelectorAll("[data-nav]")) a.removeAttribute("aria-current");
  const navs = [...new Set([...document.querySelectorAll("[data-nav]")].map((a) => a.dataset.nav))];
  const best = navs
    .filter((n) => path === n || (n !== "/" && path.startsWith(`${n}/`)))
    .sort((a, b) => b.length - a.length)[0];
  if (best) for (const a of document.querySelectorAll(`[data-nav="${best}"]`)) a.setAttribute("aria-current", "page");
}

export async function render({ scrollTop = false } = {}) {
  const path = normalizePath(location.pathname);
  if (path !== location.pathname) history.replaceState(null, "", path + location.search + location.hash);
  const params = new URLSearchParams(location.search);
  const route = routes.find((r) => r.path === path) ?? notFound;
  const user = getUser();

  if (!route.guest && !route.open && !user) {
    navigate(`/login?next=${encodeURIComponent(path + location.search)}`, { replace: true });
    return;
  }
  if (route.guest && user) {
    navigate(safeNext(params.get("next")), { replace: true });
    return;
  }

  current?.abort();
  const controller = new AbortController();
  current = controller;

  document.title = `${route.title} · Voca`;
  markActive(path);
  const page = document.createElement("div");
  page.className = "page";
  view.replaceChildren(page);
  if (scrollTop) window.scrollTo(0, 0);

  try {
    const mod = await route.load();
    if (controller.signal.aborted) return;
    await mod.default(page, { user, query: params, navigate, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) return;
    console.error(err);
    page.replaceChildren(errorBox(err, () => render()));
  }
}

function onLinkClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest("a[href]");
  if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download") || a.origin !== location.origin) return;
  if (a.pathname.startsWith("/api/")) return;
  e.preventDefault();
  navigate(a.pathname + a.search + a.hash);
}

export function startRouter(options) {
  view = options.view;
  getUser = options.getUser;
  document.addEventListener("click", onLinkClick);
  window.addEventListener("popstate", () => render());
  render();
}
