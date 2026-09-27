import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFirebaseConfig, readEmulators, firebaseClientConfig } from "../src/lib/firebase-config.js";

const expected = {
  apiKey: "AIzaSyTest",
  authDomain: "demo.firebaseapp.com",
  projectId: "demo",
  storageBucket: "demo.firebasestorage.app",
  messagingSenderId: "123",
  appId: "1:123:web:abc",
};

test("JSON 문자열을 해석한다", () => {
  const { config, error } = parseFirebaseConfig(JSON.stringify(expected));
  assert.equal(error, null);
  assert.deepEqual(config, expected);
});

test("Firebase 콘솔 코드(const firebaseConfig = {...};)를 그대로 붙여넣어도 해석한다", () => {
  const snippet = `// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyTest",
  authDomain: 'demo.firebaseapp.com',
  projectId: "demo",
  storageBucket: "demo.firebasestorage.app",
  messagingSenderId: "123",
  appId: "1:123:web:abc",
  measurementId: "G-XYZ",
};`;
  const { config } = parseFirebaseConfig(snippet);
  assert.deepEqual(config, { ...expected, measurementId: "G-XYZ" });
});

test("대시보드 JSON 타입 변수(객체)와 중첩된 firebaseConfig 키도 받는다", () => {
  assert.deepEqual(parseFirebaseConfig(expected).config, expected);
  assert.deepEqual(parseFirebaseConfig({ firebaseConfig: expected }).config, expected);
});

test("알 수 없는 키는 버리고 authDomain이 없으면 채운다", () => {
  const { config } = parseFirebaseConfig('{"apiKey":"k","projectId":"p","secret":"x"}');
  assert.deepEqual(config, { apiKey: "k", projectId: "p", authDomain: "p.firebaseapp.com" });
});

test("값이 없거나 잘못되면 설명과 함께 null", () => {
  assert.equal(parseFirebaseConfig(undefined).config, null);
  assert.match(parseFirebaseConfig("").error, /FIREBASE_CONFIG/);
  assert.equal(parseFirebaseConfig("not json").config, null);
  assert.match(parseFirebaseConfig('{"apiKey":"k"}').error, /projectId/);
});

test("Realtime Database 주소: 콘솔 코드의 databaseURL을 쓰고 FIREBASE_DATABASE_URL이 있으면 우선", () => {
  const snippet = `const firebaseConfig = {
  apiKey: "AIzaSyTest",
  authDomain: "fir-2-f3b80.firebaseapp.com",
  databaseURL: "https://fir-2-f3b80-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "fir-2-f3b80",
};`;
  assert.equal(
    firebaseClientConfig({ FIREBASE_CONFIG: snippet }).config.databaseURL,
    "https://fir-2-f3b80-default-rtdb.asia-southeast1.firebasedatabase.app",
  );
  assert.equal(
    firebaseClientConfig({ FIREBASE_CONFIG: JSON.stringify(expected), FIREBASE_DATABASE_URL: " https://x.firebasedatabase.app/ " }).config.databaseURL,
    "https://x.firebasedatabase.app",
  );
  assert.equal(firebaseClientConfig({ FIREBASE_CONFIG: JSON.stringify(expected) }).config.databaseURL, undefined);
  assert.equal(firebaseClientConfig({}).config, null);
});

test("에뮬레이터 설정은 환경변수가 있을 때만 만든다", () => {
  assert.equal(readEmulators({}), null);
  assert.deepEqual(readEmulators({ FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_DATABASE_EMULATOR_HOST: "127.0.0.1:9000" }), {
    auth: "http://127.0.0.1:9099",
    database: "127.0.0.1:9000",
  });
});
