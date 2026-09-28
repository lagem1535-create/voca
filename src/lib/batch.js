// 긴 목록을 나눠 AI 를 동시에 호출하고 결과를 합칩니다.
// 일부 묶음이 실패해도 성공한 결과는 돌려주고, 실패한 항목은 missing 에 넣습니다.

export async function runInChunks(list, size, fn, keyOf = (x) => x) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  const settled = await Promise.allSettled(chunks.map((chunk) => fn(chunk)));
  const items = [];
  const missing = [];
  let error = null;
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      items.push(...r.value.items);
      missing.push(...r.value.missing);
    } else {
      error ??= r.reason;
      missing.push(...chunks[i].map(keyOf));
    }
  });
  return { items, missing, error };
}
