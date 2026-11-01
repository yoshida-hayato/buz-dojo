// 基本情報技術者試験 科目B — 問題データ (ビジネス道場の自作)
//
// 全問こちらで書いた。IPA が公表した過去問の転載は1問も無い。
// 擬似言語の書き方は試験の表記にそろえてある (代入は左向きの矢印、
// 配列の添字は1から、割り算の商は整数部分)。
//
// なぜ文字コードから記号を組むのか:
//   この repo の変更は Slack のパッチの口を通る。その口はバッククォートと
//   アスタリスクと円記号を字面として運べない (引き継ぎメモ「パッチの書き方」)。
//   問題文の中のコード囲みはバッククォート3個なので、文字コードから組む。
//   画面側 (js/dom-util.js の formatRichText) が囲みを pre と code に変える。
var FEB_NL = String.fromCharCode(10);
var FEB_FENCE = String.fromCharCode(96, 96, 96);

// 擬似言語の塊。引数を1行ずつ受けて、コード囲みにする。
function febCode() {
  var lines = Array.prototype.slice.call(arguments);
  return FEB_FENCE + FEB_NL + lines.join(FEB_NL) + FEB_NL + FEB_FENCE;
}

// 問題文や解説の段落。引数を1行ずつ受けて、改行でつなぐ。
function febText() {
  return Array.prototype.slice.call(arguments).join(FEB_NL);
}

var QUIZ_DATA = [];

// ---- 擬似言語の基本 ----------------------------------------------------
QUIZ_DATA.push(
  {
    id: "feb-sc-base-001",
    category: "scenario",
    module: "擬似言語の基本",
    code: "B1-1",
    priority: 1,
    name: febText(
      "次の手続を実行し終えたとき、x と y の値はどれか。",
      febCode(
        "整数型: x ← 3",
        "整数型: y ← 8",
        "整数型: t",
        "t ← x",
        "x ← y",
        "y ← t"
      )
    ),
    choices: [
      "x は 8、y は 3",
      "x は 3、y は 8",
      "x は 8、y は 8",
      "x は 3、y は 3",
    ],
    explanation: febText(
      "作業用の変数 t に x の値を預けてから x を上書きするので、2つの値が入れ替わる。",
      "t ← x で t が 3。x ← y で x が 8。y ← t で y が 3 になる。",
      "t を使わずに x ← y, y ← x と書くと、1行目で x が 8 になった後に y ← x が走るため、両方 8 になって 3 が消える。これが交換で最もよく踏む間違いである。"
    ),
  },
  {
    id: "feb-sc-base-002",
    category: "scenario",
    module: "擬似言語の基本",
    code: "B1-2",
    priority: 1,
    name: febText(
      "次の関数について、hantei(80) と hantei(79) と hantei(90) の戻り値を順に並べたものはどれか。",
      febCode(
        "〇文字列型: hantei(整数型: ten)",
        "  if (ten が 90 以上)",
        "    return (トウ)",
        "  elseif (ten が 80 以上)",
        "    return (ロ)",
        "  elseif (ten が 70 以上)",
        "    return (ハ)",
        "  else",
        "    return (ニ)",
        "  endif"
      ),
      "ここで (トウ) は A、(ロ) は B、(ハ) は C、(ニ) は D を返すものとする。"
    ),
    choices: ["B と C と A", "B と B と A", "C と C と A", "B と C と B"],
    explanation: febText(
      "elseif は上から順に判定し、最初に成り立った枝だけを実行して残りを飛ばす。",
      "80 は 90 以上ではないが 80 以上なので B。79 は 80 以上でもないが 70 以上なので C。90 は1つめで成り立つので A。",
      "境界の値 (ここでは 80 と 90) を自分で入れて確かめるのが、分岐の問題を落とさない唯一の方法である。"
    ),
  },
  {
    id: "feb-sc-base-003",
    category: "scenario",
    module: "擬似言語の基本",
    code: "B1-3",
    priority: 1,
    name: febText(
      "次の手続を実行し終えたとき、syou と amari の値はどれか。割り算は商の整数部分を返すものとする。",
      febCode(
        "整数型: a ← 47",
        "整数型: b ← 5",
        "整数型: syou ← a ÷ b",
        "整数型: amari ← a - b × syou"
      )
    ),
    choices: [
      "syou は 9、amari は 2",
      "syou は 9.4、amari は 0.4",
      "syou は 10、amari は -3",
      "syou は 9、amari は 5",
    ],
    explanation: febText(
      "47 を 5 で割ると 9 余り 2 である。商の整数部分なので 9.4 ではなく 9 になる。",
      "余りは a から b × syou を引いて出す。5 × 9 が 45 で、47 - 45 が 2 である。",
      "四捨五入して 10 にしてしまうと余りが負になる。整数の割り算が切り捨てであることを、余りの計算と合わせて確かめること。"
    ),
  },
  {
    id: "feb-sc-base-004",
    category: "scenario",
    module: "擬似言語の基本",
    code: "B1-4",
    priority: 1,
    name: febText(
      "x が -1、y が 5 のとき、次の2つの式の値はどれか。",
      febCode("(1) (x が 0 より大きい) and (y が 0 より大きい)", "(2) (x が 0 より大きい) or (y が 0 より大きい)")
    ),
    choices: [
      "(1) は偽、(2) は真",
      "(1) も (2) も偽",
      "(1) は真、(2) は偽",
      "(1) も (2) も真",
    ],
    explanation: febText(
      "x が 0 より大きいは偽、y が 0 より大きいは真である。",
      "and は両方が真のときだけ真になるので (1) は偽。or は片方が真なら真になるので (2) は真。",
      "and と or を取り違えると、条件が1つでも満たされない入力で分岐がまるごと逆になる。"
    ),
  }
);

