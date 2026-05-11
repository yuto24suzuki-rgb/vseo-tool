// ============================================================
// バレット ショート広告 AI判断スクリプト【v4 広告設定最適化版】
// 改善点（v3→v4）:
//   1. 【アクション】を広告設定側（予算・入札・ターゲティング等）に限定
//   2. 週次トレンドサマリーを最新測定期間のみ対象に絞る
//   3. ターゲティング設定（興味/関心・詳しいユーザー属性）の入力と削除推奨を追加
// ============================================================

// ▼▼▼ ここだけ設定してください ▼▼▼
const API_KEY            = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
const DATA_SHEET_NAME    = "進捗管理（各週・個別）";
const SUMMARY_SHEET_NAME = "週次トレンドサマリー";
const RESULT_COL_HEADER  = "AI判断";
const WEEKS_FOR_TREND    = 2;
// ▲▲▲ 設定ここまで ▲▲▲


// ============================================================
// ターゲティング設定
// 現在設定している「興味/関心」と「詳しいユーザー属性」を記載してください
// 広告フェーズが進んだ際、どれを削除すべきかをAIが提案します
// ============================================================
const TARGETING_SETTINGS = {
  // 興味/関心カテゴリ（Google広告の設定値）
  interests: [
    "プログラマー求人",
    "就職活動",
    "doda",
    "ビズリーチ",
    "正社員求人",
    "リクナビ",
  ],

  // 詳しいユーザー属性（Google広告の設定値）
  detailedDemographics: [
    "IT、技術系の求人情報",
    "就職相談サービス",
    "人材サービス、リクルート サービス",
    "企業ソフトウェア",
    "ネットワーク システム、サービス",
    "ネットワーク装置、仮想化",
    "近々退職予定",
    "転職",
    "近々転職予定",
    "最近転職した",
    "ソフトウェア",
    "アプリケーションソフトウェア",
    "求人情報",
    "ソフトウェア開発",
    "転職支援サービス",
  ],
};


// ============================================================
// 判断基準定数
// ============================================================
const THRESHOLDS = {
  // --- 基本KPI ---
  ctr:         { good: 0.3,  excellent: 0.5  },   // %
  cvRate:      { good: 0.5,  excellent: 1.0  },   // %
  cvCost:      { good: 1000, excellent: 500  },   // 円（低いほど良）
  viewRate100: { good: 15,   excellent: 30   },   // %

  // --- タッチポイント効率 ---
  honpenCost:       { good: 500, excellent: 200 }, // 本編視聴単価（円）
  interactionToView: { good: 3,  excellent: 8   }, // インタラクション→本編視聴 転換率(%)

  // --- サンプル信頼性 ---
  minImpressions: 5000,   // これ未満は「学習期間中」と判定
  minClicks:      30,     // これ未満はCTR信頼性低
  minCv:          5,      // これ未満はCV率・CV単価の信頼性低

  // --- フェーズ判定（履歴週数で判断）---
  phase: {
    initial:  1,   // 1週目 = 初週（基準緩め）
    growth:   3,   // 2-3週目 = 成長期（通常基準）
    mature:   6,   // 4-6週目 = 成熟期（厳しめ基準）
    // 7週目以降 = 衰退期（停止を積極検討）
  },

  stopWeeks: 3, // n週連続で全KPI未達なら停止推奨
};


