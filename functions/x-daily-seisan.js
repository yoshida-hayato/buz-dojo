/**
 * X（Twitter）毎日 生産管理2級クイズ投稿
 *
 * - 毎朝 8:15 JST に 1問（親=問題画像、返信=答え＋誘導）
 *   ※ SAP 垢（7:45 JST）とずらす
 * - 問題マスタ: https://gakusyu-dojo.web.app/subjects/biz-career/questions.js
 *   （+ judgment-questions.js を合算）
 * - 投稿済み ID: Firestore system/xDailySeisanQuiz
 * - SAP 垢・SAP Secrets（X_API_KEY 等）とは完全分離
 *
 * Secrets:
 *   X_SEISAN_API_KEY, X_SEISAN_API_SECRET, X_SEISAN_ACCESS_TOKEN, X_SEISAN_ACCESS_SECRET
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const vm = require("vm");
const { createCanvas } = require("@napi-rs/canvas");
const { TwitterApi } = require("twitter-api-v2");

if (!admin.apps.length) {
  admin.initializeApp();
}

const REGION = "asia-northeast1";
const SERVICE_ACCOUNT = "firebase-adminsdk-fbsvc@buz-dojo.iam.gserviceaccount.com";
const ADMIN_EMAIL = "yoshida.hayato0126@gmail.com";
const SITE_URL = "https://buz-dojo.web.app/biz-career";
const QUESTIONS_URL = "https://gakusyu-dojo.web.app/subjects/biz-career/questions.js";
const META_PATH = "system/xDailySeisanQuiz";
const POST_AT_LABEL = "8:15 JST";

const xApiKey = defineSecret("X_SEISAN_API_KEY");
const xApiSecret = defineSecret("X_SEISAN_API_SECRET");
const xAccessToken = defineSecret("X_SEISAN_ACCESS_TOKEN");
const xAccessSecret = defineSecret("X_SEISAN_ACCESS_SECRET");

const SECRETS = [xApiKey, xApiSecret, xAccessToken, xAccessSecret];

const POSTABLE = new Set([
  "scenario",
  "term",
  "judgment",
  "abbr",
]);
const MODULE_LABEL = {
  品質管理: "品質管理",
  原価管理: "原価管理",
  納期管理: "納期管理",
  環境管理: "環境管理",
  安全衛生管理: "安全衛生",
};

function metaRef() {
  return admin.firestore().collection("system").doc("xDailySeisanQuiz");
}

function assertAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "ログインが必要です");
  const email = (request.auth.token && request.auth.token.email) || "";
  if (email !== ADMIN_EMAIL) {
    throw new HttpsError("permission-denied", "管理者のみ実行できます");
  }
}

function weekdayCategory(date = new Date()) {
  const jst = getJstDate(date);
  const dateKey = getJstDateKey(date);
  // 曜日ごとに複数カテゴリから日付で決定論的に選ぶ（バリエーション増）
  // プランニング寄り（品質・原価）とオペレーション寄り（正誤・略称）を週で混ぜる
  const poolByDay = {
    0: ["scenario", "abbr"],
    1: ["scenario", "term"],
    2: ["term", "judgment"],
    3: ["judgment", "scenario"],
    4: ["scenario", "judgment"],
    5: ["scenario", "abbr"],
    6: ["term", "abbr"],
  };
  const pool = poolByDay[jst.getDay()] || ["scenario"];
  return pool[hashSeed(dateKey + ":cat") % pool.length];
}

async function fetchQuizData() {
  async function fetchText(url) {
    const res = await fetch(url + (url.includes("?") ? "&" : "?") + "_=" + Date.now(), {
      headers: { "cache-control": "no-cache" },
    });
    if (!res.ok) throw new Error("fetch failed: " + url + " " + res.status);
    return res.text();
  }

  const base = QUESTIONS_URL.replace(/\/questions\.js$/, "");
  let jSrc = "var JUDGMENT_DATA = [];";
  try {
    jSrc = await fetchText(base + "/judgment-questions.js");
  } catch (e) {
    console.warn("judgment-questions.js fetch skipped:", e.message || e);
  }
  const qSrc = await fetchText(QUESTIONS_URL);
  const rewritten =
    jSrc.replace(/\bconst\s+JUDGMENT_DATA\s*=/, "var JUDGMENT_DATA =") +
    "\n" +
    qSrc.replace(/\bconst\s+QUIZ_DATA\s*=/, "var QUIZ_DATA =");
  const ctx = { QUIZ_DATA: null, JUDGMENT_DATA: null };
  vm.createContext(ctx);
  vm.runInContext(rewritten + "\n;QUIZ_DATA;", ctx);
  if (!Array.isArray(ctx.QUIZ_DATA)) throw new Error("QUIZ_DATA parse failed");
  return ctx.QUIZ_DATA.filter((q) => q && q.id && POSTABLE.has(q.category));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hashSeed(str) {
  let h = 2166136261;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  let state = a >>> 0;
  return function rng() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeededShuffle(seed) {
  const rng = mulberry32(hashSeed(String(seed)));
  return function seededShuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
}

function getJstDate(date = new Date()) {
  return new Date(date.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
}

function getJstDateKey(date = new Date()) {
  const d = getJstDate(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatJstDateLabel(dateKey) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = ["日", "月", "火", "水", "木", "金", "土"][dt.getDay()];
  return `${m}/${d}（${wd}）`;
}

function addJstDays(dateKey, days) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const CATEGORY_LABEL = {
  tcode: "Tコード",
  term: "用語",
  judgment: "正誤",
  scenario: "シナリオ",
  shortcut: "ショートカット",
  abbr: "略称",
  cloze: "穴埋め",
};

const LAYOUT_LABEL = {
  standard: "4択",
  judgment: "正誤",
  shortcut: "ショートカット",
  cloze: "穴埋め",
  abbr: "略称",
};

/** 背景は全レイアウト共通の緑系グラデーション（SAP青と差別化） */
const BG_BLUE = ["#0f766e", "#0d5c56", "#0a4540"];

function isPostedOnDate(last, dateKey) {
  if (!last || !last.at || !last.questionId) return false;
  const at = last.at.toDate ? last.at.toDate() : new Date(last.at);
  return getJstDateKey(at) === dateKey;
}

function isJudgmentMulti(q) {
  return q.category === "judgment" && Array.isArray(q.statements) && q.statements.length > 0;
}

function buildTcodePayload(q, pool, shuf = shuffle) {
  const answer = String(q.code || "").trim();
  const sameMod = pool.filter(
    (x) => x.category === "tcode" && x.module === q.module && x.id !== q.id && x.code
  );
  const distractors = shuf(sameMod)
    .map((x) => String(x.code).trim())
    .filter((c) => c && c !== answer);
  const choices = shuf([answer, ...distractors.slice(0, 3)]);
  while (choices.length < 4) {
    const extra = pool.find(
      (x) => x.category === "tcode" && x.code && !choices.includes(String(x.code).trim())
    );
    if (!extra) break;
    choices.push(String(extra.code).trim());
  }
  return {
    id: q.id,
    category: q.category,
    module: q.module,
    question: `「${q.name}」を行う Tコードは？`,
    choices: choices.slice(0, 4),
    answer,
    explanation: String(q.explanation || "").replace(/\s+/g, " ").trim(),
  };
}

function buildTermPayload(q, pool, shuf = shuffle) {
  // 用語 → 意味（4択）
  const answer = String(q.name || "").trim();
  const sameMod = pool.filter(
    (x) => x.category === "term" && x.module === q.module && x.id !== q.id && x.name
  );
  const distractors = shuf(sameMod)
    .map((x) => String(x.name).trim())
    .filter((n) => n && n !== answer);
  const choices = shuf([answer, ...distractors.slice(0, 3)]);
  return {
    id: q.id,
    category: q.category,
    module: q.module,
    question: `「${q.code}」とは？`,
    choices: choices.slice(0, 4),
    answer,
    explanation: String(q.explanation || "").replace(/\s+/g, " ").trim(),
  };
}

