// 読み物レッスンを実際に描いて歩く道具。
//   node _dev/tools/walk-screens.js ai-ontology-intro 390
//
// なぜ要るか: 2026-10-31 に「オントロジー入門が正解押しても次に行かない」が
// 社長から来た。原因は読み物レッスンの確認クイズで、2026-09-21 から40日
// 壊れていた。テストが1件も無く、誰も browser で歩いていなかったからである。
// 歩くだけなら機械にできるので、1つの命令にした。
//
// repo を自分で配信し、問題データのマスタ (よその repo が持つ) を科目定義から
// 組み立てた偽物に差し替えて、章の全部の面を最後まで歩く。偽のデータなので
// 中身の正しさは見ない。見るのは「次へ進めるか」だけである。進めなくなった面が
// 1つでも在れば、その場所を言って1で終わる。
//
// 通常のクイズは歩かない。偽データは scenario の形しか作れず、SAP や Tコードの
// 科目では出題プールが空になるうえ、進行の側は functions のテストが見ている。
// 章を持つのは ai-ontology-intro だけなので、ふだん当てるのはこの科目である。
const fs = require("fs");
const path = require("path");
const http = require("http");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const SUBJECT_ID = process.argv[2] || "ai-ontology-intro";
const WIDTH = Number(process.argv[3]) || 390;
const PORT = Number(process.argv[4]) || 8099;
const TYPES = { html: "text/html", js: "application/javascript", css: "text/css",
  json: "application/json", svg: "image/svg+xml", png: "image/png" };

// 実行ファイルの道は版が上がると変わるので決め打ちしない
function findChrome(dir, depth) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { return null; }
  for (const n of names) {
    const full = path.join(dir, n);
    let st;
    try { st = fs.statSync(full); } catch (e) { continue; }
    if (n === "chrome" && !st.isDirectory()) return full;
    if (st.isDirectory() && depth < 3) {
      const got = findChrome(full, depth + 1);
      if (got) return got;
    }
  }
  return null;
}

function serve() {
  const srv = http.createServer((req, res) => {
    let rel = decodeURIComponent(String(req.url).split("?")[0]);
    while (rel.charAt(0) === "/") rel = rel.slice(1);
    const file = path.join(ROOT, rel || "index.html");
    fs.readFile(file, (err, buf) => {
      if (err) { res.statusCode = 404; return res.end("404"); }
      res.setHeader("Content-Type", TYPES[path.extname(file).slice(1)] || "text/plain");
      res.end(buf);
    });
  });
  return new Promise((ok) => srv.listen(PORT, "127.0.0.1", () => ok(srv)));
}

// 科目定義の modules から問題を、chapters から読み物と確認クイズを組み立てる
function fakeMaster() {
  const src = fs.readFileSync(path.join(ROOT, "subjects", SUBJECT_ID, "subject.js"), "utf8");
  const box = {};
  vm.runInNewContext(src, box);
  const subject = box.SUBJECT;
  const mods = Object.keys(subject.modules || { 共通: "共通" });
  const data = [];
  mods.forEach((m, mi) => {
    for (let n = 1; n <= 12; n++) {
      data.push({ id: "w-sc-" + mi + "-" + n, category: "scenario", module: m,
        code: "S" + mi + n, priority: 1, name: m + "の問" + n,
        choices: ["正解" + mi + "x" + n, "誤A" + mi + n, "誤B" + mi + n, "誤C" + mi + n],
        explanation: "解説" + mi + n });
    }
  });
  const chapters = subject.chapters || [];
  const lesson = { version: 1, chapters: {} };
  chapters.forEach((ch) => {
    // 歩ければよいので、章あたり3往復に切る (本物の章は最大8問)
    const need = Math.min(3, Number(ch.clearCorrect) || 1);
    const mi = mods.indexOf(ch.module);
    const sections = [];
    for (let n = 1; n <= need; n++) {
      sections.push({ id: ch.id + "-r" + n, kind: "reading", title: "読み物" + n, body: "本文" + n },
        { id: ch.id + "-q" + n, kind: "quiz", title: "理解確認" + n,
          questionIds: ["w-sc-" + mi + "-" + n] });
    }
    lesson.chapters[ch.id] = { title: ch.module, sections };
  });
  return { subject, data, lesson, chapters };
}

// 外へ出る取得は全部ここで受ける。手元の配信 (127 で始まる) には触らない。
// 字面の照合にしているので、星の並びも、よそのホスト名も書かずに済む。
// 斜線から始める照合でないと、手元の js/subject-catalog.js まで止めてしまう。
const toLocal = (u) => String(u).indexOf("127.0.0.1") >= 0;

