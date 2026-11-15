//
// 「外しても結果が1件も動かない門」を機械で探す走査。
//
// なぜ要るか。2026-11-15 の2便で、自分が置いた門が5つ、外しても全試験が
// 通る形だった (00:48便 で3つ、06:48便 で2つ)。どれも書いている途中は
// 二重の防御のつもりだったが、先に効く別の行が在るので一度も仕事を
// していなかった。動かない門は、次の人が「要らない」と読んで本物のほうを
// 消す筋になる (失敗の型15 と、00:48便 と 06:48便 の件)。
//
// 字面では決められない。呼び元に門が在る形も、入れ子の関数で囲みを取り違える
// 形も在る。だから実際に外して走らせる。
//
// 走らせ方: node scripts/dead-gate-scan.js [ファイル名の一部]
//
// 試験ではない。1行あたり全試験を走らせるので1ファイルで数分かかる。
// jest からは呼ばない (遅いうえ、便の枠を道連れにしないため)。
//
// 読み方。拾った行は2通りのどちらかである:
//   (a) 外しても結果が動かない門 (先に効く行が在る。消すか、効く形に直す)
//   (b) どの試験も通っていない門 (見張りが無い。危ないのはこちら)
// 走査はこの2つを区別できない。どちらかを決めるのは人の目である。
//
// 円記号がパッチの口を通らないので、正規表現は1つも使わない。
//
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const JS_DIR = path.join(ROOT, "js");
const RUNNER = path.join(ROOT, "scripts", "minijest.js");
const NL = String.fromCharCode(10);

// 門の形。1行で閉じているものだけを見る (複数行の門は拾わない)
const TAILS = ["return;", "continue;", "break;"];

// 行がこの尾で終わっているか。
// idx >= 0 を先に見ること。尾が行より長いと t.length - tail.length が負に
// なり、lastIndexOf の -1 と一致して「終わっている」と誤判定する
// (2026-11-15 に実測。これで if (first) { を門として拾っていた。失敗の型6)。
function endsWith(t, tail) {
  const idx = t.lastIndexOf(tail);
  return idx >= 0 && idx === t.length - tail.length;
}

function isGateLine(line) {
  const t = line.trim();
  if (t.indexOf("if (") !== 0) return false;
  if (t.indexOf(") ") < 0) return false;
  for (const tail of TAILS) {
    if (endsWith(t, tail)) return true;
  }
  if (endsWith(t, "return false;")) return true;
  if (endsWith(t, "return true;")) return true;
  if (endsWith(t, "return null;")) return true;
  return false;
}

