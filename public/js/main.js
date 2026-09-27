// 모든 페이지의 시작점: <body data-page="..."> 에 맞는 기능 모듈을 불러옵니다.
// 페이지(기능)별 코드는 js/pages/ 에 있습니다.

import { loadConfig } from "./core/config.js";
import { renderFatal } from "./core/ui.js";

const pages = {
  home: () => import("./pages/home.js"),
  login: () => import("./pages/login.js"),
  words: () => import("./pages/words.js"),
  "word-add": () => import("./pages/word-form.js"),
  "word-edit": () => import("./pages/word-form.js"),
  "test-select": () => import("./pages/test-select.js"),
  "test-choice": () => import("./pages/test-choice.js"),
  "test-blank": () => import("./pages/test-blank.js"),
};

const page = document.body.dataset.page;
loadConfig().catch(() => {}); // Firebase SDK를 받는 동안 설정도 미리 요청 (오류는 페이지에서 처리)

try {
  const load = pages[page];
  if (!load) throw new Error(`알 수 없는 페이지입니다: ${page}`);
  const module = await load();
  await module.default({ page });
} catch (err) {
  console.error(err);
  renderFatal(err);
}
