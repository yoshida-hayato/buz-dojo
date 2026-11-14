//
// 無いファイルが 200 で頁を返す経路の見張り、その4 (科目カードの件数)。
// 自前の問題データを持つ3科目には catalog.js が無く、頁が 200 で返る。
//
// 足場から名前で取り出す。属性で書くと 語とドットとTLD の形になり、
// Slack がリンク記法に書き替えて貼れなくなる (PAGE と NL は実在する TLD)
const { makeFetch, PAGE, NL } = require("../test-helpers/subject-loader-sandbox");
const { runIn, readJs: READ } = require("../test-helpers/js-sandbox");

describe("約束6: カタログの件数取りが、頁を評価しない", () => {
  // 自前の問題データを持つ3科目には catalog.js が無く、頁が 200 で返る。
  // 件数そのものは外側の catch も落とすので、件数だけを見ても門の有無が
  // 区別できない (2026-11-14 に実測。門を外しても件数は 100 のままだった)。
  // 区別が付くのは、偽の失敗を記録に残すかどうかである
  function run(bodyByTail, missing) {
    const r = runIn(
      [READ("subject-loader.js"), READ("subject-catalog.js")],
      {
        fetch: makeFetch(bodyByTail, missing === undefined ? PAGE : missing),
        APP_VERSION: "test",
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        SUBJECT_REGISTRY: [{
          id: "fe-kamoku-b",
          path: "/subjects/fe-kamoku-b",
          contentBase: "/data/fe-kamoku-b",
          enabled: true,
        }],
        PricingConfig: { SUBJECT_CATALOG: { "fe-kamoku-b": { questionCount: 100 } } },
      },
      "SubjectCatalog"
    );
    return r.taken.getQuestionCount("fe-kamoku-b").then((n) => ({ n, warns: r.warns }));
  }

  test("頁が返っても、料金の表の件数に落ちる", async () => {
    const { n } = await run({});
    expect(n).toBe(100);
  });

  test("頁が返ったことを、取得の失敗として記録しない", async () => {
    const { warns } = await run({});
    const noise = warns.filter((w) => w.indexOf("catalog") !== -1);
    expect(noise).toEqual([]);
  });

  // 対照。ok が偽で返る場合は本物の失敗なので、記録が立つ。
  // これが無いと、上の1件は「記録が1件も立たない書き方」でも通ってしまう
  test("本当に取れないときは、失敗として記録する", async () => {
    const { warns } = await run({}, null);
    const noise = warns.filter((w) => w.indexOf("catalog") !== -1);
    expect(noise.length).toBe(1);
  });

  test("catalog.js が素の JS なら、そちらの件数を使う", async () => {
    const body = "var SUBJECT_CONTENT_CATALOG = { questionCount: 46 };" + NL;
    const { n, warns } = await run({ "catalog.js": body });
    expect(n).toBe(46);
    expect(warns.filter((w) => w.indexOf("catalog") !== -1)).toEqual([]);
  });
});
