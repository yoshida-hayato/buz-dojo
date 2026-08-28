/** 問題オブジェクト生成・解説 HTML */

// ===== 問題の生成 =====
/** 2文字の部分文字列（バイグラム）の重なり具合で文字列の類似度を測る（0〜1） */
function bigramOverlap(x, y) {
  const grams = (t) => {
    const g = new Set();
    for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
    return g;
  };
  const gx = grams(x);
  const gy = grams(y);
  if (gx.size === 0 || gy.size === 0) return 0;
  let hit = 0;
  gx.forEach((g) => { if (gy.has(g)) hit++; });
  return hit / Math.min(gx.size, gy.size);
}

/**
 * 2つの問題エントリの「紛らわしさ」スコア。
 * コードの前方一致（VA01↔VA02など）、名称の類似（登録↔変更↔照会の兄弟など）、
 * 同一モジュールを合算する。ハード難易度の誤答選びに使う。
 */
function similarityScore(a, b) {
  let s = 0;
  if (a.module === b.module) s += 2;
  const ca = a.code.toUpperCase();
  const cb = b.code.toUpperCase();
  let p = 0;
  while (p < ca.length && p < cb.length && ca[p] === cb[p]) p++;
  s += Math.min(p, 4) * 1.2;                     // コードの共通接頭辞
  if (Math.abs(ca.length - cb.length) <= 1) s += 0.5; // コード長が近い
  s += bigramOverlap(ca, cb) * 2;                 // コード全体の類似
  s += bigramOverlap(a.name, b.name) * 4;         // 機能・説明文の類似
  return s;
}

