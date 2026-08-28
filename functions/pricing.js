/**
 * Cloud Functions 用料金（config/pricing.js と同一。_dev/sync-shared.py で同期）
 * 編集は config/pricing.js のみ行い、デプロイ前に sync すること。
 */
module.exports = require("./pricing-shared.js");
