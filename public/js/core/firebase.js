// Firebase 초기화 (설정은 Cloudflare 환경변수 FIREBASE_CONFIG → /api/config 에서 받아옴)
// 로그인: Firebase Authentication, 저장소: Firebase Realtime Database
// Firebase SDK 버전은 이 파일에서만 관리합니다.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, connectDatabaseEmulator } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { loadConfig, SetupError } from "./config.js";

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
  ref,
  get,
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

let firebasePromise;

/** @returns {Promise<{ app: any, auth: any, db: any }>} */
export function getFirebase() {
  firebasePromise ??= loadConfig().then(({ firebase, emulators }) => {
    if (!firebase.databaseURL) {
      throw new SetupError(
        "FIREBASE_CONFIG에 databaseURL(Realtime Database 주소)이 없습니다. Firebase 콘솔 → Realtime Database 화면 위쪽의 https://…firebasedatabase.app 주소를 FIREBASE_CONFIG의 databaseURL로 넣거나 FIREBASE_DATABASE_URL 변수로 추가해 주세요.",
        "database_url_missing",
      );
    }
    const app = initializeApp(firebase);
    const auth = getAuth(app);
    auth.languageCode = "ko";
    const db = getDatabase(app);
    // 로컬 개발에서 Firebase 에뮬레이터를 쓰는 경우
    if (emulators?.auth) connectAuthEmulator(auth, emulators.auth, { disableWarnings: true });
    if (emulators?.database) {
      const [host, port] = emulators.database.split(":");
      connectDatabaseEmulator(db, host, Number(port));
    }
    return { app, auth, db };
  });
  return firebasePromise;
}
