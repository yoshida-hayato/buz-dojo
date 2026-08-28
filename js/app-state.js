

/**
 * ビジネス道場 — 画面横断の共有状態・定数
 */
let CATEGORIES = {};
let MODULES = {};
let MODULE_FILTERABLE = new Set(["tcode", "term", "scenario", "judgment", "reorder", "cloze"]);
let INPUT_CATEGORIES = new Set();
let CURRENT_SUBJECT = null;

const PRIORITIES = {
  1: "★★★ 最優先",
  2: "★★ 重要",
  3: "★ 余裕があれば",
};

const RANK_CORRECT_CAP_MULT = 3;

/** SAP科目向け段位（フォールバック） */
const DEFAULT_SAP_RANKS = [
  { name: "10級", alias: "白帯・SAP見習い",             correctRatio: 0,         minAcc: 0,  color: "linear-gradient(135deg, #f8fafc, #d9e2ec)", fg: "#334155" },
  { name: "9級",  alias: "黄帯・ログオン修行中",         correctRatio: 0.00625,   minAcc: 0,  color: "linear-gradient(135deg, #fde047, #eab308)", fg: "#57430a" },
  { name: "8級",  alias: "橙帯・Tコード見習い",          correctRatio: 0.0125,    minAcc: 0,  color: "linear-gradient(135deg, #fb923c, #ea580c)", fg: "#ffffff" },
  { name: "7級",  alias: "緑帯・駆け出しエンドユーザ",   correctRatio: 0.020833,  minAcc: 0,  color: "linear-gradient(135deg, #4ade80, #16a34a)", fg: "#ffffff" },
  { name: "6級",  alias: "青帯・頼れる現場担当",         correctRatio: 0.03125,   minAcc: 0,  color: "linear-gradient(135deg, #38bdf8, #0284c7)", fg: "#ffffff" },
  { name: "5級",  alias: "紫帯・キーユーザ",             correctRatio: 0.04375,   minAcc: 0,  color: "linear-gradient(135deg, #a78bfa, #7c3aed)", fg: "#ffffff" },
  { name: "4級",  alias: "茶帯・モジュールの番人",       correctRatio: 0.058333,  minAcc: 0,  color: "linear-gradient(135deg, #b45309, #78350f)", fg: "#ffffff" },
  { name: "3級",  alias: "赤帯・サポートデスクの星",     correctRatio: 0.075,     minAcc: 0,  color: "linear-gradient(135deg, #f87171, #dc2626)", fg: "#ffffff" },
  { name: "2級",  alias: "紺帯・ジュニアコンサルタント", correctRatio: 0.095833,  minAcc: 0,  color: "linear-gradient(135deg, #475569, #1e3a8a)", fg: "#ffffff" },
  { name: "1級",  alias: "黒帯・コンサルタント",         correctRatio: 0.120833,  minAcc: 0,  color: "linear-gradient(135deg, #334155, #0f172a)", fg: "#ffffff" },
  { name: "初段", alias: "シニアコンサルタント",         correctRatio: 0.15,      minAcc: 0,  minMasteredPct: 10,  color: "linear-gradient(135deg, #d99058, #a05a2c)", fg: "#ffffff" },
  { name: "二段", alias: "ソリューションアーキテクト",   correctRatio: 0.1875,    minAcc: 0,  minMasteredPct: 15,  color: "linear-gradient(135deg, #c77b30, #8b4513)", fg: "#ffffff" },
  { name: "三段", alias: "プロジェクトリーダー",         correctRatio: 0.233333,  minAcc: 0,  minMasteredPct: 20,  color: "linear-gradient(135deg, #e2e8f0, #94a3b8)", fg: "#1f2937" },
  { name: "四段", alias: "SAPマイスター",                correctRatio: 0.291667,  minAcc: 0,  minMasteredPct: 25,  color: "linear-gradient(135deg, #cbd5e1, #64748b)", fg: "#ffffff" },
  { name: "五段", alias: "道場師範代",                   correctRatio: 0.3625,    minAcc: 0,  minMasteredPct: 30,  color: "linear-gradient(135deg, #fcd34d, #d97706)", fg: "#713f12" },
  { name: "六段", alias: "道場師範",                     correctRatio: 0.445833,  minAcc: 70, minMasteredPct: 40,  color: "linear-gradient(135deg, #fbbf24, #b45309)", fg: "#ffffff" },
  { name: "七段", alias: "SAP賢者",                      correctRatio: 0.541667,  minAcc: 75, minMasteredPct: 50,  minInputMasteredPct: 20,  minInputAcc: 60, color: "linear-gradient(135deg, #ccfbf1, #5eead4)", fg: "#134e4a" },
  { name: "八段", alias: "伝説のコンサルタント",         correctRatio: 0.666667,  minAcc: 80, minMasteredPct: 65,  minInputMasteredPct: 40,  minInputAcc: 65, color: "linear-gradient(135deg, #5eead4, #0d9488)", fg: "#ffffff" },
  { name: "九段", alias: "SAP仙人",                      correctRatio: 0.8125,    minAcc: 85, minMasteredPct: 80,  minInputMasteredPct: 65,  minInputAcc: 70, color: "linear-gradient(135deg, #a5f3fc, #22d3ee)", fg: "#164e63" },
  { name: "名人", alias: "SAPの神",                      correctRatio: 1,         minAcc: 90, minMasteredPct: 100, minInputMasteredPct: 100, minInputAcc: 75, color: "linear-gradient(135deg, #f59e0b, #ef4444, #a855f7, #3b82f6)", fg: "#ffffff" },
];

