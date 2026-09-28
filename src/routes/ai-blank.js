// POST /api/ai/blank — AI 빈칸 문제
//   요청: { "items": [{ id, word, meaning, pos }] }
//   응답: { "items": [{ id, sentence(빈칸 "_____" 포함), answer, translation }], "missing": [id…] }
import { HttpError, json, readJson } from "../lib/http.js";
import { requireUser } from "../lib/auth.js";
import { generateJson } from "../lib/gemini.js";
import { runInChunks } from "../lib/batch.js";
import { BLANK_SCHEMA, buildBlankPrompt, cleanBlankInputs, sanitizeBlankItems } from "../ai/blank.js";

export const MAX_ITEMS = 30;
const CHUNK = 10;

export async function handleAiBlank(request, env) {
  await requireUser(request, env);
  const body = await readJson(request);
  if (Array.isArray(body.items) && body.items.length > MAX_ITEMS) {
    throw new HttpError(400, `한 번에 ${MAX_ITEMS}문제까지 만들 수 있습니다.`);
  }
  const inputs = cleanBlankInputs(body.items, MAX_ITEMS);
  if (!inputs.length) throw new HttpError(400, "문제로 낼 단어가 없습니다.");

  const { items, missing, error } = await runInChunks(
    inputs,
    CHUNK,
    async (chunk) => {
      const data = await generateJson(env, { prompt: buildBlankPrompt(chunk), schema: BLANK_SCHEMA });
      return sanitizeBlankItems(data.items, chunk);
    },
    (it) => it.id,
  );
  if (!items.length) throw error ?? new HttpError(502, "AI 가 빈칸 문제를 만들지 못했습니다. 다시 시도하세요.");
  return json({ items, missing });
}