// ============================================================
// メイン関数
// ============================================================
function analyzeAds() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DATA_SHEET_NAME);

  if (!sheet) {
    SpreadsheetApp.getUi().alert("シートが見つかりません。DATA_SHEET_NAMEを確認してください。");
    return;
  }

  const data          = sheet.getDataRange().getValues();
  const groupHeaders  = data[0];
  const detailHeaders = data[1];

  const columnNames = detailHeaders.map((detail, idx) => {
    const group = groupHeaders[idx];
    if (group === "動画再生時間の割合") {
      let label = detail;
      if (typeof detail === "number") {
        label = Math.round(detail * 100) + "%";
      } else if (typeof detail === "string" && detail.trim() !== "") {
        const num = parseFloat(detail);
        if (!isNaN(num) && !detail.includes("%")) {
          label = Math.round(num * 100) + "%";
        }
      }
      return `動画再生時間の割合_${label}`;
    }
    return detail || group || `列${idx + 1}`;
  });

  let resultColIndex = columnNames.indexOf(RESULT_COL_HEADER);
  if (resultColIndex === -1) {
    resultColIndex = columnNames.length;
    sheet.getRange(2, resultColIndex + 1).setValue(RESULT_COL_HEADER);
  }

  const summarySheet = getOrCreateSummarySheet(ss);
  const historyMap   = loadHistoryFromSummary(summarySheet);
  const titleIdx     = columnNames.indexOf("タイトル");
  const periodIdx    = columnNames.indexOf("測定期間");

  // ▼ v4追加：最新の測定期間のみ処理対象とする
  const latestPeriod = findLatestPeriod(data, periodIdx);
  if (!latestPeriod) {
    SpreadsheetApp.getUi().alert("測定期間が見つかりません。シートを確認してください。");
    return;
  }

  let processedCount = 0;

  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (titleIdx === -1 || !row[titleIdx] || row[titleIdx] === "") continue;

    // 最新の測定期間以外はスキップ
    const rowPeriod = periodIdx !== -1 ? String(row[periodIdx]) : "";
    if (rowPeriod !== latestPeriod) continue;

    const title   = row[titleIdx];
    const period  = row[periodIdx] || "";
    const adData  = formatRowData(columnNames, row);
    const history = historyMap[title] || [];

    const metrics    = extractMetrics(columnNames, row);
    const supplement = buildSupplementInfo(metrics, history.length);

    const judgment = callClaude(adData, supplement, history, title);

    sheet.getRange(i + 1, resultColIndex + 1).setValue(judgment);
    appendToSummary(summarySheet, title, period, columnNames, row, judgment);

    processedCount++;
    Utilities.sleep(600);
  }

  SpreadsheetApp.getUi().alert(
    `分析完了！${processedCount}件を分析しました（測定期間: ${latestPeriod}）。\n「${RESULT_COL_HEADER}」列と「${SUMMARY_SHEET_NAME}」シートを確認してください。`
  );
}


// ============================================================
// 最新の測定期間を特定する
// ============================================================
function findLatestPeriod(data, periodIdx) {
  if (periodIdx === -1) return null;

  const periods = [];
  for (let i = 2; i < data.length; i++) {
    const val = data[i][periodIdx];
    if (val && String(val).trim() !== "") {
      periods.push(String(val).trim());
    }
  }

  if (periods.length === 0) return null;

  // 重複除去してソート（文字列ソートで日付形式に対応）
  const unique = [...new Set(periods)].sort();
  return unique[unique.length - 1];
}


// ============================================================
// 数値データを抽出する
// ============================================================
function extractMetrics(columnNames, row) {
  const get = (colName) => {
    const idx = columnNames.indexOf(colName);
    return (idx !== -1 && row[idx] !== "" && row[idx] !== null) ? Number(row[idx]) : null;
  };

  const impressions  = get("表示回数");
  const clicks       = get("クリック数");
  const cost         = get("費用");
  const cv           = get("CV数（ch登録）");
  const interaction  = get("インタラクション");
  const honpenViews  = get("広告視聴後の動画視聴");
  const viewRate100  = get("動画再生時間の割合_100%");

  const honpenCost = (cost && honpenViews && honpenViews > 0)
    ? Math.round(cost / honpenViews) : null;
  const interactionToViewRate = (interaction && honpenViews && interaction > 0)
    ? Math.round((honpenViews / interaction) * 100 * 10) / 10 : null;

  return {
    impressions, clicks, cost, cv, interaction, honpenViews, viewRate100,
    honpenCost, interactionToViewRate,
  };
}


