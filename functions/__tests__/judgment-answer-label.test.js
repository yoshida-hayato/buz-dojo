//
// 正誤問題の正解ラベル (js/subject-config.js の judgmentSingleAnswer) のガード。
//
// なぜ要るか: この1つの関数に4箇所が乗っている。出題の組み立て (quiz-builder)、
// 解説の文面 (quiz-engine)、お問い合わせの写し (screens-contact)、そして
// 2026-10-31 に直した読み物レッスンの確認クイズ (screens-lesson) である。
// それなのに subject-config にはテストが1件も無かった。
//
// いちばん効く不変条件: 返る値は必ず 正 か 誤 のどちらかである。
// 肢の字面が返ると、正誤問題を出した画面に押せる肢が1つも無くなる
// (レッスンは button を 正 と 誤 の2つしか作らないので、一致する肢が無ければ
// 利用者はそこで詰まる。それが今日直した不具合と同じ形である)。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js", "subject-config.js"), "utf8");
const NL = String.fromCharCode(10);

function load() {
  const box = {
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    console: { warn: () => {}, error: () => {} },
    String, Number, Array, Object, Math, JSON,
  };
  box.window = box;
  return vm.runInNewContext(SRC + NL + ";({ label: judgmentSingleAnswer })", box).label;
}

describe("正誤問題の正解ラベル", () => {
  const label = load();

  test("答えが 正 か 誤 で書かれていれば、それをそのまま返す", () => {
    expect(label({ answer: "正", choices: ["文A", "文B"] })).toBe("正");
    expect(label({ answer: "誤", choices: ["文A", "文B"] })).toBe("誤");
  });

  test("答えが無ければ、肢の先頭が 誤 のときだけ 誤 になる", () => {
    expect(label({ choices: ["誤", "正"] })).toBe("誤");
    expect(label({ choices: ["正", "誤"] })).toBe("正");
  });

  test("答えが 正 と 誤 以外の字面なら、肢の規則に落ちる", () => {
    expect(label({ answer: "true", choices: ["誤", "正"] })).toBe("誤");
    expect(label({ answer: "", choices: ["正", "誤"] })).toBe("正");
    expect(label({ answer: null, choices: ["誤"] })).toBe("誤");
  });

  // ここが本題。肢の字面が返ると、正誤問題の画面に押せる肢が無くなる
  test("どんな入り方でも、返るのは 正 か 誤 のどちらかである", () => {
    const cases = [
      {},
      { choices: [] },
      { choices: ["文A", "文B"] },
      { answer: "どちらでもない", choices: ["長い文がここに入る", "もう一方の文"] },
      { answer: 1, choices: ["誤り", "正しい"] },
      { answer: undefined },
      { choices: ["誤り", "誤"] },
      { answer: "正解", choices: ["誤", "正"] },
    ];
    cases.forEach((entry) => {
      const got = label(entry);
      expect(["正", "誤"].indexOf(got)).toBeGreaterThan(-1);
    });
  });

  test("肢が 誤り のように 誤 で始まる長い字面でも、先頭一致では 誤 にしない", () => {
    // 完全一致で見ているので、誤り は 誤 ではない。ここが緩むと
    // 正誤問題の答えが裏返る
    expect(label({ choices: ["誤り", "正しい"] })).toBe("正");
  });
});
