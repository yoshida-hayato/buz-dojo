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

// ---- 配列と探索 --------------------------------------------------------
QUIZ_DATA.push(
  {
    id: "feb-sc-arr-001",
    category: "scenario",
    module: "配列と探索",
    code: "B3-1",
    priority: 1,
    name: febText(
      "配列 a の要素が順に 2、4、6、8、10 のとき、次の手続を実行し終えた配列 b の要素はどれか。添字は 1 から始まる。",
      febCode(
        "整数型の配列: b ← 要素数 5 の配列",
        "for (i を 1 から 5 まで 1 ずつ増やす)",
        "  b[6 - i] ← a[i]",
        "endfor"
      )
    ),
    choices: [
      "10、8、6、4、2",
      "2、4、6、8、10",
      "2、2、6、8、8",
      "10、8、6、8、10",
    ],
    explanation: febText(
      "i が 1 のとき b[5] に a[1] の 2 が入り、i が 5 のとき b[1] に a[5] の 10 が入る。",
      "つまり a を逆順に詰め替えている。b は先頭から 10、8、6、4、2 になる。",
      "添字の和が常に 6 (要素数 + 1) になっている形が逆順の目印である。同じ配列の中で入れ替える場合は中央より先で止めないと、二度入れ替えて元に戻ってしまう。"
    ),
  },
  {
    id: "feb-sc-arr-002",
    category: "scenario",
    module: "配列と探索",
    code: "B3-2",
    priority: 1,
    name: febText(
      "配列 a の要素が順に 5、9、13、21 のとき、次の関数の tansaku(13) と tansaku(7) の戻り値を順に並べたものはどれか。添字は 1 から始まる。",
      febCode(
        "〇整数型: tansaku(整数型: target)",
        "  for (i を 1 から a の要素数 まで 1 ずつ増やす)",
        "    if (a[i] が target と等しい)",
        "      return i",
        "    endif",
        "  endfor",
        "  return 0"
      )
    ),
    choices: ["3 と 0", "13 と 0", "3 と -1", "2 と 0"],
    explanation: febText(
      "13 は 3 番目の要素なので 3 を返す。7 は配列に無いので、繰返しを抜けた後の return 0 に到達して 0 を返す。",
      "添字が 1 から始まるので、見つからない合図として 0 が使える。添字が 0 から始まる言語では 0 は先頭の要素を指すので、この合図には -1 を使うのが普通である。",
      "見つからないときに何を返すかを決めずに書くと、呼ぶ側が「0 番目の要素が当たった」と読んでしまう。試験でも、探索の問題は不在のときの戻り値を問うことが多い。"
    ),
  },
  {
    id: "feb-sc-arr-003",
    category: "scenario",
    module: "配列と探索",
    code: "B3-3",
    priority: 2,
    name: febText(
      "次の関数は、文字列が前から読んでも後ろから読んでも同じかどうかを返す。kaibun(しんぶんし) と kaibun(みかん) の戻り値を順に並べたものはどれか。",
      febCode(
        "〇論理型: kaibun(文字列型: s)",
        "  整数型: i ← 1",
        "  整数型: j ← s の文字数",
        "  while (i が j より小さい)",
        "    if (s の i 文字目 が s の j 文字目 と異なる)",
        "      return false",
        "    endif",
        "    i ← i + 1",
        "    j ← j - 1",
        "  endwhile",
        "  return true"
      )
    ),
    choices: [
      "true と false",
      "false と false",
      "true と true",
      "false と true",
    ],
    explanation: febText(
      "しんぶんし は 1 文字目と 5 文字目が し、2 文字目と 4 文字目が ん で一致し、中央の ぶ は比較せずに抜けるので true。",
      "みかん は 1 文字目の み と 3 文字目の ん が異なるので、1 回目の比較で false を返す。",
      "条件が i が j より小さい なので、文字数が奇数のときの中央は比較されない。中央を比較しても結果は変わらないが、条件を i が j 以下 に変えると中央で必ず一致するだけの無駄な1回が増える。"
    ),
  },
  {
    id: "feb-sc-arr-004",
    category: "scenario",
    module: "配列と探索",
    code: "B3-4",
    priority: 2,
    name: febText(
      "昇順に並んだ 15 個の要素 1、2、3、…、15 が入った配列から、二分探索で 13 を探す。a[i] と target を比べる回数は何回か。添字は 1 から始まり、中央は (lo + hi) ÷ 2 の整数部分とする。",
      febCode(
        "整数型: lo ← 1",
        "整数型: hi ← 15",
        "while (lo が hi 以下)",
        "  整数型: mid ← (lo + hi) ÷ 2",
        "  if (a[mid] が target と等しい)",
        "    return mid",
        "  elseif (a[mid] が target より小さい)",
        "    lo ← mid + 1",
        "  else",
        "    hi ← mid - 1",
        "  endif",
        "endwhile"
      )
    ),
    choices: ["4 回", "3 回", "13 回", "8 回"],
    explanation: febText(
      "mid は 8、12、14、13 と動く。1 回目は a[8] の 8 と比べて小さいので lo を 9 に、2 回目は a[12] の 12 と比べて小さいので lo を 13 に、3 回目は (13 + 15) ÷ 2 の 14 と比べて大きいので hi を 13 に、4 回目に a[13] で当たる。",
      "だから 4 回である。",
      "この問題は実際に数えないと外す。要素数 15 なら最大 4 回 (2 の 4 乗が 16) という上限は使えるが、途中で当たるかどうかは値によるので、上限だけで答えを決めないこと。"
    ),
  }
);

