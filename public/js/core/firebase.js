// Firebase 초기화 (설정은 Cloudflare 환경변수 FIREBASE_CONFIG → /api/config 에서 받아옴)
// Firebase SDK 버전은 이 파일에서만 관리합니다.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore-lite.js";
import { loadConfig } from "./config.js";

export {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

export {
  collection,
  doc,
  getDoc,
  getDocs,
  getCount,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore-lite.js";

let firebasePromise;

/** @returns {Promise<{ app: any, auth: any, db: any }>} */
export function getFirebase() {
  firebasePromise ??= loadConfig().then(({ firebase, emulators }) => {
    const app = initializeApp(firebase);
    const auth = getAuth(app);
    auth.languageCode = "ko";
    const db = getFirestore(app);
    // 로컬 개발에서 Firebase 에뮬레이터를 쓰는 경우 (FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST)
    if (emulators?.auth) connectAuthEmulator(auth, emulators.auth, { disableWarnings: true });
    if (emulators?.firestore) {
      const [host, port] = emulators.firestore.split(":");
      connectFirestoreEmulator(db, host, Number(port));
    }
    return { app, auth, db };
  });
  return firebasePromise;
}