function buildScenarioPayload(q, shuf = shuffle) {
  const choices = Array.isArray(q.choices) ? q.choices.map(String) : [];
  if (choices.length < 2) return null;
  const answer = choices[0];
  return {
    id: q.id,
    category: q.category,
    module: q.module,
    question: String(q.name || q.code || "").trim(),
    choices: shuf(choices).slice(0, 4),
    answer,
    explanation: String(q.explanation || "").replace(/\s+/g, " ").trim(),
  };
}

function buildJudgmentPayload(q, shuf = shuffle) {
  if (isJudgmentMulti(q)) {
    const pickIncorrect = q.pick === "incorrect";
    const instruction = pickIncorrect
      ? "誤っているものをすべて選んでください。"
      : "正しいものをすべて選んでください。";
    const shuffled = shuf(
      q.statements.map((s) => ({
        text: String(s.text || "").trim(),
        correct: !!s.correct,
      }))
    ).filter((s) => s.text);
    if (shuffled.length < 3) return null;
    const letterLabels = ["A", "B", "C", "D", "E", "F"];
    const choices = shuffled.map((s) => s.text).slice(0, 6);
    const answerLabels = shuffled
      .slice(0, 6)
      .map((s, i) => {
        const isTarget = pickIncorrect ? !s.correct : s.correct;
        return isTarget ? letterLabels[i] : null;
      })
      .filter(Boolean);
    if (!answerLabels.length) return null;
    return {
      id: q.id,
      category: q.category,
      module: q.module,
      visualType: "judgmentMulti",
      question: `${String(q.name || "").trim()}\n\n${instruction}`,
      choices,
      answerLabels,
      answer: answerLabels.join(", "),
      explanation: String(q.explanation || "").replace(/\s+/g, " ").trim(),
    };
  }
  const choices = Array.isArray(q.choices) && q.choices.length >= 2 ? q.choices.map(String) : ["正", "誤"];
  let answer = String(q.answer || "").trim();
  if (answer !== "正" && answer !== "誤") {
    answer = choices[0];
  }
  return {
    id: q.id,
    category: q.category,
    module: q.module,
    visualType: "standard",
    question: String(q.name || "").trim() + "\n\nこの記述は正しい？",
    choices: ["正", "誤"],
    answer,
    explanation: String(q.explanation || "").replace(/\s+/g, " ").trim(),
  };
}

function buildShortcutPayload(q, pool, shuf = shuffle) {
  const answer = String(q.code || "").trim();
  const peers = pool.filter(
    (x) => x.category === "shortcut" && x.id !== q.id && x.code
  );
  const distractors = shuf(peers)
    .map((x) => String(x.code).trim())
    .filter((c) => c && c !== answer);
  const choices = shuf([answer, ...distractors.slice(0, 3)]);
  return {
    id: q.id,
    category: q.category,
    module: q.module,
    visualType: "standard",
    question: `「${q.name}」\nのコマンド／キー操作は？`,
    choices: choices.slice(0, 4),
    answer,
    explanation: String(q.explanation || "").replace(/\s+/g, " ").trim(),
  };
}

const ABBR_CONNECTORS = new Set([
  "of",
  "and",
  "in",
  "or",
  "to",
  "for",
  "at",
  "by",
  "on",
  "the",
  "with",
  "via",
  "from",
  "as",
]);

function isAbbrConnector(word) {
  return ABBR_CONNECTORS.has(String(word || "").trim().toLowerCase());
}

