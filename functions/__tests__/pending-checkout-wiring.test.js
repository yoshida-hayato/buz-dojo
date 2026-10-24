// 購入の意思を捨てる配線の見張り (js/auth.js)。
//
// 利用者がモーダルを自分で閉じる口は3つ (閉じるボタン / 背景クリック / Esc)。
// この3つは dismissModal を通ること。そして closeModal 自身は意思を捨てない
// こと。closeModal はログイン成功時にも呼ばれるので (onAuthStateChanged の
// 中)、そこで捨てると本来の再開が動かなくなる。振る舞いは
// pending-checkout-dismiss の1枚が見る。
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(
  path.join(__dirname, "..", "..", "js", "auth.js"),
  "utf8"
);

function bodyOf(name) {
  const head = "function " + name + "() {";
  const at = SRC.indexOf(head);
  expect(at).toBeGreaterThan(-1);
  const end = SRC.indexOf("\n    }", at);
  expect(end).toBeGreaterThan(at);
  return SRC.slice(at, end);
}

test("利用者が閉じる3つの口は dismissModal を通る", () => {
  expect(SRC).toContain('$("login-modal-close").addEventListener("click", dismissModal)');
  expect(SRC).toContain("if (e.target === modal) dismissModal()");
  expect(SRC).toContain('if (e.key === "Escape" && !modal.classList.contains("hidden")) dismissModal()');
});

test("閉じる3つの口は closeModal を直に呼ばない", () => {
  expect(SRC).not.toContain('$("login-modal-close").addEventListener("click", closeModal)');
  expect(SRC).not.toContain("if (e.target === modal) closeModal()");
  expect(SRC).not.toContain('if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal()');
});

test("dismissModal は意思を捨ててから閉じる", () => {
  const body = bodyOf("dismissModal");
  expect(body).toContain("Billing.clearPendingCheckout");
  expect(body).toContain("closeModal()");
  expect(body.indexOf("clearPendingCheckout")).toBeLessThan(body.indexOf("closeModal()"));
});

test("closeModal 自身は意思を捨てない (ログイン成功時の再開を殺さないため)", () => {
  expect(bodyOf("closeModal")).not.toContain("clearPendingCheckout");
});

test("ログイン成功の経路はいまも closeModal と再開の両方を呼ぶ", () => {
  const at = SRC.indexOf("onAuthStateChanged");
  expect(at).toBeGreaterThan(-1);
  const tail = SRC.slice(at);
  expect(tail).toContain("closeModal();");
  expect(tail).toContain("Billing.resumePendingCheckout");
  expect(tail.indexOf("closeModal();")).toBeLessThan(tail.indexOf("resumePendingCheckout"));
});
