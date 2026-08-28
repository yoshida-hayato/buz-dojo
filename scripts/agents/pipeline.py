#!/usr/bin/env python3
"""
マルチエージェント型クイズ自動生成パイプライン。

Round 1: Idea Agent — 原案作成
Round 2: Logic + UX Review — 並列レビュー
Round 3: Idea Agent — 最終版
Round 4: JSON Agent — スキーマ準拠 JSON（リトライ付き）
Round 5: Marketing Agent — note / Shorts 生成
"""

from __future__ import annotations

import json
import os
import re
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, Optional, Type, TypeVar

# scripts/agents/ を import パスに追加（python scripts/agents/pipeline.py 実行用）
_AGENTS_DIR = Path(__file__).resolve().parent
if str(_AGENTS_DIR) not in sys.path:
    sys.path.insert(0, str(_AGENTS_DIR))

from google import genai
from google.genai import types
from jsonschema import Draft202012Validator
from pydantic import BaseModel, ValidationError

from models import MarketingContent, QuizDraft, QuizRecord, ReviewFeedback
from prompts import (
    IDEA_AGENT,
    IDEA_DRAFT_PROMPT,
    IDEA_REVISE_PROMPT,
    JSON_AGENT,
    LOGIC_REVIEW_AGENT,
    MARKETING_AGENT,
    REVIEW_TARGET_PROMPT,
    UX_REVIEW_AGENT,
)

T = TypeVar("T", bound=BaseModel)

# リポジトリルート（ビジネス道場/）
REPO_ROOT = Path(__file__).resolve().parents[2]
QUIZ_DIR = REPO_ROOT / "src" / "data" / "quizzes"
NOTE_DIR = REPO_ROOT / "marketing" / "note"
SHORTS_DIR = REPO_ROOT / "marketing" / "shorts"
SCHEMA_PATH = QUIZ_DIR / "schema.json"

DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
MAX_JSON_RETRIES = 3

JST = timezone(timedelta(hours=9))

THEME_HINTS = [
    "原価計算と価格設定のトレードオフ",
    "リーン生産と在庫リスク",
    "PDCAとカイゼンの違い",
    "SWOTを実務で使うときの落とし穴",
    "損益分岐点と固定費変動費の見極め",
    "品質コスト（失敗コスト）の考え方",
    "チームの心理的安全性と生産性",
]


def log(msg: str) -> None:
    print(f"[pipeline] {msg}", flush=True)


def load_json_schema() -> Dict[str, Any]:
    with SCHEMA_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def strip_json_fence(text: str) -> str:
    """LLM 出力から JSON 部分を抽出。"""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if fence:
        return fence.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start : end + 1]
    return text


def get_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY が未設定です。環境変数または GitHub Secrets を設定してください。"
        )
    return genai.Client(api_key=api_key)


def call_gemini(
    client: genai.Client,
    *,
    system: str,
    user: str,
    model: str = DEFAULT_MODEL,
) -> str:
    response = client.models.generate_content(
        model=model,
        contents=user,
        config=types.GenerateContentConfig(
            system_instruction=system,
            temperature=0.7,
            response_mime_type="application/json",
        ),
    )
    text = (response.text or "").strip()
    if not text:
        raise RuntimeError("Gemini API が空の応答を返しました")
    return text


def parse_model(raw: str, model_cls: Type[T]) -> T:
    payload = json.loads(strip_json_fence(raw))
    return model_cls.model_validate(payload)


def validate_against_schema(data: Dict[str, Any], schema: Dict[str, Any]) -> None:
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
    if errors:
        msgs = "; ".join(f"{list(e.path)}: {e.message}" for e in errors[:5])
        raise ValidationError.from_exception_data(
            "QuizRecord",
            [{"type": "json_schema", "loc": (), "msg": msgs, "input": data}],
        )


def slugify(title: str, max_len: int = 40) -> str:
    s = re.sub(r"[^\w\u3040-\u30ff\u3400-\u9fff\-]+", "_", title.strip())
    s = re.sub(r"_+", "_", s).strip("_")
    return (s or "quiz")[:max_len]


def today_prefix() -> str:
    return datetime.now(JST).strftime("%Y%m%d")


def round1_idea(client: genai.Client, theme_hint: str) -> QuizDraft:
    log("Round 1: 企画コンサルが原案を作成中…")
    raw = call_gemini(
        client,
        system=IDEA_AGENT,
        user=IDEA_DRAFT_PROMPT.format(theme_hint=theme_hint),
    )
    draft = parse_model(raw, QuizDraft)
    log(f"  原案: {draft.title}（{draft.category.value} / {draft.difficulty.value}）")
    return draft


def round2_reviews(client: genai.Client, draft: QuizDraft) -> tuple[ReviewFeedback, ReviewFeedback]:
    log("Round 2: ロジック・UX レビューを並列実行中…")
    draft_json = draft.model_dump_json(indent=2, ensure_ascii=False)
    target = REVIEW_TARGET_PROMPT.format(draft_json=draft_json)

    def logic() -> ReviewFeedback:
        raw = call_gemini(client, system=LOGIC_REVIEW_AGENT, user=target)
        return parse_model(raw, ReviewFeedback)

    def ux() -> ReviewFeedback:
        raw = call_gemini(client, system=UX_REVIEW_AGENT, user=target)
        return parse_model(raw, ReviewFeedback)

    with ThreadPoolExecutor(max_workers=2) as pool:
        f_logic = pool.submit(logic)
        f_ux = pool.submit(ux)
        logic_fb = f_logic.result()
        ux_fb = f_ux.result()

    log(f"  Logic severity={logic_fb.severity}, UX severity={ux_fb.severity}")
    return logic_fb, ux_fb


