# 科目を1本足すとき、どこを触るか (2026-10-26 18:48便 に実測)

社長の 2026-10-26 11:08 の依頼は「科目をたくさん追加して」である。
この1枚は、その1本ぶんの実際の手数を測った結果である。推測ではない。

## 測り方

11本目の科目 (公開過去問・5,000問) を subjects/registry.js と
config/pricing.js にだけ足して、全テストを走らせた。
結果は 22件が落ち、11ファイルが名指しで何が足りないかを言った。

つまり テスト一式が、そのままこの表の代わりになる。
足して走らせれば、落ちたテストの名前が残りの手順を読み上げる。
順番を覚える必要は無い。

## 手で触るところ (忘れると、名前を挙げた見張りが落ちる)

1. 科目の行。置き場が2つある。
   (a) マスタが外に在る科目 → subjects/registry.js。パッチでは触れない
   (ブリッジは subjects/ 配下で subject.js しか受け付けない)。
   社長か、学習道場からの同期の側でやる
   (b) 問題データをこちら側に持つ科目 → config/extra-subjects.js。
   こちらは社員が足せる (2026-11-01 12:48便 に置いた)。レジストリの直後に
   読まれ、同じ配列に push される。足し忘れは extra-subject-wiring が
   名指しで落とす。社長が 11:31 に b と答えたので、この道が開いた
2. subjects/(科目id)/subject.js — branding と段位。
   忘れると subject-static-about が (科目id):no-subject-js と言う
3. config/pricing.js — SUBJECT_CATALOG の行 (questionCount と sourceType)。
   sourceType を書き忘れると public-past-exam-pricing が落ちる
4. config/exam-licenses.js — 公開過去問のときだけ。
   忘れると exam-license-gate が (未記入) と言う。
   許諾が granted の試験しか名乗れない (日商簿記と宅建は断られている)
5. functions/subject-catalog.js — master の catalog.js の URL。
   忘れると subject-content-urls が「master に問い合わせる」で落ち、
   請求額が静的な questionCount に落ちる
6. js/screens-subjects.js — どの帯に入れるかの表。
   忘れると catalog-group-bands が落ちる
7. index.html — known の題と説明、そしてフッターの入口。
   どちらも index-html-guard が別々に見張る
8. firebase.json — その道の Content-Type と no-cache の行。
   忘れると subject-static-pages が2件落ちる (型と札で別)
9. functions/question-stats-paths.js と js/question-stats-paths.js の
   FALLBACK_SUBJECT_IDS。一覧そのものは導出に替えたので手は要らないが、
   導けなかったときの控えは字面なので足す。
   question-stats-subject-wiring が見張る
10. _dev/sync-catalog.js — counts の表と writeCatalog の呼び出し。
    ここだけ見張りが無い。テストは1件も落ちないので、自分で思い出すこと。
    忘れると社長が node _dev/sync-catalog.js を叩いても
    その科目の問題数だけ更新されない

## 問題 id の接頭

新しい科目の問題 id が、既にある科目の接頭で始まるなら、
ID_PREFIXES では 長いほうを先に 置く。

2026-10-26 に実際に踏んだ: 生産管理は bc-sc-、プランニング専門は
bc-pp-、オペレーション専門は bc-po- で、3つとも bc- で始まる。
bc- の行が先に在ったので、専門2科目の問題は全部 biz-career に行っていた。
いまは「含まれる側は後ろ」を関係として見張っているので、順を間違えれば落ちる。

## わざと置いてある関門 (10 と書いてあるので、足すたびに直す)

科目が10本であることを数で書いた検査が5箇所ある。
これは足し忘れではなく、人の目を1度通すための関門である。
数を直すだけでよいが、直す前に「本当に足してよい科目か」を考えること。

- functions/__tests__/bizcareer-application-lift.test.js (2箇所)
- functions/__tests__/catalog-exam-note.test.js
- functions/__tests__/catalog-group-bands.test.js (2箇所)
- functions/__tests__/subject-content-urls.test.js

## 自動でそろうところ (触らない)

- functions/pricing-shared.js — config/pricing.js の写し。
  functions の pretest が _dev/sync-shared.py を呼ぶので、
  パッチで直すと空振りする
- _dev/gen-seo.py — registry を読んで科目の静的な頁と sitemap を書く
- js/storage.js の成績キー — 既定の組み立てが biz_dojo_(科目id)_stats_v1 を
  作る。known の表に無くても同じ字面になる
- js/admin-question-stats-shared.js の集計対象 — registry から導く
- question-stats-paths.js の SUBJECT_IDS — 2026-10-26 18:48便 で
  導出に替えた (サーバは料金の正本から、画面は registry から)

## 塞いでいたもの、いま塞いでいるもの (2026-11-01 12:48便 に更新)

塞ぎは2つあった。2つめは外れた。

1. (いまも塞いでいる) 問題データの本体。公開問題の原文を、社員の取得の口が
   書き写さない (3度実測した)。それ以上に、量そのものが無い。基本情報の
   公開問題は1年度あたり 科目A 20問 / 科目B 6問 で、4年度ぶんが全量である
   (実測は docs/EXAM_LICENSE_REGISTRY.md に書いた)。だから「無料の公開
   過去問の科目」は転載では作れない。作れるのはシラバスに沿った自作問題で、
   それは値付けの規則では有料になる。ここは社長に相談せず決めてよい側だが、
   決める前に流入を1度は測ること
2. (外れた) レジストリの行をパッチで足せない。2026-11-01 に
   config/extra-subjects.js を置いて開けた。社長が 11:31 に b と答え、
   公開情報の科目にかぎり問題データをこちら側に置くことを許したためである。
   手順は上の1番の (b)。空のうちは本番が1pxも動かないことを実測済み
