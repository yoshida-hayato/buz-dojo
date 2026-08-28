/**
 * X（Twitter）毎日 SAP クイズ投稿
 *
 * - 毎朝 7:45 JST に 1問（親=問題画像、返信=答え＋誘導）
 * - 問題マスタ: https://sap-dojo.web.app/data/questions.js
 * - 投稿済み ID: Firestore system/xDailySapQuiz
 *
 * Secrets:
 *   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
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
const SITE_URL = "https://buz-dojo.web.app/sap";
const QUESTIONS_URL = "https://sap-dojo.web.app/data/questions.js";
const META_PATH = "system/xDailySapQuiz";

const xApiKey = defineSecret("X_API_KEY");
const xApiSecret = defineSecret("X_API_SECRET");
const xAccessToken = defineSecret("X_ACCESS_TOKEN");
const xAccessSecret = defineSecret("X_ACCESS_SECRET");

const SECRETS = [xApiKey, xApiSecret, xAccessToken, xAccessSecret];

const POSTABLE = new Set(["tcode", "term", "scenario", "judgment"]);
const MODULE_LABEL = {
  FI: "FI（財務）",
  CO: "CO（管理会計）",
  MM: "MM（購買・在庫）",
  SD: "SD（販売）",
  PP: "PP（生産）",
  HR: "HR（人事）",
  BASIS: "BASIS",
  ABAP: "ABAP",
  共通: "共通",
  略称: "略称",
};

function metaRef() {
  return admin.firestore().collection("system").doc("xDailySapQuiz");
}

function assertAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "ログインが必要です");
  const email = (request.auth.token && request.auth.token.email) || "";
  if (email !== ADMIN_EMAIL) {
    throw new HttpsError("permission-denied", "管理者のみ実行できます");
  }
}

function weekdayCategory(date = new Date()) {
  // JST の曜日でローテ（0=日 … 6=土）
  const jst = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const map = {
    0: "tcode",
    1: "tcode",
    2: "term",
    3: "judgment",
    4: "scenario",
    5: "tcode",
    6: "term",
  };
  return map[jst.getDay()] || "tcode";
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

function isJudgmentMulti(q) {
  return q.category === "judgment" && Array.isArray(q.statements) && q.statements.length > 0;
}

function buildTcodePayload(q, pool) {
  const answer = String(q.code || "").trim();
  const sameMod = pool.filter(
    (x) => x.category === "tcode" && x.module === q.module && x.id !== q.id && x.code
  );
  const distractors = shuffle(sameMod)
    .map((x) => String(x.code).trim())
    .filter((c) => c && c !== answer);
  const choices = shuffle([answer, ...distractors.slice(0, 3)]);
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

function buildTermPayload(q, pool) {
  // 用語 → 意味（4択）
  const answer = String(q.name || "").trim();
  const sameMod = pool.filter(
    (x) => x.category === "term" && x.module === q.module && x.id !== q.id && x.name
  );
  const distractors = shuffle(sameMod)
    .map((x) => String(x.name).trim())
    .filter((n) => n && n !== answer);
  const choices = shuffle([answer, ...distractors.slice(0, 3)]);
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

function buildScenarioPayload(q) {
  const choices = Array.isArray(q.choices) ? q.choices.map(String) : [];
  if (choices.length < 2) return null;
  const answer = choices[0];
  return {
    id: q.id,
    category: q.category,
    module: q.module,
    question: String(q.name || q.code || "").trim(),
    choices: shuffle(choices).slice(0, 4),
    answer,
    explanation: String(q.explanation || "").replace(/\s+/g, " ").trim(),
  };
}

function buildJudgmentPayload(q) {
  if (isJudgmentMulti(q)) {
    const pickIncorrect = q.pick === "incorrect";
    const targets = q.statements.filter((s) => (pickIncorrect ? !s.correct : !!s.correct));
    const distractors = q.statements.filter((s) => (pickIncorrect ? !!s.correct : !s.correct));
    if (!targets.length || !distractors.length) return null;
    const answer = String(targets[0].text || "").trim();
    if (!answer) return null;
    const wrongs = shuffle(
      distractors
        .map((s) => String(s.text || "").trim())
        .filter((t) => t && t !== answer)
    );
    const choices = shuffle([answer, ...wrongs.slice(0, 3)]);
    if (choices.length < 2) return null;
    return {
      id: q.id,
      category: q.category,
      module: q.module,
      question: String(q.name || "").trim(),
      choices: choices.slice(0, 4),
      answer,
      explanation: String(q.explanation || "").replace(/\s+/g, " ").trim(),
    };
  }
  const choices = Array.isArray(q.choices) && q.choices.length >= 2 ? q.choices.map(String) : ["正", "誤"];
  const answer = choices[0];
  return {
    id: q.id,
    category: q.category,
    module: q.module,
    question: String(q.name || "").trim() + "\n\nこの記述は正しい？",
    choices: shuffle(choices.slice(0, 2)),
    answer,
    explanation: String(q.explanation || "").replace(/\s+/g, " ").trim(),
  };
}

function buildPayload(q, pool) {
  if (q.category === "tcode") return buildTcodePayload(q, pool);
  if (q.category === "term") return buildTermPayload(q, pool);
  if (q.category === "scenario") return buildScenarioPayload(q);
  if (q.category === "judgment") return buildJudgmentPayload(q);
  return null;
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

function renderQuestionImage(payload, seq) {
  const W = 1200;
  const H = 675;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // 背景
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#0b5fff");
  grad.addColorStop(0.55, "#0854a0");
  grad.addColorStop(1, "#0a3d73");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // カード
  const pad = 36;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 24, "#ffffff");

  ctx.fillStyle = "#0a6ed1";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("ビジネス道場 ｜ SAPクイズ", pad + 36, pad + 52);

  ctx.fillStyle = "#6b7a8c";
  ctx.font = "22px sans-serif";
  const mod = MODULE_LABEL[payload.module] || payload.module || "";
  ctx.fillText(`#${seq}  ${mod}`, pad + 36, pad + 90);

  ctx.fillStyle = "#22303f";
  ctx.font = "bold 36px sans-serif";
  const qLines = wrapText(ctx, payload.question, W - pad * 2 - 80).slice(0, 5);
  let y = pad + 150;
  for (const line of qLines) {
    ctx.fillText(line, pad + 36, y);
    y += 48;
  }

  y += 12;
  const labels = ["A", "B", "C", "D"];
  ctx.font = "28px sans-serif";
  (payload.choices || []).slice(0, 4).forEach((c, i) => {
    ctx.fillStyle = "#e8f2fc";
    roundRect(ctx, pad + 36, y - 32, W - pad * 2 - 72, 52, 12, "#e8f2fc");
    ctx.fillStyle = "#0854a0";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText(labels[i], pad + 52, y);
    ctx.fillStyle = "#22303f";
    ctx.font = "26px sans-serif";
    const clipped = wrapText(ctx, `${c}`, W - pad * 2 - 160)[0] || "";
    ctx.fillText(clipped, pad + 96, y);
    y += 66;
  });

  ctx.fillStyle = "#6b7a8c";
  ctx.font = "22px sans-serif";
  ctx.fillText("答えは返信へ ↓　非公式の学習用クイズです", pad + 36, H - pad - 28);

  return canvas.toBuffer("image/png");
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

const MODULE_HASHTAG = {
  FI: "#FI",
  CO: "#CO",
  MM: "#MM",
  SD: "#SD",
  PP: "#PP",
  HR: "#HR",
  BASIS: "#BASIS",
  ABAP: "#ABAP",
  共通: null,
  略称: null,
};

/** 親ポスト用ハッシュタグ（多すぎるとスパム判定・リーチ低下しやすいので最大4） */
function composeHashtags(payload) {
  const tags = ["#SAP", "#SAPクイズ"];
  const modTag = MODULE_HASHTAG[payload.module];
  if (modTag) tags.push(modTag);
  // 発見用の広めタグ（短く・実務寄り）
  tags.push("#ERP");
  // 重複除去しつつ最大4
  return [...new Set(tags)].slice(0, 4).join(" ");
}