def round3_revise(
    client: genai.Client,
    draft: QuizDraft,
    logic_fb: ReviewFeedback,
    ux_fb: ReviewFeedback,
) -> QuizDraft:
    log("Round 3: 企画コンサルが最終版を作成中…")
    raw = call_gemini(
        client,
        system=IDEA_AGENT,
        user=IDEA_REVISE_PROMPT.format(
            draft_json=draft.model_dump_json(indent=2, ensure_ascii=False),
            logic_review_json=logic_fb.model_dump_json(indent=2, ensure_ascii=False),
            ux_review_json=ux_fb.model_dump_json(indent=2, ensure_ascii=False),
        ),
    )
    final = parse_model(raw, QuizDraft)
    log(f"  最終版: {final.title}")
    return final


def round4_json(
    client: genai.Client,
    final: QuizDraft,
    schema: Dict[str, Any],
) -> QuizRecord:
    log("Round 4: 構造化エンジニアが JSON 化中…")
    source = final.model_dump_json(indent=2, ensure_ascii=False)
    last_error: Optional[str] = None

    for attempt in range(1, MAX_JSON_RETRIES + 1):
        user = source
        if last_error:
            user += f"\n\n前回のバリデーションエラー:\n{last_error}\n修正して再出力してください。"
        raw = call_gemini(client, system=JSON_AGENT, user=user)
        try:
            draft = parse_model(raw, QuizDraft)
            record = QuizRecord(
                id=datetime.now(JST).strftime("%Y%m%d") + "-" + uuid.uuid4().hex[:8],
                **draft.model_dump(),
            )
            data = record.model_dump()
            validate_against_schema(data, schema)
            QuizRecord.model_validate(data)
            log(f"  JSON 化成功（試行 {attempt}/{MAX_JSON_RETRIES}）id={record.id}")
            return record
        except (json.JSONDecodeError, ValidationError) as exc:
            last_error = str(exc)
            log(f"  バリデーション失敗（試行 {attempt}）: {last_error[:200]}")

    raise RuntimeError(f"JSON 化に {MAX_JSON_RETRIES} 回失敗しました: {last_error}")


def round5_marketing(client: genai.Client, quiz: QuizRecord) -> MarketingContent:
    log("Round 5: コンテンツマーケターが記事・台本を生成中…")
    raw = call_gemini(
        client,
        system=MARKETING_AGENT,
        user=quiz.model_dump_json(indent=2, ensure_ascii=False),
    )
    content = parse_model(raw, MarketingContent)
    log("  note / Shorts 生成完了")
    return content


def save_outputs(quiz: QuizRecord, marketing: MarketingContent) -> Dict[str, Path]:
    QUIZ_DIR.mkdir(parents=True, exist_ok=True)
    NOTE_DIR.mkdir(parents=True, exist_ok=True)
    SHORTS_DIR.mkdir(parents=True, exist_ok=True)

    slug = slugify(quiz.title)
    date = today_prefix()

    quiz_path = QUIZ_DIR / f"{date}_{slug}.json"
    note_path = NOTE_DIR / f"{date}_{slug}.md"
    shorts_path = SHORTS_DIR / f"{date}_{slug}.txt"

    quiz_path.write_text(
        json.dumps(quiz.model_dump(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    note_path.write_text(marketing.note_markdown.strip() + "\n", encoding="utf-8")
    shorts_path.write_text(marketing.shorts_script.strip() + "\n", encoding="utf-8")

    return {"quiz": quiz_path, "note": note_path, "shorts": shorts_path}


def pick_theme_hint() -> str:
    idx = datetime.now(JST).toordinal() % len(THEME_HINTS)
    return THEME_HINTS[idx]


def run_pipeline(dry_run: bool = False) -> Dict[str, Any]:
    client = get_client()
    schema = load_json_schema()
    theme = pick_theme_hint()
    log(f"テーマヒント: {theme}")
    log(f"モデル: {DEFAULT_MODEL}")

    draft = round1_idea(client, theme)
    logic_fb, ux_fb = round2_reviews(client, draft)
    final = round3_revise(client, draft, logic_fb, ux_fb)
    quiz = round4_json(client, final, schema)
    marketing = round5_marketing(client, quiz)

    if dry_run:
        log("dry-run: ファイル保存をスキップ")
        return {"quiz": quiz.model_dump(), "dry_run": True}

    paths = save_outputs(quiz, marketing)
    log("保存完了:")
    for key, path in paths.items():
        log(f"  {key}: {path.relative_to(REPO_ROOT)}")

    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "paths": {k: str(v) for k, v in paths.items()},
    }


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    try:
        result = run_pipeline(dry_run=dry_run)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        log(f"ERROR: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
