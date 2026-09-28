// API 공통 도우미: JSON 응답, 오류, 요청 본문 읽기

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** JSON 객체 본문을 읽습니다. 크기 제한을 넘거나 형식이 틀리면 HttpError. */
export async function readJson(request, maxBytes = 64 * 1024) {
  if (Number(request.headers.get("content-length") || 0) > maxBytes) throw new HttpError(413, "요청이 너무 큽니다.");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "요청이 너무 큽니다.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(400, "요청 형식이 올바르지 않습니다.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpError(400, "요청 형식이 올바르지 않습니다.");
  }
  return data;
}

/** 쉼표로 구분된 환경변수 → 소문자 배열 */
export function listVar(value) {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
