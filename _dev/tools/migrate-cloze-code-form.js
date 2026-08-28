#!/usr/bin/env node
/**
 * 全 cloze を「やりたいこと → ```abap コード穴 → 解説で完成形」へ一括変換する。
 * 使い方: node tools/migrate-cloze-code-form.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const QPATH = path.join(ROOT, "data/questions.js");

const CODE = {
  "cz-ab-demo-select":
    "SELECT SINGLE * FROM mara\n  [[0]] @DATA(ls_mara)\n  WHERE matnr = @lv_matnr.\nIF sy-subrc [[1]] 0.\n  \" ヒット\nENDIF.",
  "cz-ab-001": "[[0]] 'HELLO'[[1]]",
  "cz-ab-002": "[[0]] この行は丸ごとコメント\nWRITE 'HELLO'. [[1]] 行末メモ",
  "cz-ab-003": "[[0]] lv_name TYPE [[1]] LENGTH 10.",
  "cz-ab-004": "DATA lv_amount TYPE [[0]] LENGTH 8 DECIMALS [[1]].",
  "cz-ab-005": "[[0]] lc_land TYPE land1 VALUE 'JP'.",
  "cz-ab-006": "[[0]] ty_name TYPE c LENGTH 10.\nDATA lv_name TYPE [[1]].",
  "cz-ab-007": "DATA lv_kunnr TYPE [[0]].",
  "cz-ab-008": "DATA lv_a TYPE kunnr.\nDATA lv_b [[0]] lv_a.",
  "cz-ab-009": "CONSTANTS lc_land TYPE land1 [[0]] 'JP'.",
  "cz-ab-010": "WRITE [[0]].",
  "cz-ab-011": 'DATA lv_date TYPE d.\n" 初期値は [[0]]',
  "cz-ab-012": "lv_to [[0]] lv_from.",
  "cz-ab-013": "[[0]] lv_qty.",
  "cz-ab-014": "lv_area = lv_side [[0]] 2.",
  "cz-ab-015": "lv_len = [[0]]( lv_text ).",
  "cz-ab-016": "CASE lv_status.\n  [[0]] 'A'.\n    WRITE '新規'.\n  WHEN OTHERS.\nENDCASE.",
  "cz-ab-017": "IF lv_qty [[0]] 10.\n  WRITE 'OK'.\nENDIF.",
  "cz-ab-018": "IF lv_name [[0]].\n  WRITE '入力あり'.\nENDIF.",
  "cz-ab-019": "LOOP AT lt_kna1 [[0]] ls_kna1.\n  WRITE ls_kna1-kunnr.\nENDLOOP.",
  "cz-ab-020": "DO 5 [[0]].\n  WRITE sy-index.\nENDDO.",
  "cz-ab-021": "[[0]] lv_qty > 0.\n  lv_qty = lv_qty - 1.\nENDWHILE.",
  "cz-ab-022": "LOOP AT lt_item [[0]] ls_item.\nENDLOOP.",
  "cz-ab-023": "SELECT SINGLE * FROM mara INTO @DATA(ls_mara) WHERE matnr = @lv.\nIF sy-subrc [[0]] 0.\nENDIF.",
  "cz-ab-024": "MESSAGE e001(zsd_msg) [[0]] lv_kunnr.",
  "cz-ab-025": "MESSAGE e001([[0]]) WITH lv_kunnr.",
  "cz-ab-026": '" OKコード欄\n[[0]]',
  "cz-ab-027": "[[0]] calculate_amount USING lv_qty CHANGING lv_total.",
  "cz-ab-028": "\" 汎用モジュールの作成・保守\nCALL TRANSACTION '[[0]]'.",
  "cz-ab-029": "[[0]] get_data.",
  "cz-ab-030": "CALL FUNCTION '[[0]]'\n  EXPORTING iv_qty = lv_qty.",
  "cz-ab-031": "zcl_calc[[0]]calculate( ).",
  "cz-ab-032": "METHODS get_detail\n  [[0]] iv_kunnr TYPE kunnr.",
  "cz-ab-033": "PERFORM fill_table [[0]] ct_item.",
  "cz-ab-034": "lo_cust[[0]]get_detail( ).",
  "cz-ab-035": "DATA lv_amt TYPE p LENGTH 8 [[0]] 2.",
  "cz-ab-036": "WRITE[[0]] / lv_a[[1]] / lv_b.",
  "cz-ab-037": "PERFORM calc [[0]] uv_qty.",
  "cz-ab-038": "PERFORM calc USING [[0]]( lv_qty ).",
  "cz-ab-039": "FORM show USING uv_kunnr TYPE [[0]].\nENDFORM.",
  "cz-ab-040": "FORM show USING uv_any TYPE [[0]].\nENDFORM.",
  "cz-ab-041": '" デバッガ: ステップイン\n" キー [[0]]',
  "cz-ab-042": '" デバッガ: ステップアウト\n" キー [[0]]',
  "cz-ab-043": '" 汎用モジュールの保存場所\n" 箱の名前: [[0]]',
  "cz-ab-044": "FORM calc USING [[0]]qty TYPE i.\nENDFORM.",
  "cz-ab-045": "CALL FUNCTION 'Z_GET'\n  EXCEPTIONS not_found = 1.\nIF [[0]] <> 0.\nENDIF.",
  "cz-ab-046": "\" リポジトリ横断検索\nCALL TRANSACTION '[[0]]'.",
  "cz-ab-047": "[[0]] 'Z_GET_CUSTOMER'.",
  "cz-ab-048": '" 汎用モジュールの保存単位\n" [[0]]',
  "cz-ab-049": '" SE37 の文書化タブ\n" 詳細を書く項目: [[0]]',
  "cz-ab-050": '" Function Group の中の公開API\n" 要素名: [[0]]',
  "cz-ab-051": "[[0]] 'Z_GET_CUSTOMER'\n  EXPORTING iv_kunnr = lv_kunnr.",
  "cz-ab-052": "CALL FUNCTION 'Z_GET_CUSTOMER'\n  [[0]] iv_kunnr = lv_kunnr.",
  "cz-ab-053": "[[0]] not_found.",
  "cz-ab-054": "CALL FUNCTION 'Z_GET'\n  EXCEPTIONS not_found = 1.\nCASE [[0]].\n  WHEN 1.\nENDCASE.",
  "cz-ab-055": '" BAPI_CUSTOMER_GETDETAIL\n" Business Object 部分: [[0]]',
  "cz-ab-056": "CALL FUNCTION 'BAPI_CUSTOMER_GETDETAIL'\n  IMPORTING [[0]] = ls_return.",
  "cz-ab-057": "[[0]] 'BAPI_CUSTOMER_GETDETAIL'.",
  "cz-ab-058": '" Function Group に対応するOOの箱\n" [[0]]',
  "cz-ab-059": "IF ls_return-type = '[[0]]'.\n  \" 処理を止める\nENDIF.",
  "cz-ab-060": "lo_cust->[[0]]( ).",
  "cz-ab-061": "[[0]] lo_cust TYPE REF TO zcl_customer.",
  "cz-ab-062": "lo_cust[[0]]get_detail( ).",
  "cz-ab-063": "CLASS zcl_app DEFINITION.\n  PUBLIC SECTION.\n    [[0]] gv_count TYPE i.\nENDCLASS.",
  "cz-ab-064": "CLASS zcl_app DEFINITION.\n  [[0]].\n    METHODS run.\nENDCLASS.",
  "cz-ab-065": "CLASS zcl_app DEFINITION.\n  [[0]].\n    DATA mv_secret TYPE string.\nENDCLASS.",
  "cz-ab-066": "CLASS zcl_app DEFINITION.\n  PUBLIC SECTION.\n    [[0]] factory RETURNING VALUE(ro) TYPE REF TO zcl_app.\nENDCLASS.",
  "cz-ab-067": "CLASS zcl_app DEFINITION.\n  PRIVATE SECTION.\n    [[0]] mv_id TYPE kunnr.\nENDCLASS.",
  "cz-ab-068": "TRY.\n    lo->run( ).\n  [[0]] cx_root INTO DATA(lx).\nENDTRY.",
  "cz-ab-069": "[[0]].\n  lo->run( ).\nCATCH cx_root INTO DATA(lx).\nENDTRY.",
  "cz-ab-070": "TRY.\n  lo->run( ).\nCATCH cx_root INTO DATA(lx).\n[[0]].",
  "cz-ab-071": "DATA lo_cust [[0]] zcl_customer.",
  "cz-ab-072": "METHODS [[0]].",
  "cz-ab-073": "CLASS [[0]] DEFINITION.\nENDCLASS.",
  "cz-ab-074": "CLASS [[0]]no_data DEFINITION\n  INHERITING FROM cx_static_check.\nENDCLASS.",
  "cz-ab-075": "TYPES: [[0]] ts_customer,\n         kunnr TYPE kunnr,\n       END OF ts_customer.",
  "cz-ab-076": "TYPES: BEGIN OF ts_customer,\n         kunnr TYPE kunnr,\n       [[0]] ts_customer.",
  "cz-ab-077": "TYPES: BEGIN OF [[0]],\n         kunnr TYPE kunnr,\n       END OF ts_customer.",
  "cz-ab-078": "ls_customer[[0]]kunnr = '1000'.",
  "cz-ab-079": "[[0]] ls_to FROM ls_from.",
  "cz-ab-080": "DATA lt_item TYPE [[0]] OF ts_item.",
  "cz-ab-081": "DATA lt_hash TYPE HASHED TABLE OF ts_item\n  WITH [[0]] kunnr.",
  "cz-ab-082": "READ TABLE lt_item [[0]] 1 INTO ls_item.",
  "cz-ab-083": "READ TABLE lt_item [[0]] kunnr = lv_kunnr INTO ls_item.",
  "cz-ab-084": "TYPES tt_item TYPE [[0]] ts_item.",
  "cz-ab-085": "DATA lt_cust TYPE [[0]].",
  "cz-ab-086": "[[0]] ls_item TO lt_item.",
  "cz-ab-087": "LOOP AT lt_item [[0]] ls_item.\nENDLOOP.",
  "cz-ab-088": "APPEND [[0]] lt_src TO lt_dst.",
  "cz-ab-089": "READ TABLE lt_item [[0]] kunnr = lv_kunnr INTO ls_item.",
  "cz-ab-090": "[[0]] lt_item BY kunnr.",
  "cz-ab-091": "SORT lt_item BY amount [[0]].",
  "cz-ab-092": "SORT lt_item [[0]] BY kunnr.",
  "cz-ab-093": "[[0]] lt_item.",
  "cz-ab-094": "DATA: lt_item TYPE TABLE OF ts_item [[0]].",
  "cz-ab-095": '" SE11 で ZCUSTOMER 定義後\n" 実体化操作: [[0]]',
  "cz-ab-096": '" テーブル技術設定\n" DB読込キャッシュ: [[0]]',
  "cz-ab-097": '" 主キー以外の検索を速くする\n" 付けるもの: [[0]]',
  "cz-ab-098": '" DDIC 階層\n" データエレメントの下で型を決める層: [[0]]',
  "cz-ab-099": '" プログラム終了後も残るデータ\n" 置き場: [[0]]',
  "cz-ab-100": "SELECT SINGLE * FROM mara INTO @DATA(ls)\n  [[0]] matnr = @lv_matnr.",
  "cz-ab-101": "SELECT SINGLE * FROM marc INTO @DATA(ls)\n  WHERE matnr = @lv_matnr\n    [[0]] werks = @lv_werks.",
  "cz-ab-102": "SELECT SINGLE matnr maktx FROM makt\n  INTO [[0]] ls_makt\n  WHERE matnr = @lv.",
  "cz-ab-103": "SELECT matnr maktx FROM makt\n  INTO [[0]] lt_makt\n  WHERE spras = @sy-langu.",
  "cz-ab-104": "SELECT SINGLE * [[0]] mara INTO @DATA(ls_mara).",
  "cz-ab-105": "SELECT SINGLE [[0]] FROM mara INTO @DATA(ls_mara)\n  WHERE matnr = @lv.",
  "cz-ab-106": "SELECT * FROM mara\n  [[0]] lt_mara\n  WHERE matnr IN @lr_matnr.",
  "cz-ab-107": "SELECT * FROM mara INTO TABLE @DATA(lt).\nWRITE [[0]].",
  "cz-ab-108": "SELECT * FROM mara\n  [[0]] @DATA(lt_mara)\n  WHERE matnr IN @lr.",
  "cz-ab-109": "SELECT * FROM kna1 [[0]]\n  INTO TABLE @DATA(lt)\n  WHERE mandt = '200'.",
  "cz-ab-110": '" 複合索引 (MANDT, BUKRS, BELNR)\n" WHERE は先頭から書く原則: [[0]]',
  "cz-ab-111": "SELECT a~belnr b~buzei\n  FROM bkpf AS a\n  [[0]] bseg AS b ON a~belnr = b~belnr\n  INTO TABLE @DATA(lt).",
  "cz-ab-112": '" JOIN の3要素のうち\n" テーブル同士を結びつける条件 = [[0]]',
  "cz-ab-113": "[[0]] zemployee FROM ls_employee.",
  "cz-ab-114": "[[0]] OBJECT 'F_BKPF_BUK'\n  ID 'BUKRS' FIELD p_bukrs\n  ID 'ACTVT' FIELD '03'.",
  "cz-ab-115": "AUTHORITY-CHECK OBJECT 'S_CARRID'\n  ID 'CARRID' [[0]]\n  ID 'ACTVT' FIELD '02'.",
  "cz-ab-116": "AUTHORITY-CHECK OBJECT 'F_BKPF_BUK'\n  ID 'ACTVT' FIELD '[[0]]'.",
  "cz-ab-117": "[[0]]: s_bukrs FOR bkpf-bukrs.",
  "cz-ab-118": '" Text Element\n" 一覧の列名用: [[0]]',
  "cz-ab-119": '" Text Element\n" 一覧タイトル用: [[0]]',
  "cz-ab-120": "[[0]] p_bukrs TYPE bukrs.",
  "cz-ab-121": "APPEND VALUE #( sign = '[[0]]' option = 'EQ' low = '1000' ) TO s_bukrs.",
  "cz-ab-122": "APPEND VALUE #( sign = '[[0]]' option = 'EQ' low = '1000' ) TO s_bukrs.",
  "cz-ab-123": "APPEND VALUE #( sign = 'I' option = '[[0]]' low = '1000' high = '2000' ) TO s_bukrs.",
  "cz-ab-124": "PARAMETERS p_bukrs TYPE bukrs [[0]] '1000'.",
  "cz-ab-125": "[[0]].\n  p_bukrs = '1000'.",
  "cz-ab-126": "SELECT * FROM bkpf\n  INTO TABLE @DATA(lt)\n  WHERE bukrs [[0]] s_bukrs.",
  "cz-ab-127": "[[0]].\n  AUTHORITY-CHECK OBJECT 'F_BKPF_BUK'\n    ID 'BUKRS' FIELD p_bukrs\n    ID 'ACTVT' FIELD '03'.",
  "cz-ab-128": "[[0]].\n  PERFORM get_data.",
  "cz-ab-129": '" イベントブロックは誰が起動する？\n" 起動主体: [[0]]\n" （CALL START-OF-SELECTION は無い）',
};

function wantOf(q) {
  const p = q.prompt || "";
  const m = p.match(/^([\s\S]*?たい。)/);
  if (m && !m[1].includes("[[")) return m[1].trim();
  const first = p.split("。")[0];
  if (first && !first.includes("[[")) return first.trim() + "。";
  return (q.name || "次の処理を書きたい") + "。";
}

function scrubExp(exp) {
  return String(exp || "")
    .replace(/たとえは[^。]*。/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function filledCode(id, blanks) {
  let c = CODE[id];
  blanks.forEach((b, i) => {
    c = c.split(`[[${i}]]`).join(b.answer);
  });
  return c;
}

function main() {
  const src = fs.readFileSync(QPATH, "utf8");
  vm.runInThisContext(src);
  const cloze = QUIZ_DATA.filter((q) => q && q.category === "cloze");

  let missing = [];
  let blankBad = [];
  for (const q of cloze) {
    if (!CODE[q.id]) missing.push(q.id);
    else {
      const n = (CODE[q.id].match(/\[\[\d+\]\]/g) || []).length;
      if (n !== q.blanks.length) blankBad.push(`${q.id}:${n}/${q.blanks.length}`);
    }
  }
  if (missing.length || blankBad.length) {
    console.error("missing", missing);
    console.error("blankBad", blankBad);
    process.exit(1);
  }

  let text = src;
  let updated = 0;
  for (const q of cloze) {
    const want = wantOf(q);
    const code = CODE[q.id];
    const newPrompt = `${want}\n\n\`\`\`abap\n${code}\n\`\`\``;
    const complete = filledCode(q.id, q.blanks);
    const base = scrubExp(q.explanation);
    const newExpl =
      `穴を埋めた完成形は次のとおり。\n\`\`\`abap\n${complete}\n\`\`\`\n` + base;

    // Replace prompt: between prompt: " and ",\n    blanks
    const idRe = new RegExp(
      `(\\{ id: "${q.id}"[\\s\\S]*?prompt: )([\`"])([\\s\\S]*?)\\2([\\s\\S]*?explanation: )([\`"])([\\s\\S]*?)\\5`,
      "m"
    );
    const m = text.match(idRe);
    if (!m) {
      console.error("block not found", q.id);
      process.exit(1);
    }
    // Use JSON.stringify for safe escaping of new strings in JS source
    const pLit = JSON.stringify(newPrompt);
    const eLit = JSON.stringify(newExpl);
    const replaced = text.replace(idRe, (_, a, _q1, _oldP, mid, _q2, _oldE) => {
      return `${a}${pLit}${mid}${eLit}`;
    });
    if (replaced === text) {
      console.error("no change", q.id);
      process.exit(1);
    }
    text = replaced;
    updated++;
  }

  fs.writeFileSync(QPATH, text);
  console.log("updated", updated, "cloze prompts/explanations");
}

main();
