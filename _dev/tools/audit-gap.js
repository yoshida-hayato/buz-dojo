#!/usr/bin/env node
/**
 * 学習バックログ photoChecklist の Gap / 密度監査（SAP道場）
 *
 * 目的: チェックリストを先に束ねて gap0 に見せかける事故を防ぐ。
 * デプロイ前に必ず実行し、NG なら exit 1。
 *
 * 検査対象: status が done|ready で photoChecklist があるエントリ
 * （sourceItemCount があるもの、または id が lb-071 以上）
 *
 * 検査内容:
 *   1. status "gap" が残っていない
 *   2. covered / existing に ids が1つ以上ある
 *   3. skipped に reason がある
 *   4. sourceItemCount があるとき: photoChecklist.length >= sourceItemCount
 *      （ユーザーCLを先に束ねて減らしていないか）
 *   5. 画像枚数あたりの doneIds が 2 未満でない（下限）。目安は約5問/枚
 *   6. covered の寄せ過ぎ: 専用ID（そのCL内で出現≤2回）を持たない項目が
 *      covered の 80% 超（代表問題への統合は許容。極端な1問寄せだけ弾く）
 *
 * 使い方: node tools/audit-gap.js
 *   特定エントリだけ: node tools/audit-gap.js --id lb-073
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BACKLOG = path.join(__dirname, "..", "data", "learning-backlog.js");
/** 枚あたり doneIds の下限（目安は約5問/枚。既存エントリも落とさない） */
const MIN_PER_IMAGE = 2;
/** これ超は警告のみ（必須ではない）。目安5なので余裕を見て 8 */
const SOFT_MAX_PER_IMAGE = 8;
const MAX_THIN_RATIO = 0.8;
const DEDICATED_MAX_USES = 2;

function loadBacklog() {
  const src = fs.readFileSync(BACKLOG, "utf8");
  return (
    vm.runInNewContext(src + "\n; LEARNING_BACKLOG;", {}) || []
  );
}

function lbNum(id) {
  const m = String(id).match(/^lb-(\d+)$/i);
  return m ? Number(m[1]) : 0;
}

function shouldAudit(entry) {
  if (!entry || !Array.isArray(entry.photoChecklist) || !entry.photoChecklist.length) {
    return false;
  }
  const st = entry.status;
  if (st !== "done" && st !== "ready") return false;
  if (entry.sourceItemCount != null) return true;
  if (entry.gapAudit === true) return true;
  return lbNum(entry.id) >= 71;
}

function auditEntry(entry) {
  const errors = [];
  const warnings = [];
  const cl = entry.photoChecklist || [];
  const doneIds = entry.doneIds || [];

  // 1-3 per item
  let gapCount = 0;
  const idUses = Object.create(null);
  for (const row of cl) {
    const st = row.status;
    if (st === "gap") {
      gapCount++;
      errors.push(`[${row.source}] ${row.item}: status=gap`);
    }
    if ((st === "covered" || st === "existing") && (!row.ids || !row.ids.length)) {
      errors.push(`[${row.source}] ${row.item}: ${st} なのに ids が空`);
    }
    if (st === "skipped" && !row.reason) {
      errors.push(`[${row.source}] ${row.item}: skipped なのに reason なし`);
    }
    for (const id of row.ids || []) {
      idUses[id] = (idUses[id] || 0) + 1;
    }
  }
  if (gapCount) {
    errors.push(`${entry.id}: gap が ${gapCount} 件（デプロイ禁止）`);
  }

  // 4 sourceItemCount
  if (entry.sourceItemCount != null) {
    const need = Number(entry.sourceItemCount);
    if (cl.length < need) {
      errors.push(
        `${entry.id}: photoChecklist ${cl.length} < sourceItemCount ${need}（ユーザーCLの束ねすぎ）`
      );
    }
  } else if (lbNum(entry.id) >= 71) {
    errors.push(
      `${entry.id}: sourceItemCount 未設定。構造化文字起こしのチェックリスト行数を必ず入れる`
    );
  }

  // 5 density per image
  const images = new Set(cl.map((r) => r.source).filter(Boolean));
  const imgCount = images.size || 1;
  const doneCount = doneIds.length;
  const perImg = doneCount / imgCount;
  if (doneCount > 0 && perImg < MIN_PER_IMAGE) {
    errors.push(
      `${entry.id}: 枚あたり doneIds ${perImg.toFixed(1)} < ${MIN_PER_IMAGE}（done=${doneCount}, imgs=${imgCount}）`
    );
  }
  if (doneCount > 0 && perImg > SOFT_MAX_PER_IMAGE && lbNum(entry.id) >= 111) {
    warnings.push(
      `${entry.id}: 枚あたり doneIds ${perImg.toFixed(1)} > ${SOFT_MAX_PER_IMAGE}（目安は約5問/枚。細分化しすぎていないか確認）`
    );
  }

  // 6 thin covered (no dedicated id) — 代表問題への統合は許容。ほぼ全項目が同一IDだけは弾く
  const covered = cl.filter((r) => r.status === "covered");
  const thin = covered.filter((r) => {
    const ids = r.ids || [];
    return !ids.some((id) => (idUses[id] || 0) <= DEDICATED_MAX_USES);
  });
  if (covered.length >= 8) {
    const ratio = thin.length / covered.length;
    if (ratio > MAX_THIN_RATIO) {
      errors.push(
        `${entry.id}: covered の寄せ過ぎ ${(ratio * 100).toFixed(0)}%（${thin.length}/${covered.length}）。核心は別問題に分け、細部は skipped へ`
      );
      for (const t of thin.slice(0, 8)) {
        errors.push(`  - [${t.source}] ${t.item} → ${(t.ids || []).join(",")}`);
      }
    }
  }

  return { errors, warnings, stats: { cl: cl.length, doneCount, imgCount, perImg, thin: thin.length, covered: covered.length } };
}

function main() {
  const args = process.argv.slice(2);
  const onlyIdx = args.indexOf("--id");
  const onlyId = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  const list = loadBacklog();
  let errors = [];
  let warnings = [];
  let audited = 0;

  for (const entry of list) {
    if (onlyId && entry.id !== onlyId) continue;
    if (!shouldAudit(entry)) continue;
    audited++;
    const r = auditEntry(entry);
    errors = errors.concat(r.errors);
    warnings = warnings.concat(r.warnings);
    const s = r.stats;
    console.log(
      `${entry.id}: CL=${s.cl} doneIds=${s.doneCount} imgs=${s.imgCount} /img=${s.perImg.toFixed(1)} thin=${s.thin}/${s.covered}` +
        (entry.sourceItemCount != null ? ` sourceItemCount=${entry.sourceItemCount}` : "")
    );
  }

  if (warnings.length) {
    console.log("\n【警告】");
    for (const w of warnings) console.log("  " + w);
  }

  if (!audited) {
    console.log("監査対象エントリなし");
    process.exit(0);
  }

  if (errors.length) {
    console.log("\n【NG】");
    for (const e of errors) console.log("  " + e);
    console.log(`\nNG: ${errors.length}件。gap/密度を直してからデプロイしてください。`);
    process.exit(1);
  }

  console.log("\nOK: gap/密度ヒットなし。デプロイ可。");
  process.exit(0);
}

main();
