// 로그인 상태 확인·로그아웃·오류 메시지

import { getFirebase, signOut } from "./firebase.js";

/** 로그인 상태가 확정될 때까지 기다린 뒤 현재 사용자(없으면 null)를 돌려줍니다. */
export async function getCurrentUser() {
  const { auth } = await getFirebase();
  await auth.authStateReady();
  return auth.currentUser;
}

/** 로그인 후 돌아갈 주소: 같은 사이트 안의 경로만 허용합니다. */
export function safeNext(value) {
  const next = String(value || "");
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

/** 로그인이 필요한 페이지에서 호출합니다. 로그인 안 했으면 로그인 페이지로 보냅니다. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (user) return user;
  const next = location.pathname + location.search;
  location.replace(`/login/?next=${encodeURIComponent(next)}`);
  return new Promise(() => {}); // 페이지 이동 중이므로 이후 코드를 실행하지 않음
}

export async function logout() {
  const { auth } = await getFirebase();
  await signOut(auth);
  location.href = "/login/";
}

export async function getIdToken(forceRefresh = false) {
  const user = await getCurrentUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  return user.getIdToken(forceRefresh);
}

export function displayName(user) {
  return user?.displayName || user?.email?.split("@")[0] || "사용자";
}

export function authErrorMessage(err) {
  let code = err?.code || "";
  // 서버 오류 문구가 코드에 붙어 오는 경우 (예: auth/api-key-not-valid.-please-pass-a-valid-api-key.)
  if (code.startsWith("auth/api-key-not-valid")) code = "auth/api-key-not-valid";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    case "auth/email-already-in-use":
      return "이미 가입된 이메일입니다. 로그인해 주세요.";
    case "auth/weak-password":
      return "비밀번호는 6자 이상이어야 합니다.";
    case "auth/invalid-email":
    case "auth/missing-email":
      return "이메일 주소를 확인해 주세요.";
    case "auth/missing-password":
      return "비밀번호를 입력해 주세요.";
    case "auth/too-many-requests":
      return "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    case "auth/popup-blocked":
      return "팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "로그인 창이 닫혔습니다.";
    case "auth/unauthorized-domain":
      return `이 주소(${location.hostname})가 Firebase에 등록되지 않았습니다. Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 추가해 주세요.`;
    case "auth/operation-not-allowed":
      return "이 로그인 방식이 꺼져 있습니다. Firebase 콘솔 → Authentication → 로그인 방법에서 사용 설정해 주세요.";
    case "auth/configuration-not-found":
      return "Firebase Authentication이 아직 시작되지 않았습니다. Firebase 콘솔 → Authentication → 시작하기를 눌러 주세요.";
    case "auth/api-key-not-valid":
    case "auth/invalid-api-key":
      return "FIREBASE_CONFIG의 apiKey가 올바르지 않습니다.";
    case "auth/network-request-failed":
      return "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해 주세요.";
    case "auth/user-disabled":
      return "사용이 중지된 계정입니다.";
    default:
      return err?.message || "로그인 중 오류가 발생했습니다.";
  }
}
