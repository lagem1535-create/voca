// 화면 도우미: DOM 만들기, 아이콘, 알림, 로딩, 발음 듣기, 시간 표시
// 사용자 데이터는 항상 텍스트 노드로 넣습니다(innerHTML 은 아이콘에만 사용).

const PROPS = new Set(["value", "checked", "disabled", "selected", "hidden", "indeterminate"]);

/** h("button", { class: "btn", onclick }, "텍스트", 자식노드…) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "style") {
      for (const [k, v] of Object.entries(value)) {
        if (k.startsWith("--")) el.style.setProperty(k, v);
        else el.style[k] = v;
      }
    } else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (PROPS.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
}

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  test: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  star: '<path d="m12 2.8 2.9 5.9 6.4.9-4.7 4.6 1.1 6.4L12 17.6l-5.7 3 1.1-6.4-4.7-4.6 6.4-.9z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  sparkles: '<path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  arrow: '<path d="M5 12h14M13 5l7 7-7 7"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  external: '<path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
};

export function icon(name, size = 20) {
  const span = document.createElement("span");
  span.className = "icon";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  return span;
}

export function toast(message, type = "info") {
  const box = document.querySelector(".toasts");
  if (!box) return;
  const el = h("div", { class: `toast ${type}`, role: type === "error" ? "alert" : "status" }, message);
  box.append(el);
  setTimeout(() => {
    el.classList.add("hide");
    setTimeout(() => el.remove(), 300);
  }, type === "error" ? 5000 : 2600);
}

export function loading(text = "불러오는 중…") {
  return h("div", { class: "loading", role: "status" }, h("span", { class: "spinner" }), h("span", {}, text));
}

const RULES_SNIPPET = `"users": {
  "$uid": {
    "voca": {
      ".read": "auth != null && auth.uid === $uid",
      ".write": "auth != null && auth.uid === $uid"
    }
  }
}`;

/** 오류 안내 상자. Realtime Database 규칙 오류면 추가할 규칙도 보여줍니다. */
export function errorBox(err, retry) {
  return h(
    "div",
    { class: "alert error stack", role: "alert" },
    h("strong", {}, err?.message || String(err)),
    err?.kind === "rules"
      ? h("div", { class: "stack-sm" },
          h("span", {}, "Realtime Database → 규칙의 users → $uid 안에 아래 voca 부분을 추가하고 게시하세요. (기존 규칙은 그대로 두세요)"),
          h("pre", { class: "code" }, RULES_SNIPPET))
      : null,
    retry ? h("div", {}, h("button", { type: "button", class: "btn small", onclick: retry }, icon("refresh", 16), "다시 시도")) : null,
  );
}

/** 버튼을 잠그고 로딩 표시를 한 뒤 fn 을 실행합니다. */
export async function withBusy(button, label, fn) {
  const before = [...button.childNodes];
  button.disabled = true;
  button.classList.add("busy");
  button.replaceChildren(h("span", { class: "spinner small" }), h("span", {}, label));
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.classList.remove("busy");
    button.replaceChildren(...before);
  }
}

const VOICE_LANG = { en: "en-US", ja: "ja-JP", zh: "zh-CN", es: "es-ES", fr: "fr-FR", de: "de-DE", it: "it-IT", ru: "ru-RU", pt: "pt-BR", vi: "vi-VN", th: "th-TH", id: "id-ID", ko: "ko-KR" };

/** 브라우저 음성으로 읽어 줍니다. */
export function speak(text, lang = "en") {
  if (!("speechSynthesis" in window)) {
    toast("이 브라우저는 발음 듣기를 지원하지 않아요.", "error");
    return;
  }
  speechSynthesis.cancel();
  const code = String(lang || "en");
  const u = new SpeechSynthesisUtterance(String(text));
  u.lang = VOICE_LANG[code] || code;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

export function speakButton(text, lang, label = "발음 듣기") {
  return h(
    "button",
    { type: "button", class: "btn icon ghost", "aria-label": label, title: label, onclick: (e) => { e.stopPropagation(); speak(text, lang); } },
    icon("volume", 18),
  );
}

export function timeAgo(ms) {
  if (!ms) return "";
  const sec = Math.round((Date.now() - ms) / 1000);
  if (sec < 60) return "방금 전";
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}일 전`;
  return new Date(ms).toLocaleDateString("ko-KR");
}

export function percent(value) {
  return value == null ? "–" : `${Math.round(value * 100)}%`;
}

/** 단어 목록이 비었을 때 등 빈 상태 안내 */
export function emptyState(title, text, ...actions) {
  return h("div", { class: "empty" }, h("p", { class: "empty-title" }, title), text ? h("p", { class: "muted" }, text) : null, actions.length ? h("div", { class: "btn-row center" }, actions) : null);
}
