// 公開過去問の問題データ (data/fe-kamoku-a/questions.js) の見張り。
//
// なぜ要るか (2026-11-02):
//   この科目は情報処理推進機構が公表した問題の転載である。許諾の条件は
//   出典の明記と、改変した場合はその旨の明記で、どちらも義務である。
//   つまり source か sourceModified が1問でも欠けると、無料で載せてよい
//   根拠そのものが崩れる。見た目の問題ではない。
//
//   もう1つ。この科目は図・表・流れ図を見ないと解けない問を外すことで
//   成立している (60問のうち14問を外して46問にした)。図を参照する問を
//   うっかり足すと、画面には問題文だけが出て、解けない問になる。
//   その形も、ここで落とす。
//
//   正解は choices の先頭である。公表されている解答例と突き合わせて
//   46問とも確かめたが、肢を並べ替える手が入ると黙って壊れる。だから
//   正解の見本を下に表として持ち、先頭の肢がそれを含むかを見る。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const SUBJECT_ID = "fe-kamoku-a";
const SRC = read(path.join("data", SUBJECT_ID, "questions.js"));
const SUBJECT_SRC = read(path.join("subjects", SUBJECT_ID, "subject.js"));

const pricing = require("../../config/pricing.js");
const licenses = require("../../config/exam-licenses.js");

const BACKTICK = String.fromCharCode(96);
const STAR = String.fromCharCode(42);
const YEN = String.fromCharCode(92);
const NL = String.fromCharCode(10);

const SOURCE_HEAD = "基本情報技術者試験 科目A サンプル問題 問";

// 問題データを、本番と同じ読み方 (隔離した器で評価) で取り出す。
function loadQuiz() {
  const sandbox = { String, Array, Object, JSON, Math };
  vm.createContext(sandbox);
  return vm.runInContext(SRC + NL + ";QUIZ_DATA;", sandbox, { filename: "questions" });
}

function declaredModules() {
  const at = SUBJECT_SRC.indexOf(NL + "  modules: {");
  if (at < 0) return [];
  const open = SUBJECT_SRC.indexOf("{", at);
  const close = SUBJECT_SRC.indexOf(NL + "  }", open);
  if (open < 0 || close < 0) return [];
  const out = [];
  SUBJECT_SRC.slice(open + 1, close).split(NL).forEach(function (line) {
    const t = line.trim();
    if (!t || t.indexOf("//") === 0) return;
    const colon = t.indexOf(":");
    if (colon <= 0) return;
    out.push(t.slice(0, colon).trim().split('"').join(""));
  });
  return out;
}

// 正解の見本。公表されている解答例と、1問ずつ自分で解いた結果の両方に
// 一致した字面だけを書いてある。他の肢には出てこない部分を選んである。
const CORRECT_HINT = {
  A01: "XOR 11111111", A03: "Q が真，R が真", A07: "2", A08: "15",
  A09: "割付けができなかったとき", A10: "タイマー", A11: "9", A13: "5",
  A16: "解釈しながら実行", A17: "C，B，A", A18: "ルートディレクトリ",
  A19: "高集積化", A21: "名前を付けた導出表", A23: "そのままの形式や構造",
  A25: "BLE", A26: "128", A27: "MIME", A28: "UDP",
  A29: "送信元 80，宛先 50001", A30: "ソーシャルエンジニアリング",
  A31: "命令を出したり応答を受け取ったり", A32: "改ざんされていないこと",
  A33: "電源の瞬断", A34: "問題を引き起こしそうな多様なデータ",
  A35: "サンドボックス", A36: "特別な意味をもつ文字", A37: "SMTP-AUTH",
  A38: "カプセル化", A39: "必要なデータ項目だけを引数", A40: "ブラックボックス",
  A41: "プロダクトインクリメント", A42: "リスクは",
  A43: "入出力データ数やファイル数", A45: "ベストプラクティス",
  A46: "ロールフォワード", A47: "内部監査部門", A48: "中断時間",
  A49: "仮想化してサーバ上に置く", A51: "グリーン購入", A52: "まねのできない",
  A53: "実用最小限", A54: "家庭内通信ネットワーク", A55: "あまり売れない商品群",
  A56: "個人が，自らが使用した商品", A58: "6.5", A59: "120",
};

// 図を見ないと解けない問を混ぜない。外した14問がこの形だった。
const FIGURE_WORDS = ["図", "表のとおり", "流れ図", "状態遷移", "アローダイアグラム"];

describe("約束1: 件数がカードの字面と一致する", () => {
  test("データの問数と、料金表の questionCount が同じ", () => {
    const n = loadQuiz().length;
    expect(n).toBe(pricing.SUBJECT_CATALOG[SUBJECT_ID].questionCount);
  });

  test("46問である (外した14問を足し戻していない)", () => {
    expect(loadQuiz().length).toBe(46);
  });
});

describe("約束2: 転載の条件 (出典と改変の明記) が全問にそろっている", () => {
  test("全問が source を持ち、公表物の名前で始まる", () => {
    const bad = loadQuiz().filter(
      (q) => typeof q.source !== "string" || q.source.indexOf(SOURCE_HEAD) !== 0
    );
    expect(bad.map((q) => q.id)).toEqual([]);
  });

  test("全問が sourceModified を立てている", () => {
    const bad = loadQuiz().filter((q) => q.sourceModified !== true);
    expect(bad.map((q) => q.id)).toEqual([]);
  });

  test("出どころの台帳が、この科目の転載を許している", () => {
    expect(pricing.isPublicPastExam(SUBJECT_ID)).toBe(true);
    const key = pricing.SUBJECT_CATALOG[SUBJECT_ID].examLicense;
    expect(licenses.mayReproduce(key)).toBe(true);
  });

  test("公開過去問なので値段は0である", () => {
    const meta = pricing.SUBJECT_CATALOG[SUBJECT_ID];
    expect(pricing.priceForSubject(SUBJECT_ID, meta.questionCount)).toBe(0);
  });
});
