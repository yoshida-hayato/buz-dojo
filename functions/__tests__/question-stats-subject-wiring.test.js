//
// questionStats の科目配線のガード。
//
// なぜ必要か: 2026-10-26 に実測した。レジストリの有効な科目は10本なのに、
// questionStats の科目一覧は8本しか無く、biz-pm-planning と
// biz-pm-operation が最初から欠けていた。欠けた影響は2つ。
//   (1) functions/question-stats-merge.js の listAllQuestionStatsBuz は
//       この一覧を回してサブコレクションを読むので、専門2科目の
//       問題別集計を一度も読まない
//   (2) 接頭の当て推量が専門2科目を生産管理に吸い込む。マスタの実物で
//       問題 id を確かめたところ、生産管理は bc-sc-、プランニング専門は
//       bc-pp-、オペレーション専門は bc-po- で、3つとも bc- で始まる。
//       bc- の行が先に当たるので、専門の問題は全部 biz-career に行く
//
// 直す前の時点で、テストは71ファイル690件が通っていた。科目ごとの配線は
// ほかに9箇所あり (料金・帯・静的な頁・配信の札・索引の台本など)、
// どれもレジストリから導くか既定の組み立てを持つかで、現にそろっていた。
// そろっていなかったのは、手で並べた字面の表を持ち、既定も無く、
// 見張りも無かったこの1箇所だけである。だからここに見張りを置く。
//
// 見張るのは6つ。(1) 両方の一覧がレジストリの有効な科目と一致する
// (2) 既定の控えも一致する (3) 接頭の表が2枚で同じ中身である
// (4) マスタの実物の id が正しい科目に行く (5) 長い接頭が短い接頭より
// 先に在る (これが今回の壊れ方そのもの) (6) 3枚目の表を持たない
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const read = (...rel) => fs.readFileSync(path.join(ROOT, ...rel), "utf8");

const REGISTRY = read("subjects", "registry.js");
const CLIENT_SRC = read("js", "question-stats-paths.js");
const ADMIN_SRC = read("js", "admin-question-stats-shared.js");
const ADMIN_HTML = read("admin", "question-analytics.html");

const server = require("../question-stats-paths");

function clientModule(withRegistry) {
  const ctx = vm.createContext({ console, JSON, Math, window: {} });
  if (withRegistry) vm.runInContext(REGISTRY, ctx, { filename: "registry" });
  vm.runInContext(CLIENT_SRC, ctx, { filename: "question-stats-paths" });
  return vm.runInContext("QuestionStatsPaths", ctx, { filename: "get" });
}

function registryIds() {
  const ctx = vm.createContext({});
  vm.runInContext(REGISTRY, ctx, { filename: "registry" });
  return vm.runInContext(
    "SUBJECT_REGISTRY.filter(function (s) { return s.enabled !== false; }).map(function (s) { return s.id; })",
    ctx,
    { filename: "ids" }
  );
}

const IDS = registryIds();

describe("科目の一覧は、レジストリの有効な科目と同じである", () => {
  test("レジストリに有効な科目が1本以上在る (空ならこの下は何も見張れない)", () => {
    expect(IDS.length).toBeGreaterThan(0);
  });

  test("サーバの一覧がレジストリと一致する (並びまで)", () => {
    expect(server.SUBJECT_IDS).toEqual(IDS);
  });

  test("画面の一覧がレジストリと一致する (並びまで)", () => {
    expect(clientModule(true).SUBJECT_IDS).toEqual(IDS);
  });

  test("サーバの既定の控えもレジストリと一致する (導けなかったときに古くならない)", () => {
    expect(server.FALLBACK_SUBJECT_IDS.slice().sort()).toEqual(IDS.slice().sort());
  });

  test("画面の既定の控えもレジストリと一致する", () => {
    expect(clientModule(true).FALLBACK_SUBJECT_IDS.slice().sort()).toEqual(
      IDS.slice().sort()
    );
  });

  test("レジストリを読めなかった画面でも、控えで全科目そろう", () => {
    expect(clientModule(false).SUBJECT_IDS.slice().sort()).toEqual(IDS.slice().sort());
  });

  test("有効な科目は全部 isSubjectDocId で真になる", () => {
    IDS.forEach((id) => {
      expect(server.isSubjectDocId(id)).toBe(true);
      expect(clientModule(true).isSubjectDocId(id)).toBe(true);
    });
  });
});

