import { google } from 'googleapis';
import type {
  ChannelDailyMetrics,
  VideoMetrics,
  TrafficSourceMetrics,
  GeographyMetrics,
} from './youtubeAnalyticsService';

type CellValue = string | number;

function createSheets() {
  const auth = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  return google.sheets({ version: 'v4', auth });
}

const SPREADSHEET_ID = () => process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;

async function ensureSheet(
  sheets: ReturnType<typeof createSheets>,
  title: string
): Promise<void> {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID() });
  const exists = spreadsheet.data.sheets?.some((s) => s.properties?.title === title);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID(),
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
  }
}

async function writeSheet(
  sheets: ReturnType<typeof createSheets>,
  sheetName: string,
  data: CellValue[][]
): Promise<void> {
  await ensureSheet(sheets, sheetName);
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID(),
    range: `'${sheetName}'!A:Z`,
  });
  if (data.length === 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID(),
    range: `'${sheetName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: data },
  });
}

function pct(v: number): number {
  return Math.round(v * 100) / 100;
}

export async function writeChannelDailyMetrics(metrics: ChannelDailyMetrics[]): Promise<void> {
  const sheets = createSheets();
  const headers: CellValue[] = [
    '日付',
    '視聴回数',
    '視聴時間(分)',
    '平均視聴時間(秒)',
    '平均視聴率(%)',
    '登録者増加',
    '登録者減少',
    '純増登録者',
    'いいね',
    'コメント',
    'シェア',
    'カードインプレッション',
    'カードクリック',
    'カードCTR(%)',
  ];
  const rows: CellValue[][] = metrics.map((m) => [
    m.date,
    m.views,
    m.estimatedMinutesWatched,
    Math.round(m.averageViewDuration),
    pct(m.averageViewPercentage),
    m.subscribersGained,
    m.subscribersLost,
    m.subscribersGained - m.subscribersLost,
    m.likes,
    m.comments,
    m.shares,
    m.cardImpressions,
    m.cardClicks,
    pct(m.cardClickRate),
  ]);
  await writeSheet(sheets, 'チャンネル概要（日別）', [headers, ...rows]);
}

export async function writeVideoMetrics(metrics: VideoMetrics[]): Promise<void> {
  const sheets = createSheets();
  const headers: CellValue[] = [
    '動画ID',
    'タイトル',
    '公開日',
    '視聴回数',
    '視聴時間(分)',
    '平均視聴時間(秒)',
    '平均視聴率(%)',
    'いいね',
    'コメント',
    'シェア',
    '登録者増加',
  ];
  const rows: CellValue[][] = metrics.map((m) => [
    m.videoId,
    m.title,
    m.publishedAt,
    m.views,
    m.estimatedMinutesWatched,
    Math.round(m.averageViewDuration),
    pct(m.averageViewPercentage),
    m.likes,
    m.comments,
    m.shares,
    m.subscribersGained,
  ]);
  await writeSheet(sheets, '動画別パフォーマンス', [headers, ...rows]);
}

const TRAFFIC_SOURCE_LABELS: Record<string, string> = {
  EXT_URL: '外部リンク',
  NO_LINK_EMBEDDED: '埋め込み動画',
  NO_LINK_OTHER: 'その他 YouTube 機能',
  RELATED_VIDEO: '関連動画',
  YT_CHANNEL: 'チャンネルページ',
  YT_OTHER_PAGE: 'YouTube その他のページ',
  YT_SEARCH: 'YouTube 検索',
  SUBSCRIBER: '通知',
  PLAYLIST: 'プレイリスト',
  YT_SHORTS: 'YouTube Shorts',
  CAMPAIGN_CARD: 'キャンペーンカード',
  END_SCREEN: '終了画面',
  HASHTAGS: 'ハッシュタグ',
  SOUND_PAGE: 'サウンドページ',
};

export async function writeTrafficSources(metrics: TrafficSourceMetrics[]): Promise<void> {
  const sheets = createSheets();
  const totalViews = metrics.reduce((s, m) => s + m.views, 0);
  const headers: CellValue[] = [
    '流入元タイプ',
    '流入元（日本語）',
    '視聴回数',
    '視聴時間(分)',
    '割合(%)',
  ];
  const rows: CellValue[][] = metrics.map((m) => [
    m.source,
    TRAFFIC_SOURCE_LABELS[m.source] ?? m.source,
    m.views,
    m.estimatedMinutesWatched,
    totalViews > 0 ? pct((m.views / totalViews) * 100) : 0,
  ]);
  await writeSheet(sheets, 'トラフィックソース', [headers, ...rows]);
}

export async function writeGeography(metrics: GeographyMetrics[]): Promise<void> {
  const sheets = createSheets();
  const totalViews = metrics.reduce((s, m) => s + m.views, 0);
  const headers: CellValue[] = ['国コード', '視聴回数', '視聴時間(分)', '割合(%)'];
  const rows: CellValue[][] = metrics.map((m) => [
    m.country,
    m.views,
    m.estimatedMinutesWatched,
    totalViews > 0 ? pct((m.views / totalViews) * 100) : 0,
  ]);
  await writeSheet(sheets, '視聴者の地域', [headers, ...rows]);
}
