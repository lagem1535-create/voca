// 시험 끝 화면 (5지선다·빈칸 공용)
import { saveResult } from "./store.js";
import { $, esc, toast } from "./ui.js";

/** answers = [{ id, ok }], words = 전체 단어, retry(wrongWords) = 틀린 문제 다시 */
export async function showResult(type, answers, words, retry) {
  try {
    await saveResult(type, answers, words);
  } catch (err) {
    toast(`기록 저장 실패: ${err.message}`, "bad");
  }
  const correct = answers.filter((a) => a.ok).length;
  const wrong = answers.filter((a) => !a.ok).map((a) => words.find((w) => w.id === a.id)).filter(Boolean);
  const pct = Math.round((correct / answers.length) * 100);
  $("#app").innerHTML = `
    <section class="card" style="text-align:center">
      <h1>${pct >= 80 ? "🎉" : pct >= 50 ? "👍" : "💪"} ${correct} / ${answers.length}</h1>
      <p class="muted">정답률 ${pct}%</p>
      <div class="row" style="justify-content:center">
        ${wrong.length ? '<button id="retry" class="primary" type="button">틀린 문제 다시 풀기</button>' : ""}
        <a class="btn" href="${location.pathname}${location.search}">새로 시작</a>
        <a class="btn" href="/test/">시험 선택</a>
      </div>
    </section>
    ${wrong.length ? `<section class="card"><h2>틀린 단어</h2>${wrong.map((w) => `<div><b>${esc(w.word)}</b> <span class="muted">${esc(w.meaning)}</span></div>`).join("")}</section>` : ""}`;
  $("#retry")?.addEventListener("click", () => retry(wrong));
}

export function readOptions() {
  const p = new URLSearchParams(location.search);
  return {
    count: Math.min(Math.max(Number(p.get("n")) || 10, 1), 50),
    scope: p.get("scope") || "all",
    direction: p.get("dir") || "w2m",
  };
}

export function progress(i, total) {
  return `<div class="progress"><div style="width:${(i / total) * 100}%"></div></div><p class="muted">${i + 1} / ${total}</p>`;
}

export function emptyMessage(scope) {
  $("#app").innerHTML = `<section class="card"><h2>문제로 낼 단어가 없어요</h2>
    <p class="muted">${scope === "all" ? "먼저 단어를 추가하세요." : "선택한 범위에 해당하는 단어가 없습니다."}</p>
    <div class="row"><a class="btn primary" href="/words/add/">단어 추가</a><a class="btn" href="/test/">시험 선택</a></div></section>`;
}