describe("接頭の表は2枚で、同じ中身である", () => {
  test("サーバと画面の表が一致する (並びまで)", () => {
    expect(clientModule(true).ID_PREFIXES).toEqual(server.ID_PREFIXES);
  });

  test("表が指す科目は全部、レジストリに在る", () => {
    server.ID_PREFIXES.forEach((row) => {
      expect(IDS).toContain(row[1]);
    });
  });

  test("既定の科目もレジストリに在る", () => {
    expect(IDS).toContain(server.DEFAULT_SUBJECT_ID);
    expect(clientModule(true).DEFAULT_SUBJECT_ID).toBe(server.DEFAULT_SUBJECT_ID);
  });

  test("同じ接頭を2度書いていない", () => {
    const seen = server.ID_PREFIXES.map((row) => row[0]);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe("長い接頭が短い接頭より先に在る (2026-10-26 の壊れ方そのもの)", () => {
  // bc- と bc-pp- のように一方が他方で始まるとき、短いほうが先に在ると
  // 長いほうは一度も当たらない。科目が増えたときも同じ事故が起きるので、
  // 特定の組ではなく関係そのものを見る。
  test("どの組でも、含まれる側 (短い) が含む側 (長い) より後ろに在る", () => {
    const rows = server.ID_PREFIXES;
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const earlier = rows[i][0];
        const later = rows[j][0];
        if (later.startsWith(earlier)) {
          throw new Error(
            "接頭 " + later + " は " + earlier + " より先に置く必要がある"
          );
        }
      }
    }
  });
});

describe("マスタの実物の問題 id が、正しい科目に行く", () => {
  // 2026-10-26 に学習道場の公開 questions.js で実測した先頭の id。
  const SAMPLES = [
    ["bc-sc-pm-001", "biz-career"],
    ["bc-pp-sc-001", "biz-pm-planning"],
    ["bc-po-sc-001", "biz-pm-operation"],
    ["aoi-sc-intro-001", "ai-ontology-intro"],
  ];

  SAMPLES.forEach((pair) => {
    test(pair[0] + " は " + pair[1] + " に行く", () => {
      expect(server.guessSubjectId(pair[0])).toBe(pair[1]);
      expect(clientModule(true).guessSubjectId(pair[0])).toBe(pair[1]);
    });
  });

  test("科目が明示されていれば、接頭より明示が勝つ", () => {
    expect(server.guessSubjectId("bc-pp-sc-001", "biz-career")).toBe("biz-career");
  });

  test("どの接頭にも当たらない id は既定の科目に行く", () => {
    expect(server.guessSubjectId("10.1")).toBe(server.DEFAULT_SUBJECT_ID);
  });

  test("問題の書き込み先が科目別サブコレクションになる", () => {
    const seen = [];
    const db = {
      collection(name) {
        seen.push(name);
        return this;
      },
      doc(name) {
        seen.push(name);
        return this;
      },
    };
    server.docRef(db, "bc-pp-sc-001");
    expect(seen).toEqual([
      "questionStats",
      "biz-pm-planning",
      "questions",
      "bc-pp-sc-001",
    ]);
  });
});

describe("管理画面は3枚目の表を持たない", () => {
  test("接頭の字面が admin-question-stats-shared に残っていない", () => {
    expect(ADMIN_SRC).not.toContain('startsWith("bc-")');
    expect(ADMIN_SRC).not.toContain('startsWith("ws-")');
  });

  test("admin は QuestionStatsPaths に当て推量を任せている", () => {
    expect(ADMIN_SRC).toContain("QuestionStatsPaths.guessSubjectId");
  });

  test("admin の頁は、当て推量の表を先に読み込む", () => {
    const before = ADMIN_HTML.indexOf("js/question-stats-paths.js");
    const after = ADMIN_HTML.indexOf("js/admin-question-stats-shared.js");
    expect(before).toBeGreaterThan(-1);
    expect(after).toBeGreaterThan(before);
  });

  test("サブコレクションの科目を、行まで持ち回している", () => {
    expect(ADMIN_SRC).toContain("subjectId: sid");
    expect(ADMIN_SRC).toContain("item.subjectId || d.subjectId");
  });
});
