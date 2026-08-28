#!/usr/bin/env node
/**
 * 複数選択正誤を 5記述（正3・誤2）に揃え、トピック外の記述を差し替える。
 * 実行: node scripts/fix-judgment-multi.js
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../data/judgment-questions.js");
let src = fs.readFileSync(file, "utf8");

const REPLACEMENTS = {
  "j-055": {
    pick: "correct",
    code: "MRPと計画",
    explanation: "MRP＝提案、PIR＝見込需要。MD04は需給一覧。自動発注送信は誤り。",
    statements: [
      { text: "MD02で内製品不足が検出されると計画手配が生成される。", correct: true },
      { text: "MRPは外部調達品について購買依頼を提案するが、発注を自動送信はしない。", correct: true },
      { text: "PIR（計画独立所要量）があれば実受注がなくても需要として認識される。", correct: true },
      { text: "MRP実行で購買発注が仕入先へ自動送信される。", correct: false, note: "MRPが作るのは購買依頼・計画手配などの「提案」。発注はME21N等で担当者が変換する。" },
      { text: "MD04は原価センタマスタの登録・変更を行う。", correct: false, note: "MD04は需給状況一覧（MRPリスト）。マスタ変更はKS02（原価センタ変更）等。" },
    ],
  },
  "j-061": {
    pick: "correct",
    code: "G/Lタイプ",
    explanation: "S/4のP/S/X区分と二次原価の入口制限。一次原価PはFB50から転記可。",
    statements: [
      { text: "S/4では原価要素がG/L勘定マスタ（FS00）に統合されている。", correct: true },
      { text: "G/LタイプPは一次原価、Sは二次原価を表す。", correct: true },
      { text: "G/LタイプX（BS勘定）は原価要素としてCOへ費用を送らない。", correct: true },
      { text: "G/LタイプSの勘定はFB50から直接FI伝票として転記できる。", correct: false, note: "二次原価（G/LタイプS）はFI伝票入力から直接転記できない。KB21NなどCO取引から入る。" },
      { text: "G/LタイプPの一次原価はFB50から転記できない。", correct: false, note: "一次原価PはFB50（G/L伝票入力）からFI伝票として転記できる。" },
    ],
  },
  "j-063": {
    pick: "correct",
    code: "照会Tコード",
    explanation: "KS03＝マスタ照会、KSB1＝明細照会。01/03系とxB1系の使い分け。",
    statements: [
      { text: "KS03は原価センタマスタ（定義）の照会である。", correct: true },
      { text: "KSB1は原価センタの実際原価明細照会である。", correct: true },
      { text: "01/03系はマスタ照会、xB1系は明細照会というパターンがある。", correct: true },
      { text: "KS03で原価センタへの実績金額明細を確認できる。", correct: false, note: "KS03はマスタ（定義）の照会。実績金額明細はKSB1（原価センタ実際明細照会）。" },
      { text: "KSB1で原価センタマスタの定義を変更できる。", correct: false, note: "KSB1は実績明細の照会専用。マスタ変更はKS02（原価センタ変更）等。" },
    ],
  },
  "j-067": {
    pick: "correct",
    code: "補助元帳",
    explanation: "統制勘定＝整合性の要。FS10N→明細のドリルダウンがFI照会の定番。",
    statements: [
      { text: "統制勘定は補助元帳とG/Lの橋渡し役である。", correct: true },
      { text: "補助元帳残高合計は統制勘定経由でG/L残高と一致する。", correct: true },
      { text: "FS10NからFBL3N相当の明細へドリルダウンできる。", correct: true },
      { text: "補助元帳は統制勘定なしにG/Lと独立して残高管理される。", correct: false, note: "補助元帳残高は統制勘定を通じてG/L残高と一致する。統制勘定が橋渡し役。" },
      { text: "FD10Nの残高を開くとG/L勘定マスタ（FS00）が表示される。", correct: false, note: "FD10N（得意先残高）からはFBL5N（得意先明細）へのドリルダウンが典型。FS00はG/Lマスタ保守。" },
    ],
  },
  "j-068": {
    pick: "incorrect",
    code: "固定資産",
    explanation: "AW01N＝照会、AS01＝登録。取得仕訳は手動転記が必要な場合がある。",
    statements: [
      { text: "AW01Nは固定資産マスタの登録・変更画面である。", correct: false, note: "AW01Nは取得価額・減価償却・簿価など「値」の照会。マスタ登録はAS01。" },
      { text: "固定資産取得の会計仕訳は常に自動で完了し手動転記は不要である。", correct: false, note: "取得方法・設定により手動転記や追加仕訳が必要な場合がある。常に自動完了とは限らない。" },
      { text: "AW01Nは取得価額・減価償却・簿価など値の照会である。", correct: true },
      { text: "AS01が固定資産マスタ登録である。", correct: true },
      { text: "統制勘定フラグ付きG/L勘定はFB50から直接仕訳入力できない。", correct: true },
    ],
  },
  "j-071": {
    pick: "correct",
    code: "在庫とCO",
    explanation: "MM-CO連携と在庫原則。入庫仕訳はGR/IRが貸方。",
    statements: [
      { text: "移動タイプ201（原価センタ向け出庫）でCO原価センタに実績転記される。", correct: true },
      { text: "移動タイプ261（指図向け出庫）で製造指図に材料費が載る。", correct: true },
      { text: "在庫は入出庫転記（MIGO）以外では変更できない。", correct: true },
      { text: "入庫101で借方:買掛金／貸方:在庫の仕訳が作られる。", correct: false, note: "入庫時は請求書前のため借方:在庫／貸方:GR/IR。買掛金はMIRO（請求書照合）後。" },
      { text: "MMBEで在庫数量を直接編集して棚卸差異を修正できる。", correct: false, note: "在庫は入出庫転記（MIGO）でのみ変更できる。照会画面MMBEに数量入力欄はない。" },
    ],
  },
  "j-076": {
    pick: "incorrect",
    code: "運用Tコード",
    explanation: "SM12は無断削除厳禁。ST22＝ダンプ、SM37＝ジョブ監視。",
    statements: [
      { text: "SM12で他ユーザのロックを確認なしで即削除してよい。", correct: false, note: "放置ロックは本人確認後にのみ削除すべき。無断削除は業務データ破損のリスクがある。" },
      { text: "ST22はバッチジョブの実行状況を監視する画面である。", correct: false, note: "ST22はABAP異常終了（ショートダンプ）の第一確認先。ジョブ監視はSM37。" },
      { text: "ST22はABAP異常終了（ショートダンプ）の第一確認先である。", correct: true },
      { text: "SM36でジョブ定義、SM37で実行状況監視である。", correct: true },
      { text: "STMSは開発機の移送依頼を本番へインポートする。", correct: true },
    ],
  },
  "j-080": {
    pick: "incorrect",
    code: "転記の意味",
    explanation: "転記＝保存による確定更新。プレビュー・未保存では残高は動かない。",
    statements: [
      { text: "「転記」とは保存して在庫・勘定残高を実際に更新することである。", correct: true },
      { text: "入力中（未保存）は残高に影響しない。", correct: true },
      { text: "会計のみの伝票登録で対応する物料伝票が自動生成される。", correct: false, note: "物料伝票はMIGO等の在庫移動から生成される。会計伝票だけでは在庫は動かない。" },
      { text: "プレビュー表示の段階で勘定残高・在庫数量は更新済みになる。", correct: false, note: "転記（保存）が完了するまで残高は動かない。プレビューは確定前のイメージ。" },
      { text: "保存せずにログオフしても、入力途中の内容は転記済みとして残る。", correct: false, note: "未保存データは転記されない。セッション終了で破棄される。" },
    ],
  },
  "j-081": {
    pick: "correct",
    code: "支払サイクル",
    explanation: "照合→支払の分離。支払はB/S整理、費用は照合時。",
    statements: [
      { text: "MIROで請求書を転記しても同時に銀行口座から支払は実行されない。", correct: true },
      { text: "F110は未消込買掛金明細を対象に自動支払する。", correct: true },
      { text: "支払仕訳は借方:買掛金／貸方:銀行勘定である。", correct: true },
      { text: "支払実行でP/L上の費用が増加する。", correct: false, note: "支払は借方:買掛金／貸方:銀行勘定でB/S整理。費用計上は請求書照合（MIRO/FB60）のタイミング。" },
      { text: "F110は請求書照合の3点照合（発注・入庫・請求）を実行する。", correct: false, note: "3点照合はMIROの機能。F110は未消込買掛金の自動支払プログラム。" },
    ],
  },
  "j-083": {
    pick: "correct",
    code: "3点照合",
    explanation: "LIVの核心。FB60はMIROの代替ではない。",
    statements: [
      { text: "MIROでは発注数量・入庫数量・請求数量の3点照合が行われる。", correct: true },
      { text: "許容範囲超過で請求書照合がブロックされる。", correct: true },
      { text: "FB60は購買非参照の買掛金直接入力である。", correct: true },
      { text: "FB60でも発注参照ありの3点照合が行われる。", correct: false, note: "FB60は購買非参照の直接入力。3点照合（発注・入庫・請求）はMIROの機能。" },
      { text: "MIROで請求書を転記すると同時に銀行口座から支払が実行される。", correct: false, note: "MIROは買掛金計上まで。支払はF110等の別ステップ。" },
    ],
  },
  "j-090": {
    pick: "incorrect",
    code: "ロックとダンプ",
    explanation: "ST22=ダンプ、SM12=ロック、SU53=権限（本人・直後）。SM37=ジョブ。",
    statements: [
      { text: "放置ロックは本人確認後にのみ削除すべきである。", correct: true },
      { text: "ST22はダンプ解析の定番Tコードである。", correct: true },
      { text: "SM12はテーブルロックの確認・解除に使う。", correct: true },
      { text: "ダンプが出たらまずSM37でジョブ状況を見る。", correct: false, note: "ABAP異常終了（ショートダンプ）の第一確認先はST22。SM37はバッチジョブ監視。" },
      { text: "SU53は管理者が他ユーザの権限エラーを後から調査する専用画面である。", correct: false, note: "SU53は権限エラー直後に本人が実行すると失敗した権限オブジェクトが見える。" },
    ],
  },
  "j-092": {
    pick: "incorrect",
    code: "利益センタ",
    explanation: "利益センタ＝統計典型。原価センタ/指図の使い分け。",
    statements: [
      { text: "利益センタへの転記は統計転記扱いが典型である。", correct: true },
      { text: "原価センタは常設部門の原価集計に使う。", correct: true },
      { text: "内部指図はプロジェクト等の一時的原価集計に使う。", correct: true },
      { text: "利益センタ実績は原価センタ配賦の計算対象になる。", correct: false, note: "利益センタへの転記は統計転記扱いが典型。原価センタ配賦の計算対象にはならない。" },
      { text: "利益センタへの転記は実績転記であり配賦・決済のベースデータになる。", correct: false, note: "利益センタは統計（参考）が典型。配賦・決済のベースは原価センタ等の実績転記。" },
    ],
  },
  "j-093": {
    pick: "correct",
    code: "債権債務",
    explanation: "債権債務管理と支払のB/S性。統制勘定制約。",
    statements: [
      { text: "FB70で計上した売上も売掛金明細として管理される。", correct: true },
      { text: "FBL5Nは得意先明細、FBL1Nは仕入先明細照会である。", correct: true },
      { text: "支払はB/S科目の整理でP/Lは影響しない。", correct: true },
      { text: "買掛金支払でP/L費用が増える。", correct: false, note: "支払はB/S科目（買掛金・銀行）の整理。P/L費用計上は請求書照合の時点。" },
      { text: "統制勘定なしのG/L勘定だけで仕入先補助元帳を独立管理できる。", correct: false, note: "仕入先・得意先補助元帳は統制勘定を通じてG/Lと整合する。" },
    ],
  },
  "j-095": {
    pick: "correct",
    code: "引当と在庫",
    explanation: "ATP vs MMBE、在庫はPGIで動く。",
    statements: [
      { text: "ATPは入出庫予定と既存引当を考慮した約束可能量を出す。", correct: true },
      { text: "MMBEは現在庫の照会である。", correct: true },
      { text: "PGI前に出荷伝票だけ作成すれば在庫は減らない。", correct: true },
      { text: "MMBEの数量を増やせばATP不足を解消できる。", correct: false, note: "MMBEは照会のみ。在庫変更はMIGO等の入出庫転記が必要。" },
      { text: "ATPは現在庫のみを見て入庫予定や引当を考慮しない。", correct: false, note: "ATPは入出庫予定・既存引当を考慮した約束可能量。MMBE（現在庫のみ）とは異なる。" },
    ],
  },
  "j-097": {
    pick: "correct",
    code: "統合プロセス",
    explanation: "Procure/Order/Manufacture to Xの会計タイミング統合理解。",
    statements: [
      { text: "調達で会計が動くのは入庫・請求書照合・支払である。", correct: true },
      { text: "販売で売上計上はVF01、原価計上はPGIである。", correct: true },
      { text: "製造で材料費は261、加工費は確認で指図に載る。", correct: true },
      { text: "発注・受注・指図登録の時点で会計伝票が必ず生成される。", correct: false, note: "発注・受注・指図登録は約束・計画の記録。会計が動くのは入庫・照合・PGI・請求等。" },
      { text: "支払実行の時点でP/L上の費用が初めて計上される。", correct: false, note: "費用計上は請求書照合（MIRO等）のタイミング。支払はB/S整理。" },
    ],
  },
  "j-130": {
    pick: "correct",
    code: "移動タイプ",
    explanation: "101/102/122は定番。301は社内転送で購買入庫ではない。",
    statements: [
      { text: "101は購買発注に対する通常の発注入庫に使う。", correct: true },
      { text: "102は101（発注入庫）の取消に使う。", correct: true },
      { text: "122は仕入先への返品入庫に使う。", correct: true },
      { text: "301は仕入先からの購買入庫（発注入庫）に使う。", correct: false, note: "301はプラント間在庫転送（社内再配置）。購買入庫は101。" },
      { text: "101入庫で借方:買掛金／貸方:在庫となる。", correct: false, note: "101入庫時は借方:在庫／貸方:GR/IR。買掛金はMIRO（請求書照合）後。" },
    ],
  },
  "j-137": {
    pick: "correct",
    code: "POデフォルト出所",
    explanation: "品目・購買情報・仕入先マスタがPOデフォルトの三本柱。",
    statements: [
      { text: "数量単位は品目マスタから提案され得る。", correct: true },
      { text: "納入リードタイムや価格は購買情報レコードから提案され得る。", correct: true },
      { text: "仕入先住所はサプライヤのパートナデータから転記され得る。", correct: true },
      { text: "買掛金の統制勘定は購買発注明細から毎回手入力する。", correct: false, note: "統制勘定はBPのFI仕入先ロールの会社コードデータでマスタ設定する。" },
      { text: "GR/IR残高から購買発注の単価が自動決定される。", correct: false, note: "GR/IRは入庫と請求の差異吸収用の経過勘定。発注単価のデフォルト元は購買情報レコード等。" },
    ],
  },
};

function fmtStatements(stmts) {
  return stmts
    .map((s) => {
      let line = `      { text: "${s.text}", correct: ${s.correct}`;
      if (s.note) line += `, note: "${s.note}"`;
      line += " },";
      return line;
    })
    .join("\n");
}

function fmtBlock(id, data) {
  const head = `  { id: "${id}", category: "judgment", module: "${moduleOf(id)}", code: "${data.code}", pick: "${data.pick}", priority: ${priorityOf(id)}, statements: [\n`;
  const foot = `    ], explanation: "${data.explanation}" },`;
  return head + fmtStatements(data.statements) + "\n" + foot;
}

const MODULE_MAP = {};
const PRIORITY_MAP = {};

// parse existing module/priority from file
for (const m of src.matchAll(/\{ id: "(j-\d+)", category: "judgment", module: "([^"]+)", code: "([^"]+)", pick: "(correct|incorrect)", priority: (\d+), statements:/g)) {
  MODULE_MAP[m[1]] = m[2];
  PRIORITY_MAP[m[1]] = m[5];
}

function moduleOf(id) {
  return MODULE_MAP[id] || "MM";
}
function priorityOf(id) {
  return PRIORITY_MAP[id] || 1;
}

for (const [id, data] of Object.entries(REPLACEMENTS)) {
  const re = new RegExp(
    `  \\{ id: "${id}", category: "judgment", module: "[^"]+", code: "[^"]+", pick: "(?:correct|incorrect)", priority: \\d+, statements: \\[[\\s\\S]*?\\], explanation: "[^"]*" \\},`
  );
  const block = fmtBlock(id, data);
  if (!re.test(src)) {
    console.error(`Not found: ${id}`);
    process.exit(1);
  }
  src = src.replace(re, block);
}

// SE16N off-topic in j-076 - remove from remaining if still there
src = src.replace(
  /      \{ text: "SE16Nは本番でも更新リスクなくテーブル照会できる。", correct: true \},\n/,
  ""
);

// j-098 duplicate SE16N - keep one statement about SE16N as true is ok for 本番運用

fs.writeFileSync(file, src);
console.log(`Updated ${Object.keys(REPLACEMENTS).length} judgment-multi questions.`);
