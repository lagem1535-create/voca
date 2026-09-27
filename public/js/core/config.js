// /api/config 에서 Firebase 설정을 한 번만 받아옵니다. (페이지가 열리자마자 요청을 시작)

export class SetupError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "SetupError";
    this.code = code;
  }
}

let configPromise;

export function loadConfig() {
  configPromise ??= fetch("/api/config", { headers: { accept: "application/json" } })
    .catch(() => {
      throw new SetupError("서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.", "network");
    })
    .then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.firebase) {
        throw new SetupError(data?.error || `Firebase 설정을 불러오지 못했습니다. (HTTP ${res.status})`, data?.code || "config_error");
      }
      return data;
    });
  return configPromise;
}