/** 記述式の入力を正規化する（全角→半角、空白除去、大文字化） */
function normalizeCode(s) {
  return String(s ?? "")
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** Tコード問題の誤答解説用インデックス（クイズ問題 + Tコード一覧） */
let tcodeIndex = null;

function ensureTcodeIndex() {
  if (tcodeIndex) return;
  tcodeIndex = { byCode: new Map(), byName: new Map(), refByCode: new Map() };
  for (const e of QUIZ_DATA) {
    if (!e || e.category !== "tcode" || !e.code) continue;
    try {
      tcodeIndex.byCode.set(normalizeCode(e.code), e);
      if (e.codeAliases) {
        for (const a of e.codeAliases) {
          if (a == null || a === "") continue;
          tcodeIndex.byCode.set(normalizeCode(a), e);
        }
      }
      if (e.name && !tcodeIndex.byName.has(e.name)) tcodeIndex.byName.set(e.name, e);
    } catch (err) {
      console.error("Tコード索引の作成をスキップ:", e.id, err);
    }
  }
  if (typeof TCODE_REF !== "undefined") {
    for (const r of TCODE_REF) {
      if (!r || !r.code) continue;
      try {
        tcodeIndex.refByCode.set(normalizeCode(r.code), r);
      } catch (err) {
        console.error("Tコード一覧の索引をスキップ:", r.code, err);
      }
    }
  }
}

function firstSentence(text) {
  if (!text) return "";
  const i = text.indexOf("。");
  return i >= 0 ? text.slice(0, i + 1) : text;
}

/**
 * Tコード問題で不正解のとき、選んだ／入力した誤答の意味を追記する。
 * 記述式は TCODE_REF（一覧データ）も参照する。
 */
function tcodeWrongChoiceNote(q, givenText) {
  if (!givenText || q.entry.category !== "tcode") return "";
  ensureTcodeIndex();

  if (q.direction === "code2name") {
    const wrongEntry = tcodeIndex.byName.get(givenText);
    if (!wrongEntry || wrongEntry.id === q.entry.id) return "";
    return (
      `\n\n【あなたの回答について】${wrongEntry.name}（${wrongEntry.code}）\n` +
      firstSentence(wrongEntry.explanation)
    );
  }

  // 機能→コード（選択式・記述式）: 入力／選択したTコードを引く
  const typed = normalizeCode(givenText);
  if (!typed) return "";
  if (typed === normalizeCode(q.entry.code)) return "";
  if (q.entry.codeAliases && q.entry.codeAliases.some((a) => normalizeCode(a) === typed)) {
    return "";
  }

  const wrongEntry = tcodeIndex.byCode.get(typed);
  if (wrongEntry && wrongEntry.id !== q.entry.id) {
    return (
      `\n\n【あなたの回答について】${wrongEntry.code}（${wrongEntry.name}）\n` +
      firstSentence(wrongEntry.explanation)
    );
  }

  const ref = tcodeIndex.refByCode.get(typed);
  if (ref && normalizeCode(ref.code) !== normalizeCode(q.entry.code)) {
    return (
      `\n\n【あなたの回答について】${ref.code}（${ref.name}）\n` +
      firstSentence(ref.description)
    );
  }

  return "";
}

/** 正誤（複数選択）: ポイント文章＋各項目の正誤／訂正 */
function buildJudgmentMultiExplanation(q) {
  const pickIncorrect = q.entry.pick === "incorrect";
  const items = q.statementItems.map((s, i) => {
    const shouldPick = q.targetIndices.includes(i);
    let verdict;
    if (s.correct) {
      verdict = shouldPick ? "正しい（選ぶ）" : "正しい（選ばない）";
    } else {
      verdict = shouldPick ? "誤り（選ぶ）" : "誤り（選ばない）";
    }
    const note = !s.correct && s.note ? s.note : "";
    return { key: choiceKey(i), text: s.text, verdict, note, shouldPick, correct: s.correct };
  });

  // プレーンテキスト版（結果画面の誤答一覧など）
  const lines = [
    "【この問題のポイント】",
    q.entry.explanation,
    "",
    "【各項目】",
    ...items.flatMap((it) => {
      const row = [`${it.key}. ${it.text}`, `→ ${it.verdict}`];
      if (it.note) row.push(`　訂正: ${it.note}`);
      return [row.join("\n"), ""];
    }),
  ];
  if (pickIncorrect) {
    lines.push("※ この問題は「誤っている記述」を選ぶ形式です。");
  }
  return lines.join("\n").trim();
}

/** 複数選択の解説HTML（フィードバックカード用） */
function buildJudgmentMultiExplanationHtml(q) {
  const pickIncorrect = q.entry.pick === "incorrect";
  const itemsHtml = q.statementItems
    .map((s, i) => {
      const shouldPick = q.targetIndices.includes(i);
      let verdict;
      let cls = "jmulti-item";
      if (s.correct) {
        verdict = shouldPick ? "正しい（選ぶ）" : "正しい（選ばない）";
        cls += shouldPick ? " is-pick" : " is-skip";
      } else {
        verdict = shouldPick ? "誤り（選ぶ）" : "誤り（選ばない）";
        cls += shouldPick ? " is-pick is-wrong-stmt" : " is-skip is-wrong-stmt";
      }
      const note = !s.correct && s.note
        ? `<div class="jmulti-note">${escapeHtml(s.note)}</div>`
        : "";
      return (
        `<div class="${cls}">` +
          `<div class="jmulti-head"><span class="jmulti-key">${choiceKey(i)}</span>` +
          `<span class="jmulti-verdict">${escapeHtml(verdict)}</span></div>` +
          `<div class="jmulti-text">${escapeHtml(s.text)}</div>` +
          note +
        `</div>`
      );
    })
    .join("");

  return (
    `<div class="jmulti-exp">` +
      `<div class="jmulti-point">` +
        `<div class="jmulti-label">この問題のポイント</div>` +
        `<p>${formatRichText(q.entry.explanation)}</p>` +
      `</div>` +
      `<div class="jmulti-items">` +
        `<div class="jmulti-label">各項目</div>` +
        itemsHtml +
      `</div>` +
      (pickIncorrect
        ? `<p class="jmulti-hint">※ この問題は「誤っている記述」を選ぶ形式です。</p>`
        : "") +
    `</div>`
  );
}

/** 正誤フィードバック用の解説文（Tコード／関連用語の誤答解説を含む） */
function buildFeedbackExplanation(q, isCorrect, givenText) {
  if (q.isJudgmentMulti) return buildJudgmentMultiExplanation(q);
  let text = q.entry.explanation || "";
  if (!isCorrect) {
    try {
      text += tcodeWrongChoiceNote(q, givenText);
    } catch (err) {
      console.error("Tコード誤答解説の生成に失敗:", err);
    }
    try {
      text += quizEntryWrongChoiceNote(q, givenText);
    } catch (err) {
      console.error("関連用語の誤答解説の生成に失敗:", err);
    }
  }
  return text;
}

/**
 * 用語・シナリオ等で、選んだ誤答が別問題の code（用語名）と一致するとき意味を追記する。
 * 例: MIGO画面の問いで「MIROの画面構成」を選んだ → mm-65 の解説を添える。
 */
function quizEntryWrongChoiceNote(q, givenText) {
  if (!givenText || q.entry.category === "tcode") return "";
  if (typeof QUIZ_DATA === "undefined") return "";
  let hit = QUIZ_DATA.find((e) => e && e.id !== q.entry.id && e.code === givenText);
  if (!hit && (q.direction === "code2name" || q.direction === "judgment")) {
    hit = QUIZ_DATA.find((e) => e && e.id !== q.entry.id && e.name === givenText);
  }
  if (!hit) return "";
  const label = hit.code === givenText ? hit.code : `${hit.code}`;
  return `\n\n【あなたの回答について】${label}\n${firstSentence(hit.explanation)}`;
}

/** Tコードを「先頭の英字部分」と「数字部分」に分解する（例: VA01 → {prefix:"VA", digits:"01"}、SE16N → {prefix:"SE", digits:"16"}） */
function splitCode(code) {
  const up = code.toUpperCase();
  const prefixMatch = up.match(/^[^0-9]+/);
  const digitMatches = up.match(/\d+/g);
  return {
    prefix: prefixMatch ? prefixMatch[0] : "",
    digits: digitMatches ? digitMatches.join("") : "",
  };
}

/**
 * Tコードが答えになる問題（機能→コード）の誤答選び。
 * 「接頭の英字が同じで数字が違う」ものだけを並べると数字の比較だけで解けてしまうため、
 * ①接頭が同じ組（VA01↔VA02）と ②数字が同じで接頭が違う組（VA01↔MM01↔SU01）を
 * 2〜3個ずつ混ぜて、英字と数字の両方を理解していないと絞れないようにする。
 * 足りない分は類似度順の一般候補で埋める。
 */
function pickCodeDistractors(entry, candidates, need) {
  const me = splitCode(entry.code);
  const used = new Set([entry.code.toUpperCase()]);
  const picked = [];

  const take = (list, max) => {
    let n = 0;
    for (const c of list) {
      if (picked.length >= need || n >= max) break;
      const key = c.code.toUpperCase();
      if (used.has(key)) continue;
      used.add(key);
      picked.push(c.code);
      n++;
    }
  };

  const samePrefix = candidates.filter((c) => {
    const s = splitCode(c.code);
    return me.prefix !== "" && s.prefix === me.prefix && c.code.toUpperCase() !== entry.code.toUpperCase();
  });
  const sameDigits = candidates.filter((c) => {
    const s = splitCode(c.code);
    return me.digits !== "" && s.digits === me.digits && s.prefix !== me.prefix;
  });

  // 接頭一致・数字一致を2個ずつ → 残り1枠はどちらかから → それでも足りなければ一般候補で補充
  take(samePrefix, 2);
  take(sameDigits, 2);
  if (Math.random() < 0.5) { take(sameDigits, 1); take(samePrefix, 1); }
  else { take(samePrefix, 1); take(sameDigits, 1); }
  take(candidates, need);

  return picked;
}

/**
 * ショートカットコードを「+ / ＋」で分解する（例: Ctrl+Shift+F11 → ["Ctrl","Shift","F11"]）
 */
function splitShortcutTokens(code) {
  return String(code || "")
    .split(/[+＋]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 全ショートカット問題からトークン候補を集める（誤答用） */
function shortcutTokenPool() {
  const tokens = new Set();
  for (const q of QUIZ_DATA) {
    if (q.category !== "shortcut") continue;
    for (const t of splitShortcutTokens(q.code)) tokens.add(t);
  }
  // よくある修飾キー・ファンクション（問題に無くても誤答候補に入れる）
  ["Ctrl", "Shift", "Alt", "Enter", "Tab", "Esc", "Delete", "Backspace"].forEach((t) =>
    tokens.add(t)
  );
  for (let i = 1; i <= 12; i++) tokens.add(`F${i}`);
  return [...tokens];
}

/**
 * ショートカット1問分の parts（略語問題と同じ形式）を自動生成する。
 * 各トークンについて、他ショートカットのトークンから誤答5個を取る。
 */
function buildShortcutPartDefs(entry) {
  const answers = splitShortcutTokens(entry.code);
  if (!answers.length) return null;
  const pool = shortcutTokenPool();
  return answers.map((answer) => {
    const wrongs = shuffle(pool.filter((t) => t !== answer)).slice(0, 5);
    while (wrongs.length < 5) {
      const pad = `?${wrongs.length}`;
      if (!wrongs.includes(pad) && pad !== answer) wrongs.push(pad);
      else break;
    }
    return { answer, wrongs };
  });
}

/**
 * 1問分の出題オブジェクトを作る。
 * direction: "code2name"（コード→機能） | "name2code"（機能→コード）
 * 用語問題は常に「説明→用語」（name2code相当）で出題する。
 * 誤答は類似度スコアの高い（紛らわしい）順に選ぶ。
 *
 * 記述式（answerMode=input / both で入力側）はTコード問題のみ対象。
 * 用語・ショートカットは表記ゆれで正誤判定が不安定になるため、選択式のまま出題する。
 * ショートカットの「機能→キー」は略語と同様、トークンを1つずつ選ばせる。
 */
function buildQuestion(entry, settings, forceInputMode) {
  // parts 形式: 略称は正式名称を1語ずつ、ショートカットはキーを1つずつ選ぶ
  if (entry.parts) {
    const isShortcutParts = entry.category === "shortcut";
    const parts = entry.parts.map((p) => {
      if (p.fixedChoices) {
        const choices = p.fixedChoices.slice();
        return { choices, answerIndex: choices.indexOf(p.answer) };
      }
      const choices = shuffle([p.answer, ...p.wrongs]);
      return { choices, answerIndex: choices.indexOf(p.answer) };
    });
    return {
      entry,
      direction: isShortcutParts ? "name2code" : "abbr",
      inputMode: false,
      isAbbr: true,
      isShortcutParts,
      partDefs: entry.parts,
      parts,
      selections: [],
      choices: [],
      answerIndex: -1,
    };
  }

  // 手順並べ替え: steps の正しい順を、タップで組み立てる
  if (entry.category === "reorder" && Array.isArray(entry.steps) && entry.steps.length >= 2) {
    const indices = entry.steps.map((_, i) => i);
    return {
      entry,
      direction: "reorder",
      isReorder: true,
      inputMode: false,
      stepLabels: entry.steps.slice(),
      poolOrder: shuffle(indices),
      sequence: [],
      choices: [],
      answerIndex: -1,
    };
  }

  // 穴埋め（タップ）: prompt 内の [[0]] [[1]] … を順に6択で埋める
  if (entry.category === "cloze" && Array.isArray(entry.blanks) && entry.blanks.length >= 1) {
    const blanks = entry.blanks.map((b) => {
      const wrongs = Array.isArray(b.wrongs) ? b.wrongs.slice(0, 5) : [];
      const choices = shuffle([b.answer, ...wrongs]);
      return { choices, answerIndex: choices.indexOf(b.answer), answer: b.answer };
    });
    return {
      entry,
      direction: "cloze",
      isCloze: true,
      inputMode: false,
      blanks,
      blankIdx: 0,
      selections: [],
      choices: [],
      answerIndex: -1,
    };
  }

  // 正誤問題（複数選択）: 記述文を複数提示し、正しい／誤っているものをすべて選ばせる
  if (entry.statements && entry.category === "judgment") {
    const statements = shuffle(
      entry.statements.map((s) => ({ text: s.text, correct: s.correct, note: s.note }))
    );
    const targetIndices = statements.reduce((acc, s, i) => {
      const hit = entry.pick === "correct" ? s.correct : !s.correct;
      if (hit) acc.push(i);
      return acc;
    }, []);
    return {
      entry,
      direction: "judgmentMulti",
      isJudgmentMulti: true,
      inputMode: false,
      statementItems: statements,
      statements: statements.map((s) => s.text),
      targetIndices,
      selectedIndices: [],
      choices: [],
      answerIndex: -1,
    };
  }

  // シナリオ・正誤問題（単一）: 正誤は A=正・B=誤 固定、シナリオは従来どおりシャッフル
  if (entry.choices) {
    const isJudgment = entry.category === "judgment";
    const choices = isJudgment ? ["正", "誤"] : shuffle(entry.choices);
    const answerIndex = isJudgment
      ? judgmentSingleAnswerIndex(entry)
      : choices.indexOf(entry.choices[0]);
    const direction = isJudgment ? "judgment" : "scenario";
    return {
      entry,
      direction,
      inputMode: false,
      choices,
      answerIndex,
    };
  }

  const inputMode = resolveInputMode(entry, settings, forceInputMode);

  let direction = settings.direction;
  if (direction === "mixed") direction = Math.random() < 0.5 ? "code2name" : "name2code";
  if (entry.category === "term") direction = "name2code";
  if (inputMode) direction = "name2code"; // 記述式は常に「機能→コードを入力」

  // ショートカット「機能→キー」: Ctrl / Shift / F11 のように1トークンずつ選ぶ
  if (entry.category === "shortcut" && direction === "name2code" && !inputMode) {
    const partDefs = buildShortcutPartDefs(entry);
    if (partDefs && partDefs.length) {
      const parts = partDefs.map((p) => {
        const choices = shuffle([p.answer, ...p.wrongs]);
        return { choices, answerIndex: choices.indexOf(p.answer) };
      });
      return {
        entry,
        direction: "name2code",
        inputMode: false,
        isAbbr: true,
        isShortcutParts: true,
        partDefs,
        parts,
        selections: [],
        choices: [],
        answerIndex: -1,
      };
    }
  }

  if (inputMode) {
    return { entry, direction, inputMode: true, choices: [], answerIndex: -1 };
  }

  /** 同一操作の別表記など、誤答候補に出すと「どちらも正解」に見えるペアを除外する */
  const distractorExcluded = (candidate) => {
    const ids = entry.distractorExcludeIds;
    return Array.isArray(ids) && ids.includes(candidate.id);
  };

  // 紛らわしい順に並べる（毎回同じ組み合わせにならないよう少しだけ乱数を混ぜる）
  const candidates = QUIZ_DATA
    .filter((q) => q.category === entry.category && q.id !== entry.id && !distractorExcluded(q))
    .map((c) => ({ c, s: similarityScore(entry, c) + Math.random() * 1.5 }))
    .sort((x, y) => y.s - x.s)
    .map((x) => x.c);

  const field = direction === "code2name" ? "name" : "code";
  let distractors;
  if (field === "code" && entry.category === "tcode") {
    // Tコードが答えの場合は「接頭が同じ組」と「数字が同じ組」を混ぜる
    distractors = pickCodeDistractors(entry, candidates, CHOICE_COUNT - 1);
  } else {
    const used = new Set([entry[field]]);
    distractors = [];
    // 紛らわしい対比語を必ず候補に入れる（例: 見積↔引合）
    const forceIds = Array.isArray(entry.distractorForceIds) ? entry.distractorForceIds : [];
    for (const fid of forceIds) {
      if (distractors.length >= CHOICE_COUNT - 1) break;
      const fc = QUIZ_DATA.find((q) => q && q.id === fid && q.category === entry.category);
      if (!fc || used.has(fc[field])) continue;
      used.add(fc[field]);
      distractors.push(fc[field]);
    }
    for (const c of candidates) {
      if (distractors.length >= CHOICE_COUNT - 1) break;
      if (used.has(c[field])) continue;
      used.add(c[field]);
      distractors.push(c[field]);
    }
  }

  const choices = shuffle([entry[field], ...distractors]);
  return {
    entry,
    direction,
    inputMode: false,
    choices,
    answerIndex: choices.indexOf(entry[field]),
  };
}

function questionText(q) {
  const e = q.entry;
  if (q.isReorder) {
    const title = e.name || e.code || "手順";
    return `${formatRichText(title)}<br><span class="judgment-multi-hint">下の候補を正しい順番にタップしてください</span>`;
  }
  if (q.isCloze) {
    const title = e.name ? `<span class="q-code">${escapeHtml(e.name)}</span><br>` : "";
    return `${title}<span class="judgment-multi-hint">空欄を順にタップで埋めてください</span>`;
  }
  if (q.isShortcutParts) {
    return `「${escapeHtml(e.name)}」のコマンド／キー操作を、キーやコマンドを1つずつ順番に選んでください`;
  }
  if (q.isAbbr || e.parts) {
    const scope = e.abbrScope ? `${escapeHtml(e.abbrScope)}の` : "";
    return `${scope}略称 <span class="q-code">${escapeHtml(e.code)}</span> の正式名称を、1単語ずつ順番に選んでください`;
  }
  if (e.statements && e.category === "judgment") {
    const pickLabel = e.pick === "correct"
      ? "該当するもの、もしくは正しいものを選んでください"
      : "誤っているものだけを選んでください";
    const caution = e.pick === "correct"
      ? "（該当しないものは選ばない）"
      : "（正しいものは選ばない）";
    const topic = e.name || e.code;
    return `<span class="q-code">${escapeHtml(topic)}</span><br>${pickLabel}<span class="judgment-multi-hint">${caution}</span>`;
  }
  if (e.choices) {
    if (e.category === "judgment") {
      return `次の記述は正しいか？<br><span class="judgment-statement">${escapeHtml(e.name)}</span>`;
    }
    return formatRichText(e.name);
  }
  if (q.direction === "code2name") {
    if (e.category === "shortcut") {
      return `コマンド／キー操作 <span class="q-code">${escapeHtml(e.code)}</span> の機能はどれ？`;
    }
    return `トランザクションコード <span class="q-code">${escapeHtml(e.code)}</span> の機能はどれ？`;
  }
  if (e.category === "shortcut") {
    return `「${escapeHtml(e.name)}」のコマンド／キー操作はどれ？`;
  }
  if (e.category === "term") {
    return `次の説明に当てはまるSAP用語はどれ？<br>「${escapeHtml(e.name)}」`;
  }
  if (q.inputMode) {
    return `「${escapeHtml(e.name)}」を行うトランザクションコードを入力してください`;
  }
  return `「${escapeHtml(e.name)}」を行うトランザクションコードはどれ？`;
}

/** 結果画面・復習リスト用の問題文（HTMLタグなし） */
function wrongItemQuestionLabel(q) {
  const e = q.entry;
  if (q.isReorder) return e.name || e.code || "手順の並べ替え";
  if (q.isCloze) return e.name || e.code || "穴埋め";
  if (q.isShortcutParts) return `「${e.name}」のコマンド／キー操作`;
  if (q.isAbbr || e.parts) {
    const scope = e.abbrScope ? `${e.abbrScope}の` : "";
    return `${scope}略称「${e.code}」の正式名称`;
  }
  if (e.statements && e.category === "judgment") {
    const pickLabel = e.pick === "correct"
      ? "該当するもの、もしくは正しいものを選ぶ"
      : "誤っているものだけを選ぶ";
    const topic = e.name || e.code;
    return `「${topic}」：${pickLabel}`;
  }
  if (e.choices) return e.category === "judgment" ? `正誤: ${e.name}` : e.name;
  if (q.direction === "code2name") {
    if (e.category === "shortcut") return `コマンド／キー操作「${e.code}」の機能`;
    return `トランザクションコード「${e.code}」の機能`;
  }
  if (e.category === "shortcut") return `「${e.name}」のコマンド／キー操作`;
  if (e.category === "term") return e.name;
  if (q.inputMode) return `「${e.name}」のTコード（記述式）`;
  return `「${e.name}」のTコード`;
}

/** 正誤（複数選択）の回答ラベル */
function judgmentMultiAnswerLabel(q, indices) {
  return indices
    .slice()
    .sort((a, b) => a - b)
    .map((i) => `${choiceKey(i)}. ${q.statements[i]}`)
    .join(" / ");
}

/** 間違えた問題1件分のHTML */
function buildWrongItemHtml(q, given, index) {
  const e = q.entry;
  let correctText;
  if (q.isReorder) correctText = q.stepLabels.join(" → ");
  else if (q.isCloze) correctText = q.blanks.map((b) => b.answer).join(" / ");
  else if (q.isAbbr) correctText = q.isShortcutParts ? q.entry.code : e.name;
  else if (q.inputMode) correctText = e.code;
  else if (q.isJudgmentMulti) correctText = judgmentMultiAnswerLabel(q, q.targetIndices);
  else correctText = q.choices[q.answerIndex];
  const explanation = buildFeedbackExplanation(q, false, given);
  const codeLine = e.category === "tcode" && !q.isAbbr
    ? `<span class="wi-code">${escapeHtml(e.code)}</span>`
    : e.category !== "scenario" && e.category !== "reorder" && e.category !== "cloze" && e.code
      ? `<span class="wi-code">${escapeHtml(e.code)}</span>`
      : "";

  return (
    `<article class="wrong-item">` +
      `<div class="wi-header">` +
        `<span class="wi-num">${index}</span>` +
        `<span class="badge">${escapeHtml(CATEGORIES[e.category] || e.category)}</span>` +
        codeLine +
      `</div>` +
      `<div class="wi-question">${escapeHtml(wrongItemQuestionLabel(q))}</div>` +
      `<div class="wi-answers">` +
        `<div class="wi-answer wi-answer-wrong">` +
          `<div class="wi-answer-label">あなたの回答</div>` +
          `<div class="wi-answer-value">${escapeHtml(given)}</div>` +
        `</div>` +
        `<div class="wi-answer wi-answer-correct">` +
          `<div class="wi-answer-label">正解</div>` +
          `<div class="wi-answer-value">${escapeHtml(correctText)}</div>` +
        `</div>` +
      `</div>` +
      `<details class="wi-details">` +
        `<summary>解説を見る</summary>` +
        `<div class="wi-exp">${formatRichText(explanation)}</div>` +
      `</details>` +
    `</article>`
  );
}
