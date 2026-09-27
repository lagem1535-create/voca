// /login/ — Firebase 로그인 (Google · 이메일/비밀번호)
import {
  firebase, currentUser, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
} from "../firebase.js";
import { start, $, esc, busy } from "../ui.js";

const next = () => {
  const n = new URLSearchParams(location.search).get("next") || "/";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
};

const MESSAGES = {
  "auth/invalid-credential": "이메일 또는 비밀번호가 틀렸습니다.",
  "auth/email-already-in-use": "이미 가입된 이메일입니다. 로그인하세요.",
  "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
  "auth/invalid-email": "이메일 형식이 올바르지 않습니다.",
  "auth/unauthorized-domain": "이 주소가 Firebase 승인된 도메인에 없습니다. Authentication → 설정 → 승인된 도메인에 추가하세요.",
  "auth/operation-not-allowed": "이 로그인 방식이 꺼져 있습니다. Firebase Authentication → 로그인 방법에서 사용 설정하세요.",
  "auth/popup-closed-by-user": "로그인 창이 닫혔습니다.",
};

start(async () => {
  if (await currentUser()) return location.replace(next());
  const { auth } = await firebase();
  $("#app").innerHTML = `
    <section class="card">
      <h1>로그인</h1>
      <button id="google" class="primary" type="button" style="width:100%">Google 계정으로 로그인</button>
      <p class="muted" style="text-align:center">또는 이메일</p>
      <form id="form">
        <label for="email">이메일</label><input id="email" type="email" autocomplete="email" required>
        <label for="pw">비밀번호</label><input id="pw" type="password" autocomplete="current-password" minlength="6" required>
        <div class="row" style="margin-top:14px">
          <button class="primary" type="submit">로그인</button>
          <button id="signup" type="button">회원가입</button>
        </div>
      </form>
      <p id="msg" class="feedback bad"></p>
    </section>`;

  const fail = (err) => ($("#msg").textContent = MESSAGES[err.code] || err.message);
  const done = () => location.replace(next());

  $("#google").onclick = (e) =>
    busy(e.target, "로그인 중…", () => signInWithPopup(auth, new GoogleAuthProvider()).then(done, fail));
  $("#form").onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, "로그인 중…", () => signInWithEmailAndPassword(auth, $("#email").value, $("#pw").value).then(done, fail));
  };
  $("#signup").onclick = (e) => {
    if (!$("#form").reportValidity()) return;
    busy(e.target, "가입 중…", () => createUserWithEmailAndPassword(auth, $("#email").value, $("#pw").value).then(done, fail));
  };
});