// ============================================================
// 補助情報（サンプル信頼性・フェーズ・複合パターン・タッチポイント効率）を構築
// ============================================================
function buildSupplementInfo(m, historyWeeks) {
  const lines = [];

  // ① サンプル信頼性チェック
  lines.push("【サンプル信頼性】");
  const sampleIssues = [];
  if (m.impressions !== null && m.impressions < THRESHOLDS.minImpressions) {
    sampleIssues.push(`表示回数${m.impressions}件（基準${THRESHOLDS.minImpressions}件未満）→ 学習期間中の可能性あり`);
  }
  if (m.clicks !== null && m.clicks < THRESHOLDS.minClicks) {
    sampleIssues.push(`クリック数${m.clicks}件（基準${THRESHOLDS.minClicks}件未満）→ CTRの信頼性が低い`);
  }
  if (m.cv !== null && m.cv < THRESHOLDS.minCv) {
    sampleIssues.push(`CV数${m.cv}件（基準${THRESHOLDS.minCv}件未満）→ CV率・CV単価の信頼性が低い`);
  }
  if (sampleIssues.length === 0) {
    lines.push("サンプル十分 → 通常基準で判断可能");
  } else {
    lines.push(...sampleIssues);
    lines.push("※ 上記の信頼性課題がある指標は判断の重みを下げ、信頼できる指標を優先してください");
  }

  // ② 広告フェーズ判定
  lines.push("\n【広告フェーズ】");
  const totalWeeks = historyWeeks + 1;
  let phase, phaseGuidance;
  if (totalWeeks <= THRESHOLDS.phase.initial) {
    phase = "初週（データ蓄積期）";
    phaseGuidance = "判断基準を20%緩め、データ蓄積を優先してください。停止判断は原則行わないでください。";
  } else if (totalWeeks <= THRESHOLDS.phase.growth) {
    phase = "成長期（2-3週目）";
    phaseGuidance = "通常の判断基準を適用してください。改善の余地があれば設定変更を優先します。";
  } else if (totalWeeks <= THRESHOLDS.phase.mature) {
    phase = "成熟期（4-6週目）";
    phaseGuidance = "判断基準を10%厳しくしてください。効果が横ばいなら停止を検討します。";
  } else {
    phase = "衰退期（7週目以降）";
    phaseGuidance = "クリエイティブの疲弊が想定されます。明確な改善がない限り停止を積極的に検討してください。";
  }
  lines.push(`出稿${totalWeeks}週目 → ${phase}`);
  lines.push(phaseGuidance);

  // ③ タッチポイント効率の数値化
  lines.push("\n【タッチポイント効率（計算済み）】");
  if (m.honpenCost !== null) {
    const hLabel = m.honpenCost <= THRESHOLDS.honpenCost.excellent ? "優秀"
                 : m.honpenCost <= THRESHOLDS.honpenCost.good      ? "良好"
                 : "要改善";
    lines.push(`本編視聴単価: ${m.honpenCost}円（基準: ${THRESHOLDS.honpenCost.good}円以下=良好 / ${THRESHOLDS.honpenCost.excellent}円以下=優秀）→ ${hLabel}`);
  } else {
    lines.push("本編視聴単価: 計算不可（本編視聴数0 or データなし）");
  }

  if (m.interactionToViewRate !== null) {
    const iLabel = m.interactionToViewRate >= THRESHOLDS.interactionToView.excellent ? "優秀"
                 : m.interactionToViewRate >= THRESHOLDS.interactionToView.good      ? "良好"
                 : "要改善";
    lines.push(`インタラクション→本編視聴 転換率: ${m.interactionToViewRate}%（基準: ${THRESHOLDS.interactionToView.good}%以上=良好 / ${THRESHOLDS.interactionToView.excellent}%以上=優秀）→ ${iLabel}`);
  } else {
    lines.push("インタラクション→本編視聴 転換率: 計算不可");
  }

  // ④ 複合パターン診断
  lines.push("\n【複合パターン診断】");
  const patterns = diagnoseCombinedPatterns(m);
  lines.push(...patterns);

  return lines.join("\n");
}


// ============================================================
// 指標の複合パターン診断
// ============================================================
function diagnoseCombinedPatterns(m) {
  const results = [];

  if (m.honpenViews === 0 || m.honpenViews === null) {
    if (m.cv && m.cv > 0) {
      results.push("パターン[クリックなし登録型]: 本編視聴なし＋CV有 → 広告自体でチャンネル登録を完結させている。CTAとエンドカードの最適化でさらに伸ばせる可能性あり");
    } else {
      results.push("パターン[タッチポイント未獲得型]: 本編視聴・CVともに低い → 広告訴求と本編の関連性・CTA文言を見直す必要あり");
    }
  } else if (m.honpenViews > 10 && m.cv && m.cv > 5) {
    results.push("パターン[理想型]: タッチポイント獲得＋CV双方で成果あり → 現状設定を維持しつつスケールを検討");
  } else if (m.honpenViews > 10 && (!m.cv || m.cv <= 3)) {
    results.push("パターン[視聴獲得型・CV弱]: 本編へは誘導できているがCVにつながっていない → 本編動画の登録訴求・エンドカードを改善する");
  } else if ((m.honpenViews === 0 || m.honpenViews < 5) && m.cv && m.cv > 5) {
    results.push("パターン[CV特化型]: 本編視聴は少ないがCV率が高い → チャンネル登録目的には有効。本編誘導を強化するか目的を割り切るか検討");
  }

  return results.length > 0 ? results : ["パターン判定: データ不足のため診断不可"];
}


