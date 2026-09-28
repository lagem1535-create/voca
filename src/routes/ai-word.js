// POST /api/ai/word — AI 뜻·품사·발음·예문
//   요청: { "words": ["abandon", "take off"] }  또는  { "word": "abandon" }
//   응답: { "items": [{ input, word, lang, meaning, pos, pronunciation, examples: [{sentence, translation}] }], "missing": [] }
import { HttpError, json, readJson } from "../lib/http.js";
import { requireUser } from "../lib/auth.js";
import { generateJson } from "../lib/gemini.js";
import { runInChunks } from "../lib/batch.js";
import { uniqueTerms } from "../../public/js/shared/text.js";
import { WORD_SCHEMA, buildWordPrompt, sanitizeWordItems } from "../ai/word.js";

export const MAX_WORDS = 30;
const CHUNK = 10;

export async function handleAiWord(request, env) {
  await requireUser(request, env);
  const body = await readJson(request);
  const words = uniqueTerms((Array.isArray(body.words) ? body.words : [body.word]).filter((w) => typeof w === "string"));
  if (!words.length) throw new HttpError(400, "단어를 입력하세요.");
  if (words.length > MAX_WORDS) throw new HttpError(400, `한 번에 ${MAX_WORDS}개까지 만들 수 있습니다.`);

  const { items, missing, error } = await runInChunks(words, CHUNK, async (chunk) => {
    const data = await generateJson(env, { prompt: buildWordPrompt(chunk), schema: WORD_SCHEMA });
    return sanitizeWordItems(data.items, chunk);
  });
  if (!items.length) throw error ?? new HttpError(502, "AI 가 뜻을 찾지 못했습니다. 철자를 확인하세요.");
  return json({ items, missing });
}
