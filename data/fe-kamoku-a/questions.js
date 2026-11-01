// 基本情報技術者試験 科目A — 問題データ (情報処理推進機構の公開問題)
//
// 出どころ: 情報処理推進機構が公表している
// 「基本情報技術者試験（科目A試験）サンプル問題（60問）セット」。
// 全60問のうち、図・表・流れ図・状態遷移図を見ないと解けない14問を外し、
// 文字だけで成立する46問を収めた。
//
// 許諾: 情報処理推進機構は、公表した過去の試験問題の使用に許諾も使用料も
// 要らないと明記している。条件は2つで、出典を明記すること、改変した場合は
// その旨を明記することである。台帳は config/exam-licenses.js、条件の写しは
// docs/EXAM_LICENSE_REGISTRY.md に在る。
//
// だから全問に source を持たせ、sourceModified を true にしてある。
// true にする理由は、解答群の並びを出題のたびに入れ替えており、
// ア・イ・ウ・エ の記号も外しているためである。一部の問では、PDF から
// 文字を起こすときに上付き文字や表組みが崩れる所を読める字面に直した
// (問11 の 2 の n 乗、問3 と問29 の表形式の解答群、問36 の上位ディレクトリの
// 字面)。どれも設問の意味は変えていないが、改変として扱う。
//
// 解説は当道場が書いたものである。情報処理推進機構はこのサンプル問題に
// 解説を公表していない。
//
// 正解の確かめ方 (2026-11-02): 公表されている解答例 (問1から問60までの
// 正解の一覧) を取り、46問すべてを別に自分で解いて突き合わせた。46問とも
// 一致している。choices の先頭が正解で、画面が出題のたびに並べ替える。
//
// コード囲み (バッククォート3個) はパッチの口を通らないので、文字コードから
// 組む。画面側の formatRichText が囲みを pre と code に変える。
var FEA_NL = String.fromCharCode(10);
var FEA_FENCE = String.fromCharCode(96, 96, 96);

// 擬似コードの塊。引数を1行ずつ受けて、コード囲みにする。
function feaCode() {
  var lines = Array.prototype.slice.call(arguments);
  return FEA_FENCE + FEA_NL + lines.join(FEA_NL) + FEA_NL + FEA_FENCE;
}

// 問題文や解説の段落。引数を1行ずつ受けて、改行でつなぐ。
function feaText() {
  return Array.prototype.slice.call(arguments).join(FEA_NL);
}

var QUIZ_DATA = [];

// ---- 基礎理論とアルゴリズム ----------------------------------
QUIZ_DATA.push(
  {
    id: "fea-sc-base-001",
    category: "scenario",
    module: "基礎理論とアルゴリズム",
    code: "A01",
    priority: 1,
    name: feaText(
      "負数を 2 の補数で表すとき，8 ビットの 2 進正数 n に対し－n を求める式はどれか。",
      "ここで，＋は加算を表し，OR はビットごとの論理和，XOR はビットごとの排他的論理和を表す。"
    ),
    choices: [
      "(n XOR 11111111) ＋ 00000001",
      "(n OR 10000000) ＋ 00000001",
      "(n OR 11111110) ＋ 11111111",
      "(n XOR 10000000) ＋ 11111111",
    ],
    source: "基本情報技術者試験 科目A サンプル問題 問1",
    sourceModified: true,
    explanation: feaText(
      "2 の補数は「全ビットを反転して 1 を足す」で作る。",
      "全ビット反転は 11111111 との排他的論理和である。論理和では反転にならない。",
      "だから XOR 11111111 のあとに 00000001 を足す形だけが正しい。"
    ),
  },
  {
    id: "fea-sc-base-003",
    category: "scenario",
    module: "基礎理論とアルゴリズム",
    code: "A03",
    priority: 1,
    name: feaText(
      "P，Q，R はいずれも命題である。命題 P の真理値は真であり，命題 (not P ) or Q 及び命題 (not Q ) or R のいずれの真理値も真であることが分かっている。Q，R の真理値はどれか。",
      "ここで，X or Y は X と Y の論理和，not X は X の否定を表す。"
    ),
    choices: [
      "Q が真，R が真",
      "Q が偽，R が偽",
      "Q が偽，R が真",
      "Q が真，R が偽",
    ],
    source: "基本情報技術者試験 科目A サンプル問題 問3",
    sourceModified: true,
    explanation: feaText(
      "P が真なので not P は偽。(not P) or Q が真であるためには Q が真しかない。",
      "同じ理屈で Q が真なら not Q は偽なので，(not Q) or R が真であるためには R も真しかない。",
      "or は片方が真なら真になるので、偽の側に引きずられないことが鍵である。"
    ),
  },
  {
    id: "fea-sc-base-007",
    category: "scenario",
    module: "基礎理論とアルゴリズム",
    code: "A07",
    priority: 1,
    name: feaText(
      "10 進法で 5 桁の数 a1a2a3a4a5 を，ハッシュ法を用いて配列に格納したい。ハッシュ関数を mod (a1＋a2＋a3＋a4＋a5，13) とし，求めたハッシュ値に対応する位置の配列要素に格納する場合，54321 は配列のどの位置に入るか。",
      "ここで，mod (x，13) は，x を 13 で割った余りとする。"
    ),
    choices: [
      "2",
      "1",
      "7",
      "11",
    ],
    source: "基本情報技術者試験 科目A サンプル問題 問7",
    sourceModified: true,
    explanation: feaText(
      "各桁の和は 5＋4＋3＋2＋1 で 15 である。",
      "15 を 13 で割った余りは 2 なので、位置は 2 になる。",
      "ハッシュ法の問題は、まず関数の中身を素直に計算することで足りる場合が多い。"
    ),
  },
  {
    id: "fea-sc-base-008",
    category: "scenario",
    module: "基礎理論とアルゴリズム",
    code: "A08",
    priority: 1,
    name: feaText(
      "自然数 n に対して，次のとおり再帰的に定義される関数 f (n) を考える。f (5) の値はどれか。",
      feaCode(
        "f (n)： if n≦1 then return 1",
        "          else return n＋ f (n－1)",
      )
    ),
    choices: [
      "15",
      "6",
      "9",
      "25",
    ],
    source: "基本情報技術者試験 科目A サンプル問題 問8",
    sourceModified: true,
    explanation: feaText(
      "定義のとおり外側からほどくと f(5) は 5＋f(4)、f(4) は 4＋f(3) と続く。",
      "f(1) は 1 で止まるので、5＋4＋3＋2＋1 で 15 になる。",
      "再帰の問題は、止まる条件 (ここでは n が 1 以下) から逆に積み上げると間違えにくい。"
    ),
  }
);
