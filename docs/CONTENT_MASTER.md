# 問題マスタの置き場

ビジネス道場には **問題データを置かない**。科目の branding / 段位だけを持ち、問題はマスタから読み込む。

## 役割

| 役割 | 場所 | すること |
|---|---|---|
| **マスタ（開発）** | SAP道場 / 学習道場 | 問題の追加・修正・試し |
| **公開（本番）** | ビジネス道場 | `subject.js` と課金・成績のみ。問題はマスタ URL を参照 |

## マスタ対応表

| 科目 | マスタ | 公開 URL（ビジネス道場が読む） |
|---|---|---|
| SAP | `SAPクイズ/data/` | https://sap-dojo.web.app/data/ |
| Windowsショートカット | `学習道場/subjects/windows-shortcuts/` | https://gakusyu-dojo.web.app/subjects/windows-shortcuts/ |
| 生産管理 | `学習道場/subjects/biz-career/` | https://gakusyu-dojo.web.app/subjects/biz-career/ |
| Excel関数 | `学習道場/subjects/excel-functions/` | https://gakusyu-dojo.web.app/subjects/excel-functions/ |
| Outlookメール | `学習道場/subjects/outlook-mail/` | https://gakusyu-dojo.web.app/subjects/outlook-mail/ |
| Teams | `学習道場/subjects/teams-collab/` | https://gakusyu-dojo.web.app/subjects/teams-collab/ |
| オントロジー入門 | `学習道場/subjects/ai-ontology-intro/` | https://gakusyu-dojo.web.app/subjects/ai-ontology-intro/ |
| オントロジー基礎 | `学習道場/subjects/ai-ontology-core/` | https://gakusyu-dojo.web.app/subjects/ai-ontology-core/ |

定義は `ビジネス道場/subjects/registry.js` の `contentBase` / `contentVersionUrl`。

## 問題を追加する手順

1. **SAP** → `SAPクイズ` で編集 → `firebase deploy --only hosting --project sap-dojo`
2. **生産管理 / ショートカット / オントロジー など** → `学習道場` で編集 → `firebase deploy --only hosting --project gakusyu-dojo`
3. ビジネス道場側の問題ファイル編集は不要（マスタの `version.js` でキャッシュ更新）

## ビジネス道場に置くもの

各 `subjects/<id>/subject.js` のみ:

- ブランド名（ビジネス道場）
- `storageKey`（成績キー）
- 段位・カテゴリ表示・`extraScripts` 名

問題本体（`questions.js` 等）は置かない。

## ローカル確認

ビジネス道場をローカル起動しても、問題は本番マスタ URL から読みます。  
マスタをローカルで試す場合は、該当マスタアプリ側で確認してください。

## ビジネス道場 Hosting 前（推奨）

`firebase deploy --only hosting --project buz-dojo` の前に、クライアント束ねに X 系 Secret 名や SAP/SEISAN 混在の痕跡がないか静的確認する。

```bash
cd "ビジネス道場" && bash _dev/tools/scan-client-secrets.sh
```

**exit 0** を推奨（ヒット時は修正してから Hosting）。レーン分離の正本は `docs/SECURITY_LANE.md`（ヘビ／カラス窓口）。
