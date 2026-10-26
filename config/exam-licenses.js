// 公開過去問を転載してよい試験の台帳 (一次情報を 2026-10-26 に確認)
//
// なぜ要るか:
//   「公表された試験問題は自由に使える」は俗説で、法律上の根拠が無い。
//   著作権法が権利の目的から外しているのは法令・告示・判決などで、試験問題は
//   入っていない。だから使えるかどうかは、実施団体が個別に許諾しているか
//   どうかで決まり、団体ごとに逆の答えになる。実際に、営利目的の使用を
//   はっきり断っている団体も、事前の許諾を必須にしている団体も在る。
//
//   ここは科目を足すときの門である。sourceType が公開過去問の科目は、
//   status が granted の試験しか名乗れない (テストが見張る)。
//
// 出典の書き方:
//   このファイルには URL を書かない (パッチ経路でドメインの字面が
//   リンク記法に化けるため)。団体名と頁の名前で辿れるようにしてある。
//   詳しい文面の写しは docs/EXAM_LICENSE_REGISTRY.md に在る。
//
// status の3段:
//   granted            = 許諾が明示されている (申請不要と書いてある)
//   requires-permission = 事前の許諾が必須と書いてある
//   denied             = 無断転載や営利目的の使用を断っている
//   unknown            = 記述を確認できなかった。確認できるまで使わない
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.ExamLicenses = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const GRANTED = "granted";
  const REQUIRES_PERMISSION = "requires-permission";
  const DENIED = "denied";
  const UNKNOWN = "unknown";

  const EXAM_LICENSES = {
    "ipa-joho-shori": {
      examLabel: "情報処理技術者試験・情報処理安全確保支援士試験",
      body: "情報処理推進機構",
      status: GRANTED,
      needsApplication: false,
      needsFee: false,
      needsAttribution: true,
      needsModificationNotice: true,
      attributionExample: "出典: 平成31年度 春期 基本情報技術者試験 午前 問1",
      note:
        "過去問題の頁と、試験のよくある質問の その他 に明記。許諾も使用料も" +
        "不要だが、著作権は放棄していないと書いてあり、出典の明記と、改変した" +
        "場合はその旨の明記が条件。商用可とは書いていない。許す範囲を" +
        "教育目的など、試験制度の意義に反しない限り と限定している。" +
        "非公開の回 (令和2年度から令和4年度の情報セキュリティマネジメントと" +
        "基本情報) は対象外。解答例や採点講評が同じ条件に入るかは不明",
    },
    "jafp-fp": {
      examLabel: "FP技能検定 (日本FP協会が実施した回)",
      body: "日本ファイナンシャル・プランナーズ協会",
      status: GRANTED,
      needsApplication: false,
      needsFee: false,
      needsAttribution: true,
      needsModificationNotice: true,
      note:
        "試験問題の利用について という配布文書に、協会への申請は不要と明記。" +
        "出典の明記と、修正や加工をした場合はその旨の明記が条件。商用の可否は" +
        "書かれていない。2級と3級の学科は別団体との共通問題で、両団体が" +
        "著作権を持つと書いてあるので、そちらの条件も要る",
    },
    "moj-shiho": {
      examLabel: "司法試験ほか法務省が実施する試験",
      body: "法務省",
      status: GRANTED,
      needsApplication: false,
      needsFee: false,
      needsAttribution: true,
      needsModificationNotice: true,
      note:
        "サイト全体に公共データ利用規約が適用され、商用利用も可と明記されて" +
        "いる。出典の記載と、加工した場合はその旨の記載が条件。第三者が権利を" +
        "持つ部分は利用者が自分で許諾を取る",
    },
    "mhlw-kokushi": {
      examLabel: "医師国家試験ほか厚生労働省が所管する国家試験",
      body: "厚生労働省",
      status: GRANTED,
      needsApplication: false,
      needsFee: false,
      needsAttribution: true,
      needsModificationNotice: true,
      note:
        "サイト全体に公共データ利用規約が適用され、商用利用も可と明記。" +
        "別冊の図は掲載にあたり一部が非公表または加工されていると注記が在る",
    },
    "nissho-boki": {
      examLabel: "日商簿記検定",
      body: "日本商工会議所",
      status: DENIED,
      needsAttribution: true,
      note:
        "1級の一部の回だけ公開しており、その頁に 紙媒体、インターネット等への" +
        "無断転載や営利目的の使用は固くお断りいたします と書いてある。" +
        "2級と3級は問題そのものを公開していない。有料のサービスに載せるのは" +
        "明示的に断られている側なので、足さない",
    },
    "gyosei-shoshi": {
      examLabel: "行政書士試験",
      body: "行政書士試験研究センター",
      status: REQUIRES_PERMISSION,
      needsAttribution: true,
      note:
        "書籍やホームページへの登載はセンターの許諾が必要と明記。著作権は" +
        "センターに帰属すると書いてある。公開版は著作権の関係で一部の問題を" +
        "外している。許諾を取るまで足さない",
    },
    takken: {
      examLabel: "宅地建物取引士資格試験",
      body: "不動産適正取引推進機構",
      status: DENIED,
      needsAttribution: true,
      note:
        "過去問題の頁に転載の条項は無いが、サイトの著作権の頁で、私的使用や" +
        "引用など著作権法上認められた行為を除き無断で転載できない、無断で" +
        "改変できないと書いてある。出題は転載にあたるので足さない",
    },
    "kinzai-fp": {
      examLabel: "FP技能検定 (金融財政事情研究会が実施した回)",
      body: "金融財政事情研究会",
      status: UNKNOWN,
      needsAttribution: true,
      note:
        "技能検定試験問題の使用について という頁が在るはずだが、本文を" +
        "確認できなかった。確認できるまで足さない",
    },
    shindanshi: {
      examLabel: "中小企業診断士試験",
      body: "中小企業診断協会",
      status: UNKNOWN,
      needsAttribution: true,
      note: "ロボット向けの設定で頁を取得できず、条件を確認できなかった",
    },
    sharoshi: {
      examLabel: "社会保険労務士試験",
      body: "社会保険労務士試験オフィシャルサイト",
      status: UNKNOWN,
      needsAttribution: true,
      note: "過去問題の公開・著作権・転載についての記述を確認できなかった",
    },
  };

  function get(key) {
    return EXAM_LICENSES[key] || null;
  }

  // 公開過去問として転載してよいか。granted 以外は全部 false
  function mayReproduce(key) {
    const row = get(key);
    return Boolean(row && row.status === GRANTED);
  }

  function keysByStatus(status) {
    return Object.keys(EXAM_LICENSES).filter(
      (k) => EXAM_LICENSES[k].status === status
    );
  }

  return {
    EXAM_LICENSES,
    GRANTED,
    REQUIRES_PERMISSION,
    DENIED,
    UNKNOWN,
    STATUSES: [GRANTED, REQUIRES_PERMISSION, DENIED, UNKNOWN],
    get,
    mayReproduce,
    keysByStatus,
  };
});
