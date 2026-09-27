// 5지선다·빈칸 시험이 함께 쓰는 화면 조각 (진행 막대, 결과 카드)

import { esc } from "./ui.js";
import { cheerMessage, scoreSummary } from "./quiz.js";

export function progressHtml({ index, total, correct }) {
  const percent = Math.round((index / total) * 100);
  return `<div class="quiz-top">
    <span class="quiz-count"><strong>${index + 1}</strong> / ${total}</span>
    <div class="progress" role="progressbar" aria-label="진행률" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${index}"><span style="width:${percent}%"></span></div>
    <span class="quiz-score">정답 ${correct}</span>
  </div>`;
}

/**
 * 결과 화면
 * @param {{ title: string, answers: { correct: boolean }[], wrongWords: { word: string, meaning: string }[] }} data
 */
export function resultHtml({ title, answers, wrongWords }) {
  const { total, correct, rate } = scoreSummary(answers);
  return `
    <section class="card result">
      <p class="result-label">${esc(title)} 결과</p>
      <p class="result-score"><strong>${correct}</strong><span>/ ${total}</span></p>
      <div class="meter" aria-hidden="true"><span style="width:${rate}%"></span></div>
      <p class="result-rate">정답률 ${rate}% · ${esc(cheerMessage(rate))}</p>
      <p class="save-status muted" aria-live="polite">결과를 저장하는 중…</p>
      <div class="actions">
        ${wrongWords.length ? `<button type="button" class="btn btn-primary" data-action="retry-wrong">틀린 ${wrongWords.length}문제 다시 풀기</button>` : ""}
        <a class="btn" href="/test/">다른 시험 보기</a>
        <a class="btn btn-ghost" href="/words/">단어장</a>
      </div>
    </section>
    ${
      wrongWords.length
        ? `<section class="card">
            <h2 class="section-title">틀린 단어</h2>
            <ul class="wrong-list">${wrongWords.map((word) => `<li><strong>${esc(word.word)}</strong><span>${esc(word.meaning)}</span></li>`).join("")}</ul>
          </section>`
        : ""
    }`;
}