function abbrLettersFromCode(code) {
  return String(code || "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .split("");
}

function buildAbbrPartsMeta(code, parts) {
  const letters = abbrLettersFromCode(code);
  let letterIdx = 0;
  return parts.map((part, i) => {
    const answer = String(part.answer || "").trim();
    const connector = isAbbrConnector(answer);
    let badge = null;
    if (!connector) {
      badge = letters[letterIdx] || answer.charAt(0).toUpperCase() || String(i + 1);
      letterIdx += 1;
    }
    return { connector, badge };
  });
}

function buildAbbrPayload(q, shuf = shuffle) {
  if (!Array.isArray(q.parts) || !q.parts.length) return null;
  const code = String(q.code || "").trim();
  if (!code) return null;
  const meta = buildAbbrPartsMeta(code, q.parts);
  const abbrParts = [];
  for (let i = 0; i < q.parts.length; i++) {
    const part = q.parts[i];
    const answer = String(part.answer || "").trim();
    if (!answer) return null;
    const wrongs = (part.wrongs || []).map(String).filter((w) => w && w !== answer);
    const distractors = shuf(wrongs).slice(0, 3);
    const choices = shuf([answer, ...distractors]);
    if (choices.length < 4) return null;
    abbrParts.push({
      wordIndex: i + 1,
      badge: meta[i].badge,
      isConnector: meta[i].connector,
      choices,
      answer,
    });
  }
  return {
    id: q.id,
    category: q.category,
    module: q.module,
    visualType: "abbr",
    abbrCode: code,
    abbrParts,
    question: `「${code}」の正式名称は？（各語を選択）`,
    answer: abbrParts.map((p) => p.answer).join(" "),
    explanation: String(q.explanation || "").replace(/\s+/g, " ").trim(),
  };
}

function simplifyClozePrompt(text) {
  return String(text || "")
    .replace(/\[\[(\d+)\]\]/g, "______")
    .replace(/```[\w]*\n?/g, "")
    .replace(/```/g, "")
    .replace(/\r/g, "")
    .trim();
}

function extractClozeSnippet(prompt) {
  const simplified = simplifyClozePrompt(prompt);
  const lines = simplified.split("\n").map((l) => l.trimEnd()).filter(Boolean);
  const idx = lines.findIndex((l) => l.includes("______"));
  if (idx >= 0) {
    const blankLine = lines[idx].trim();
    const prev = idx > 0 ? lines[idx - 1].trim() : "";
    if (prev && /^[A-Za-z_`]/.test(prev)) {
      return `${prev}\n${blankLine}`.slice(0, 120);
    }
    return blankLine.slice(0, 100);
  }
  return simplified.slice(0, 100);
}

function buildClozePayload(q, shuf = shuffle) {
  const blank = Array.isArray(q.blanks) && q.blanks[0];
  if (!blank) return null;
  const answer = String(blank.answer || "").trim();
  const wrongs = (blank.wrongs || []).map(String).filter((w) => w && w !== answer);
  const choices = shuf([answer, ...wrongs]).slice(0, 4);
  if (choices.length < 2) return null;
  const snippet = extractClozeSnippet(q.prompt || "");
  const title = String(q.name || "次の空欄に入る語句は？").trim();
  return {
    id: q.id,
    category: q.category,
    module: q.module,
    visualType: "cloze",
    clozeSnippet: snippet,
    question: title,
    choices,
    answer,
    explanation: String(q.explanation || "").replace(/\s+/g, " ").trim(),
  };
}

function buildPayload(q, pool, shuf = shuffle) {
  if (q.category === "tcode") return buildTcodePayload(q, pool, shuf);
  if (q.category === "term") return buildTermPayload(q, pool, shuf);
  if (q.category === "scenario") return buildScenarioPayload(q, shuf);
  if (q.category === "judgment") return buildJudgmentPayload(q, shuf);
  if (q.category === "shortcut") return buildShortcutPayload(q, pool, shuf);
  if (q.category === "abbr") return buildAbbrPayload(q, shuf);
  if (q.category === "cloze") return buildClozePayload(q, shuf);
  return null;
}

function getVisualType(payload) {
  if (payload && payload.visualType) return payload.visualType;
  const cat = payload && payload.category;
  if (cat === "cloze") return "cloze";
  if (cat === "abbr" && Array.isArray(payload.abbrParts)) return "abbr";
  return "standard";
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = String(text || "").split("\n");
  for (const para of paragraphs) {
    if (!para) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const ch of para) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

const IMG_W = 1200;
const IMG_PAD = 36;
const HEADER_BOTTOM = IMG_PAD + 108;
const FOOTER_RESERVE = 52;

function clipText(ctx, text, maxWidth) {
  const s = String(text || "");
  if (ctx.measureText(s).width <= maxWidth) return s;
  let out = s;
  while (out.length > 1 && ctx.measureText(out + "…").width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + "…";
}

const ABBR_ROW_H = 58;
const ABBR_ROW_GAP = 10;
const ABBR_CHOICE_FONT = 18;
const ABBR_LABEL_FONT = 18;

function abbrRowCount(partCount) {
  return partCount;
}

function fontMetrics(ctx, font) {
  ctx.font = font;
  const m = ctx.measureText("Mg");
  return {
    ascent: m.actualBoundingBoxAscent || 12,
    descent: m.actualBoundingBoxDescent || 4,
  };
}

function textBaselineInBox(ctx, boxTop, boxH, font) {
  const { ascent, descent } = fontMetrics(ctx, font);
  const textH = ascent + descent;
  return boxTop + (boxH - textH) / 2 + ascent;
}

function computeImageSize(payload) {
  const vt = getVisualType(payload);
  if (vt === "abbr" && Array.isArray(payload.abbrParts)) {
    const n = payload.abbrParts.length;
    return { w: IMG_W, h: Math.min(1100, 400 + n * (ABBR_ROW_H + ABBR_ROW_GAP)) };
  }
  if (vt === "judgmentMulti") {
    const n = Math.min((payload.choices || []).length, 6);
    return { w: IMG_W, h: Math.min(1050, 460 + n * 68) };
  }
  if (vt === "cloze") return { w: IMG_W, h: 760 };
  return { w: IMG_W, h: 675 };
}

function paintBackground(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, BG_BLUE[0]);
  grad.addColorStop(0.55, BG_BLUE[1]);
  grad.addColorStop(1, BG_BLUE[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawImageHeader(ctx, payload, seq, imgH) {
  const pad = IMG_PAD;
  roundRect(ctx, pad, pad, IMG_W - pad * 2, imgH - pad * 2, 24, "#ffffff");
  ctx.fillStyle = "#0f766e";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("ビジネス道場 ｜ 生産管理2級", pad + 36, pad + 52);
  ctx.fillStyle = "#6b7a8c";
  ctx.font = "22px sans-serif";
  const mod = MODULE_LABEL[payload.module] || payload.module || "";
  const cat = CATEGORY_LABEL[payload.category] || payload.category || "";
  ctx.fillText(`#${seq}  ${mod} ・ ${cat}`, pad + 36, pad + 90);
}

function drawImageFooter(ctx, imgH) {
  ctx.fillStyle = "#6b7a8c";
  ctx.font = "22px sans-serif";
  ctx.fillText("答えは返信へ ↓　非公式の学習用クイズです", IMG_PAD + 36, imgH - IMG_PAD - 28);
}

function drawQuestionBlock(ctx, text, startY, maxLines, fontSize) {
  ctx.fillStyle = "#22303f";
  ctx.font = `bold ${fontSize}px sans-serif`;
  const lines = wrapText(ctx, text, IMG_W - IMG_PAD * 2 - 80).slice(0, maxLines);
  let y = startY;
  for (const line of lines) {
    ctx.fillText(line, IMG_PAD + 36, y);
    y += fontSize + 18;
  }
  return y;
}

function choiceRowHeight(ctx, text, compact) {
  const maxW = IMG_W - IMG_PAD * 2 - (compact ? 150 : 160);
  const lines = wrapText(ctx, String(text), maxW).slice(0, compact ? 1 : 2);
  return Math.max(compact ? 44 : 52, 20 + lines.length * (compact ? 24 : 28));
}

function choiceAreaHeight(ctx, payload, compact) {
  const choices = (payload.choices || []).slice(0, compact ? 6 : 4);
  if (!choices.length) return 0;
  let h = 12;
  choices.forEach((c) => {
    h += choiceRowHeight(ctx, c, compact) + (compact ? 6 : 10);
  });
  return h;
}

function abbrAreaHeight(payload) {
  if (!Array.isArray(payload.abbrParts)) return 0;
  return abbrRowCount(payload.abbrParts.length) * (ABBR_ROW_H + ABBR_ROW_GAP);
}

function estimateContentHeight(ctx, payload) {
  const vt = getVisualType(payload);
  const fontSize = 28;
  const maxQLines = vt === "cloze" ? 3 : vt === "judgmentMulti" ? 4 : 5;
  ctx.font = `bold ${fontSize}px sans-serif`;
  const qLines = wrapText(ctx, getDisplayQuestion(payload), IMG_W - IMG_PAD * 2 - 80).slice(0, maxQLines);
  let h = qLines.length * (fontSize + 18) + 18;
  if (vt === "cloze") {
    const snippet = String(payload.clozeSnippet || "").trim();
    const panelW = IMG_W - IMG_PAD * 2 - 72;
    const contentLines = snippet.split("\n").flatMap((part) => wrapText(ctx, part, panelW - 32)).slice(0, 3);
    h += 36 + contentLines.length * 30 + 16 + 18;
  }
  if (vt === "abbr") {
    h += abbrAreaHeight(payload);
  } else {
    h += choiceAreaHeight(ctx, payload, vt === "judgmentMulti") + 8;
  }
  return h;
}

function layoutContentStart(ctx, payload, imgH) {
  const footerTop = imgH - IMG_PAD - FOOTER_RESERVE;
  const contentHeight = estimateContentHeight(ctx, payload);
  const free = footerTop - HEADER_BOTTOM - contentHeight;
  const offset = free > 24 ? free / 2 : 12;
  return HEADER_BOTTOM + offset;
}

function drawChoiceList(ctx, payload, startY, contentBottom, compact) {
  const labels = ["A", "B", "C", "D", "E", "F"];
  const maxChoices = compact ? 6 : 4;
  const choices = (payload.choices || []).slice(0, maxChoices);
  const areaH = choiceAreaHeight(ctx, payload, compact);
  let y = Math.min(startY, contentBottom - areaH);
  const rowGap = compact ? 6 : 10;
  const boxLeft = IMG_PAD + 36;
  const boxW = IMG_W - IMG_PAD * 2 - 72;
  const labelX = IMG_PAD + 52;
  const textX = IMG_PAD + 92;
  const maxTextW = IMG_W - IMG_PAD * 2 - (compact ? 150 : 160);

  choices.forEach((c, i) => {
    const rowH = choiceRowHeight(ctx, c, compact);
    const top = y;
    roundRect(ctx, boxLeft, top, boxW, rowH, compact ? 10 : 12, "#e6f4f2");

    const labelFont = `bold ${compact ? 20 : 24}px sans-serif`;
    const textFont = `${compact ? 20 : 22}px sans-serif`;
    const lineH = compact ? 24 : 28;
    const lines = wrapText(ctx, String(c), maxTextW).slice(0, compact ? 1 : 2);
    const lm = fontMetrics(ctx, labelFont);
    const tm = fontMetrics(ctx, textFont);

    if (lines.length === 1) {
      const baseline = textBaselineInBox(ctx, top, rowH, textFont);
      ctx.fillStyle = "#0f766e";
      ctx.font = labelFont;
      ctx.fillText(labels[i], labelX, baseline);
      ctx.fillStyle = "#22303f";
      ctx.font = textFont;
      ctx.fillText(lines[0], textX, baseline);
    } else {
      const blockH = lines.length * lineH;
      const blockTop = top + (rowH - blockH) / 2;
      const labelH = lm.ascent + lm.descent;
      const labelBaseline = blockTop + (blockH - labelH) / 2 + lm.ascent;
      ctx.fillStyle = "#0f766e";
      ctx.font = labelFont;
      ctx.fillText(labels[i], labelX, labelBaseline);
      ctx.fillStyle = "#22303f";
      ctx.font = textFont;
      let baseline = blockTop + tm.ascent;
      for (const line of lines) {
        ctx.fillText(line, textX, baseline);
        baseline += lineH;
      }
    }

    y = top + rowH + rowGap;
  });
  return y;
}

function drawAbbrStrip(ctx, part, x, y, w) {
  const labels = ["A", "B", "C", "D"];
  const isConn = !!part.isConnector;
  roundRect(ctx, x, y, w, ABBR_ROW_H, 10, isConn ? "#f8fafc" : "#f2f8f7");
  ctx.fillStyle = isConn ? "#94a3b8" : "#0f766e";
  roundRect(ctx, x + 10, y + 10, 3, ABBR_ROW_H - 20, 2, isConn ? "#94a3b8" : "#0f766e");

  const pillText = isConn ? "·" : String(part.badge || "").trim();
  ctx.font = `bold ${ABBR_CHOICE_FONT}px sans-serif`;
  const pillSize = 34;
  const pillX = x + 18;
  const pillY = y + (ABBR_ROW_H - pillSize) / 2;
  const pillFill = isConn ? "#94a3b8" : "#0f766e";
  roundRect(ctx, pillX, pillY, pillSize, pillSize, 8, pillFill);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(
    pillText,
    pillX + (pillSize - ctx.measureText(pillText).width) / 2,
    textBaselineInBox(ctx, pillY, pillSize, `bold ${ABBR_CHOICE_FONT}px sans-serif`)
  );

  const colStart = pillX + pillSize + 14;
  const colW = (x + w - colStart - 8) / 4;
  const labelFont = `bold ${ABBR_LABEL_FONT}px sans-serif`;
  const textFont = `${ABBR_CHOICE_FONT}px sans-serif`;
  part.choices.slice(0, 4).forEach((choice, ci) => {
    const cx = colStart + ci * colW;
    const baseline = textBaselineInBox(ctx, y, ABBR_ROW_H, textFont);
    ctx.fillStyle = "#0f766e";
    ctx.font = labelFont;
    ctx.fillText(labels[ci], cx + 4, baseline);
    ctx.fillStyle = "#22303f";
    ctx.font = textFont;
    ctx.fillText(clipText(ctx, choice, colW - 28), cx + 28, baseline);
    if (ci < 3) {
      ctx.strokeStyle = "#c5ddd9";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + colW - 2, y + 12);
      ctx.lineTo(cx + colW - 2, y + ABBR_ROW_H - 12);
      ctx.stroke();
    }
  });
}

function drawAbbrParts(ctx, payload, startY) {
  const parts = payload.abbrParts;
  const panelX = IMG_PAD + 36;
  const panelW = IMG_W - IMG_PAD * 2 - 72;
  let y = startY;

  for (const part of parts) {
    drawAbbrStrip(ctx, part, panelX, y, panelW);
    y += ABBR_ROW_H + ABBR_ROW_GAP;
  }
  return y;
}

function getDisplayQuestion(payload) {
  return String(payload.question || "").trim();
}

function drawClozePanel(ctx, payload, startY) {
  const snippet = String(payload.clozeSnippet || "").trim();
  const panelX = IMG_PAD + 36;
  const panelW = IMG_W - IMG_PAD * 2 - 72;
  const contentLines = snippet.split("\n").flatMap((part) =>
    wrapText(ctx, part, panelW - 32)
  ).slice(0, 3);
  const panelH = 36 + contentLines.length * 30 + 16;
  roundRect(ctx, panelX, startY, panelW, panelH, 10, "#e8f5f3");
  ctx.fillStyle = "#0f766e";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("▼ 空欄（＿＿＿＿）に入る語句", panelX + 16, startY + 24);
  ctx.fillStyle = "#22303f";
  ctx.font = "22px sans-serif";
  let ty = startY + 52;
  for (const line of contentLines) {
    const parts = line.split("______");
    let lx = panelX + 16;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i]) {
        ctx.fillStyle = "#22303f";
        ctx.fillText(parts[i], lx, ty);
        lx += ctx.measureText(parts[i]).width;
      }
      if (i < parts.length - 1) {
        const blankW = 72;
        roundRect(ctx, lx, ty - 20, blankW, 26, 4, "#cce8e4");
        ctx.strokeStyle = "#0f766e";
        ctx.lineWidth = 2;
        ctx.strokeRect(lx + 0.5, ty - 19.5, blankW - 1, 25);
        lx += blankW + 4;
      }
    }
    ty += 30;
  }
  return startY + panelH + 8;
}

