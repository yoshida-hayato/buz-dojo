#!/usr/bin/env node
/**
 * 複数選択正誤の正誤比率を統一:
 *   pick=correct   → 正3・誤2
 *   pick=incorrect → 正2・誤3
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../data/judgment-questions.js");
let src = fs.readFileSync(file, "utf8");

const PATCHES = {
  "j-052": {
    flip: [{ from: "VL02Nでピッキング数量を出荷数量と一致させてからPGIに進む。", to: { text: "VL02Nでピッキング数量を入力せず、そのままPGIに進めるのが標準である。", correct: false, note: "VL02Nでピッキング数量を出荷数量と一致させてからPGIに進むのが標準フロー。" } }],
  },
  "j-054": {
    flip: [{ from: "受注時にATPチェックが自動実行され約束可能量を確認する。", to: { text: "受注登録時点ではATPチェックは実行されず、出荷伝票作成時に初めて実行される。", correct: false, note: "受注時にATPチェックが自動実行され、約束可能量を確認する。" } }],
  },
  "j-058": {
    flip: [{ from: "指図決済は原価差異を精算し指図残高をゼロにする処理である。", to: { text: "指図決済は入庫と同時に自動実行され、手動での決済処理は不要である。", correct: false, note: "指図決済は原価差異を精算し指図残高をゼロにする月次処理。入庫後も手動決済が必要な場合がある。" } }],
  },
  "j-062": {
    flip: [{ from: "確認で入力した作業時間×活動タイプ単価が加工費になる。", to: { text: "作業時間の入力は進捗報告のみで、原価計算（加工費）には影響しない。", correct: false, note: "確認で入力した作業時間×活動タイプ単価が加工費として指図に転記される。" } }],
  },
  "j-063": {
    replace: {
      explanation: "KS03＝マスタ照会、KSB1/KB13＝xB1系明細照会。01/03系とxB1系の使い分け。",
      statements: [
        { text: "KS03は原価センタマスタ（定義）の照会である。", correct: true },
        { text: "KSB1は原価センタの実際原価明細照会である。", correct: true },
        { text: "KB13は内部指図の実績明細照会であり、KSB1と同様xB1系の延長である。", correct: true },
        { text: "KS03で原価センタへの実績金額明細を確認できる。", correct: false, note: "KS03はマスタ（定義）の照会。実績金額明細はKSB1（原価センタ実際明細照会）。" },
        { text: "KSB1で原価センタマスタの定義を変更できる。", correct: false, note: "KSB1は実績明細の照会専用。マスタ変更はKS02（原価センタ変更）等。" },
      ],
    },
  },
  "j-064": {
    flip: [{ from: "調達サイクルで会計が動くのは入庫・請求書照合・支払の3か所である。", to: { text: "調達サイクルで会計が動くのは発注・入庫・支払の3か所である。", correct: false, note: "発注は会計不動。会計が動くのは入庫・請求書照合・支払。" } }],
  },
  "j-066": {
    flip: [{ from: "FB08は元伝票を削除せず反対仕訳で取消する。", to: { text: "FB08は元伝票をデータベースから物理削除し、監査証跡も残さない。", correct: false, note: "FB08は元伝票を削除せず反対仕訳で取消し、痕跡を残す。" } }],
  },
  "j-068": {
    flip: [{ from: "AS01が固定資産マスタ登録である。", to: { text: "AS01は固定資産の取得価額・減価償却の照会専用である。", correct: false, note: "AS01は固定資産マスタ登録。取得価額照会はAW01N。" } }],
  },
  "j-072": {
    flip: [{ from: "ジョブは役割の型、ポジションは組織上の空席である。", to: { text: "ジョブは組織上の空席、ポジションは役割の型である。", correct: false, note: "ジョブ＝役割の型、ポジション＝組織上の空席。" } }],
  },
  "j-074": {
    flip: [{ from: "人事領域は必ず1つの会社コードに割り当てられる。", to: { text: "人事領域は複数の会社コードにまたがって割り当てられる。", correct: false, note: "人事領域は必ず1つの会社コードに割り当てられる。" } }],
  },
  "j-076": {
    flip: [{ from: "SM36でジョブ定義、SM37で実行状況監視である。", to: { text: "SM36でジョブ実行状況を監視し、SM37でジョブ定義を行う。", correct: false, note: "SM36でジョブ定義、SM37で実行状況監視である。" } }],
  },
  "j-077": {
    flip: [{ from: "本番で独自UPDATEプログラム実行は照会目的でも厳禁である。", to: { text: "本番でのZプログラム実行は、照会目的であればテスト実行してよい。", correct: false, note: "本番での独自UPDATEプログラム実行は照会目的でもデータ変更リスクがあり厳禁。" } }],
  },
  "j-078": {
    flip: [{ from: "同一BPの名称・住所は一般データ1回変更で全ロールに反映される。", to: { text: "同一BPの名称・住所はロールごとに個別登録し、一般データ変更は各ロールに反映されない。", correct: false, note: "一般データ（名称・住所等）は1回変更で全ロールに反映される。" } }],
  },
  "j-082": {
    flip: [{ from: "SDは原価と売上の計上タイミングを意図的に分離している。", to: { text: "SD標準ではPGIと同時に売上高・売掛金も計上される。", correct: false, note: "SDは原価（PGI）と売上（VF01）の計上タイミングを意図的に分離している。" } }],
  },
  "j-084": {
    flip: [{ from: "KB21N（活動配賦）で二次原価が配賦される。", to: { text: "KB21N（活動配賦）は一次原価のみを配賦し、二次原価は対象外である。", correct: false, note: "KB21N（活動配賦）で二次原価が原価センタ間に配賦される。" } }],
  },
  "j-086": {
    flip: [{ from: "統制勘定は補助元帳経由のみ転記可能である。", to: { text: "統制勘定フラグのないG/L勘定でも、仕入先補助元帳を独立管理できる。", correct: false, note: "仕入先・得意先補助元帳は統制勘定を通じてG/Lと整合する。" } }],
  },
  "j-088": {
    flip: [{ from: "MRP結果の購買依頼はME21Nで発注に変換する。", to: { text: "MRP結果の購買依頼は自動的に仕入先へ発注送信される。", correct: false, note: "MRP結果の購買依頼はME21N等で担当者が発注に変換する。自動送信はしない。" } }],
  },
  "j-090": {
    flip: [{ from: "ST22はダンプ解析の定番Tコードである。", to: { text: "ST22はバッチジョブ監視の定番Tコードである。", correct: false, note: "ST22はABAPダンプ解析の定番。ジョブ監視はSM37。" } }],
  },
  "j-092": {
    flip: [{ from: "内部指図はプロジェクト等の一時的原価集計に使う。", to: { text: "内部指図は常設部門の原価集計に使い、原価センタは一時的な入れ物である。", correct: false, note: "原価センタ＝常設部門、内部指図＝プロジェクト等の一時的原価集計。" } }],
  },
  "j-094": {
    flip: [{ from: "201は原価センタ向け出庫である。", to: { text: "201は指図向け出庫（材料消費）である。", correct: false, note: "201は原価センタ向け出庫。261が指図向け出庫。" } }],
  },
  "j-096": {
    flip: [{ from: "外注品はMRP結果が購買依頼になる。", to: { text: "外注品はMRP結果が製造指図（計画手配）になる。", correct: false, note: "外注品（外部調達）はMRP結果が購買依頼になる。計画手配は内製品。" } }],
  },
  "j-098": {
    flip: [{ from: "移送はテスト環境で十分検証してから本番インポートする。", to: { text: "移送はテスト環境での検証なしに本番へ直接インポートしてよい。", correct: false, note: "移送はテスト環境で十分検証してから本番インポートする。" } }],
  },
  "j-100": {
    flip: [{ from: "FD10N→明細→伝票のドリルダウンは債権調査に使える。", to: { text: "FD10Nの残高はG/L勘定マスタ（FS00）へのドリルダウンのみ可能である。", correct: false, note: "FD10N→FBL5N（得意先明細）→伝票のドリルダウンは債権調査に使える。" } }],
  },
  "j-112": {
    flip: [{ from: "購買グループはME21Nのヘッダに入力される。", to: { text: "購買グループは購買発注明細行ごとに必ず個別入力する。", correct: false, note: "購買グループはME21Nのヘッダに入力される。" } }],
  },
  "j-122": {
    flip: [{ from: "納入日付は明細行ごとに設定できる。", to: { text: "納入日付はヘッダに1つだけ設定し、全明細行が同一日付になる。", correct: false, note: "納入日付は明細行ごとに設定できる。" } }],
  },
  "j-131": {
    replace: {
      explanation: "誤りは「請求書番号で自動入庫」「PO番号は重複チェック専用」「納品書番号は入庫と無関係」。各参照は目的が異なる。",
      statements: [
        { text: "仕入先請求書番号は請求書の識別と重複登録防止に使う。", correct: true },
        { text: "購買発注番号は発注・入庫実績との3点照合の起点になる。", correct: true },
        { text: "仕入先請求書番号を入力すると、入庫（MIGO）が自動実行される。", correct: false, note: "請求書番号は請求書の識別用。入庫はMIGO等で別途転記。MIROは照合・買掛計上。" },
        { text: "購買発注番号は請求書の重複チェック専用で、入庫実績とは無関係である。", correct: false, note: "PO番号は発注明細・入庫履歴を引き、3点照合の起点になる。重複チェック専用ではない。" },
        { text: "納品書番号は入庫実績とは無関係で、請求書の重複チェック専用である。", correct: false, note: "納品書番号は同一POへの複数回納入があるとき、特定の納品と請求を結びつける。" },
      ],
    },
  },
  "j-138": {
    replace: {
      explanation: "誤りは「品目マスタで定義」「請求元と発注先は常に同一」「品目供給者は品目マスタで定義」。4機能はBP側。",
      statements: [
        { text: "購買発注先住所は発注書の送付先などに使われる。", correct: true },
        { text: "請求元は請求書処理で使われるパートナー機能である。", correct: true },
        { text: "取引先機能は品目マスタの会計ビューで定義する。", correct: false, note: "取引先機能はビジネスパートナ（サプライヤロール）のパートナ機能。品目マスタとは別。" },
        { text: "請求元と購買発注先住所は常に同一でなければならない。", correct: false, note: "別拠点・別請求センターがあり得る。機能ごとにBPへ割り当て可能。" },
        { text: "品目供給者は品目マスタの一般データで定義する。", correct: false, note: "品目供給者はBP（サプライヤ）のパートナ機能。品目マスタの一般データとは別。" },
      ],
    },
  },
  "j-145": {
    flip: [{ from: "産業コードは画面レイアウトや項目選択を業種別に制御する。", to: { text: "産業コードは品目タイプ（ROH/FERT等）を決定する。", correct: false, note: "産業コードは画面レイアウト・項目選択を業種別に制御。品目タイプとは別の設定。" } }],
  },
};

function stmtLine(s) {
  let line = `      { text: "${s.text}", correct: ${s.correct}`;
  if (s.note) line += `, note: "${s.note}"`;
  return line + " },";
}

function applyFlip(block, flip) {
  for (const f of flip) {
    const re = new RegExp(
      `      \\{ text: "${f.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}", correct: (true|false)(?:, note: "[^"]*")? \\},`
    );
    if (!re.test(block)) {
      throw new Error(`Flip not found: ${f.from}`);
    }
    block = block.replace(re, stmtLine(f.to));
  }
  return block;
}

function applyReplace(block, data, id) {
  const headRe = new RegExp(
    `(  \\{ id: "${id}", category: "judgment", module: "[^"]+", code: "[^"]+", pick: "(?:correct|incorrect)", priority: \\d+, statements: \\[)\\n[\\s\\S]*?(    \\], explanation: ")[^"]*(" \\},)`
  );
  const inner = data.statements.map(stmtLine).join("\n") + "\n";
  const repl = `$1\n${inner}$2${data.explanation}$3`;
  if (!headRe.test(block)) throw new Error(`Replace head not found: ${id}`);
  return block.replace(headRe, repl);
}

for (const [id, patch] of Object.entries(PATCHES)) {
  const re = new RegExp(
    `  \\{ id: "${id}", category: "judgment",[\\s\\S]*?\\], explanation: "[^"]*" \\},`
  );
  const m = src.match(re);
  if (!m) {
    console.error(`Not found: ${id}`);
    process.exit(1);
  }
  let block = m[0];
  if (patch.flip) block = applyFlip(block, patch.flip);
  if (patch.replace) block = applyReplace(block, patch.replace, id);
  src = src.replace(m[0], block);
}

fs.writeFileSync(file, src);
console.log(`Patched ${Object.keys(PATCHES).length} judgment-multi questions.`);
