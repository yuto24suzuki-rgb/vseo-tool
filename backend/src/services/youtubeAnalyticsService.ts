import { google } from 'googleapis';

function createAuth() {
  const auth = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  return auth;
}

function dateRange(days: number) {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

function n(v: unknown): number {
  return Number(v ?? 0);
}

export interface ChannelDailyMetrics {
  date: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  comments: number;
  shares: number;
  cardImpressions: number;
  cardClicks: number;
  cardClickRate: number;
}

export interface VideoMetrics {
  videoId: string;
  title: string;
  publishedAt: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
}

export interface TrafficSourceMetrics {
  source: string;
  views: number;
  estimatedMinutesWatched: number;
}

export interface GeographyMetrics {
  country: string;
  views: number;
  estimatedMinutesWatched: number;
}

export function isYouTubeConfigured(): boolean {
  return !!(
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_REFRESH_TOKEN &&
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID
  );
}

export async function getChannelDailyMetrics(): Promise<ChannelDailyMetrics[]> {
  const auth = createAuth();
  const analyticsApi = google.youtubeAnalytics({ version: 'v2', auth });
  const { startDate, endDate } = dateRange(90);
  const channelId = process.env.YOUTUBE_CHANNEL_ID ?? 'mine';

  const res = await analyticsApi.reports.query({
    ids: `channel==${channelId}`,
    startDate,
    endDate,
    metrics: [
      'views',
      'estimatedMinutesWatched',
      'averageViewDuration',
      'averageViewPercentage',
      'subscribersGained',
      'subscribersLost',
      'likes',
      'comments',
      'shares',
      'cardImpressions',
      'cardClicks',
      'cardClickRate',
    ].join(','),
    dimensions: 'day',
    sort: 'day',
  });

  return (res.data.rows ?? []).map((row) => ({
    date: String(row[0]),
    views: n(row[1]),
    estimatedMinutesWatched: n(row[2]),
    averageViewDuration: n(row[3]),
    averageViewPercentage: n(row[4]),
    subscribersGained: n(row[5]),
    subscribersLost: n(row[6]),
    likes: n(row[7]),
    comments: n(row[8]),
    shares: n(row[9]),
    cardImpressions: n(row[10]),
    cardClicks: n(row[11]),
    cardClickRate: n(row[12]),
  }));
}

export async function getVideoMetrics(): Promise<VideoMetrics[]> {
  const auth = createAuth();
  const analyticsApi = google.youtubeAnalytics({ version: 'v2', auth });
  const youtubeApi = google.youtube({ version: 'v3', auth });
  const { startDate, endDate } = dateRange(90);
  const channelId = process.env.YOUTUBE_CHANNEL_ID ?? 'mine';

  const res = await analyticsApi.reports.query({
    ids: `channel==${channelId}`,
    startDate,
    endDate,
    metrics: [
      'views',
      'estimatedMinutesWatched',
      'averageViewDuration',
      'averageViewPercentage',
      'likes',
      'comments',
      'shares',
      'subscribersGained',
    ].join(','),
    dimensions: 'video',
    sort: '-views',
    maxResults: 50,
  });

  const rows = res.data.rows ?? [];
  if (rows.length === 0) return [];

  const videoIds = rows.map((row) => String(row[0]));

  // Fetch titles in batches of 50 (API limit)
  const titlesMap = new Map<string, { title: string; publishedAt: string }>();
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const titlesRes = await youtubeApi.videos.list({ part: ['snippet'], id: batch });
    for (const item of titlesRes.data.items ?? []) {
      titlesMap.set(item.id!, {
        title: item.snippet?.title ?? '(不明)',
        publishedAt: (item.snippet?.publishedAt ?? '').split('T')[0],
      });
    }
  }

  return rows.map((row) => {
    const videoId = String(row[0]);
    const info = titlesMap.get(videoId) ?? { title: '(不明)', publishedAt: '' };
    return {
      videoId,
      title: info.title,
      publishedAt: info.publishedAt,
      views: n(row[1]),
      estimatedMinutesWatched: n(row[2]),
      averageViewDuration: n(row[3]),
      averageViewPercentage: n(row[4]),
      likes: n(row[5]),
      comments: n(row[6]),
      shares: n(row[7]),
      subscribersGained: n(row[8]),
    };
  });
}

export async function getTrafficSources(): Promise<TrafficSourceMetrics[]> {
  const auth = createAuth();
  const analyticsApi = google.youtubeAnalytics({ version: 'v2', auth });
  const { startDate, endDate } = dateRange(28);
  const channelId = process.env.YOUTUBE_CHANNEL_ID ?? 'mine';

  const res = await analyticsApi.reports.query({
    ids: `channel==${channelId}`,
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched',
    dimensions: 'insightTrafficSourceType',
    sort: '-views',
  });

  return (res.data.rows ?? []).map((row) => ({
    source: String(row[0]),
    views: n(row[1]),
    estimatedMinutesWatched: n(row[2]),
  }));
}

export async function getGeographyMetrics(): Promise<GeographyMetrics[]> {
  const auth = createAuth();
  const analyticsApi = google.youtubeAnalytics({ version: 'v2', auth });
  const { startDate, endDate } = dateRange(28);
  const channelId = process.env.YOUTUBE_CHANNEL_ID ?? 'mine';

  const res = await analyticsApi.reports.query({
    ids: `channel==${channelId}`,
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched',
    dimensions: 'country',
    sort: '-views',
    maxResults: 30,
  });

  return (res.data.rows ?? []).map((row) => ({
    country: String(row[0]),
    views: n(row[1]),
    estimatedMinutesWatched: n(row[2]),
  }));
}