function composeParentText(payload, seq, options = {}) {
  const mod = MODULE_LABEL[payload.module] || payload.module || "SAP";
  const lines = [`【SAPクイズ #${seq}】${mod}`, ""];
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
  const labels = ["A", "B", "C", "D"];
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

function formatXError(step, err) {
  const data = err && err.data ? err.data : null;
  const detail =
    (data && (data.detail || data.title)) ||
    (err && err.message) ||
    String(err);
  const code = err && err.code != null ? err.code : "";
  return `X API error at ${step}: [${code}] ${detail}`;
}

async function pickQuestion(pool, postedIds, preferCategory, opts = {}) {
  const posted = new Set(postedIds || []);
  const preferred = pool.filter((q) => q.category === preferCategory && !posted.has(q.id));
  const fallback = pool.filter((q) => !posted.has(q.id));
  const strict = !!opts.strict;
  const candidates = preferred.length ? preferred : strict ? [] : fallback;
  if (!candidates.length) return null;

  // priority 1 を優先しつつランダム。明示カテゴリ指定時は候補を広めに試す
  const p1 = candidates.filter((q) => Number(q.priority) === 1);
  const base = p1.length ? p1 : candidates;
  const tryN = strict ? Math.min(base.length, 200) : 40;
  for (const q of shuffle(base).slice(0, tryN)) {
    const payload = buildPayload(q, pool);
    if (payload && payload.question && payload.choices && payload.choices.length >= 2) {
      return payload;
    }
  }
  return null;
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
  const prefer =
    options.preferCategory && POSTABLE.has(String(options.preferCategory))
      ? String(options.preferCategory)
      : weekdayCategory();
  const strictPrefer = !!(options.preferCategory && POSTABLE.has(String(options.preferCategory)));
  const payload = await pickQuestion(pool, postedIds, prefer, { strict: strictPrefer });
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
  await metaRef().set(
    {
      seq,
      postedIds: nextPosted.slice(-4000),
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

function createXDailySapQuizScheduleExport() {
  return onSchedule(
    {
      schedule: "45 7 * * *",
      timeZone: "Asia/Tokyo",
      region: REGION,
      serviceAccount: SERVICE_ACCOUNT,
      timeoutSeconds: 300,
      memory: "1GiB",
      secrets: SECRETS,
    },
    async () => {
      const result = await runDailyPost({ dryRun: false });
      console.info("xDailySapQuiz", result);
      return result;
    }
  );
}

/** 曜日ローテと同じ4カテゴリ（重複曜日はまとめ） */
const WEEKDAY_CATEGORIES = ["tcode", "term", "judgment", "scenario"];

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
function createPostXDailySapQuizNowExport() {
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
        console.error("postXDailySapQuizNow", err);
        throw new HttpsError("internal", err.message || String(err));
      }
    }
  );
}

module.exports = {
  createXDailySapQuizScheduleExport,
  createPostXDailySapQuizNowExport,
  runDailyPost,
  runAllCategoryPosts,
  WEEKDAY_CATEGORIES,
};
