//
// 無いファイルが 200 で頁を返す経路の見張り、その3 (管理画面)。
// 管理画面の問題別の正答率は js/subject-loader.js を読まないので、同じ判定を
// 自分で1つ持っている。2つが食い違うと画面ごとに結果が変わるので、
// 6通りの入力で直に突き合わせる。
//
// 足場から名前で取り出す。属性で書くと 語とドットとTLD の形になり、
// Slack がリンク記法に書き替えて貼れなくなる (PAGE と NL は実在する TLD)
const { load, makeFetch, PAGE, NL } = require("../test-helpers/subject-loader-sandbox");
const { runIn, readJs: READ } = require("../test-helpers/js-sandbox");

const QUESTIONS =
  'var QUIZ_DATA = [{ id: "q1", name: "問1", choices: ["あ", "い"], answer: 1 }];' + NL;

describe("約束4: 2つの判定が、同じ答えを出す", () => {
  const { api } = load(makeFetch({}, PAGE));
  const admin = runIn([READ("admin-question-stats-shared.js")], {},
    "AdminQuestionStatsShared").taken;

  test("管理画面の側も判定を持っている", () => {
    expect(typeof admin.looksLikeHtmlResponse).toBe("function");
    expect(typeof api.looksLikeHtmlResponse).toBe("function");
  });

  test("6通りの入力で、2つの答えが1つも食い違わない", () => {
    const inputs = [
      PAGE,
      "  " + NL + PAGE,
      String.fromCharCode(65279) + PAGE,
      QUESTIONS,
      "",
      undefined,
    ];
    const mine = inputs.map((t) => api.looksLikeHtmlResponse(t));
    const theirs = inputs.map((t) => admin.looksLikeHtmlResponse(t));
    expect(theirs).toEqual(mine);
    // 両方が同じ定数を返すだけの形になっていないことを見る。
    // 片方を常に真や常に偽に書き替えると、ここで並びが崩れる
    expect(mine).toEqual([true, true, true, false, false, false]);
  });
});

describe("約束5: 管理画面が、頁を問題マスタに混ぜない", () => {
  function metaMapWith(bodyByTail) {
    const f = makeFetch(bodyByTail, PAGE);
    const admin = runIn([READ("admin-question-stats-shared.js")], {
      fetch: f,
      SUBJECT_REGISTRY: [{ id: "fe-kamoku-b", contentBase: "/data/fe-kamoku-b", enabled: true }],
    }, "AdminQuestionStatsShared").taken;
    return admin.buildQuestionMetaMap();
  }

  test("judgment に頁が返っても、その科目の問題名が出る", async () => {
    const map = await metaMapWith({ "questions.js": QUESTIONS });
    expect(map.size).toBe(1);
    expect(map.get("q1").subjectId).toBe("fe-kamoku-b");
    expect(map.get("q1").text).toBe("問1");
  });

  test("judgment が素の JS なら、そちらも読む", async () => {
    const j = 'var JUDGMENT_DATA = [{ id: "j1", question: "真偽", answer: true }];' + NL;
    const map = await metaMapWith({ "questions.js": QUESTIONS, "judgment-questions.js": j });
    expect(map.size).toBe(1);
  });
});