// ============================================================
// 行データを整形する
// ============================================================
function formatRowData(columnNames, row) {
  const targetMap = {
    "測定期間":                   "測定期間",
    "タイトル":                   "広告タイトル",
    "ステータス":                 "ステータス",
    "クリック数":                 "クリック数",
    "表示回数":                   "表示回数（インプレッション）",
    "クリック率":                 "クリック率（CTR）",
    "平均クリック単価":           "平均クリック単価（CPC）",
    "費用":                       "費用（円）",
    "CV数（ch登録）":             "CV数（チャンネル登録）",
    "CV率":                       "CV率",
    "インタラクション":           "インタラクション数",
    "CV単価":                     "CV単価（円）",
    "動画再生時間の割合_25%":     "動画視聴完了率_25%",
    "動画再生時間の割合_50%":     "動画視聴完了率_50%",
    "動画再生時間の割合_75%":     "動画視聴完了率_75%",
    "動画再生時間の割合_100%":    "動画視聴完了率_100%",
    "広告視聴後のチャンネル登録": "広告視聴後チャンネル登録数",
    "広告視聴後の動画視聴":       "広告視聴後の本編動画視聴数",
  };

  const percentCols = new Set([
    "クリック率", "CV率",
    "動画再生時間の割合_25%", "動画再生時間の割合_50%",
    "動画再生時間の割合_75%", "動画再生時間の割合_100%",
  ]);

  return Object.entries(targetMap)
    .map(([colName, displayName]) => {
      const idx = columnNames.indexOf(colName);
      if (idx !== -1 && row[idx] !== "" && row[idx] !== null && row[idx] !== undefined) {
        let value = row[idx];
        if (percentCols.has(colName) && typeof value === "number" && value < 1) {
          value = (value * 100).toFixed(2) + "%";
        }
        return `${displayName}: ${value}`;
      }
      return null;
    })
    .filter(Boolean)
    .join("\n");
}


// ============================================================
// ターゲティング設定テキストを生成する
// ============================================================
function buildTargetingText() {
  const interests = TARGETING_SETTINGS.interests.filter(v => v && v.trim() !== "");
  const demographics = TARGETING_SETTINGS.detailedDemographics.filter(v => v && v.trim() !== "");

  if (interests.length === 0 && demographics.length === 0) {
    return "ターゲティング設定: 未入力（TARGETING_SETTINGSに設定してください）";
  }

  const lines = ["【現在のターゲティング設定】"];
  if (interests.length > 0) {
    lines.push("興味/関心:");
    interests.forEach(v => lines.push(`  - ${v}`));
  }
  if (demographics.length > 0) {
    lines.push("詳しいユーザー属性:");
    demographics.forEach(v => lines.push(`  - ${v}`));
  }
  lines.push("※ 学習初期はすべて維持推奨。学習が進んだ段階でパフォーマンスの低いセグメントを削除することで配信効率が上がります。");
  return lines.join("\n");
}


// ============================================================
// Claude API呼び出し
// ============================================================
function callClaude(adData, supplement, history, title) {
  const prompt = buildPrompt(adData, supplement, history, title);

  const payload = {
    model: "claude-opus-4-5",
    max_tokens: 1800,
    messages: [{ role: "user", content: prompt }],
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", options);
    const json     = JSON.parse(response.getContentText());
    return json.content?.[0]?.text || "エラー: " + JSON.stringify(json);
  } catch (e) {
    return "通信エラー: " + e.message;
  }
}


