/** 상태 코드·오류 코드와 함께 클라이언트에 그대로 보여줄 한국어 메시지를 담는 오류 */
export class HttpError extends Error {
  constructor(status, code, message, extra = undefined) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

export function errorResponse(err) {
  if (err instanceof HttpError) {
    return json({ error: err.message, code: err.code, ...(err.extra || {}) }, err.status);
  }
  console.error("Unhandled error", err);
  return json({ error: "서버에서 알 수 없는 오류가 발생했습니다.", code: "internal" }, 500);
}

/** JSON 본문을 읽습니다. 너무 크거나 형식이 틀리면 400대 오류를 던집니다. */
export async function readJson(request, maxBytes = 32 * 1024) {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new HttpError(413, "too_large", "요청 내용이 너무 큽니다.");
  }
  try {
    const data = JSON.parse(text);
    if (data && typeof data === "object") return data;
  } catch {
    // 아래에서 공통 오류로 처리
  }
  throw new HttpError(400, "bad_json", "요청 형식이 올바르지 않습니다.");
}
