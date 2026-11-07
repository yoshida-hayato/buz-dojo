// 科目を切り替えて戻ったときの 解答方式 の既定。
//
// 背景 (2026-11-07 18:48便)。js/screens-subjects.js の
// activateSubjectInner は applySubjectConfig (中で
// applySubjectSettingVisibility を呼ぶ) のあとで
// QuizStorage.useSubject を呼ぶ。だから切り替えた直後の
// 1回目は、保存値がまだ前の科目のものである。そこで既定
// (記述式の実績が在れば 両方出題) を計算していたため、記述式の実績が
// 在る人に 選択式 が付いた。しかも中立化の印 (neutralized) はそこで
// 消えるのに手で選んだ印 (userSet) は残るので、正しい保存値で走る
// 2回目 (initSettingsUI 経由) の復元もどちらの枝にも入らなかった。
// 塞ぎは2つ要る。詳しい経緯と数字は学習ログの同じ便に在る。
//
// 選択式のみに落ちると、選択式を習得し切って記述式が未習得の人は
// 本物の buildPool で枠0になり、開始ボタンが無効になる。
// 記述式を持つ科目は SAP だけで、その問題データはよその repo に在る。
// だから測ったのは画面ではなく状態の遷移である。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const NL = String.fromCharCode(10);
const ROOT = path.join(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js", "subject-config.js"), "utf8");

const SAP = {
  id: "sap",
  categories: { tcode: "Tコード", term: "用語" },
  modules: {},
  inputCategories: ["tcode"],
  brand: "ビジネス道場",
  brandAccentWord: "道場",
  title: "SAP",
};
const OTHER = {
  id: "fe-kamoku-a",
  categories: { scenario: "シナリオ" },
  modules: {},
  inputCategories: [],
  brand: "ビジネス道場",
  brandAccentWord: "道場",
  title: "科目A",
};

function fakeEl() {
  return {
    dataset: {},
    value: "",
    textContent: "",
    style: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
  };
}

// 科目ごとの保存値。sapInput は SAP の記述式の回答数。
function makeWorld(sapInput) {
  const store = {
    sap: { inputAnswered: sapInput },
    "fe-kamoku-a": { inputAnswered: 0 },
  };
  const dom = {};
  const ids = [
    "answer-mode-group", "direction-group", "direction-answer-row",
    "answer-mode-select", "direction-select", "pool-mode-hint",
    "category-count-hint", "module-count-hint", "site-title",
    "current-subject-label", "start-expect-note",
  ];
  for (const id of ids) dom[id] = fakeEl();
  dom["answer-mode-select"].value = "choice";
  dom["direction-select"].value = "mixed";

  const sandbox = {
    console,
    escapeHtml: (s) => String(s),
    document: {
      getElementById: (id) => dom[id] || null,
      querySelectorAll: () => [],
      querySelector: () => null,
    },
    DEFAULT_RANKS: [{ name: "初段", inputCorrectRatio: 0.5 }],
    CHOICE_KEYS: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
    CURRENT_SUBJECT: null,
    CATEGORIES: {},
    MODULES: {},
    MODULE_FILTERABLE: null,
    INPUT_CATEGORIES: null,
    DEFAULT_CATEGORIES: null,
    RANKS: null,
    // 本物の QuizStorage.useSubject は subjectId も立てる (js/storage.js)
    QuizStorage: {
      subjectId: null,
      stats: store["fe-kamoku-a"],
      load() { return this.stats; },
      useSubject(id) { this.subjectId = id; this.stats = store[id]; },
    },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(SRC, ctx);

  // js/screens-subjects.js の activateSubjectInner と同じ順番。
  // applySubjectConfig が先、QuizStorage.useSubject が後、
  // 最後に initSettingsUI がもう一度 applySubjectSettingVisibility を呼ぶ。
  function activate(subject) {
    sandbox.CURRENT_SUBJECT = null;
    vm.runInContext("applySubjectConfig(SUBJECT_IN)", Object.assign(ctx, { SUBJECT_IN: subject }));
    ctx.QuizStorage.useSubject(subject["id"]);
    vm.runInContext("applySubjectSettingVisibility()", ctx);
  }
  function mode() { return dom["answer-mode-select"].value; }
  function pick(v) {
    dom["answer-mode-select"].value = v;
    dom["answer-mode-select"].dataset.userSet = "1";
  }
  return { activate, mode, pick, ctx };
}

describe("科目を切り替えて戻ったときの 解答方式", () => {
  test("記述式の実績が在る人は、手で選んだあと戻っても 選択式 に落ちない", () => {
    const w = makeWorld(500);
    w.activate(SAP);
    expect(w.mode()).toBe("both");
    w.pick("both");
    w.activate(OTHER);
    expect(w.mode()).toBe("choice");
    w.activate(SAP);
    expect(w.mode()).toBe("both");
  });

  test("手で触らない対照は、前と変わらず 両方出題 に戻る", () => {
    const w = makeWorld(500);
    w.activate(SAP);
    w.activate(OTHER);
    w.activate(SAP);
    expect(w.mode()).toBe("both");
  });

  test("記述式の実績が無い人は 選択式 のままである", () => {
    const w = makeWorld(0);
    w.activate(SAP);
    expect(w.mode()).toBe("choice");
    w.activate(OTHER);
    w.activate(SAP);
    expect(w.mode()).toBe("choice");
  });

  test("同じ科目を開き直すときは、手で選んだ値を残す", () => {
    const w = makeWorld(500);
    w.activate(SAP);
    w.pick("input");
    w.activate(SAP);
    expect(w.mode()).toBe("input");
  });

  test("科目を離れるときに、手で選んだ印が落ちる", () => {
    const w = makeWorld(500);
    w.activate(SAP);
    w.pick("both");
    w.activate(OTHER);
    const sel = w.ctx.document.getElementById("answer-mode-select");
    expect(sel.dataset.userSet).toBeUndefined();
    expect(sel.dataset.neutralized).toBe("1");
  });

  test("保存値がまだ前の科目のものなら、既定を計算せず値も動かさない", () => {
    const w = makeWorld(500);
    w.activate(OTHER);
    const sel = w.ctx.document.getElementById("answer-mode-select");
    // 前の科目の保存値で計算されたら choice に落ちる値を置いておく
    sel.value = "both";
    // useSubject を呼ばずに applySubjectConfig だけ走らせる
    vm.runInContext("applySubjectConfig(SUBJECT_IN)", Object.assign(w.ctx, { SUBJECT_IN: SAP }));
    expect(vm.runInContext("answerModeDefaultReady()", w.ctx)).toBe(false);
    expect(w.mode()).toBe("both");
    // 保存値が載ったあとは計算する
    w.ctx.QuizStorage.useSubject("sap");
    expect(vm.runInContext("answerModeDefaultReady()", w.ctx)).toBe(true);
    vm.runInContext("applySubjectSettingVisibility()", w.ctx);
    expect(w.mode()).toBe("both");
  });

  test("科目や保存値が欠けていても、投げずに false を返す", () => {
    const call = (fix) => {
      const w = makeWorld(500);
      w.activate(SAP);
      fix(w);
      try {
        return { threw: "", got: vm.runInContext("answerModeDefaultReady()", w.ctx) };
      } catch (e) {
        return { threw: String(e && e.message), got: null };
      }
    };
    const noSubject = call((w) => { w.ctx.CURRENT_SUBJECT = null; });
    expect(noSubject.threw).toBe("");
    expect(noSubject.got).toBe(false);
    const noStore = call((w) => { delete w.ctx.QuizStorage; });
    expect(noStore.threw).toBe("");
    expect(noStore.got).toBe(false);
  });
});
