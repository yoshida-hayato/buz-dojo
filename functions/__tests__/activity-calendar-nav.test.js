//
// 学習履歴カレンダー (js/activity-calendar.js) の期間移動のガード。
// 語の有無ではなく、実際に 前へ / 次へ / 表示切替 を押して、
// 描かれた日付のセルと詳細行を読む。
//
// なぜ要るか: 2026-10-31 に実測して3件の壊れを見つけた。どれも
// このファイルを名前で見ているテストが1枚も無かったために残っていた。
//   (1) setMonth が日を保持するため、31日が起点のとき月が飛ぶ。
//       2026-10-31 に 次へ を押すと 11月 を飛ばして 12月 になり、
//       前へ は1回押しても 10月 のままだった
//   (2) 年表示の列が53週の決め打ちで、うるう年かつ1/1が土曜の年
//       (直近は2028年) は 12/31 のセルが出なかった
//   (3) 前へ/次へ が anchor だけを動かし、下の詳細行は選択日のまま
//       だったので、表示していない期間の日付と問数を出していた
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js", "activity-calendar.js"), "utf8");
const NL = String.fromCharCode(10);

// 固定の「今日」。実日付に寄りかかると翌月に落ちるテストになる
const TODAY = [2026, 9, 31];

// 問数は日ごとに別の値にしておく。詳細行がどの日を指しているかを
// 文言ではなく数で読めるようにするため (locale に依存しない)
const DAILY = {
  "2026-10-31": { a: 12, c: 9 },
  "2026-10-17": { a: 77, c: 70 },
  "2026-09-15": { a: 40, c: 30 },
};

function load() {
  function FakeDate() {
    if (arguments.length === 0) return new RealDate(RealDate.UTC(TODAY[0], TODAY[1], TODAY[2], 3));
    if (arguments.length === 1) return new RealDate(arguments[0]);
    return new RealDate(arguments[0], arguments[1], arguments[2] || 1);
  }
  const RealDate = Date;
  FakeDate.now = () => FakeDate().getTime();
  FakeDate.UTC = RealDate.UTC;
  FakeDate.prototype = RealDate.prototype;

  const sandbox = { Date: FakeDate, Math, String, Number, Array, Object, WeakSet };
  const ctx = vm.createContext(sandbox);
  const cal = vm.runInContext(SRC + NL + "; ActivityCalendar;", ctx);

  const container = {
    innerHTML: "",
    addEventListener(name, fn) {
      if (name === "click") this.handler = fn;
    },
    contains: () => true,
  };
  cal.render(container, DAILY, {});

  function press(attrs) {
    const btn = { getAttribute: (k) => (k in attrs ? attrs[k] : null) };
    container.handler({ currentTarget: container, target: { closest: () => btn } });
  }
  return { container, press };
}

// 描かれた日付セルの data-date を全部取る。
// 正規表現を使わないのは、パッチ経路に円記号を通せないため
function cells(html) {
  const out = [];
  const parts = String(html).split('data-date="');
  for (let i = 1; i < parts.length; i++) out.push(parts[i].slice(0, 10));
  return out;
}

// 詳細行が言っている問数。「<strong>12問</strong>」の形で出る
function detailCount(html) {
  const head = String(html).indexOf('<p class="cal-detail">');
  if (head < 0) return 0;
  const open = String(html).indexOf("<strong>", head);
  if (open < 0) return 0; // 記録の無い日は strong を出さない
  const body = String(html).slice(open + 8);
  return Number(body.slice(0, body.indexOf("問"))) || 0;
}

describe("学習履歴カレンダーの期間移動", () => {
  test("月表示: 31日が起点でも 前へ は1回で前の月に行く", () => {
    const { container, press } = load();
    expect(cells(container.innerHTML)).toContain("2026-10-15");
    press({ "data-cal": "prev" });
    const got = cells(container.innerHTML);
    expect(got).toContain("2026-09-15");
    expect(got).not.toContain("2026-10-15");
  });

  test("月表示: 31日が起点でも 次へ は翌月を飛ばさない", () => {
    const { container, press } = load();
    press({ "data-cal": "next" });
    const got = cells(container.innerHTML);
    expect(got).toContain("2026-11-15");
    expect(got).not.toContain("2026-10-15");
    expect(got).not.toContain("2026-12-15");
  });

  test("月表示: 前へ と 次へ は往復して元の月に戻る", () => {
    const { container, press } = load();
    press({ "data-cal": "prev" });
    press({ "data-cal": "next" });
    expect(cells(container.innerHTML)).toContain("2026-10-15");
  });

  test("年表示: うるう年かつ1/1が土曜の2028年でも 12/31 のセルが出る", () => {
    const { container, press } = load();
    press({ "data-cal": "view", "data-view": "year" });
    expect(cells(container.innerHTML)).toContain("2026-12-31");
    press({ "data-cal": "next" });
    press({ "data-cal": "next" });
    const got = cells(container.innerHTML);
    expect(got).toContain("2028-01-01");
    expect(got).toContain("2028-12-31");
  });

  test("週表示: 前へ を押すと詳細行も表示中の週の日になる", () => {
    const { container, press } = load();
    press({ "data-cal": "view", "data-view": "week" });
    expect(detailCount(container.innerHTML)).toBe(12); // 10/31 を見ている
    press({ "data-cal": "prev" });
    press({ "data-cal": "prev" });
    const html = container.innerHTML;
    const got = cells(html);
    expect(got).toContain("2026-10-17");
    expect(got).not.toContain("2026-10-31");
    // 10/31 の 12問 ではなく、表示中の週に在る 10/17 の 77問 を出すこと
    expect(detailCount(html)).toBe(77);
  });

  test("月表示: 前へ のあとの詳細行も、表示中の月の日になる", () => {
    const { container, press } = load();
    press({ "data-cal": "prev" });
    // 10/31 の1か月前は 9/30。9/15 の 40問 ではなく 0問 (記録なし) が正しい
    expect(detailCount(container.innerHTML)).toBe(0);
    expect(cells(container.innerHTML)).toContain("2026-09-30");
    // 9/15 を押せば 40問 が出る (選択の経路そのものは生きている)
    press({ "data-cal": "day", "data-date": "2026-09-15" });
    expect(detailCount(container.innerHTML)).toBe(40);
  });

  test("今月 ボタンは今日に戻す", () => {
    const { container, press } = load();
    press({ "data-cal": "prev" });
    press({ "data-cal": "prev" });
    press({ "data-cal": "today" });
    expect(cells(container.innerHTML)).toContain("2026-10-31");
    expect(detailCount(container.innerHTML)).toBe(12);
  });
});
