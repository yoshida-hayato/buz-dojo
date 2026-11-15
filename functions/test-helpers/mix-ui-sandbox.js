//
// MixUI を本物のまま走らせる足場。DOM も大域も要らない規則だけを見る。
//
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");

function load() {
  const sandbox = {
    String, Number, Array, Object, JSON, Set, Boolean,
    console: { warn: () => {}, error: () => {}, log: () => {} },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "mix-ui.js"), "utf8"), ctx);
  return vm.runInContext("MixUI", ctx);
}

// レジストリの行の形だけを真似る。問題数はカタログから来る
function rows(list) {
  return list.map((r) =>
    typeof r === "string" ? { id: r, title: r, enabled: true } : r
  );
}

// hasAccess と remainingFree を表で与える。
// owned: 権利が在る科目、rem: 権利は無いが今日の残りが在る科目
function opts(over) {
  const o = over || {};
  const owned = o.owned || [];
  const rem = o.rem || {};
  return Object.assign(
    {
      currentId: o.currentId || "",
      counts: o.counts || {},
      hasAccess: (id) => owned.indexOf(id) >= 0,
      remainingFree: (id) =>
        Object.prototype.hasOwnProperty.call(rem, id) ? rem[id] : 0,
      quotaLabel: (r) => "本日あと" + r + "問",
    },
    o.raw || {}
  );
}

function stateOf(out, id) {
  const hit = out.filter((r) => r.id === id)[0];
  return hit ? hit.state : "";
}

module.exports = { load, rows, opts, stateOf };
