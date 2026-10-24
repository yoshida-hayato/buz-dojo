// 決済から戻ったあと、権利が本当に付いたかを見張る振る舞いのガード。
//
// 付与は webhook がやるので、戻った時点ではまだ付いていない。付かないまま
// 終わる経路は実在する (functions/index.js の applyOneTimePurchase が
// ok:false でも 200 を返すので Stripe は再送しない)。見張りが無いと、
// 払ったのに付かなかった回は画面にもログにも1件も残らない。売上0件の
// いま、最初の1件を落としたことに気づけないのが一番高い損である。
const { boot, text, GRANT_KEY } = require("../test-helpers/grant-dom");

test("決済へ飛ぶ直前に、何を買ったかを控える", async () => {
  const h = boot();
  await h.api.startCheckout("subject", "sap");
  const row = JSON.parse(h.store[GRANT_KEY]);
  expect(row.planType).toBe("subject");
  expect(row.subjectId).toBe("sap");
});

test("付与が着いたら、確認の1件を残して帯を出す", () => {
  const h = boot({
    search: "?checkout=success&session_id=cs_1",
    seed: { planType: "subject", subjectId: "sap" },
  });
  h.tick(2000);
  expect(h.banner()).toBeNull();
  h.grant({ pack: false, subjects: { sap: { status: "active" } } });
  h.tick(2000);
  expect(h.names()).toContain("checkout_grant_confirmed");
  expect(h.names()).not.toContain("checkout_grant_timeout");
  expect(text(h.banner())).toContain("反映されました");
  expect(h.store[GRANT_KEY]).toBeUndefined();
});

test("90秒待っても付かなければ、取りこぼしの1件を残して次の手を出す", () => {
  const h = boot({
    search: "?checkout=success&session_id=cs_1",
    seed: { planType: "pack", subjectId: "" },
  });
  h.tick(95000);
  expect(h.names()).toContain("checkout_grant_timeout");
  expect(h.names()).not.toContain("checkout_grant_confirmed");
  const b = h.banner();
  expect(b.className).toContain("is-late");
  expect(text(b)).toContain("お問い合わせ");
  expect(text(b)).toContain("再読み込み");
  expect(text(b)).toContain("もう一度購入しないで");
});

test("買った1件だけを見る (別の科目を持っている人を取り違えない)", () => {
  const h = boot({
    search: "?checkout=success",
    ent: { pack: false, subjects: { "excel-functions": { status: "active" } } },
    seed: { planType: "subject", subjectId: "sap" },
  });
  h.tick(95000);
  expect(h.names()).toContain("checkout_grant_timeout");
});

test("控えが無い回は、見張りも帯も出さない (別のタブで戻った人など)", () => {
  const h = boot({ search: "?checkout=success" });
  h.tick(95000);
  expect(h.names()).not.toContain("checkout_grant_timeout");
  expect(h.names()).not.toContain("checkout_grant_confirmed");
  expect(h.banner()).toBeNull();
});

test("取り消して戻った回は、見張らない", () => {
  const h = boot({
    search: "?checkout=cancel",
    seed: { planType: "pack", subjectId: "" },
  });
  h.tick(95000);
  expect(h.names()).not.toContain("checkout_grant_timeout");
});