function renderQuestionImage(payload, seq) {
  const imgSize = computeImageSize(payload);
  const canvas = createCanvas(imgSize.w, imgSize.h);
  const ctx = canvas.getContext("2d");
  const imgH = imgSize.h;
  const contentBottom = imgH - IMG_PAD - FOOTER_RESERVE;
  const visualType = getVisualType(payload);

  paintBackground(ctx, imgSize.w, imgH);
  drawImageHeader(ctx, payload, seq, imgH);

  const maxQLines = visualType === "cloze" ? 3 : visualType === "judgmentMulti" ? 4 : 5;
  const fontSize = 28;
  let y = layoutContentStart(ctx, payload, imgH);
  y = drawQuestionBlock(ctx, getDisplayQuestion(payload), y, maxQLines, fontSize);
  y += 18;
  if (visualType === "cloze") {
    y = drawClozePanel(ctx, payload, y);
    y += 18;
  }
  if (visualType === "abbr") {
    drawAbbrParts(ctx, payload, y + 8);
  } else {
    drawChoiceList(ctx, payload, y + 8, contentBottom, visualType === "judgmentMulti");
  }
  drawImageFooter(ctx, imgH);
  return canvas.toBuffer("image/png");
}

function payloadToImageBase64(payload, seq) {
  if (!payload) return null;
  try {
    return renderQuestionImage(payload, seq).toString("base64");
  } catch (err) {
    console.warn("renderQuestionImage failed", err.message || err);
    return null;
  }
}

/** 親ポスト用ハッシュタグ（SAPタグ禁止・最大4） */
function composeHashtags(payload, date = new Date()) {
  const jst = getJstDate(date);
  // 日〜水: プランニング寄与 / 木〜土: オペレーション寄与
  const day = jst.getDay();
  const laneTag =
    day === 0 || day === 1 || day === 2 || day === 3
      ? "#生産管理プランニング"
      : "#生産管理オペレーション";
  const tags = ["#ビジネスキャリア検定", "#生産管理", laneTag, "#生産管理2級"];
  return [...new Set(tags)].slice(0, 4).join(" ");
}

