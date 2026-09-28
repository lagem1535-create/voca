// 시험 화면 공통 조각: 진행 표시, 결과 화면, 시험을 볼 수 없을 때 안내
import { h, icon, emptyState } from "../ui.js";
import { SCOPES } from "../quiz.js";

export function quizHeader(index, total, score) {
  return h(
    "div",
    { class: "quiz-head" },
    h("div", { class: "quiz-meta" }, h("strong", {}, `${index + 1} / ${total}`), h("span", { class: "muted" }, `정답 ${score}`)),
    h(
      "div",
      { class: "progress", role: "progressbar", "aria-label": "진행", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(index) },
      h("div", { class: "progress-bar", style: { width: `${(index / total) * 100}%` } }),
    ),
  );
}

function cheer(pct) {
  if (pct === 100) return "완벽해요! 🎉";
  if (pct >= 80) return "아주 잘했어요! 👏";
  if (pct >= 50) return "좋아요. 틀린 단어만 한 번 더 풀어 볼까요?";
  return "괜찮아요. 복습하면 금방 늘어요 💪";
}

/**
 * @param {{title: string, total: number, correct: number, wrongWords: object[], onRetryWrong: Function, onRetryAll: Function}} p
 */
export function resultView({ title, total, correct, wrongWords, onRetryWrong, onRetryAll }) {
  const pct = total ? Math.round((correct / total) * 100) : 0;
  return h(
    "div",
    { class: "stack" },
    h(
      "section",
      { class: "card result center stack-sm" },
      h("p", { class: "muted" }, title),
      h("div", { class: "score-ring", style: { "--p": String(pct) } }, h("strong", {}, `${pct}%`)),
      h("p", { class: "result-line" }, `${total}문제 중 ${correct}개 정답`),
      h("p", { class: "muted" }, cheer(pct)),
    ),
    wrongWords.length
      ? h(
          "section",
          { class: "card stack-sm" },
          h("h2", { class: "card-title" }, `틀린 단어 ${wrongWords.length}개`),
          h("ul", { class: "mini-list" }, wrongWords.map((w) => h("li", {}, h("strong", { lang: w.lang }, w.word), h("span", { class: "muted" }, w.meaning)))),
        )
      : null,
    h(
      "div",
      { class: "btn-row" },
      wrongWords.length ? h("button", { type: "button", class: "btn primary", onclick: onRetryWrong }, icon("refresh", 18), "틀린 단어 다시 풀기") : null,
      h("button", { type: "button", class: `btn${wrongWords.length ? "" : " primary"}`, onclick: onRetryAll }, "새 문제로 한 번 더"),
      h("a", { class: "btn", href: "/test" }, "다른 시험"),
      h("a", { class: "btn ghost", href: "/" }, "홈"),
    ),
  );
}

/** 범위에 단어가 없거나 단어가 부족할 때 */
export function cannotStart(message, scope) {
  return emptyState(
    "시험을 시작할 수 없어요",
    message || `'${SCOPES[scope]?.label ?? scope}' 범위에 단어가 없어요.`,
    h("a", { class: "btn primary", href: "/test" }, "시험 선택으로"),
    h("a", { class: "btn", href: "/words/add" }, "단어 추가"),
  );
}

/** 시험을 풀 때 쓰는 키보드 도우미: 입력칸에서 누른 키는 무시 */
export function isTypingTarget(e) {
  const t = e.target;
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}
