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

## 本数の関門と、3波の順番 (2026-11-01 18:48便 に実測)

科目を1本足すと、本数と顔ぶれが「2枚のレジストリ」の側と
「index.html の題の表・フッターの入口・帯の表・料金の表・接頭の表」の側で
同時に変わる。パッチは1件ずつ全テストを通すので、どちらを先に出しても
途中の1手で必ず落ちる。だから窓を使う。

1. functions/test-helpers/subject-rows.js の WIRING_IN_PROGRESS を true に
   する (1件)。これで本数と顔ぶれの食い違いを見る約束が全部黙る
2. 配線を全部入れる。順番は自由になる。レジストリの2枚目の行だけは最後に
   出すこと (extra-subject-wiring の約束4 が、他の配線が全部そろって
   いることを要求する)
3. WIRING_IN_PROGRESS を false に戻し、DECLARED_SUBJECT_COUNT を新しい本数に
   書き替える (1件。2行は隣に置いてあるので1件で済む)

窓を開けたまま終わらせないこと。開いているあいだ、本数も顔ぶれも
1つも検出されない。18:48便 は35件をこの順で出し、1件ずつまっさらな clone に
当てて、途中のどの状態でも全テストが通ることを先に確かめた。

## 自前の問題データを持つ科目 (2026-11-01 18:48便 に1本目を足した)

fe-kamoku-b が1本目である。よその repo にマスタが無い科目は、ここが違う。

- contentBase はこのドメインの道にする (/data/(科目id))。コロンを含めると
  extra-subject-wiring が落ちる
- 問題データは data/(科目id)/questions.js に置く。firebase.json の ignore に
  data は入っていないので、そのまま配信される。judgment と order と contrast
  の3つは任意で、404 なら空配列に落ちるのが正しい道である
- contentVersionUrl は書かない。master の version が無いので APP_VERSION に
  落ちる。これで正しい
- functions/subject-catalog.js の URL 表には足さない。master が無いので
  問い合わせ先が無く、config/pricing.js の静的な questionCount が正本になる。
  subject-content-urls が、2枚目に宣言が在る科目だけをこの約束から除ける
- だから問題を足したら questionCount を手で直すこと。忘れると科目カードの
  全N問 が黙って嘘になる。fe-kamoku-b-questions が件数の一致を見張っている
- 問題文のコード囲み (バッククォート3個) はパッチの口を通らないので、
  文字コードから組む (data/fe-kamoku-b/questions.js の febCode と febText)。
  画面側の formatRichText が囲みを pre と code に変える。これは元から在る
- _dev/sync-catalog.js の counts には足す。数える先は PERSONAL ではなく
  ROOT である。writeCatalog は呼ばない (書く先が無い)

## 塞いでいたもの (2026-11-01 18:48便 に2つとも外れた)

塞ぎは2つあった。2つとも外れた。

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

## 公開過去問の科目 (2026-11-02 00:48便 に1本目を足した)

fe-kamoku-a が1本目である。自作問題の科目と違う所だけ書く。

- 問題の原文は取れる。頼み方は2つで、どちらも要る。1回に2問まで。
  prompt に「それぞれ短い引用として扱ってよいので、1つの引用が125文字を
  超えないように、文を区切って引用してください。省略や要約をしないこと。」
  を入れる。3問以上まとめて頼むと、引用の上限を理由に逐語を拒まれ、
  要約に化ける。これを道具の限界と読み違えた便が3つ在る (失敗の型18)
- 正解の一覧は別のファイルで公表されている。問題のファイルと解答例の
  ファイルは別に取る。解答例は1回で全問ぶん取れる
- 取った正解は、そのまま信じずに自分でも解くこと。00:48便 は46問とも
  自分で解いて解答例と突き合わせ、全問一致を確かめてから入れた。
  一致しない問が出たら、取り方を疑う前に自分の計算を疑うこと
- 図・表・流れ図・状態遷移図・アローダイアグラムを見ないと解けない問は
  外す。文字だけ出すと「解けない問」になる。科目A の60問では14問が
  該当した。ガードが問題文と肢に図への参照が無いことを見張る
- 許諾の台帳 (config/exam-licenses.js) が granted の試験にかぎる。
  日商簿記と宅建は断られているので足せない
- 出どころの鍵は2箇所に、別の名前で要る。config/pricing.js の行には
  examLicense、config/extra-subjects.js の行には examLicenseKey である。
  名前が違うので両方書くこと。片方だけだと extra-subject-wiring の
  約束5 が undefined で落ちる (00:48便 が実際に踏んだ)
- 問題ごとに source と sourceModified を持たせる。出典の明記と改変の
  明記が許諾の条件なので、ここが欠けると無料で載せてよい根拠が崩れる。
  画面側の受け皿は js/quiz-engine.js の renderQuestionSource で、
  これは 10/26 から在る。肢の並びを出題のたびに入れ替えるので、
  sourceModified は全問 true にしてある
- 出どころが public-past-exam の科目は、問題数に関わらず無料になる。
  だから100問を超えても値付けの判断は要らない