function composeParentText(payload, seq, options = {}) {
  const mod = MODULE_LABEL[payload.module] || payload.module || "生産管理";
  const lines = [`【生産管理2級 #${seq}】${mod}`, ""];
  if (options.includeQuestion) {
    const q = String(payload.question || "").replace(/\s+/g, " ").trim();
    lines.push(q.slice(0, 160) + (q.length > 160 ? "…" : ""));
    if (Array.isArray(payload.choices) && payload.choices.length) {
      const labels = ["A", "B", "C", "D"];
      payload.choices.slice(0, 4).forEach((c, i) => {
        lines.push(`${labels[i]}. ${String(c).slice(0, 36)}`);
      });
    }
    lines.push("");
    lines.push("正解はどれ？ 答えは返信へ ↓");
  } else {
    lines.push("正解はどれ？");
    lines.push("考えてから答え合わせ ↓");
  }
  lines.push("");
  lines.push(composeHashtags(payload));
  return clipToTweetWeight(lines.join("\n"), 270);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** X の加重文字数（CJK は概ね2）。URL は t.co 換算で23。 */
function tweetWeight(text) {
  let t = String(text || "");
  const urls = t.match(/https?:\/\/[^\s]+/g) || [];
  t = t.replace(/https?:\/\/[^\s]+/g, "");
  let w = urls.length * 23;
  for (const ch of t) {
    const cp = ch.codePointAt(0);
    // Basic Latin / Latin Extended などは1、それ以外（日本語など）は2
    if (cp <= 0x02af || (cp >= 0x1e00 && cp <= 0x1eff) || (cp >= 0x2000 && cp <= 0x206f)) {
      w += 1;
    } else {
      w += 2;
    }
  }
  return w;
}

function clipToTweetWeight(text, maxWeight = 270) {
  const raw = String(text || "");
  if (tweetWeight(raw) <= maxWeight) return raw;
  // URL を残しつつ末尾から削る
  const urls = raw.match(/https?:\/\/[^\s]+/g) || [];
  let body = raw;
  urls.forEach((u, i) => {
    body = body.replace(u, `\uE000${i}\uE001`);
  });
  let out = "";
  let w = urls.length * 23;
  for (const ch of body) {
    if (ch === "\uE000" || ch === "\uE001") {
      out += ch;
      continue;
    }
    const cp = ch.codePointAt(0);
    const cw =
      cp <= 0x02af || (cp >= 0x1e00 && cp <= 0x1eff) || (cp >= 0x2000 && cp <= 0x206f) ? 1 : 2;
    if (w + cw > maxWeight - 2) break;
    out += ch;
    w += cw;
  }
  out = out.replace(/\uE000(\d+)\uE001/g, (_, i) => urls[Number(i)] || "");
  return out.replace(/\s+$/g, "") + "…";
}

async function tweetWithRetry(client, body, step, attempts = 3, options = {}) {
  const retryForbidden = !!options.retryForbidden;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      if (i > 0) await sleep(options.backoffMs ? options.backoffMs * i : 2000 * i);
      return await client.v2.tweet(body);
    } catch (err) {
      lastErr = err;
      const code = err && err.code;
      if (code === 402 || code === 401) break;
      if (code === 403 && !retryForbidden) break;
    }
  }
  throw new Error(formatXError(step, lastErr));
}

async function postReplyTweet(client, parentId, replyText) {
  // composeReplyText 済み想定。フッタを壊す全体クリップはしない
  const text = String(replyText || "");
  try {
    return await tweetWithRetry(
      client,
      { text, reply: { in_reply_to_tweet_id: String(parentId) } },
      "reply_tweet",
      5,
      { retryForbidden: true, backoffMs: 3000 }
    );
  } catch (err) {
    const short = composeReplyFooterOnly(text);
    if (!short || short === text) throw err;
    try {
      await sleep(2500);
      return await tweetWithRetry(
        client,
        { text: short, reply: { in_reply_to_tweet_id: String(parentId) } },
        "reply_tweet_short",
        3,
        { retryForbidden: true, backoffMs: 3000 }
      );
    } catch (err2) {
      try {
        await sleep(2000);
        const v1 = await client.v1.reply(short, String(parentId));
        return { data: { id: String(v1.id_str || v1.id) } };
      } catch (err3) {
        throw err2;
      }
    }
  }
}

function replyFooterBlock() {
  return `続きはサイトで（1日20問無料）\n${SITE_URL}`;
}

function composeReplyFooterOnly(fromText) {
  const first = String(fromText || "")
    .split("\n")
    .find((l) => l.startsWith("正解"));
  const answerLine = first && first.startsWith("正解") ? first.trim() : "正解：";
  return `${answerLine}\n\n${replyFooterBlock()}`;
}

function choiceLabel(payload) {
  const labels = ["A", "B", "C", "D", "E", "F"];
  if (Array.isArray(payload.answerLabels) && payload.answerLabels.length) {
    return payload.answerLabels.join(", ");
  }
  if (Array.isArray(payload.abbrParts) && payload.abbrParts.length) {
    return payload.abbrParts
      .map((p) => {
        const idx = p.choices.findIndex((c) => String(c) === String(p.answer));
        return `${p.wordIndex}語目${labels[idx >= 0 ? idx : 0]}`;
      })
      .join(" ");
  }
  const answer = String(payload.answer || "");
  const idx = (payload.choices || []).findIndex((c) => String(c) === answer);
  return idx >= 0 ? labels[idx] : null;
}

function charTweetWeight(ch) {
  const cp = ch.codePointAt(0);
  if (cp <= 0x02af || (cp >= 0x1e00 && cp <= 0x1eff) || (cp >= 0x2000 && cp <= 0x206f)) {
    return 1;
  }
  return 2;
}

function composeReplyText(payload) {
  const label = choiceLabel(payload);
  // 選択肢本文は入れない（正解：A のみ）
  const answerLine = label
    ? `正解：${label}`
    : `正解：${String(payload.answer || "").replace(/\s+/g, " ").trim().slice(0, 20)}`;
  const footer = `\n\n${replyFooterBlock()}`;
  const maxTotal = 270;
  const reserved = tweetWeight(answerLine) + tweetWeight(footer);
  const remaining = maxTotal - reserved;

  const raw = String(payload.explanation || "").replace(/\s+/g, " ").trim();
  let mid = "";
  if (raw && remaining >= 10) {
    const prefix = "\n解説：";
    const prefixW = tweetWeight(prefix);
    let budget = remaining - prefixW;
    if (budget >= 4) {
      let body = "";
      let w = 0;
      for (const ch of raw) {
        const cw = charTweetWeight(ch);
        if (w + cw > budget) break;
        body += ch;
        w += cw;
      }
      if (body.length < raw.length) {
        while (body.length && tweetWeight(prefix + body + "…") > remaining) {
          body = body.slice(0, -1);
        }
        if (body.length >= 2) body += "…";
      }
      if (body.length >= 2) mid = prefix + body;
    }
  }

  const text = answerLine + mid + footer;
  // 必須フッタが欠けたら解説を捨ててフッタ優先
  if (!text.includes(SITE_URL) || !text.includes("続きはサイトで（1日20問無料）")) {
    return `${answerLine}\n\n${replyFooterBlock()}`;
  }
  return text;
}

const REPLY_MAX_WEIGHT = 270;

function buildReplyPreview(payload) {
  const text = composeReplyText(payload);
  const weight = tweetWeight(text);
  const fullExplanation = String(payload.explanation || "").replace(/\s+/g, " ").trim();
  const hasExplanation = text.includes("\n解説：");
  const explanationTruncated =
    !!fullExplanation && hasExplanation && !text.includes(fullExplanation);
  const explanationOmitted = !!fullExplanation && !hasExplanation;
  return {
    text,
    weight,
    maxWeight: REPLY_MAX_WEIGHT,
    explanationTruncated,
    explanationOmitted,
  };
}

