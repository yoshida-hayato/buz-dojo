#!/usr/bin/env node
/**
 * 複数選択問題の品質修復（のではない／でではない等の壊れた誤文を正しいミスリードに差し替え）
 * pick方向・正解数は現状維持
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const file = path.join(__dirname, "../data/judgment-questions.js");
let src = fs.readFileSync(file, "utf8");

// id → statements 全文（pick・explanationは現行を維持）
const FIX = {
  "j-051": [
    { text: "オーダーフルフィルメントの標準順序は、受注→出荷伝票→ピッキング→出庫確認→請求である。", correct: true },
    { text: "出庫確認（PGI）を実行すると、売上高と売掛金が同時に計上される。", correct: false, note: "PGIでは売上原価と在庫のみ。売上高・売掛金はVF01。" },
    { text: "VL01N（出荷伝票登録）だけで在庫数量が減る。", correct: false, note: "VL01Nだけでは在庫は減らない。PGIで減る。" },
    { text: "VA01（受注登録）の保存時点で売上高が計上される。", correct: false, note: "受注は約束の記録。売上はVF01。" },
    { text: "オーダーフルフィルメントは受注→請求→出荷→PGIの順が標準である。", correct: false, note: "標準は受注→出荷→PGI→請求。" },
  ],
  "j-052": [
    { text: "PGI後は単純な数量変更ではなく取消処理が必要になる場合がある。", correct: true },
    { text: "VL01とVL01Nは別Tコードで、VL01NがEnjoy新画面である。", correct: true },
    { text: "出荷プラントは在庫引当・出荷の起点。未設定だとATPチェックやVL01Nでエラーになる。", correct: true },
    { text: "VL02Nでピッキング数量を出荷数量と一致させてからPGIに進むのが標準フロー。", correct: true },
    { text: "ATPは現在庫のみを見て入庫予定や引当を考慮しない。", correct: false, note: "ATPは入出庫予定・既存引当を考慮する。" },
  ],
  "j-053": [
    { text: "VKM3で与信保留された受注は、リリースされるまで出荷に進めない場合がある。", correct: true },
    { text: "請求伝票（VF01）なしでPGIだけ実行すれば売掛金が計上される。", correct: false, note: "売掛金・売上はVF01で計上。" },
    { text: "出荷伝票作成と同時に請求書が自動転記されるのがSD標準である。", correct: false, note: "請求はVF01の別ステップ。" },
    { text: "FB70で計上した売上は売掛金明細として管理されない。", correct: false, note: "FB70も売掛金明細として管理される。" },
    { text: "与信ブロックは出荷処理に影響しない。", correct: false, note: "VKM3保留は出荷停止の場合がある。" },
  ],
  "j-054": [
    { text: "VA02では出荷済み数量を超える増量がいつでも自由にできる。", correct: false, note: "出荷済み数量以上への増量は不可。" },
    { text: "後続の出荷処理が進むと受注変更の可能範囲が制限される。", correct: true },
    { text: "受注時にATPチェックが自動実行され、約束可能量を確認する。", correct: true },
    { text: "出荷伝票は受注を参照して作成する。", correct: true },
    { text: "売掛金・売上高の計上はVF01（請求）のタイミングである。", correct: true },
  ],
  "j-055": [
    { text: "MD02で内製品不足が検出されると計画手配が生成される。", correct: true },
    { text: "MRP実行で購買発注が仕入先へ自動送信される。", correct: false, note: "MRPは提案のみ。発注は担当者が変換。" },
    { text: "MD04は原価センタマスタの登録・変更を行う。", correct: false, note: "MD04は需給状況一覧（MRPリスト）。" },
    { text: "MRPは外部調達品について購買依頼を提案するが、発注を自動送信はする。", correct: false, note: "MRPは購買依頼を提案するが発注自動送信はしない。" },
    { text: "PIR（計画独立所要量）があれば実受注がなくても需要として認識されない。", correct: false, note: "PIRがあれば実受注がなくても需要として認識される。" },
  ],
  "j-056": [
    { text: "261（指図向け出庫）は製造指図が必要。計画手配はCO01等で指図に変換してから実行する。", correct: true },
    { text: "指図発行（リリース）が実行フェーズの開始許可。未発行では261出庫は制限される。", correct: true },
    { text: "CO11Nの作業時間入力は原価計算に影響する。", correct: true },
    { text: "入庫（101）後も原価差異が残る場合があり、指図決済で精算する。", correct: true },
    { text: "入庫（101）だけで指図残高が必ずゼロになり決済不要になる。", correct: false, note: "入庫後も差異が残る場合があり指図決済が必要。" },
  ],
  "j-057": [
    { text: "BOM（CS01）は材料構成（何から作るか）を定義する。", correct: true },
    { text: "BOMは工程順序と標準時間を保持するマスタである。", correct: false, note: "BOMは材料構成。工程・時間は作業手順の役割。" },
    { text: "作業区は工程ごとの標準時間と作業順序を保持する。", correct: false, note: "作業区は作業場所。工程・時間は作業手順の役割。" },
    { text: "作業手順（CA01）は材料構成（何から作るか）を定義する。", correct: false, note: "材料構成はBOM（CS01）の役割。" },
    { text: "作業区（CR01）は工程順序と標準時間を定義する。", correct: false, note: "工程順序・標準時間は作業手順（CA01）の役割。" },
  ],
  "j-058": [
    { text: "指図決済は入庫と同時に自動実行され、手動での決済処理は不要である。", correct: false, note: "指図決済は原価差異を精算する月次処理。手動決済が必要な場合がある。" },
    { text: "261出庫で材料費が製造指図の実際原価に載る。", correct: true },
    { text: "月末の未完成指図原価は仕掛品（WIP）としてB/Sに計上され得る。", correct: true },
    { text: "CO11Nの確認で加工費が指図の実際原価に載る。", correct: true },
    { text: "指図決済で原価差異を精算し、指図残高をゼロにする。", correct: true },
  ],
  "j-059": [
    { text: "MD01N（MRP Live）はHANA上で高速実行される。", correct: true },
    { text: "MRP Liveの提案種類は従来MRPと全く異なる体系である。", correct: false, note: "購買依頼・計画手配など従来MRPと同系の考え方。" },
    { text: "MRPは作業区の能力・稼働率を同時に最適化して計算する。", correct: false, note: "MRPは数量ベース。能力計画は別プロセス。" },
    { text: "MRP Liveは購買発注を自動的に仕入先へ送信する。", correct: false, note: "Liveも提案のみ。発注送信は担当者判断。" },
    { text: "能力所要量計画はMRPと同一プログラムで同時に解決される。", correct: false, note: "MRPは数量、能力計画は別プロセス。" },
  ],
  "j-060": [
    { text: "1件の費用転記で原価センタと指図の両方に実績転記できる。", correct: false, note: "1件につき実績を受け取れるCO対象は1つ。" },
    { text: "原価センタは常設部門、内部指図はイベント単位の一時集計である。", correct: true },
    { text: "指図と原価センタ同時指定時、指図が実績・原価センタは統計転記になる。", correct: true },
    { text: "統計転記は配賦・決済の計算には使われず、参考・表示用である。", correct: true },
    { text: "内部指図はプロジェクト等の一時的原価集計に使う。", correct: true },
  ],
  "j-061": [
    { text: "S/4では原価要素がG/L勘定マスタ（FS00）に統合されている。", correct: true },
    { text: "G/LタイプPは二次原価、Sは一次原価を表す。", correct: false, note: "P=一次原価、S=二次原価。" },
    { text: "G/LタイプX（BS勘定）も原価要素としてCOへ費用を送る。", correct: false, note: "XはBS勘定でCOへ送らない。" },
    { text: "G/LタイプSの勘定はFB50から直接FI伝票として転記できる。", correct: false, note: "二次原価はCO取引から入る。" },
    { text: "G/LタイプPの一次原価はFB50から転記できない。", correct: false, note: "一次原価PはFB50から転記できる。" },
  ],
  "j-062": [
    { text: "CK24は計画値の更新だけで在庫評価には影響しない。", correct: false, note: "CK24で標準原価更新すると在庫評価基準も変わる。" },
    { text: "CK24で標準原価をリリースすると完成品在庫の評価基準も変わる。", correct: true },
    { text: "261出庫で材料費が指図の実際原価に載る。", correct: true },
    { text: "確認で入力した作業時間×活動タイプ単価が加工費として指図に転記される。", correct: true },
    { text: "加工費はCO11N（確認）で作業時間×活動タイプ単価を入力したときに指図へ転記される。", correct: true },
  ],
  "j-064": [
    { text: "ME21Nで発注保存すると買掛金の会計伝票が自動生成される。", correct: false, note: "発注は会計不動。買掛金はMIROで計上。" },
    { text: "MIGO 101入庫時は借方:在庫／貸方:GR/IRとなる。", correct: true },
    { text: "MIROで請求書照合すると借方:GR/IR／貸方:買掛金となる。", correct: true },
    { text: "F110/F-53の支払はB/S上の買掛金整理であり、P/L費用は増加しない。", correct: true },
    { text: "調達サイクルで会計が動くのは入庫・請求書照合・支払の3か所である。", correct: true },
  ],
  "j-065": [
    { text: "GR/IRはG/Lの経過勘定（クリアリング勘定）である。", correct: true },
    { text: "GR/IRは仕入先ごとの買掛金明細としてFBL1Nで消込される。", correct: false, note: "GR/IRはG/L経過勘定。買掛明細は照合後にFBL1N。" },
    { text: "期末GR/IRの借方残は入庫済み・請求未照合を示す。", correct: false, note: "貸方残が入庫済み・請求未照合のサイン。" },
    { text: "MIROは発注・入庫を参照せず請求書だけで買掛金計上する。", correct: false, note: "MIROで3点照合（発注・入庫・請求）。" },
    { text: "FB60は発注参照ありの3点照合にも使える。", correct: false, note: "3点照合はMIROの領域。FB60は非参照入力。" },
  ],
  "j-066": [
    { text: "FB02で転記済み伝票の借方・貸方金額を直接変更できる。", correct: false, note: "転記済みは金額変更不可。参考項目のみ。" },
    { text: "FB08は元伝票をデータベースから物理削除し、監査証跡も残さない。", correct: false, note: "FB08は反対仕訳で取消し痕跡を残す。" },
    { text: "FB08は元伝票を削除せず反対仕訳で取消する。", correct: true },
    { text: "OB52で月をクローズするとその月の新規転記が禁止される。", correct: true },
    { text: "転記済み伝票は参考項目（テキスト等）のみ変更可能である。", correct: true },
  ],
  "j-067": [
    { text: "統制勘定は補助元帳とG/Lの橋渡し役である。", correct: true },
    { text: "補助元帳残高合計は統制勘定経由でG/L残高と一致する。", correct: true },
    { text: "補助元帳は統制勘定なしにG/Lと独立して残高管理される。", correct: false, note: "補助元帳は統制勘定経由でG/Lと一致。" },
    { text: "FD10Nの残高を開くとG/L勘定マスタ（FS00）が表示される。", correct: false, note: "FD10NからはFBL5N（得意先明細）へドリルダウン。" },
    { text: "FS10NはG/L残高照会のみで明細ドリルダウンはできない。", correct: false, note: "FS10NからFBL3N相当の明細へドリルダウンできる。" },
  ],
  "j-069": [
    { text: "購買情報レコード（ME11）登録でME21N時に価格が提案される。", correct: true },
    { text: "基本契約（ME31K）は枠取りで都度発注で引き当てる。", correct: true },
    { text: "分納契約（ME31L）は契約段階で納入スケジュール行を固定する。", correct: false, note: "分納契約は納入スケジュール行を固定する。" },
    { text: "基本契約で納入日ごとの数量をスケジュール行として固定する。", correct: false, note: "それは分納契約（ME31L）。" },
    { text: "分納契約のスケジュールはME21Nなしで自動入庫される。", correct: false, note: "入庫はMIGO等で別途転記が必要。" },
  ],
  "j-070": [
    { text: "委託在庫は倉庫に置いた時点で自社資産・買掛金が計上される。", correct: false, note: "委託在庫の所有権は仕入先。消費時に買掛計上。" },
    { text: "委託在庫は使用・消費時に買掛金計上となる。", correct: true },
    { text: "外注加工では支給部品を外注先へ出庫し特殊在庫管理する。", correct: true },
    { text: "プラント間転送（301等）で必ず仕入先買掛金が計上される。", correct: false, note: "プラント間転送は社内再配置。" },
    { text: "MMBEは在庫数量の照会に使う。", correct: true },
  ],
  "j-072": [
    { text: "組織改編時は先に全員異動してから組織構造を変更する。", correct: false, note: "先にOM構造を整えてから人事アクション。" },
    { text: "ジョブは役割の型、ポジションは組織上の空席である。", correct: true },
    { text: "1人の個人が複数ポジションを兼務することはできない。", correct: false, note: "ダブルホールディング（兼務）可能。" },
    { text: "組織改編は先にOM構造を整えてから人事アクションで配属変更する。", correct: true },
    { text: "人事データはインフォタイプ単位で有効期間付き履歴管理される。", correct: true },
  ],
  "j-073": [
    { text: "eリクルーティングの候補者と入社後の個人（従業員）は別オブジェクトである。", correct: true },
    { text: "入社時PA40（人事イベント）で新規個人・従業員が作成される。", correct: true },
    { text: "採用要件→求人→候補者の順でオブジェクトがつながる。", correct: false, note: "採用要件→求人→候補者の順。" },
    { text: "内定後に候補者データが名称変更されて個人マスタになる。", correct: false, note: "候補者と個人は別。PA40で新規個人作成。" },
    { text: "PA30は照会専用で変更はできない。", correct: false, note: "PA30は更新用。照会はPA20。" },
  ],
  "j-074": [
    { text: "勤怠時間データは給与計算の入力として使われる。", correct: true },
    { text: "SuccessFactorsとERP HCMは同一DBで個人マスタを共有する。", correct: false, note: "SFとオンプレHCMは別システム。連携はIF経由。" },
    { text: "給与計算結果はFIへ自動連携され必ず個別伝票が生成される。", correct: false, note: "給与FI連携は設定・運用依存。" },
    { text: "人事領域は必ず1つの会社コードに割り当てられる。", correct: true },
    { text: "SAP Learningで日次・定期アクティビティ両方を管理できる。", correct: true },
  ],
  "j-075": [
    { text: "SU03で一般ユーザは自分の日付形式・小数点表記を変更できる。", correct: true },
    { text: "SU53は権限エラー直後に実行すると失敗した権限オブジェクトが見える。", correct: true },
    { text: "PFCGのロールはメニュー内容と権限の両方に影響する。", correct: false, note: "PFCGロールはメニューと権限の両方に影響。" },
    { text: "SU01は一般ユーザが自分の権限を変更するためのTコードである。", correct: false, note: "SU01は管理者用。本人設定はSU3。" },
    { text: "SU53は管理者のみが他人の権限エラーを確認できる。", correct: false, note: "SU53はエラー直後に本人が実行する。" },
  ],
  "j-077": [
    { text: "SE09（移送オーガナイザ）で移送依頼の作成・リリースを行う。", correct: true },
    { text: "STMSが本番側のインポート（受け入れ）を担当する。", correct: true },
    { text: "開発機で修正した設定は本番へ移送しないと反映されない。", correct: false, note: "開発機の変更は移送しないと本番に反映されない。" },
    { text: "STMSは開発機でプログラムをコーディングするTコードである。", correct: false, note: "STMSは移送管理。コーディングはSE38等。" },
    { text: "本番でのZプログラム実行は、照会目的であればテスト実行してよい。", correct: false, note: "本番での独自UPDATEはデータ変更リスクがあり厳禁。" },
  ],
  "j-078": [
    { text: "BPカテゴリ（個人・組織・グループ）は登録後に変更できる。", correct: false, note: "BPカテゴリは登録時に決定し後から変更不可。" },
    { text: "サプライヤロールだけで購買発注から支払まで一貫処理できる。", correct: false, note: "購買はサプライヤ、会計はFI仕入先の両ロールが必要。" },
    { text: "同一BPの名称・住所は一般データ1回変更で全ロールに反映される。", correct: true },
    { text: "購買はサプライヤ、会計はFI仕入先の両ロールが必要である。", correct: true },
    { text: "BPはECCの得意先・仕入先・FI/SDロールの統合先である。", correct: true },
  ],
  "j-079": [
    { text: "製品タイプ（ROH/FERT等）は保守できるビューや業務処理に影響する。", correct: true },
    { text: "ROH（原材料）は販売ビューを持てない等の制約がある。", correct: true },
    { text: "製品タイプは単なる分類ラベルで業務処理に影響しない。", correct: false, note: "製品タイプはビュー・処理に影響する。" },
    { text: "基本数量単位は登録後いつでも自由に変更できる。", correct: false, note: "基本数量単位の変更は極めて困難。" },
    { text: "FERT（完成品）は購買ビューのみで販売・MRPビューは持てない。", correct: false, note: "FERTは販売・MRP等のビューを持てる。" },
  ],
  "j-090": [
    { text: "ダンプが出たらまずSM37でジョブ状況を見る。", correct: false, note: "ダンプの第一確認先はST22。" },
    { text: "SU53は管理者が他ユーザの権限エラーを後から調査する専用画面である。", correct: false, note: "SU53はエラー直後に本人が実行する。" },
    { text: "SM12で他人のロックを無断削除してよい。", correct: false, note: "ロック削除は本人確認後に行う。" },
    { text: "ST22はダンプ解析の定番Tコードである。", correct: true },
    { text: "SM12はテーブルロックの確認・解除に使う。", correct: true },
  ],
  "j-092": [
    { text: "利益センタへの転記は統計転記扱いが典型である。", correct: true },
    { text: "原価センタは常設部門の原価集計に使う。", correct: true },
    { text: "利益センタ実績は原価センタ配賦の計算対象になる。", correct: false, note: "利益センタは統計典型。配賦対象外。" },
    { text: "利益センタへの転記は実績転記であり配賦・決済のベースデータになる。", correct: false, note: "利益センタは統計（参考）が典型。" },
    { text: "内部指図は常設部門の原価集計に使う。", correct: false, note: "内部指図は一時的な原価集計。原価センタが常設部門。" },
  ],
  "j-096": [
    { text: "MRPは購買依頼・計画手配を「提案」する。", correct: true },
    { text: "計画手配はそのまま完成品入庫できる。", correct: false, note: "計画手配は指図変換・実行フェーズが必要。" },
    { text: "外注品はMRP結果が製造指図（計画手配）になる。", correct: false, note: "外注品はMRP結果が購買依頼。" },
    { text: "BOM変更は過去の指図実績を自動的に書き換える。", correct: false, note: "BOM変更は将来の計画に効く。" },
    { text: "内製品は製造指図を経ずに材料出庫だけで完成品入庫できる。", correct: false, note: "内製品は指図を経て出庫・確認・入庫する。" },
  ],
  "j-098": [
    { text: "本番環境では移送テストを省略し、開発機から直接本番へインポートしてよい。", correct: false, note: "移送はテスト環境で検証してから本番へ。" },
    { text: "本番でZ開発プログラムをテスト目的で実行してよい。", correct: false, note: "本番テスト実行はデータ変更リスクがあり厳禁。" },
    { text: "SM12で他人のロックを無断削除してよい。", correct: false, note: "ロック削除は本人確認後に行う。" },
    { text: "権限不足はSU53→PFCGロール追加の流れで調査する。", correct: false, note: "SU53はエラー直後に本人が実行する。" },
    { text: "本番でのデータ変更は移送・テスト済みの標準機能のみに限定すべきである。", correct: true },
  ],
  "j-099": [
    { text: "組織管理（OM）と人事管理（PA）は連携する。", correct: true },
    { text: "eリクルーティングは採用要件から始まる。", correct: true },
    { text: "勤怠データは給与計算に使われる。", correct: true },
    { text: "人事領域は給与・勤怠・社保など人事処理の管理単位である。", correct: true },
    { text: "SuccessFactorsはERP HCMと同一システムである。", correct: false, note: "SFとERP HCMは別製品・別基盤。" },
  ],
  "j-100": [
    { text: "WIP（仕掛品）はB/Sの資産である。", correct: true },
    { text: "WIPはP/L費用として既に全額認識済みである。", correct: false, note: "WIPはB/S資産として計上され得る。" },
    { text: "FD10N→明細→伝票のドリルダウンは債権調査に使える。", correct: false, note: "FD10NからFBL5Nへドリルダウン可能。" },
    { text: "GR/IR貸方残は請求未照合のサインになり得る。", correct: false, note: "貸方残は入庫済み・請求未照合のサイン。" },
    { text: "転記とは画面を開くことであり、保存しなくても残高が更新される。", correct: false, note: "転記＝保存による確定更新。未保存は残高に影響しない。" },
  ],
  "j-111": [
    { text: "購買組織とプラントはOX08でN:Nに割り当てる。", correct: true },
    { text: "1つの購買組織には会社コードを1つだけ割り当てられる。", correct: true },
    { text: "購買組織は仕入先との価格・条件交渉の責任単位である。", correct: true },
    { text: "購買組織は会社コード内の調達活動をまとめる組織単位である。", correct: true },
    { text: "購買グループを購買組織に割り当てれば、全プラントで自動的に発注できる。", correct: false, note: "発注可能プラントはOX08割当のみ。" },
  ],
  "j-112": [
    { text: "購買グループはME21Nのヘッダに入力される。", correct: true },
    { text: "購買グループはプラントへのOX08割当が必須である。", correct: false, note: "EKGRPは伝票ヘッダ属性。OX08割当不要。" },
    { text: "購買グループは購買組織の下位組織として階層管理される。", correct: false, note: "購買グループは分析・権限の分類キー。" },
    { text: "購買グループは購買発注明細行ごとに必ず個別入力する。", correct: false, note: "購買グループはヘッダ入力。" },
    { text: "購買グループはTコードOX08でプラントと紐づけて定義する。", correct: false, note: "購買グループはOME4でマスタ定義。" },
  ],
  "j-121": [
    { text: "伝票タイプと購買発注番号はヘッダデータである。", correct: true },
    { text: "仕入先と通貨は通常ヘッダで設定する。", correct: true },
    { text: "支払条件は発注全体に共通のヘッダ項目である。", correct: true },
    { text: "購買発注数量・納期は明細行（品目行）ごとに設定する。", correct: true },
    { text: "明細カテゴリはヘッダに1つだけ設定し全明細が強制同一になる。", correct: false, note: "明細カテゴリは明細行ごとに設定。" },
  ],
  "j-122": [
    { text: "品目コード（またはテキスト）は明細データである。", correct: true },
    { text: "購買発注価格（ネット価格）はヘッダで1つだけ設定する。", correct: false, note: "価格は明細行で設定する。" },
    { text: "支払条件は明細行ごとに必ず異なる値のみ入力できる。", correct: false, note: "支払条件は通常ヘッダで共通設定。" },
    { text: "仕入先は通常、各明細行で個別に変更するのが標準である。", correct: false, note: "仕入先は通常ヘッダに1つ。" },
    { text: "納入日付はヘッダに1つだけ設定し、全明細行が同一日付になる。", correct: false, note: "納入日付は明細行ごとに設定できる。" },
  ],
  "j-131": [
    { text: "仕入先請求書番号は請求書の識別と重複登録防止に使う。", correct: true },
    { text: "仕入先請求書番号を入力すると、入庫（MIGO）が自動実行される。", correct: false, note: "入庫はMIGOで別途。MIROは照合・買掛計上。" },
    { text: "購買発注番号は請求書の重複チェック専用で、入庫実績とは無関係である。", correct: false, note: "PO番号は3点照合の起点。" },
    { text: "納品書番号は入庫実績とは無関係で、請求書の重複チェック専用である。", correct: false, note: "納品書番号は納品と請求を結びつける。" },
    { text: "MIROでは購買発注番号の入力は任意で、入庫実績なしでも買掛金計上できる。", correct: false, note: "MIROは発注・入庫実績との照合が基本。" },
  ],
  "j-144": [
    { text: "品目番号・名称・基本数量単位は一般データレベルで共通管理される。", correct: true },
    { text: "MRP・購買・会計ビューはプラントデータレベルで持てる。", correct: true },
    { text: "保管場所固有のデータは保管場所データレベルで持てる。", correct: true },
    { text: "品目番号は共通のまま、必要なプラントビューを拡張登録する。", correct: true },
    { text: "購買組織データレベルで品目のMRP設定を保持する。", correct: false, note: "MRPはプラントデータレベル。" },
  ],
  "j-145": [
    { text: "品目タイプは調達をMMかPPかを制御し得る。", correct: true },
    { text: "品目タイプは単なるラベルで、利用可能な品目マスタビューに影響しない。", correct: false, note: "品目タイプはビューを制御する。" },
    { text: "産業コードは会計期間の設定にのみ使われ、画面レイアウトには影響しない。", correct: false, note: "産業コードは画面レイアウトを制御。" },
    { text: "産業コードは品目番号の内部/外部採番を決定する。", correct: false, note: "採番は品目タイプの設定。" },
    { text: "基本数量単位PCはPersonal Computer専用の品目タイプである。", correct: false, note: "PC＝Piece（ピース）。" },
  ],
};

const TARGET = {
  "j-051": { pick: "correct", n: 1 }, "j-052": { pick: "incorrect", n: 1 },
  "j-053": { pick: "correct", n: 1 }, "j-054": { pick: "incorrect", n: 1 },
  "j-055": { pick: "correct", n: 1 }, "j-056": { pick: "incorrect", n: 1 },
  "j-057": { pick: "correct", n: 1 }, "j-058": { pick: "incorrect", n: 1 },
  "j-059": { pick: "correct", n: 1 }, "j-060": { pick: "incorrect", n: 1 },
  "j-061": { pick: "correct", n: 1 }, "j-062": { pick: "incorrect", n: 1 },
  "j-064": { pick: "incorrect", n: 1 }, "j-065": { pick: "correct", n: 1 },
  "j-066": { pick: "incorrect", n: 2 }, "j-067": { pick: "correct", n: 2 },
  "j-069": { pick: "correct", n: 2 }, "j-070": { pick: "incorrect", n: 2 },
  "j-072": { pick: "incorrect", n: 2 }, "j-073": { pick: "correct", n: 2 },
  "j-074": { pick: "incorrect", n: 2 }, "j-075": { pick: "correct", n: 2 },
  "j-077": { pick: "correct", n: 2 }, "j-078": { pick: "incorrect", n: 2 },
  "j-079": { pick: "correct", n: 2 }, "j-090": { pick: "incorrect", n: 3 },
  "j-092": { pick: "incorrect", n: 3 }, "j-096": { pick: "incorrect", n: 4 },
  "j-098": { pick: "incorrect", n: 4 }, "j-099": { pick: "correct", n: 4 },
  "j-100": { pick: "incorrect", n: 4 }, "j-111": { pick: "correct", n: 4 },
  "j-112": { pick: "incorrect", n: 4 }, "j-121": { pick: "correct", n: 4 },
  "j-122": { pick: "incorrect", n: 4 }, "j-131": { pick: "incorrect", n: 4 },
  "j-144": { pick: "correct", n: 4 }, "j-145": { pick: "incorrect", n: 4 },
};

for (const [id, stmts] of Object.entries(FIX)) {
  const t = TARGET[id];
  const cnt = stmts.filter((s) => (t.pick === "correct" ? s.correct : !s.correct)).length;
  if (cnt !== t.n) {
    console.error(`Count mismatch ${id}: expected ${t.n} got ${cnt}`);
    process.exit(1);
  }
  if (stmts.length !== 5) {
    console.error(`Statement count ${id}: expected 5 got ${stmts.length}`);
    process.exit(1);
  }
}

function fmtStatements(stmts) {
  return stmts
    .map((s) => {
      let line = `      { text: "${s.text.replace(/"/g, '\\"')}", correct: ${s.correct}`;
      if (s.note) line += `, note: "${s.note.replace(/"/g, '\\"')}"`;
      return line + " },";
    })
    .join("\n");
}

for (const [id, statements] of Object.entries(FIX)) {
  const re = new RegExp(
    `(  \\{ id: "${id}", category: "judgment", module: "[^"]+", code: "[^"]+", pick: "(?:correct|incorrect)", priority: \\d+, statements: \\[)\\n[\\s\\S]*?(    \\], explanation: ")([^"]*)(" \\},)`
  );
  if (!re.test(src)) {
    console.error("Not found:", id);
    process.exit(1);
  }
  src = src.replace(re, `$1\n${fmtStatements(statements)}\n$2$3$4`);
}

fs.writeFileSync(file, src);

// 検証
const sb = {};
vm.runInNewContext(src.replace(/const JUDGMENT_DATA/, "var JUDGMENT_DATA"), sb);
let bad = 0;
const hist = {};
for (const q of sb.JUDGMENT_DATA) {
  if (!q.statements) continue;
  const pickN = q.statements.filter((s) => (q.pick === "correct" ? s.correct : !s.correct)).length;
  hist[pickN] = (hist[pickN] || 0) + 1;
  for (const s of q.statements) {
    if (/のではない|でではない|（誤り）|すしない|になならない/.test(s.text)) bad++;
  }
}
console.log("Distribution:", hist);
console.log("Artifact lines:", bad);