// ---- 関数と再帰 --------------------------------------------------------
QUIZ_DATA.push(
  {
    id: "feb-sc-fn-001",
    category: "scenario",
    module: "関数と再帰",
    code: "B4-1",
    priority: 1,
    name: febText(
      "次の関数の kaijou(5) の戻り値はどれか。",
      febCode(
        "〇整数型: kaijou(整数型: n)",
        "  if (n が 1 以下)",
        "    return 1",
        "  endif",
        "  return n × kaijou(n - 1)"
      )
    ),
    choices: ["120", "15", "24", "25"],
    explanation: febText(
      "5 × 4 × 3 × 2 × 1 で 120 である。",
      "n が 1 以下で 1 を返す行が、再帰を止める足場である。この行が無いと n が 0 や負の値まで下がり続けて止まらない。",
      "15 は 1 から 5 までの和で、掛け算と足し算を取り違えた値である。24 は 4 の階乗なので、止める条件を1段ずらすとこうなる。"
    ),
  },
  {
    id: "feb-sc-fn-002",
    category: "scenario",
    module: "関数と再帰",
    code: "B4-2",
    priority: 2,
    name: febText(
      "次の関数について、fib(6) の戻り値と、fib が呼ばれた回数 (最初の fib(6) を含む) を順に並べたものはどれか。",
      febCode(
        "〇整数型: fib(整数型: n)",
        "  if (n が 2 以下)",
        "    return 1",
        "  endif",
        "  return fib(n - 1) + fib(n - 2)"
      )
    ),
    choices: [
      "戻り値 8、呼ばれた回数 15",
      "戻り値 8、呼ばれた回数 6",
      "戻り値 13、呼ばれた回数 15",
      "戻り値 8、呼ばれた回数 11",
    ],
    explanation: febText(
      "fib は 1、1、2、3、5、8 と並ぶので fib(6) は 8 である。",
      "呼ばれた回数は 15 回。同じ fib(4) や fib(3) が何度も計算されるので、回数は戻り値よりずっと速く増える。",
      "ここが「素朴な再帰は同じ計算を繰り返す」という話の実物である。一度計算した値を控えて使い回す (メモ化) と、呼ばれる回数は n に比例する程度まで下がる。"
    ),
  },
  {
    id: "feb-sc-fn-003",
    category: "scenario",
    module: "関数と再帰",
    code: "B4-3",
    priority: 2,
    name: febText(
      "次の関数は2つの正の整数の最大公約数を返す。gcd(1071, 462) の戻り値はどれか。割り算の余りを使う。",
      febCode(
        "〇整数型: gcd(整数型: a, 整数型: b)",
        "  if (b が 0 と等しい)",
        "    return a",
        "  endif",
        "  return gcd(b, a を b で割った余り)"
      )
    ),
    choices: ["21", "3", "7", "42"],
    explanation: febText(
      "1071 を 462 で割った余りは 147。462 を 147 で割った余りは 21。147 を 21 で割った余りは 0 なので 21 を返す。",
      "これがユークリッドの互除法である。引数が (a, b) から (b, 余り) に入れ替わるところが肝で、余りは必ず b より小さいので確実に 0 に向かう。",
      "1071 は 3 × 7 × 51 ではなく 3 × 357、462 は 2 × 3 × 7 × 11 である。共通の素因数は 3 と 7 なので 21 で合う。"
    ),
  },
  {
    id: "feb-sc-fn-004",
    category: "scenario",
    module: "関数と再帰",
    code: "B4-4",
    priority: 2,
    name: febText(
      "次の関数の ketawa(9875) の戻り値はどれか。割り算は商の整数部分を返すものとする。",
      febCode(
        "〇整数型: ketawa(整数型: n)",
        "  if (n が 10 より小さい)",
        "    return n",
        "  endif",
        "  return (n を 10 で割った余り) + ketawa(n ÷ 10)"
      )
    ),
    choices: ["29", "9875", "20", "9"],
    explanation: febText(
      "9 + 8 + 7 + 5 で 29 である。",
      "10 で割った余りが一番下の桁、10 で割った商が残りの桁になる。これを n が 1 桁になるまで繰り返している。",
      "n が 10 より小さいときに n を返す行が足場である。ここを return 0 にすると最上位の桁が落ちて 20 になる。"
    ),
  }
);
