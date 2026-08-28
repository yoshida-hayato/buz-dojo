/**
 * 問題指摘の管理者設定
 *
 * 1. config/admin-config.js の REPORT_ADMIN_EMAILS に管理者のメールを追加
 * 2. firestore.rules の isReportAdmin() に同じメールを追加して deploy
 */
const REPORT_ADMIN_EMAILS = [
  "yoshida.hayato0126@gmail.com",
];