function layoutLabelForPayload(payload) {
  const vt = getVisualType(payload);
  if (vt === "judgmentMulti") return "複数正誤";
  if (vt === "abbr") return "略称";
  if (vt === "cloze") return "穴埋め";
  if (payload.category === "judgment") return "正誤";
  return CATEGORY_LABEL[payload.category] || "4択";
}

function serializeAbbrParts(payload) {
  if (!Array.isArray(payload.abbrParts)) return null;
  return payload.abbrParts.map((p) => ({
    wordIndex: p.wordIndex,
    badge: p.badge,
    letter: p.badge,
    isConnector: !!p.isConnector,
    choices: p.choices,
    answer: p.answer,
  }));
}

function formatXError(step, err) {
  const data = err && err.data ? err.data : null;
  const detail =
    (data && (data.detail || data.title)) ||
    (err && err.message) ||
    String(err);
  const code = err && err.code != null ? err.code : "";
  return `X API error at ${step}: [${code}] ${detail}`;
}

function pickQuestionSeeded(pool, postedIds, preferCategory, seed, opts = {}) {
  const posted = new Set(postedIds || []);
  const preferred = pool.filter((q) => q.category === preferCategory && !posted.has(q.id));
  const fallback = pool.filter((q) => !posted.has(q.id));
  const strict = !!opts.strict;
  const candidates = preferred.length ? preferred : strict ? [] : fallback;
  if (!candidates.length) return null;

  const shuf = makeSeededShuffle(seed);
  const p1 = candidates.filter((q) => Number(q.priority) === 1);
  let base = p1.length ? p1 : candidates;
  if (opts.preferJudgmentMulti && preferCategory === "judgment") {
    const multi = base.filter(isJudgmentMulti);
    if (multi.length) base = multi;
  }
  const tryN = strict ? Math.min(base.length, 200) : 40;
  for (const q of shuf(base).slice(0, tryN)) {
    const payload = buildPayload(q, pool, shuf);
    if (payload && payload.question && (
      (payload.choices && payload.choices.length >= 2) ||
      (payload.abbrParts && payload.abbrParts.length)
    )) {
      return payload;
    }
  }
  return null;
}

async function pickQuestion(pool, postedIds, preferCategory, opts = {}) {
  const dateKey = opts.dateKey || getJstDateKey();
  const seq = Number(opts.seq || 0);
  const seed = hashSeed(`${dateKey}:${preferCategory}:${seq}`);
  return pickQuestionSeeded(pool, postedIds, preferCategory, seed, opts);
}

function findRawQuestion(pool, questionId) {
  return pool.find((q) => q && q.id === questionId) || null;
}

function payloadFromQuestionId(pool, questionId, dateKey, seq) {
  const q = findRawQuestion(pool, questionId);
  if (!q) return null;
  const shuf = makeSeededShuffle(hashSeed(`${dateKey}:${questionId}:${seq}`));
  return buildPayload(q, pool, shuf);
}

async function pickForScheduleDay(pool, postedIds, dateKey, seq, overrides = {}, opts = {}) {
  const override = overrides[dateKey];
  if (override && override.questionId) {
    const forced = payloadFromQuestionId(pool, override.questionId, dateKey, seq);
    if (forced) {
      return { payload: forced, source: "override" };
    }
  }
  const date = new Date(dateKey + "T12:00:00+09:00");
  const prefer =
    opts.preferCategory && POSTABLE.has(String(opts.preferCategory))
      ? String(opts.preferCategory)
      : weekdayCategory(date);
  const seed = hashSeed(`${dateKey}:${prefer}:${seq}`);
  const payload = pickQuestionSeeded(pool, postedIds, prefer, seed, {
    strict: !!opts.strictPrefer,
    preferJudgmentMulti: prefer === "judgment" && date.getDay() === 4,
  });
  return { payload, source: "auto", preferCategory: prefer };
}

async function buildLayoutSamples(pool) {
  const targets = [
    { badge: "4択", cats: ["tcode"], match: () => true },
    { badge: "正誤", cats: ["judgment"], match: (q) => !isJudgmentMulti(q) },
    { badge: "複数正誤", cats: ["judgment"], match: isJudgmentMulti, expectVisual: "judgmentMulti" },
    { badge: "ショートカット", cats: ["shortcut"], match: () => true },
    { badge: "穴埋め", cats: ["cloze"], match: () => true },
    { badge: "略称", cats: ["abbr"], match: () => true, expectVisual: "abbr" },
  ];
  const samples = [];
  for (const t of targets) {
    const candidates = pool.filter((q) => t.cats.includes(q.category) && t.match(q));
    for (const q of candidates) {
      const shuf = makeSeededShuffle(`sample:${t.badge}:${q.id}`);
      const payload = buildPayload(q, pool, shuf);
      if (!payload) continue;
      if (t.expectVisual && getVisualType(payload) !== t.expectVisual) continue;
      const imageBase64 = payloadToImageBase64(payload, 0);
      if (!imageBase64) continue;
      samples.push({
        visualType: getVisualType(payload),
        layoutLabel: t.badge,
        questionId: payload.id,
        category: payload.category,
        categoryLabel: CATEGORY_LABEL[payload.category] || payload.category,
        imageBase64,
      });
      break;
    }
  }
  return samples;
}

function prunePastScheduleOverrides(overrides, todayKey) {
  const out = {};
  for (const [dateKey, entry] of Object.entries(overrides || {})) {
    if (dateKey >= todayKey && entry && entry.questionId) out[dateKey] = entry;
  }
  return out;
}