// ---- 繰返しとトレース --------------------------------------------------
QUIZ_DATA.push(
  {
    id: "feb-sc-loop-001",
    category: "scenario",
    module: "繰返しとトレース",
    code: "B2-1",
    priority: 1,
    name: febText(
      "次の手続を実行し終えたとき、wa の値はどれか。",
      febCode(
        "整数型: wa ← 0",
        "for (i を 1 から 7 まで 1 ずつ増やす)",
        "  if (i を 2 で割った余り が 1 と等しい)",
        "    wa ← wa + i",
        "  endif",
        "endfor"
      )
    ),
    choices: ["16", "28", "12", "25"],
    explanation: febText(
      "2 で割った余りが 1 の i だけを足す。つまり 1 と 3 と 5 と 7 である。",
      "1 + 3 + 5 + 7 で 16 になる。",
      "28 は 1 から 7 まで全部足した値で、if を読み落とすとこれになる。12 は偶数 (2 と 4 と 6) の和である。"
    ),
  },
  {
    id: "feb-sc-loop-002",
    category: "scenario",
    module: "繰返しとトレース",
    code: "B2-2",
    priority: 1,
    name: febText(
      "次の手続を実行し終えたとき、kai の値はどれか。割り算は商の整数部分を返すものとする。",
      febCode(
        "整数型: n ← 100",
        "整数型: kai ← 0",
        "while (n が 1 より大きい)",
        "  n ← n ÷ 2",
        "  kai ← kai + 1",
        "endwhile"
      )
    ),
    choices: ["6", "7", "50", "5"],
    explanation: febText(
      "n は 100 から 50、25、12、6、3、1 と変わる。切り捨てなので 25 ÷ 2 は 12 である。",
      "1 になった時点で条件が偽になって抜けるので、割った回数は 6 回。",
      "ここが「n を半分にし続ける回数は、おおよそ n の2を底とする対数」という形である。二分探索の比較回数もこれと同じ理屈で決まる。"
    ),
  },
  {
    id: "feb-sc-loop-003",
    category: "scenario",
    module: "繰返しとトレース",
    code: "B2-3",
    priority: 2,
    name: febText(
      "次の手続を実行し終えたとき、kaisu の値はどれか。",
      febCode(
        "整数型: kaisu ← 0",
        "for (i を 1 から 4 まで 1 ずつ増やす)",
        "  for (j を i から 4 まで 1 ずつ増やす)",
        "    kaisu ← kaisu + 1",
        "  endfor",
        "endfor"
      )
    ),
    choices: ["10", "16", "12", "6"],
    explanation: febText(
      "内側の繰返しは j を i から 4 まで回すので、回る数は i によって変わる。",
      "i が 1 のとき 4 回、2 のとき 3 回、3 のとき 2 回、4 のとき 1 回である。合計 4 + 3 + 2 + 1 で 10 回。",
      "16 は内側が常に 1 から 4 まで回ると読み違えた場合の値である。内側の開始値が外側の変数になっている形は、総当たりの組を重複なく作るときの定石なので、見たらまず回数を数えること。"
    ),
  },
  {
    id: "feb-sc-loop-004",
    category: "scenario",
    module: "繰返しとトレース",
    code: "B2-4",
    priority: 2,
    name: febText(
      "次の手続を実行し終えたとき、n と kai の値はどれか。条件の判定は、中身を1回実行した後に行う。",
      febCode(
        "整数型: n ← 1",
        "整数型: kai ← 0",
        "繰返し",
        "  n ← n × 3 + 1",
        "  kai ← kai + 1",
        "を (n が 50 以下) の間"
      )
    ),
    choices: [
      "n は 121、kai は 4",
      "n は 40、kai は 3",
      "n は 121、kai は 5",
      "n は 40、kai は 4",
    ],
    explanation: febText(
      "n は 1 から 4、13、40、121 と変わる。",
      "40 の回を終えた時点では 50 以下なのでもう1回まわり、121 になってから判定して抜ける。だから 121 で 4 回である。",
      "後判定の繰返しは、条件が偽になる値をいったん作ってから抜ける。前判定の while だと 40 で止まるので、どちらの形かを必ず先に見ること。"
    ),
  }
);