// ============================================================
// プロンプト（v4: 広告設定アクション・ターゲティング見直し追加）
// ============================================================
function buildPrompt(adData, supplement, history, title) {
  const trendSection = history.length > 0
    ? `\n【週次トレンド（過去${history.length}週分）】\n${history.join("\n")}\n※ 改善・悪化している指標を必ず言及してください。`
    : "";

  const targetingText = buildTargetingText();

  return `あなたはYouTube広告の運用アナリストです。
以下はエンジニア転職系YouTubeチャンネル「バレット」の「ショート切り抜き動画 × デマンドジェネレーション広告」の実績データです。

【この広告の目的】
1. YouTubeチャンネル本編への新規視聴者タッチポイントを獲得すること
2. チャンネル登録（CV）を増やすこと

【基本判断基準】
- クリック率（CTR）            : 0.3%以上=良好 / 0.5%以上=優秀
- CV率                        : 0.5%以上=良好 / 1.0%以上=優秀
- CV単価                      : 1,000円以下=良好 / 500円以下=優秀
- 動画視聴完了率100%          : 15%以上=良好 / 30%以上=優秀
- 本編視聴単価                : 500円以下=良好 / 200円以下=優秀
- インタラクション→本編転換率 : 3%以上=良好 / 8%以上=優秀

【今週の広告データ】（広告名: ${title}）
${adData}

【補助分析情報（システム計算済み）】
${supplement}
${trendSection}

${targetingText}

---
以下のフォーマットで回答してください（フォーマット厳守）：

【判断】継続 / 設定変更して継続 / 停止（いずれか1つのみ）
【確信度】高 / 中 / 低

【指標サマリー】
- CTR               : X.XX% → 良好/優秀/要改善（信頼性: 高/低）
- CV率              : X.XX% → 良好/優秀/要改善（信頼性: 高/低）
- CV単価            : XXX円 → 良好/優秀/要改善（信頼性: 高/低）
- 完了率100%        : X.X%  → 良好/優秀/要改善
- 本編視聴単価      : XXX円 → 良好/優秀/要改善/計算不可
- 本編転換率        : X.X%  → 良好/優秀/要改善/計算不可
${history.length > 0 ? "- 前週比           : 改善した指標 / 悪化した指標を明記" : ""}

【複合診断】
- 診断パターン名と1行の解釈を記載（補助情報の複合パターン診断を参考に）

【理由】
・タッチポイント観点（本編視聴単価・転換率・視聴完了率から）
・CV観点（CV率・CV単価から）
・フェーズ観点（現在のフェーズと基準への影響）

【広告設定アクション】（設定変更の場合のみ、最大2件）
※ 動画コンテンツではなく、Google広告の「設定側」でできる変更を提示してください
※ 例: 予算増減・入札戦略の変更・入札単価の調整・配信スケジュールの変更・配信地域の見直し・オーディエンスリストの追加/除外・フリークエンシーキャップの調整
1. [優先度:高/中/低][難易度:易/中/難][期待効果:大/中/小] 具体的な設定変更内容
2. [優先度:高/中/低][難易度:易/中/難][期待効果:大/中/小] 具体的な設定変更内容

【ターゲティング見直し】
※ 現在の設定済みターゲティングのうち、削除・維持すべきものを判断してください
※ 学習初期（1-3週）はすべて維持が原則。成熟期以降はパフォーマンスを根拠に削除を検討します
- 削除推奨: （削除してよいターゲティングとその理由。なければ「なし」）
- 維持推奨: （維持すべきターゲティングとその理由）
- 判断根拠: （現在のフェーズとパフォーマンスから1-2行で説明）

【次回確認】○日後`;
}


