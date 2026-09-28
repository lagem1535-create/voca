// / — 홈: 학습 요약, 복습할 단어, 최근 시험
import { h, icon, loading, errorBox, emptyState, timeAgo, percent } from "../ui.js";
import { watchWords, watchResults } from "../store.js";
import { summarize, needsReview } from "../quiz.js";

const TYPE_LABEL = { choice: "5지선다", blank: "AI 빈칸" };

function stat(value, label, href) {
  return h("a", { class: "stat", href }, h("span", { class: "stat-value" }, String(value)), h("span", { class: "stat-label" }, label));
}

export default function mount(root, { user, signal }) {
  const name = user.displayName || (user.email || "").split("@")[0] || "학습자";
  const summary = h("div", { class: "stack" }, loading());
  const results = h("section", { class: "card stack-sm" }, h("h2", { class: "card-title" }, "최근 시험"), h("p", { class: "muted small" }, "불러오는 중…"));

  root.append(
    h("div", { class: "page-head" }, h("div", {}, h("h1", { class: "page-title" }, `${name}님, 안녕하세요`), h("p", { class: "muted" }, "오늘도 조금씩 외워 봐요."))),
    summary,
    results,
  );

  watchWords((s) => {
    if (s.status === "error") {
      summary.replaceChildren(errorBox(s.error, () => location.reload()));
      return;
    }
    const words = s.words;
    if (!words.length) {
      summary.replaceChildren(
        h(
          "section",
          { class: "card" },
          emptyState(
            "첫 단어를 추가해 보세요",
            "단어만 입력하면 AI 가 뜻 · 품사 · 발음 · 예문을 채워 줘요. 5개 이상 모이면 5지선다 시험도 볼 수 있어요.",
            h("a", { class: "btn primary", href: "/words/add" }, icon("plus", 18), "단어 추가"),
            h("a", { class: "btn", href: "/words/add?mode=bulk" }, "여러 단어 한 번에"),
          ),
        ),
      );
      return;
    }

    const sum = summarize(words);
    const review = words
      .filter(needsReview)
      .sort((a, b) => b.wrong - a.wrong || (b.lastTestedAt || 0) - (a.lastTestedAt || 0))
      .slice(0, 5);

    summary.replaceChildren(
      h(
        "div",
        { class: "stats" },
        stat(sum.total, "전체 단어", "/words"),
        stat(sum.review, "복습 필요", "/words?filter=review"),
        stat(sum.mastered, "외운 단어", "/words?filter=mastered"),
        stat(percent(sum.accuracy), "정답률", "/test"),
      ),
      h(
        "div",
        { class: "quick" },
        h("a", { class: "quick-card primary", href: "/test" }, icon("test", 24), h("strong", {}, "시험 보기"), h("span", {}, "5지선다 · AI 빈칸")),
        h("a", { class: "quick-card", href: "/words/add" }, icon("sparkles", 24), h("strong", {}, "단어 추가"), h("span", {}, "AI 뜻 · 예문")),
      ),
      review.length
        ? h(
            "section",
            { class: "card stack-sm" },
            h("div", { class: "card-head" }, h("h2", { class: "card-title" }, "복습이 필요한 단어"), h("a", { class: "small", href: "/words?filter=review" }, "모두 보기")),
            h(
              "ul",
              { class: "mini-list" },
              review.map((w) =>
                h("li", {}, h("strong", { lang: w.lang }, w.word), h("span", { class: "muted" }, w.meaning), h("span", { class: "tag danger" }, `틀림 ${w.wrong}`)),
              ),
            ),
            h(
              "div",
              { class: "btn-row" },
              h("a", { class: "btn primary small", href: "/test/choice?scope=review&count=10&dir=w2m" }, "5지선다로 복습"),
              h("a", { class: "btn small", href: "/test/blank?scope=review&count=10" }, "AI 빈칸으로 복습"),
            ),
          )
        : sum.fresh
          ? h("div", { class: "alert info" }, `아직 시험을 안 본 단어가 ${sum.fresh}개 있어요. `, h("a", { href: "/test?scope=new" }, "시험 보러 가기"))
          : null,
    );
  }, signal);

  watchResults(
    5,
    (list, err) => {
      const title = h("h2", { class: "card-title" }, "최근 시험");
      if (err) {
        results.replaceChildren(title, errorBox(err));
        return;
      }
      results.replaceChildren(
        title,
        list.length
          ? h(
              "ul",
              { class: "mini-list" },
              list.map((r) =>
                h(
                  "li",
                  {},
                  h("strong", {}, TYPE_LABEL[r.type] || r.type),
                  h("span", {}, `${r.correct}/${r.total} (${r.total ? Math.round((r.correct / r.total) * 100) : 0}%)`),
                  h("span", { class: "muted small" }, timeAgo(r.createdAt)),
                ),
              ),
            )
          : h("p", { class: "muted small" }, "아직 시험 기록이 없어요."),
      );
    },
    signal,
  );
}