// 条件を偽に潰す。開きかっこの対応を数えて、閉じる位置を見つける
function disable(line) {
  const open = line.indexOf("if (");
  if (open < 0) return null;
  let depth = 0;
  let close = -1;
  for (let i = open + 3; i < line.length; i++) {
    const c = line[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) return null;
  return line.slice(0, open) + "if (false)" + line.slice(close + 1);
}

function runSuite() {
  try {
    const out = execFileSync("node", [RUNNER], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out: out };
  } catch (e) {
    return { ok: false, out: String((e && e.stdout) || "") };
  }
}

function failCount(out) {
  const lines = String(out).split(NL);
  for (let i = lines.length - 1; i >= 0; i--) {
    const hit = lines[i].indexOf("落ちた ");
    if (hit >= 0) return Number(lines[i].slice(hit + 4).trim()) || 0;
  }
  return -1;
}

// 走査は遅いので、次の人は途中で止める。そのとき書き替えたファイルが
// 残ってはいけない (2026-11-15 に実測。pkill で止めたら js/billing.js に
// if (false) が1行残っていた。テストは全通したので気づきにくい)。
//
// 合図を受け取る手では足りない。全試験を同期で走らせている間は JS に
// 制御が戻らないので、止められた瞬間に戻す処理を走らせられない (実測)。
// だから控えをファイルに置く。書き替える前に元の中身を横に保存し、戻せたら
// 消す。次に走らせたときに残っていれば、それを戻してから始める。
// 一度でも強く止められても、次の走りが必ず直す。
const BACKUP_DIR = path.join(ROOT, ".dead-gate-backup");

function backupPathFor(p) {
  return path.join(BACKUP_DIR, path.basename(p) + ".bak");
}

function saveBackup(p, text) {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
  fs.writeFileSync(backupPathFor(p), text);
}

function dropBackup(p) {
  const b = backupPathFor(p);
  if (fs.existsSync(b)) fs.unlinkSync(b);
}

// 前の走りが途中で止められていたら、先に戻す
function restoreLeftovers() {
  if (!fs.existsSync(BACKUP_DIR)) return 0;
  let n = 0;
  fs.readdirSync(BACKUP_DIR).forEach((f) => {
    if (f.lastIndexOf(".bak") !== f.length - 4) return;
    const target = path.join(JS_DIR, f.slice(0, f.length - 4));
    const b = path.join(BACKUP_DIR, f);
    if (fs.existsSync(target)) {
      fs.writeFileSync(target, fs.readFileSync(b, "utf8"));
      n++;
      console.log("前の走りの書き替えを戻した: " + path.basename(target));
    }
    fs.unlinkSync(b);
  });
  return n;
}

// 2つ同時に走らせてはいけない。両方が同じファイルを書き替えるので、
// 片方の控えがもう片方の書き替えを原本として保存し、戻しても直らない
// (2026-11-15 に実測。これで js/billing.js に1行残った)。
const LOCK = path.join(ROOT, ".dead-gate-backup", "running.lock");

function takeLock() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
  if (fs.existsSync(LOCK)) {
    const owner = fs.readFileSync(LOCK, "utf8").trim();
    console.log("もう1つ走っている (" + owner + ")。");
    console.log("本当に走っていないなら " + LOCK + " を消してから始めること。");
    return false;
  }
  fs.writeFileSync(LOCK, String(process.pid));
  return true;
}

function dropLock() {
  if (fs.existsSync(LOCK)) fs.unlinkSync(LOCK);
}

function main() {
  const filter = process.argv[2] || "";
  const files = fs
    .readdirSync(JS_DIR)
    .filter((f) => f.lastIndexOf(".js") === f.length - 3)
    .filter((f) => !filter || f.indexOf(filter) >= 0);

  // 錠を先に取る。順番が逆だと、2つめの走りが1つめの書き替えを
  // 「前の走りの残り」として戻してしまう (2026-11-15 に実測)。
  if (!takeLock()) process.exit(1);
  restoreLeftovers();

  const base = runSuite();
  const baseFails = failCount(base.out);
  if (baseFails !== 0) {
    console.log("走らせる前から " + baseFails + "件 落ちている。先に直すこと");
    process.exit(1);
  }
  console.log("土台は全通。走査する js は " + files.length + "枚");
  console.log("");

  const dead = [];
  let tried = 0;
  for (const f of files) {
    const p = path.join(JS_DIR, f);
    const original = fs.readFileSync(p, "utf8");
    saveBackup(p, original);
    const lines = original.split(NL);
    const targets = [];
    lines.forEach((line, i) => {
      if (isGateLine(line) && disable(line)) targets.push(i);
    });
    if (!targets.length) continue;
    process.stdout.write(f + " (" + targets.length + "行) ");
    try {
      for (const i of targets) {
        const copy = lines.slice();
        copy[i] = disable(copy[i]);
        fs.writeFileSync(p, copy.join(NL));
        const r = runSuite();
        const n = failCount(r.out);
        tried++;
        if (n === 0) {
          dead.push({ file: f, line: i + 1, text: lines[i].trim() });
          process.stdout.write("!");
        } else {
          process.stdout.write(".");
        }
      }
    } finally {
      fs.writeFileSync(p, original);
      dropBackup(p);
    }
    process.stdout.write(NL);
  }

  console.log("");
  console.log("外した門 " + tried + "行 のうち、1件も落ちなかったのは " + dead.length + "行");
  dead.forEach((d) => {
    console.log("  " + d.file + ":" + d.line + "  " + d.text);
  });
  if (!dead.length) console.log("  (無し)");
  console.log("");
  console.log("拾った行は (a) 動かない門 か (b) 見張りの無い門 のどちらかである。");
  console.log("どちらかは人が読んで決めること。");
  dropLock();
}

main();
