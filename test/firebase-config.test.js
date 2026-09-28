import test from "node:test";
import assert from "node:assert/strict";
import { parseFirebaseConfig, resolveDatabaseURL, emulatorHosts } from "../src/lib/firebase-config.js";

const JSON_CONFIG = JSON.stringify({
  apiKey: "AIzaTest",
  authDomain: "demo.firebaseapp.com",
  databaseURL: "https://demo-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "demo",
  storageBucket: "demo.firebasestorage.app",
  messagingSenderId: "123",
  appId: "1:123:web:abc",
});

test("JSON 설정을 읽고 databaseURL 끝의 / 를 없앤다", () => {
  const { config, error } = parseFirebaseConfig({ FIREBASE_CONFIG: JSON_CONFIG });
  assert.equal(error, null);
  assert.equal(config.apiKey, "AIzaTest");
  assert.equal(config.databaseURL, "https://demo-default-rtdb.asia-southeast1.firebasedatabase.app");
});

test("Firebase 콘솔 코드를 그대로 붙여넣어도 읽는다", () => {
  const snippet = `// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
const firebaseConfig = {
  apiKey: "AIzaSnippet",
  authDomain: 'snip.firebaseapp.com',
  databaseURL: "https://snip-default-rtdb.firebaseio.com",
  projectId: "snip",
  appId: "1:1:web:1",
  measurementId: "G-XYZ",
};
const app = initializeApp(firebaseConfig);`;
  const { config } = parseFirebaseConfig({ FIREBASE_CONFIG: snippet });
  assert.equal(config.apiKey, "AIzaSnippet");
  assert.equal(config.authDomain, "snip.firebaseapp.com");
  assert.equal(config.projectId, "snip");
  assert.equal(config.measurementId, "G-XYZ");
});

test("따옴표로 한 번 더 감싼 JSON, 객체 값도 읽는다", () => {
  assert.equal(parseFirebaseConfig({ FIREBASE_CONFIG: JSON.stringify(JSON_CONFIG) }).config.projectId, "demo");
  assert.equal(parseFirebaseConfig({ FIREBASE_CONFIG: `'${JSON_CONFIG}'` }).config.projectId, "demo");
  assert.equal(parseFirebaseConfig({ FIREBASE_CONFIG: { apiKey: "k", projectId: "p" } }).config.authDomain, "p.firebaseapp.com");
  assert.equal(parseFirebaseConfig({ FIREBASE_CONFIG: JSON.stringify({ firebaseConfig: { apiKey: "k", projectId: "p" } }) }).config.projectId, "p");
});

test("없거나 잘못된 설정은 오류 메시지", () => {
  assert.match(parseFirebaseConfig({}).error, /FIREBASE_CONFIG 환경변수가 없습니다/);
  assert.match(parseFirebaseConfig({ FIREBASE_CONFIG: "hello" }).error, /해석할 수 없습니다/);
  assert.match(parseFirebaseConfig({ FIREBASE_CONFIG: '{"apiKey":"x"}' }).error, /projectId/);
});

test("FIREBASE_DATABASE_URL 이 databaseURL 보다 우선", () => {
  const { config } = parseFirebaseConfig({ FIREBASE_CONFIG: JSON_CONFIG, FIREBASE_DATABASE_URL: "https://other.firebaseio.com/" });
  assert.equal(config.databaseURL, "https://other.firebaseio.com");
});

test("databaseURL 이 없으면 기본 주소에 물어 다른 지역 주소를 찾는다", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return new Response(
      JSON.stringify({ error: "Database lives in a different region. Please change your database URL to https://nourl-default-rtdb.asia-southeast1.firebasedatabase.app" }),
      { status: 404 },
    );
  };
  const { config } = parseFirebaseConfig({ FIREBASE_CONFIG: '{"apiKey":"k","projectId":"nourl"}' });
  assert.equal(config.databaseURL, undefined);
  assert.equal(await resolveDatabaseURL(config, { fetchImpl }), "https://nourl-default-rtdb.asia-southeast1.firebasedatabase.app");
  assert.equal(calls[0], "https://nourl-default-rtdb.firebaseio.com/.json?shallow=true");
  // 한 번 찾은 주소는 저장
  assert.equal(await resolveDatabaseURL(config, { fetchImpl }), "https://nourl-default-rtdb.asia-southeast1.firebasedatabase.app");
  assert.equal(calls.length, 1);
});

test("기본 지역 데이터베이스면 firebaseio.com 주소를 쓴다", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: "Permission denied" }), { status: 401 });
  const { config } = parseFirebaseConfig({ FIREBASE_CONFIG: '{"apiKey":"k","projectId":"usdb"}' });
  assert.equal(await resolveDatabaseURL(config, { fetchImpl }), "https://usdb-default-rtdb.firebaseio.com");
});

test("에뮬레이터 주소", () => {
  assert.equal(emulatorHosts({}), null);
  assert.deepEqual(emulatorHosts({ FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" }), { auth: "127.0.0.1:9099", database: null });
});