async function buildSchedulePreview(days = 7, options = {}) {
  const includeImages = options.includeImages !== false;
  const includeSamples = options.includeSamples !== false;
  const pool = await fetchQuizData();
  const snap = await metaRef().get();
  const meta = snap.exists ? snap.data() : {};
  const postedIds = Array.isArray(meta.postedIds) ? meta.postedIds.slice() : [];
  const baseSeq = Number(meta.seq || 0);
  const last = meta.last || {};
  const todayKey = getJstDateKey();
  const todayPosted = isPostedOnDate(last, todayKey);
  const rawOverrides =
    meta.scheduleOverrides && typeof meta.scheduleOverrides === "object"
      ? meta.scheduleOverrides
      : {};
  const overrides = prunePastScheduleOverrides(rawOverrides, todayKey);
  const workingOverrides = { ...overrides };
  let overridesChanged =
    Object.keys(overrides).length !== Object.keys(rawOverrides).length;
  const result = [];
  const simulatedPosted = postedIds.slice();

  for (let i = 0; i < days; i++) {
    const dateKey = addJstDays(todayKey, i);
    const postedThisDay = i === 0 && todayPosted;
    const daySeq = todayPosted ? baseSeq + i : baseSeq + i + 1;

    let payload = null;
    let source = "auto";
    let preferCategory = weekdayCategory(new Date(dateKey + "T12:00:00+09:00"));

    if (postedThisDay && last.questionId) {
      payload = payloadFromQuestionId(pool, last.questionId, dateKey, daySeq);
      source = "posted";
    } else {
      const picked = await pickForScheduleDay(pool, simulatedPosted, dateKey, daySeq, workingOverrides);
      payload = picked.payload;
      source = picked.source || "auto";
      preferCategory = picked.preferCategory || preferCategory;
      if (payload && payload.id && !workingOverrides[dateKey]) {
        workingOverrides[dateKey] = {
          questionId: payload.id,
          note: "表示時に自動固定",
          setBy: "auto",
        };
        overridesChanged = true;
        source = "pinned";
      } else if (workingOverrides[dateKey]) {
        source = "pinned";
      }
    }

    if (payload && payload.id && !simulatedPosted.includes(payload.id)) {
      simulatedPosted.push(payload.id);
    }

    const override = workingOverrides[dateKey] || null;
    const dayItem = {
      date: dateKey,
      dateLabel: formatJstDateLabel(dateKey),
      postAt: POST_AT_LABEL,
      seq: daySeq,
      category: payload ? payload.category : preferCategory,
      categoryLabel: CATEGORY_LABEL[payload ? payload.category : preferCategory] || preferCategory,
      status: postedThisDay ? "posted" : source === "pinned" ? "pinned" : "scheduled",
      questionId: payload ? payload.id : null,
      module: payload ? payload.module : null,
      moduleLabel: payload ? MODULE_LABEL[payload.module] || payload.module : null,
      question: payload ? payload.question : null,
      choices: payload ? payload.choices : [],
      answer: payload ? payload.answer : null,
      answerLabel: payload ? choiceLabel(payload) : null,
      explanation: payload ? payload.explanation : null,
      abbrParts: payload ? serializeAbbrParts(payload) : null,
      answerLabels: payload && payload.answerLabels ? payload.answerLabels.slice() : null,
      replyText: null,
      replyWeight: null,
      replyMaxWeight: REPLY_MAX_WEIGHT,
      replyExplanationTruncated: false,
      replyExplanationOmitted: false,
      override: override
        ? {
            questionId: override.questionId || null,
            note: override.note || "",
            setBy: override.setBy || "",
          }
        : null,
      tweetUrl:
        postedThisDay && last.tweetId
          ? `https://x.com/i/web/status/${last.tweetId}`
          : null,
    };
    if (payload && includeImages) {
      const vt = getVisualType(payload);
      dayItem.visualType = vt;
      dayItem.layoutLabel = layoutLabelForPayload(payload);
      dayItem.imageBase64 = payloadToImageBase64(payload, daySeq);
    }
    if (payload) {
      const reply = buildReplyPreview(payload);
      dayItem.replyText = reply.text;
      dayItem.replyWeight = reply.weight;
      dayItem.replyMaxWeight = reply.maxWeight;
      dayItem.replyExplanationTruncated = reply.explanationTruncated;
      dayItem.replyExplanationOmitted = reply.explanationOmitted;
    }
    result.push(dayItem);
  }

  if (overridesChanged) {
    await metaRef().set(
      {
        scheduleOverrides: workingOverrides,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  const response = {
    ok: true,
    seq: baseSeq,
    todayKey,
    todayPosted,
    days: result,
    poolSize: pool.length,
  };
  if (includeSamples) {
    response.layoutSamples = await buildLayoutSamples(pool);
  }
  return response;
}

async function setScheduleOverride({ dateKey, questionId, action, note, setBy }) {
  const key = String(dateKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    throw new Error("dateKey は YYYY-MM-DD 形式で指定してください");
  }
  const snap = await metaRef().get();
  const meta = snap.exists ? snap.data() : {};
  const todayKey = getJstDateKey();
  const overrides = prunePastScheduleOverrides(
    { ...(meta.scheduleOverrides || {}) },
    todayKey
  );
  const pool = await fetchQuizData();
  const postedIds = Array.isArray(meta.postedIds) ? meta.postedIds.slice() : [];
  const baseSeq = Number(meta.seq || 0);
  const todayPosted = isPostedOnDate(meta.last, todayKey);
  const dayOffset = Math.max(
    0,
    Math.round(
      (new Date(key + "T12:00:00+09:00").getTime() -
        new Date(todayKey + "T12:00:00+09:00").getTime()) /
        86400000
    )
  );
  const seq = todayPosted ? baseSeq + dayOffset : baseSeq + dayOffset + 1;

  if (action === "clear") {
    delete overrides[key];
  } else if (action === "repick") {
    const current = overrides[key] && overrides[key].questionId;
    const prefer = weekdayCategory(new Date(key + "T12:00:00+09:00"));
    let picked = null;
    for (let salt = 0; salt < 30; salt++) {
      const seed = hashSeed(`${key}:${prefer}:${seq}:repick:${salt}`);
      const p = pickQuestionSeeded(pool, postedIds, prefer, seed);
      if (p && p.id !== current) {
        picked = p;
        break;
      }
    }
    if (!picked) throw new Error("差し替え候補が見つかりませんでした");
    overrides[key] = {
      questionId: picked.id,
      note: note || "自動差し替え",
      setBy: setBy || "",
      at: admin.firestore.FieldValue.serverTimestamp(),
    };
  } else {
    const qid = String(questionId || "").trim();
    if (!qid) throw new Error("questionId が必要です");
    if (!findRawQuestion(pool, qid)) throw new Error("問題IDが見つかりません: " + qid);
    overrides[key] = {
      questionId: qid,
      note: note || "",
      setBy: setBy || "",
      at: admin.firestore.FieldValue.serverTimestamp(),
    };
  }

  await metaRef().set(
    {
      scheduleOverrides: overrides,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true, dateKey: key, overrides: overrides[key] || null };
}

function twitterClientFromSecrets() {
  return new TwitterApi({
    appKey: xApiKey.value(),
    appSecret: xApiSecret.value(),
    accessToken: xAccessToken.value(),
    accessSecret: xAccessSecret.value(),
  });
}

async function runDailyPost(options = {}) {
  const dryRun = !!options.dryRun;
  const textOnly = !!options.textOnly;
  const pool = await fetchQuizData();
  const snap = await metaRef().get();
  const meta = snap.exists ? snap.data() : {};
  const postedIds = Array.isArray(meta.postedIds) ? meta.postedIds.slice(-4000) : [];
  const seq = Number(meta.seq || 0) + 1;
  const todayKey = getJstDateKey();
  const overrides = prunePastScheduleOverrides(
    meta.scheduleOverrides && typeof meta.scheduleOverrides === "object"
      ? meta.scheduleOverrides
      : {},
    todayKey
  );
  let payload = null;
  let prefer =
    options.preferCategory && POSTABLE.has(String(options.preferCategory))
      ? String(options.preferCategory)
      : weekdayCategory();
  if (options.preferCategory && POSTABLE.has(String(options.preferCategory))) {
    payload = await pickQuestion(pool, postedIds, prefer, {
      strict: true,
      dateKey: todayKey,
      seq,
    });
  } else {
    const picked = await pickForScheduleDay(pool, postedIds, todayKey, seq, overrides);
    payload = picked.payload;
    prefer = picked.preferCategory || prefer;
  }
  if (!payload) {
    return { ok: false, reason: "no_question", prefer };
  }

  const parentText = composeParentText(payload, seq, { includeQuestion: textOnly });
  const replyText = composeReplyText(payload);
  const png = textOnly ? null : renderQuestionImage(payload, seq);

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      textOnly,
      seq,
      prefer,
      payload: {
        id: payload.id,
        category: payload.category,
        module: payload.module,
        question: payload.question,
        answer: payload.answer,
        choices: payload.choices,
      },
      parentText,
      replyText,
      imageBytes: png ? png.length : 0,
    };
  }

  const client = twitterClientFromSecrets().readWrite;
  let parent;
  try {
    if (textOnly) {
      parent = await tweetWithRetry(client, { text: parentText }, "parent_tweet");
    } else {
      let mediaId;
      try {
        mediaId = await client.v1.uploadMedia(png, { mimeType: "image/png" });
      } catch (err) {
        throw new Error(formatXError("media_upload", err));
      }
      // 画像アップロード直後に本文投稿すると失敗しやすいので少し待つ
      await sleep(1200);
      parent = await tweetWithRetry(
        client,
        { text: parentText, media: { media_ids: [String(mediaId)] } },
        "parent_tweet"
      );
    }
  } catch (err) {
    if (err && err.message && String(err.message).startsWith("X API error")) throw err;
    throw new Error(formatXError("parent_tweet", err));
  }

  const parentId = parent.data.id;
  // 親投稿直後の返信は弾かれることがあるため待機してから投稿
  await sleep(textOnly ? 2000 : 4000);

  let reply;
  try {
    reply = await postReplyTweet(client, parentId, replyText);
  } catch (err) {
    // 親だけ成功した場合に状態を残し、手動リカバリできるようにする
    await metaRef().set(
      {
        seq,
        last: {
          questionId: payload.id,
          category: payload.category,
          module: payload.module,
          tweetId: parentId,
          replyId: null,
          replyText,
          replyFailed: true,
          textOnly,
          at: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    const msg = err && err.message ? err.message : String(err);
    throw new Error(
      `${msg}（親投稿は成功: https://x.com/i/web/status/${parentId} / retryLastReply:true で返信のみ再試行可）`
    );
  }

  const nextPosted = postedIds.concat([payload.id]);
  const nextOverrides = { ...overrides };
  delete nextOverrides[todayKey];
  await metaRef().set(
    {
      seq,
      postedIds: nextPosted.slice(-4000),
      scheduleOverrides: nextOverrides,
      last: {
        questionId: payload.id,
        category: payload.category,
        module: payload.module,
        tweetId: parentId,
        replyId: reply.data.id,
        replyFailed: false,
        textOnly,
        at: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ok: true,
    seq,
    questionId: payload.id,
    tweetId: parentId,
    replyId: reply.data.id,
    textOnly,
    url: `https://x.com/i/web/status/${parentId}`,
  };
}

/** 親だけ成功して返信が落ちた場合のリカバリ */
async function retryLastReply() {
  const snap = await metaRef().get();
  if (!snap.exists) throw new Error("no meta");
  const last = snap.data().last || {};
  if (!last.tweetId || !last.replyText) {
    throw new Error("retryable reply not found（last.replyText がありません）");
  }
  if (last.replyId && !last.replyFailed) {
    return {
      ok: true,
      alreadyReplied: true,
      tweetId: last.tweetId,
      replyId: last.replyId,
      url: `https://x.com/i/web/status/${last.tweetId}`,
    };
  }

  const client = twitterClientFromSecrets().readWrite;
  const reply = await postReplyTweet(client, last.tweetId, last.replyText);

  const postedIds = Array.isArray(snap.data().postedIds) ? snap.data().postedIds.slice(-4000) : [];
  const nextPosted =
    last.questionId && !postedIds.includes(last.questionId)
      ? postedIds.concat([last.questionId])
      : postedIds;
  const seq = Number(snap.data().seq || 0);

  await metaRef().set(
    {
      seq: seq || 1,
      postedIds: nextPosted.slice(-4000),
      last: {
        questionId: last.questionId || null,
        category: last.category || null,
        module: last.module || null,
        tweetId: last.tweetId,
        replyId: reply.data.id,
        replyFailed: false,
        textOnly: !!last.textOnly,
        at: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ok: true,
    tweetId: last.tweetId,
    replyId: reply.data.id,
    url: `https://x.com/i/web/status/${last.tweetId}`,
  };
}

function createXDailySeisanQuizScheduleExport() {
  return onSchedule(
    {
      schedule: "15 8 * * *",
      timeZone: "Asia/Tokyo",
      region: REGION,
      serviceAccount: SERVICE_ACCOUNT,
      timeoutSeconds: 300,
      memory: "1GiB",
      secrets: SECRETS,
    },
    async () => {
      const result = await runDailyPost({ dryRun: false });
      console.info("xDailySeisanQuiz", result);
      return result;
    }
  );
}

/** 曜日ローテと同じ4カテゴリ（重複曜日はまとめ） */
const WEEKDAY_CATEGORIES = [
  "scenario",
  "term",
  "judgment",
  "abbr",
];

async function runAllCategoryPosts(options = {}) {
  const results = [];
  for (let i = 0; i < WEEKDAY_CATEGORIES.length; i++) {
    const cat = WEEKDAY_CATEGORIES[i];
    const result = await runDailyPost({
      dryRun: !!options.dryRun,
      textOnly: !!options.textOnly,
      preferCategory: cat,
    });
    results.push(result);
    if (!options.dryRun && i < WEEKDAY_CATEGORIES.length - 1) {
      // 連投制限・返信完了待ち
      await sleep(15000);
    }
  }
  return {
    ok: results.every((r) => r && r.ok),
    allCategories: true,
    results,
  };
}

/** 管理者用: 今すぐ投稿 / dryRun */
function createPostXDailySeisanQuizNowExport() {
  return onCall(
    {
      region: REGION,
      cors: true,
      serviceAccount: SERVICE_ACCOUNT,
      timeoutSeconds: 540,
      memory: "1GiB",
      secrets: SECRETS,
    },
    async (request) => {
      assertAdmin(request);
      const dryRun = !!(request.data && request.data.dryRun);
      const textOnly = !!(request.data && request.data.textOnly);
      const retryLast = !!(request.data && request.data.retryLastReply);
      const resetSeq = !!(request.data && request.data.resetSeq);
      const allCategories = !!(request.data && request.data.allCategories);
      const preferCategory =
        request.data && request.data.preferCategory
          ? String(request.data.preferCategory)
          : null;
      try {
        if (resetSeq) {
          await metaRef().set(
            {
              seq: 0,
              last: admin.firestore.FieldValue.delete(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          return { ok: true, seq: 0, resetSeq: true };
        }
        if (retryLast) return await retryLastReply();
        if (allCategories) {
          return await runAllCategoryPosts({ dryRun, textOnly });
        }
        return await runDailyPost({ dryRun, textOnly, preferCategory });
      } catch (err) {
        console.error("postXDailySeisanQuizNow", err);
        throw new HttpsError("internal", err.message || String(err));
      }
    }
  );
}

/** 管理者用: X投稿予定（1週間）の取得 */
function createGetXDailySeisanScheduleExport() {
  return onCall(
    {
      region: REGION,
      cors: true,
      serviceAccount: SERVICE_ACCOUNT,
      timeoutSeconds: 180,
      memory: "1GiB",
    },
    async (request) => {
      assertAdmin(request);
      const days = Math.min(14, Math.max(1, Number(request.data && request.data.days) || 7));
      const includeImages = !(request.data && request.data.includeImages === false);
      const includeSamples = !(request.data && request.data.includeSamples === false);
      try {
        return await buildSchedulePreview(days, { includeImages, includeSamples });
      } catch (err) {
        console.error("getXDailySeisanSchedule", err);
        throw new HttpsError("internal", err.message || String(err));
      }
    }
  );
}

/** 管理者用: 特定日の投稿問題を差し替え・固定解除 */
function createSetXDailySeisanScheduleOverrideExport() {
  return onCall(
    {
      region: REGION,
      cors: true,
      serviceAccount: SERVICE_ACCOUNT,
      timeoutSeconds: 120,
      memory: "512MiB",
    },
    async (request) => {
      assertAdmin(request);
      const data = request.data || {};
      const email = (request.auth.token && request.auth.token.email) || "";
      try {
        return await setScheduleOverride({
          dateKey: data.dateKey,
          questionId: data.questionId,
          action: data.action || "set",
          note: data.note || "",
          setBy: email,
        });
      } catch (err) {
        console.error("setXDailySeisanScheduleOverride", err);
        throw new HttpsError("internal", err.message || String(err));
      }
    }
  );
}

module.exports = {
  createXDailySeisanQuizScheduleExport,
  createPostXDailySeisanQuizNowExport,
  createGetXDailySeisanScheduleExport,
  createSetXDailySeisanScheduleOverrideExport,
  runDailyPost,
  runAllCategoryPosts,
  buildSchedulePreview,
  WEEKDAY_CATEGORIES,
};
