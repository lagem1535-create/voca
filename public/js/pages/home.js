// / — 홈: 단어 수, 복습이 필요한 단어, 최근 시험 기록

import { setupPage } from "../core/page.js";
import { displayName } from "../core/auth.js";
import { countWords, countWeakWords, listWeakWords, listResults, dbErrorMessage } from "../core/db.js";
import { esc, icon, loadingHtml, formatDate, renderError } from "../core/ui.js";

const TEST_NAMES = { choice: "5지선다", blank: "AI 빈칸" };

function statHtml(label, value) {
  return `<div class="card stat"><span class="stat-label">${esc(label)}</span><span class="stat-value">${esc(value)}</span></div>`;
}

export default async function mountHome() {
  const { user, main } = await setupPage({ active: "home", title: "홈" });
  main.innerHTML = loadingHtml();

  let total, weakCount, weakWords, results;
  try {
    [total, weakCount, weakWords, results] = await Promise.all([
      countWords(user.uid),
      countWeakWords(user.uid),
      listWeakWords(user.uid, 5),
      listResults(user.uid, 10),
    ]);
  } catch (err) {
    renderError(main, "단어장을 불러오지 못했어요", dbErrorMessage(err));
    return;
  }

  const asked = results.reduce((sum, result) => sum + (Number(result.total) || 0), 0);
  const right = results.reduce((sum, result) => sum + (Number(result.correct) || 0), 0);
  const rate = asked ? `${Math.round((right / asked) * 100)}%` : "-";
  const last = results[0];

  main.innerHTML = `
    <section class="card hero">
      <h1>안녕하세요, ${esc(displayName(user))}님</h1>
      <p>${total ? `단어 ${total}개를 모았어요. 오늘도 조금씩 복습해 볼까요?` : "단어만 입력하면 AI가 뜻과 예문을 채워 드려요. 첫 단어를 추가해 보세요!"}</p>
      <div class="actions">
        <a class="btn btn-light" href="/words/add/">${icon("plus")}<span>단어 추가</span></a>
        <a class="btn btn-outline-light" href="${total ? "/test/" : "/words/add/"}">${icon("check")}<span>시험 보기</span></a>
      </div>
    </section>

    <section class="stat-grid" aria-label="요약">
      ${statHtml("전체 단어", total)}
      ${statHtml("복습 필요", weakCount)}
      ${statHtml("최근 정답률", rate)}
      ${statHtml("최근 시험", last ? `${last.correct}/${last.total}` : "-")}
    </section>

    <section class="card">
      <div class="card-head">
        <h2 class="section-title">복습이 필요한 단어</h2>
        ${weakWords.length ? '<a class="btn btn-sm" href="/test/?scope=wrong">틀린 단어로 시험</a>' : ""}
      </div>
      ${
        weakWords.length
          ? `<ul class="list">${weakWords
              .map(
                (word) => `<li>
                  <div class="list-main"><strong>${esc(word.word)}</strong><span>${esc(word.meaning)}</span></div>
                  <span class="badge badge-ng">틀림 ${esc(word.wrong)}</span>
                </li>`,
              )
              .join("")}</ul>`
          : '<p class="muted">아직 틀린 단어가 없어요.</p>'
      }
    </section>

    <section class="card">
      <div class="card-head"><h2 class="section-title">최근 시험 기록</h2></div>
      ${
        results.length
          ? `<ul class="list">${results
              .slice(0, 5)
              .map(
                (result) => `<li>
                  <div class="list-main"><strong>${esc(TEST_NAMES[result.type] || "시험")}</strong><span>${esc(formatDate(result.createdAt))}</span></div>
                  <span class="badge ${result.correct === result.total ? "badge-ok" : ""}">${esc(result.correct)} / ${esc(result.total)}</span>
                </li>`,
              )
              .join("")}</ul>`
          : `<p class="muted">아직 본 시험이 없어요.${total ? ' <a href="/test/">첫 시험 보기</a>' : ""}</p>`
      }
    </section>`;
}
