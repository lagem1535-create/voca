// 브라우저 내장 음성(TTS)으로 발음 듣기

const VOICES = {
  en: "en-US",
  ja: "ja-JP",
  zh: "zh-CN",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-BR",
  ru: "ru-RU",
  vi: "vi-VN",
  th: "th-TH",
  id: "id-ID",
  ko: "ko-KR",
};

export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

export function speak(text, language = "en") {
  if (!canSpeak || !text) return;
  const code = String(language || "en").toLowerCase();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = code.includes("-") ? code : VOICES[code] || "en-US";
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
