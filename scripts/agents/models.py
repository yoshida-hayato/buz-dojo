"""Pydantic models for generated quiz JSON."""

from __future__ import annotations

from enum import Enum
from typing import List

from pydantic import BaseModel, Field, field_validator


class QuizCategory(str, Enum):
    MARKETING = "マーケティング"
    FINANCE = "財務会計"
    STRATEGY = "戦略"
    ORG_BEHAVIOR = "組織行動"
    GENERAL_MGMT = "経営全般"
    PRODUCTION = "生産管理"
    QUALITY = "品質管理"


class QuizDifficulty(str, Enum):
    BEGINNER = "初級"
    INTERMEDIATE = "中級"
    ADVANCED = "上級"


class QuizDraft(BaseModel):
    """Round 1–3 で扱うテキスト版クイズ案。"""

    title: str = Field(min_length=4, max_length=120)
    category: QuizCategory
    difficulty: QuizDifficulty
    question: str = Field(min_length=20)
    options: List[str] = Field(min_length=4, max_length=4)
    answer_index: int = Field(ge=0, le=3)
    explanation: str = Field(min_length=80)
    key_takeaway: str = Field(min_length=20)
    ogp_copy: str = Field(min_length=10, max_length=80)

    @field_validator("options")
    @classmethod
    def options_must_be_distinct(cls, values: List[str]) -> List[str]:
        normalized = [v.strip() for v in values]
        if len(set(normalized)) != 4:
            raise ValueError("選択肢は4つとも異なる必要があります")
        return normalized


class QuizRecord(QuizDraft):
    """保存用 JSON（id 付き）。"""

    id: str = Field(min_length=8)


class ReviewFeedback(BaseModel):
    """レビューエージェントの出力。"""

    summary: str
    issues: List[str] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)
    severity: str = Field(description="low | medium | high")


class MarketingContent(BaseModel):
    """マーケティング成果物。"""

    note_markdown: str = Field(min_length=200)
    shorts_script: str = Field(min_length=100)
