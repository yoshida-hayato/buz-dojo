/**
 * firestore.rules のセキュリティルールテスト。
 *
 * Firebase Emulator(Firestore)を使って実行する。ローカルでは
 *   firebase emulators:exec --only firestore "npx jest firestore-tests"
 * CIでは .github/workflows/test.yml から実行される。
 *
 * 最優先で守るべき性質:
 *   users/{uid}/private/entitlements は Cloud Functions(Admin SDK、ルール適用外)
 *   のみが書き込める。ここがクライアントから書けてしまうと、ユーザーが
 *   自分自身に無償でプレミアムパックを付与できてしまう(直接の売上損失)。
 */
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "buz-dojo-rules-test",
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, "../firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

afterEach(async () => {
  if (testEnv) await testEnv.clearFirestore();
});

describe("users/{uid}/private/entitlements — 課金権限の要", () => {
  test("本人でもクライアントから直接は書き込めない", async () => {
    const alice = testEnv.authenticatedContext("alice");
    await assertFails(
      alice
        .firestore()
        .doc("users/alice/private/entitlements")
        .set({ pack: true })
    );
  });

  test("本人はentitlements以外のprivateドキュメントなら書き込める", async () => {
    const alice = testEnv.authenticatedContext("alice");
    await assertSucceeds(
      alice.firestore().doc("users/alice/private/notes").set({ memo: "hi" })
    );
  });

  test("本人はentitlementsを読める(表示用)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("users/alice/private/entitlements").set({ pack: true });
    });
    const alice = testEnv.authenticatedContext("alice");
    await assertSucceeds(
      alice.firestore().doc("users/alice/private/entitlements").get()
    );
  });

  test("他人のentitlementsは読めない", async () => {
    const bob = testEnv.authenticatedContext("bob");
    await assertFails(
      bob.firestore().doc("users/alice/private/entitlements").get()
    );
  });
});

describe("anonUsers/{anonId} — 匿名ユーザーの統計", () => {
  test("正しい形式のanonIdなら作成できる", async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertSucceeds(
      anon
        .firestore()
        .doc("anonUsers/a_1234567890abcdef")
        .set({ isAnonymous: true })
    );
  });

  test("形式が不正なanonId(短すぎる)は作成できない", async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(
      anon.firestore().doc("anonUsers/a_short").set({ isAnonymous: true })
    );
  });

  test("isAnonymous:trueが無いと作成できない", async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(
      anon
        .firestore()
        .doc("anonUsers/a_1234567890abcdef")
        .set({ isAnonymous: false })
    );
  });
});

describe("questionStats — 旧フラットパスは読み取り専用", () => {
  test("旧パス(questionStats/{questionId})への新規書き込みは拒否される", async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(
      anon.firestore().doc("questionStats/q123").set({ attempts: 1, correct: 1 })
    );
  });

  test("旧パスは誰でも読める", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("questionStats/q123").set({ attempts: 1, correct: 1 });
    });
    const anon = testEnv.unauthenticatedContext();
    await assertSucceeds(anon.firestore().doc("questionStats/q123").get());
  });

  test("新パス(questionStats/{subjectId}/questions/{questionId})には正しい形で書き込める", async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertSucceeds(
      anon
        .firestore()
        .doc("questionStats/sap/questions/q123")
        .set({ attempts: 1, correct: 1 })
    );
  });
});