// ============================================================
// サマリーシートの取得または新規作成
// ============================================================
function getOrCreateSummarySheet(ss) {
  let sheet = ss.getSheetByName(SUMMARY_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SUMMARY_SHEET_NAME);
    const headers = [
      "記録日時", "測定期間", "広告タイトル",
      "CTR(%)", "CV率(%)", "CV単価(円)", "完了率100%(%)",
      "CV数", "本編視聴数", "費用(円)",
      "AI判断", "確信度"
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground("#4a4a4a")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}


// ============================================================
// サマリーシートへの追記
// ============================================================
function appendToSummary(summarySheet, title, period, columnNames, row, judgment) {
  const get = (colName) => {
    const idx = columnNames.indexOf(colName);
    return idx !== -1 ? row[idx] : "";
  };

  // スプレッドシートが小数で保持するパーセント列を実際の%値に変換
  // 例: 0.0031 → 0.31（CTR）、0.15 → 15（完了率）
  const getPercent = (colName) => {
    const val = get(colName);
    if (typeof val === "number" && val > 0 && val < 1) {
      return Math.round(val * 10000) / 100;
    }
    return val;
  };

  const confidenceMatch = judgment.match(/【確信度】(高|中|低)/);
  const confidence      = confidenceMatch ? confidenceMatch[1] : "不明";
  const labelMatch      = judgment.match(/【判断】(継続|設定変更して継続|停止)/);
  const label           = labelMatch ? labelMatch[1] : "不明";

  const newRow = [
    new Date(), period, title,
    getPercent("クリック率"), getPercent("CV率"), get("CV単価"),
    getPercent("動画再生時間の割合_100%"),
    get("CV数（ch登録）"), get("広告視聴後の動画視聴"), get("費用"),
    label, confidence,
  ];

  summarySheet.appendRow(newRow);

  const lastRow = summarySheet.getLastRow();
  const color   = label === "停止"           ? "#ffcccc"
                : label === "設定変更して継続" ? "#fff2cc"
                : "#d9ead3";
  summarySheet.getRange(lastRow, 1, 1, newRow.length).setBackground(color);
}


// ============================================================
// サマリーシートから履歴を読み込む（トレンド比較用）
// ============================================================
function loadHistoryFromSummary(summarySheet) {
  const data = summarySheet.getDataRange().getValues();
  if (data.length <= 1) return {};

  const historyMap = {};
  for (let i = 1; i < data.length; i++) {
    const [datetime, period, title, ctr, cvRate, cvCost, viewRate100, cvCount, honpenViews, cost, label, confidence] = data[i];
    if (!title) continue;

    const summary = `[${period}] CTR:${ctr}% / CV率:${cvRate}% / CV単価:${cvCost}円 / 完了率100%:${viewRate100}% / CV数:${cvCount} / 本編視聴:${honpenViews} / 費用:${cost}円 → 判断:${label}(確信度:${confidence})`;

    if (!historyMap[title]) historyMap[title] = [];
    historyMap[title].push(summary);
    if (historyMap[title].length > WEEKS_FOR_TREND) {
      historyMap[title].shift();
    }
  }
  return historyMap;
}


// ============================================================
// デバッグ用：列名が正しく生成されているか確認する関数
// ============================================================
function debugColumnNames() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DATA_SHEET_NAME);
  if (!sheet) { Logger.log('シートが見つかりません'); return; }

  const data          = sheet.getDataRange().getValues();
  const groupHeaders  = data[0];
  const detailHeaders = data[1];

  const columnNames = detailHeaders.map((detail, idx) => {
    const group = groupHeaders[idx];
    if (group === '動画再生時間の割合') {
      let label = detail;
      if (typeof detail === 'number') {
        label = Math.round(detail * 100) + '%';
      } else if (typeof detail === 'string' && detail.trim() !== '') {
        const num = parseFloat(detail);
        if (!isNaN(num) && !detail.includes('%')) {
          label = Math.round(num * 100) + '%';
        }
      }
      return '動画再生時間の割合_' + label;
    }
    return detail || group || '列' + (idx + 1);
  });

  Logger.log('=== 生成された列名一覧 ===');
  columnNames.forEach((name, idx) => Logger.log('列' + (idx+1) + ': ' + name));

  ['25%','50%','75%','100%'].forEach(p => {
    const key   = '動画再生時間の割合_' + p;
    const found = columnNames.indexOf(key);
    Logger.log(key + ' → ' + (found !== -1 ? '列' + (found+1) + 'で発見✅' : '❌ 見つからない'));
  });
}


// ============================================================
// デバッグ用：最新測定期間の確認
// ============================================================
function debugLatestPeriod() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DATA_SHEET_NAME);
  if (!sheet) { Logger.log('シートが見つかりません'); return; }

  const data          = sheet.getDataRange().getValues();
  const detailHeaders = data[1];
  const columnNames   = detailHeaders.map((d, i) => d || `列${i+1}`);
  const periodIdx     = columnNames.indexOf("測定期間");

  const latest = findLatestPeriod(data, periodIdx);
  Logger.log('最新の測定期間: ' + latest);
}


// ============================================================
// 初回のみ実行：APIキーを安全に保存する
// ============================================================
function setApiKey() {
  const ui     = SpreadsheetApp.getUi();
  const result = ui.prompt(
    "APIキー設定",
    "AnthropicのAPIキーを入力してください:",
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() === ui.Button.OK) {
    PropertiesService.getScriptProperties().setProperty(
      "ANTHROPIC_API_KEY",
      result.getResponseText().trim()
    );
    ui.alert("APIキーを保存しました！次回から自動で読み込まれます。");
  }
}
