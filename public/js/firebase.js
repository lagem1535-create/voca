// Firebase 초기화 — 설정은 Worker 환경변수 FIREBASE_CONFIG 를 /api/config 로 받아옵니다.
// Firebase SDK 버전은 이 파일(과 index.html 의 modulepreload)에서만 관리합니다.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, connectDatabaseEmulator } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

export {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

export {
  ref,
  onValue,
  set,
  update,
  push,
  remove,
  query,
  orderByKey,
  limitToLast,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

let authInstance = null;
let dbInstance = null;

export class SetupError extends Error {}

/** /api/config 를 받아 Firebase 를 준비합니다. 설정이 없으면 SetupError. */
export async function initFirebase() {
  let res;
  try {
    res = await fetch("/api/config", { cache: "no-store" });
  } catch {
    throw new Error("서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.firebase) {
    throw new SetupError(data.error || `Firebase 설정을 불러오지 못했습니다. (${res.status})`);
  }

  const app = initializeApp(data.firebase);
  authInstance = getAuth(app);
  authInstance.languageCode = "ko";
  dbInstance = getDatabase(app);

  const emu = data.emulators;
  if (emu?.auth) connectAuthEmulator(authInstance, `http://${emu.auth}`, { disableWarnings: true });
  if (emu?.database) {
    const [host, port] = emu.database.split(":");
    connectDatabaseEmulator(dbInstance, host, Number(port));
  }
}

export const auth = () => authInstance;
export const db = () => dbInstance;