/** 汎用段位 */
const DEFAULT_RANKS = [
  { name: "10級", alias: "入門", correctRatio: 0, minAcc: 0, color: "linear-gradient(135deg, #f8fafc, #d9e2ec)", fg: "#334155" },
  { name: "9級", alias: "基礎の一歩", correctRatio: 0.00625, minAcc: 0, color: "linear-gradient(135deg, #fde047, #eab308)", fg: "#57430a" },
  { name: "8級", alias: "基礎固め", correctRatio: 0.0125, minAcc: 0, color: "linear-gradient(135deg, #fb923c, #ea580c)", fg: "#ffffff" },
  { name: "7級", alias: "慣れてきた", correctRatio: 0.020833, minAcc: 0, color: "linear-gradient(135deg, #4ade80, #16a34a)", fg: "#ffffff" },
  { name: "6級", alias: "実践見習い", correctRatio: 0.03125, minAcc: 0, color: "linear-gradient(135deg, #38bdf8, #0284c7)", fg: "#ffffff" },
  { name: "5級", alias: "実践者", correctRatio: 0.04375, minAcc: 0, color: "linear-gradient(135deg, #a78bfa, #7c3aed)", fg: "#ffffff" },
  { name: "4級", alias: "頼りになる", correctRatio: 0.058333, minAcc: 0, color: "linear-gradient(135deg, #b45309, #78350f)", fg: "#ffffff" },
  { name: "3級", alias: "腕利き", correctRatio: 0.075, minAcc: 0, color: "linear-gradient(135deg, #f87171, #dc2626)", fg: "#ffffff" },
  { name: "2級", alias: "上級手前", correctRatio: 0.095833, minAcc: 0, color: "linear-gradient(135deg, #475569, #1e3a8a)", fg: "#ffffff" },
  { name: "1級", alias: "上級", correctRatio: 0.120833, minAcc: 0, color: "linear-gradient(135deg, #334155, #0f172a)", fg: "#ffffff" },
  { name: "初段", alias: "一人前", correctRatio: 0.15, minAcc: 0, minMasteredPct: 10, color: "linear-gradient(135deg, #d99058, #a05a2c)", fg: "#ffffff" },
  { name: "二段", alias: "指導できる", correctRatio: 0.1875, minAcc: 0, minMasteredPct: 15, color: "linear-gradient(135deg, #c77b30, #8b4513)", fg: "#ffffff" },
  { name: "三段", alias: "リーダー", correctRatio: 0.233333, minAcc: 0, minMasteredPct: 20, color: "linear-gradient(135deg, #e2e8f0, #94a3b8)", fg: "#1f2937" },
  { name: "四段", alias: "エキスパート", correctRatio: 0.291667, minAcc: 0, minMasteredPct: 25, color: "linear-gradient(135deg, #cbd5e1, #64748b)", fg: "#ffffff" },
  { name: "五段", alias: "師範代", correctRatio: 0.3625, minAcc: 0, minMasteredPct: 30, color: "linear-gradient(135deg, #fcd34d, #d97706)", fg: "#713f12" },
  { name: "六段", alias: "師範", correctRatio: 0.445833, minAcc: 70, minMasteredPct: 40, color: "linear-gradient(135deg, #fbbf24, #b45309)", fg: "#ffffff" },
  { name: "七段", alias: "達人", correctRatio: 0.541667, minAcc: 75, minMasteredPct: 50, inputCorrectRatio: 0.05, minInputAcc: 60, color: "linear-gradient(135deg, #ccfbf1, #5eead4)", fg: "#134e4a" },
  { name: "八段", alias: "伝説", correctRatio: 0.666667, minAcc: 80, minMasteredPct: 65, inputCorrectRatio: 0.1, minInputAcc: 65, color: "linear-gradient(135deg, #5eead4, #0d9488)", fg: "#ffffff" },
  { name: "九段", alias: "仙人", correctRatio: 0.8125, minAcc: 85, minMasteredPct: 80, inputCorrectRatio: 0.166667, minInputAcc: 70, color: "linear-gradient(135deg, #a5f3fc, #22d3ee)", fg: "#164e63" },
  { name: "名人", alias: "道場破りの達人", correctRatio: 1, minAcc: 90, minMasteredPct: 100, inputCorrectRatio: 0.25, minInputAcc: 75, color: "linear-gradient(135deg, #f59e0b, #ef4444, #a855f7, #3b82f6)", fg: "#ffffff" },
];

let RANKS = DEFAULT_SAP_RANKS.slice();

const CHOICE_COUNT = 6;
const CHOICE_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

let quiz = null;
let quizEntryById = null;
const uncheckedModules = new Set();
