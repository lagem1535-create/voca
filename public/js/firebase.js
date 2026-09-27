// Firebase 초기화 — 설정은 Worker 환경변수 FIREBASE_CONFIG 를 /api/config 로 받아옵니다.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

export {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
export { ref, get, set, update, push, remove } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

let ready;

/** { auth, db } 를 돌려줍니다. 설정이 없으면 오류를 던집니다. */
export function firebase() {
  ready ||= (async () => {
    const res = await fetch("/api/config");
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.firebase) throw new Error(data.error || "Firebase 설정을 불러오지 못했습니다.");
    const app = initializeApp(data.firebase);
    return { auth: getAuth(app), db: getDatabase(app) };
  })();
  return ready;
}

/** 현재 로그인 사용자(없으면 null)를 한 번 확인합니다. */
export async function currentUser() {
  const { auth } = await firebase();
  await auth.authStateReady();
  return auth.currentUser;
}

/** 로그인이 필요한 페이지: 로그인 안 되어 있으면 /login/ 으로 보냅니다. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) {
    location.replace(`/login/?next=${encodeURIComponent(location.pathname + location.search)}`);
    return new Promise(() => {});
  }
  return user;
}

export { onAuthStateChanged };