async function main() {
  const { chromium } = require("playwright");
  const master = fakeMaster();
  const srv = await serve();
  const browser = await chromium.launch({
    executablePath: findChrome("/opt/pw-browsers", 0) || undefined,
    args: ["--no-sandbox", "--no-proxy-server"],
  });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  const js = (body) => ({ status: 200, contentType: "application/javascript", body });
  await page.route((u) => !toLocal(u), (r) => {
    const u = String(r.request().url());
    const has = (n) => u.indexOf(n) >= 0;
    const plain = has("/questions.js") && !has("judgment") && !has("order") && !has("contrast");
    if (plain) return r.fulfill(js("var QUIZ_DATA = " + JSON.stringify(master.data) + ";"));
    if (has("/lesson.js")) {
      return r.fulfill(js("var LESSON_DATA = " + JSON.stringify(master.lesson) + ";"));
    }
    return r.abort();
  });
  await page.addInitScript((id) => {
    try { localStorage.setItem("biz_dojo_selected_subject", id); } catch (e) {}
  }, SUBJECT_ID);

  const stuck = [];
  const press = (sel) => page.$eval(sel, (el) => el["click"]());
  const look = () => page.evaluate(() => {
    const vis = (id) => {
      const el = document.getElementById(id);
      return !!el && !el.classList.contains("hidden");
    };
    return {
      screen: Array.from(document.querySelectorAll(".screen"))
        .filter((s) => !s.classList.contains("hidden")).map((s) => s.id)[0] || null,
      choices: Array.from(document.querySelectorAll(".lesson-choice-btn")).map((b) => b.textContent),
      quizChoices: document.querySelectorAll("#choices .choice-btn").length,
      actions: document.querySelectorAll("#lesson-actions button").length,
      prompt: (document.querySelector(".lesson-quiz-prompt") || {}).textContent || null,
      label: (document.getElementById("lesson-progress-label") || {}).textContent || null,
      feedback: vis("feedback-card"),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

  // スキームを字面で書かない。パッチ経路が URL に書き替えて JSON を壊す
  // (2026-10-31 に1件これで破棄された。素のIPでも、スキームが続くと起きる)。
  const ORIGIN = "ht" + "tp:" + "//" + "127.0.0.1:" + PORT + "/";
  await page.goto(ORIGIN, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.startQuiz === "function", null, { timeout: 30000 });

  for (const ch of master.chapters) {
    if (!master.lesson.chapters[ch.id]) continue;
    await page.evaluate((id) => openLesson(id), ch.id);
    await page.waitForTimeout(200);
    const panels = master.lesson.chapters[ch.id].sections.length;
    let moved = 0;
    for (let i = 0; i < panels + 4; i++) {
      const s = await look();
      if (s.screen !== "screen-lesson") break;
      if (s.overflow) stuck.push("章 " + ch.id + " の面 " + s.label + " が横にはみ出した");
      if (s.choices.length) {
        const want = s.choices.find((t) => String(t).indexOf("正解") === 0);
        if (!want) { stuck.push("章 " + ch.id + ": 正解の肢が面に無い (" + s.prompt + ")"); break; }
        await page.$$eval(".lesson-choice-btn", (els, w) => {
          const t = els.find((e) => e.textContent === w);
          if (t) t["click"]();
        }, want);
        await page.waitForTimeout(90);
        if (!(await look()).actions) {
          stuck.push("章 " + ch.id + ": 正解を押しても次へ進む手が出ない (" + s.prompt + ")");
          break;
        }
      } else if (!s.actions) { stuck.push("章 " + ch.id + ": 進む手が1つも無い"); break; }
      await press("#lesson-actions button");
      await page.waitForTimeout(110);
      moved += 1;
    }
    console.log("章 " + ch.id + ": " + moved + " / " + panels + " 面を歩いた");
  }

  await finish(browser, srv, stuck, errors);
}

async function finish(browser, srv, stuck, errors) {
  console.log("頁エラー: " + errors.length +
    (errors.length ? " " + JSON.stringify(errors.slice(0, 3)) : ""));
  await browser.close();
  srv.close();
  if (!stuck.length) return console.log("進めなくなった場所: 0 件");
  console.log("進めなくなった場所 " + stuck.length + " 件:");
  stuck.forEach((s) => console.log("  - " + s));
  process.exitCode = 1;
}

// 落ちたときも browser と配信を閉じる (閉じないと命令が終わらない)
main().catch((e) => { console.error(String(e && e.message)); process.exit(1); });
