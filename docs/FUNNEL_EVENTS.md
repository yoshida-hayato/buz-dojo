# 計測イベントの一覧 (GA4)

売上はまだ1件も無い。流入も一度も測っていない。だから「誰も来ていない」のか
「来たが買っていない」のか「買おうとして落ちている」のかを、この9件だけで
分ける。GA4 の画面で探す名前はここに在る名前である。

正本はコード側 (js/ の logFunnel と logEvent)。この表と食い違ったら
functions/__tests__/funnel-events-doc.test.js が落ちる。

## 段ごとの読み方

1. page_view — 自動。頁を見た。これが0なら打つ手は集客だけである
2. paywall_view — 無料20問を使い切って壁に当たった
3. result_upsell_view — 結果画面の購入導線を見た
4. begin_checkout — 購入ボタンを押した
5. checkout_failed — セッション作成で落ちた (こちらの不具合)
6. checkout_success_return / checkout_canceled — Stripe から戻ってきた
7. checkout_grant_confirmed / checkout_grant_timeout — 権利が実際に付いたか

4が立って6が両方0なら、Stripe の画面で消えている。6の成功が立って7の
confirmed が立たないなら、払ったのに付与されていない。これは webhook 側の
事故で、金は受け取っているので最優先である。

## 1件ずつ

- paywall_view (js/screens-subjects.js)
  無料枠を使い切って開始できなかったとき。subject_id と price_yen。
  price_yen が0の paywall_view は、無料科目が壁を出している異常である

- result_upsell_view (js/screens-result.js)
  結果画面の購入導線を描いたとき。subject_id と price_yen と exhausted。
  exhausted=1 は、その回で無料枠を使い切った人

- result_upsell_click (js/screens-result.js)
  結果画面の購入ボタンを押したとき。begin_checkout と二重に立つ

- begin_checkout (js/billing.js)
  購入ボタンを押したとき。plan_type (pack か subject) と subject_id と
  signed_in。signed_in=0 はログインモーダルに回った人で、決済には進んでいない。
  押した場所 (カード / 壁 / 結果画面) は入っていない

- checkout_failed (js/billing.js)
  createCheckoutSession が落ちたとき。reason に先頭90字だけ入る

- checkout_success_return (js/billing.js)
  Stripe から成功で戻ったとき。入金の確定ではない (付与は webhook)。
  session_id_present が0なら、戻り先の URL が壊れている

- checkout_canceled (js/billing.js)
  Stripe の画面から取り消して戻ったとき。金額を見て戻った人である。
  打つ手は値付けと文面で、消えた人 (戻りが無い) とは正反対

- checkout_grant_confirmed (js/billing.js)
  戻ってから90秒以内に、買った品の権利が実際に付いたとき。
  plan_type と subject_id と waited_ms。waited_ms は webhook の遅さそのもの

- checkout_grant_timeout (js/billing.js)
  90秒待っても付かなかったとき。1件でも立ったら、その人は払ったのに
  使えていない。原因の候補は STRIPE_SETUP の署名シークレット未登録、
  イベントの未購読、applyOneTimePurchase が ok:false で 200 を返す3経路

## 注意

- 科目別の内訳を GA4 の画面で見るには、カスタム定義にパラメータを登録する
  必要がある (社長の手)。登録しないとイベント数だけが見える
- ガイドの4頁と legal の3頁にも計測が入った (ガイドは 10/17、legal は
  10/25)。だから検索の着地も、いまはこの数字に入る。入っているかは
  functions/__tests__/analytics-coverage.test.js が見張っている
- ただし「索引されているか」はここでは分からない。GA4 は来た人を数える
  道具で、来ていない理由は見えない。それは Search Console でしか読めず、
  手順は docs/SEARCH_CONSOLE_SETUP.md に書いた (社長の手)
