//
// ミックス出題 第3段: 混ぜる科目の一覧の規則 (MixUI.listRowsFrom)。
//
// 権利の無い有料科目も一覧に出す。無料ぶんは科目ごとに1日20問なので、
// 混ぜても今日その科目で解ける数は変わらない。一覧から外すと、1科目ずつ
// なら解けていた20問が、ミックスからは触れなくなる (本番の無料枠を
// 狭めることになるので、そちらには倒さない)。
// 今日のぶんを使い切った科目だけ、印を外して選べなくする。
//
const H = require("../test-helpers/mix-ui-sandbox.js");

const ALL = ["sap", "windows-shortcuts", "outlook-mail", "fe-kamoku-b"];

describe("一覧に出る科目と、その状態", () => {
  test("開いている科目は先頭で、印を外せない", () => {
    const M = H.load();
    const out = M.listRowsFrom(
      H.rows(ALL),
      H.opts({ currentId: "fe-kamoku-b", owned: ["sap"], rem: { "windows-shortcuts": 20 } })
    );
    expect(out[0].id).toBe("fe-kamoku-b");
    expect(out[0].state).toBe("current");
    expect(out[0].checked).toBe(true);
    expect(out[0].selectable).toBe(false);
    expect(out[0].note).toBe("開いている科目");
  });

  test("権利が在る科目は、札なしで既定が入りになる", () => {
    const M = H.load();
    const out = M.listRowsFrom(H.rows(ALL), H.opts({ owned: ["sap"] }));
    const sap = out.filter((r) => r.id === "sap")[0];
    expect(sap.state).toBe("owned");
    expect(sap.checked).toBe(true);
    expect(sap.selectable).toBe(true);
    expect(sap.note).toBe("");
  });

  test("権利は無いが今日の残りが在る科目は、残りを札に出して入りにする", () => {
    const M = H.load();
    const out = M.listRowsFrom(
      H.rows(ALL),
      H.opts({ rem: { "windows-shortcuts": 7 } })
    );
    const ws = out.filter((r) => r.id === "windows-shortcuts")[0];
    expect(ws.state).toBe("quota");
    expect(ws.checked).toBe(true);
    expect(ws.selectable).toBe(true);
    expect(ws.note).toBe("本日あと7問");
  });

  test("今日のぶんを使い切った科目は、印が外れて選べない", () => {
    const M = H.load();
    const out = M.listRowsFrom(H.rows(ALL), H.opts({ rem: { sap: 0 } }));
    const sap = out.filter((r) => r.id === "sap")[0];
    expect(sap.state).toBe("exhausted");
    expect(sap.checked).toBe(false);
    expect(sap.selectable).toBe(false);
    expect(sap.note).toBe("本日の無料ぶんは終了");
  });

  test("使い切った科目は一覧の末尾に寄る", () => {
    const M = H.load();
    const out = M.listRowsFrom(
      H.rows(ALL),
      H.opts({ currentId: "outlook-mail", owned: ["fe-kamoku-b"], rem: { sap: 20 } })
    );
    expect(out[0].id).toBe("outlook-mail");
    expect(out[out.length - 1].id).toBe("windows-shortcuts");
    expect(out[out.length - 1].state).toBe("exhausted");
  });

  test("止めてある科目は一覧に出さない", () => {
    const M = H.load();
    const list = H.rows(ALL);
    list[0].enabled = false;
    const out = M.listRowsFrom(list, H.opts({ owned: ["sap"] }));
    expect(out.length).toBe(3);
    expect(H.stateOf(out, "sap")).toBe("");
  });

  test("行が無くても落ちない", () => {
    const M = H.load();
    expect(M.listRowsFrom([], H.opts({})).length).toBe(0);
    expect(M.listRowsFrom(null, null).length).toBe(0);
  });

  test("短い題があれば、そちらを使う", () => {
    const M = H.load();
    const out = M.listRowsFrom(
      [{ id: "a", title: "長い題", shortTitle: "短", enabled: true }],
      H.opts({ owned: ["a"] })
    );
    expect(out[0].title).toBe("短");
  });

  test("問題数はカタログから入る", () => {
    const M = H.load();
    const out = M.listRowsFrom(
      H.rows(["sap"]),
      H.opts({ owned: ["sap"], counts: { sap: 4951 } })
    );
    expect(out[0].count).toBe(4951);
  });
});
