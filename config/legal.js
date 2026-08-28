/**
 * 法務ページ用の運営者情報
 *
 * 氏名・住所・電話は、特商法ページ上で「請求があれば遅滞なく開示」とします。
 * （副業等でサイト上に本名を常時掲出しない運用）
 */
const LEGAL_OPERATOR = {
  /**
   * サイト上に氏名を常時表示する場合のみ記入。
   * 空のときは特商法ページで「請求があれば開示」と表示します。
   */
  name: "",
  discloseNameOnRequest: true,
  serviceName: "ビジネス道場",
  siteUrl: "https://buz-dojo.web.app",
  contactPath: "/#contact",
  /** 返金検討の目安（購入日からの日数） */
  refundReviewDays: 7,
};
