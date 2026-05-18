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

// ── Milestone metrics ────────────────────────────────────────────────────────

export interface MilestoneWindow {
  views: number;
  estimatedMinutesWatched: number;
  averageViewPercentage: number;
}

export interface MilestoneMetrics {
  videoId: string;
  title: string;
  publishedAt: string;
  /** null = milestone not yet reached */
  h24: MilestoneWindow | null;
  d3: MilestoneWindow | null;
  d7: MilestoneWindow | null;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysBetween(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
}

function weightedAvgPct(pctSum: number, weight: number): number {
  return weight > 0 ? Math.round((pctSum / weight) * 100) / 100 : 0;
}

export async function getMilestoneMetrics(videos: VideoMetrics[]): Promise<MilestoneMetrics[]> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  // Only process videos published in the last 60 days (milestones of older videos don't change)
  const recentVideos = videos.filter((v) => {
    if (!v.publishedAt) return false;
    return new Date(v.publishedAt) >= sixtyDaysAgo;
  });

  if (recentVideos.length === 0) return [];

  const auth = createAuth();
  const analyticsApi = google.youtubeAnalytics({ version: 'v2', auth });
  const channelId = process.env.YOUTUBE_CHANNEL_ID ?? 'mine';

  const results: MilestoneMetrics[] = [];

  for (const video of recentVideos.slice(0, 30)) {
    const ageInDays = daysBetween(video.publishedAt, yesterdayStr);

    if (ageInDays < 1) {
      results.push({ videoId: video.videoId, title: video.title, publishedAt: video.publishedAt, h24: null, d3: null, d7: null });
      continue;
    }

    // Fetch daily data from publish day up to day 6 (= 7 calendar days) or yesterday
    const rawEnd = addDays(video.publishedAt, 6);
    const endDate = rawEnd < yesterdayStr ? rawEnd : yesterdayStr;

    try {
      const res = await analyticsApi.reports.query({
        ids: `channel==${channelId}`,
        startDate: video.publishedAt,
        endDate,
        metrics: 'views,estimatedMinutesWatched,averageViewPercentage',
        dimensions: 'day',
        filters: `video==${video.videoId}`,
        sort: 'day',
      });

      let h24V = 0, h24M = 0, h24P = 0, h24W = 0;
      let d3V = 0, d3M = 0, d3P = 0, d3W = 0;
      let d7V = 0, d7M = 0, d7P = 0, d7W = 0;

      for (const row of res.data.rows ?? []) {
        const diff = daysBetween(video.publishedAt, String(row[0]));
        const v = n(row[1]), m = n(row[2]), p = n(row[3]);

        if (diff === 0) { h24V += v; h24M += m; h24P += p * v; h24W += v; }
        if (diff <= 2)  { d3V  += v; d3M  += m; d3P  += p * v; d3W  += v; }
        if (diff <= 6)  { d7V  += v; d7M  += m; d7P  += p * v; d7W  += v; }
      }

      results.push({
        videoId: video.videoId,
        title: video.title,
        publishedAt: video.publishedAt,
        h24: ageInDays >= 1 ? { views: h24V, estimatedMinutesWatched: h24M, averageViewPercentage: weightedAvgPct(h24P, h24W) } : null,
        d3:  ageInDays >= 3 ? { views: d3V,  estimatedMinutesWatched: d3M,  averageViewPercentage: weightedAvgPct(d3P,  d3W)  } : null,
        d7:  ageInDays >= 7 ? { views: d7V,  estimatedMinutesWatched: d7M,  averageViewPercentage: weightedAvgPct(d7P,  d7W)  } : null,
      });
    } catch (err) {
      console.warn(`[analytics] milestone fetch failed for ${video.videoId}:`, err);
      results.push({ videoId: video.videoId, title: video.title, publishedAt: video.publishedAt, h24: null, d3: null, d7: null });
    }

    // Avoid YouTube Analytics API rate limit
    await new Promise((r) => setTimeout(r, 200));
  }

  return results;
}

// ── Viral / sudden-reach detection ─────────────────────────────────────────

export interface ViralVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  prev7dViews: number;
  last7dViews: number;
  growthRatio: number;
  detectedAt: string;
  note: string;
}

export async function detectViralVideos(): Promise<ViralVideo[]> {
  const auth = createAuth();
  const analyticsApi = google.youtubeAnalytics({ version: 'v2', auth });
  const youtubeApi = google.youtube({ version: 'v3', auth });
  const channelId = process.env.YOUTUBE_CHANNEL_ID ?? 'mine';

  const now = new Date();

  function dStr(daysAgo: number): string {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
  }

  // Fetch last 7 days and previous 7 days in parallel
  const [recentRes, prevRes] = await Promise.all([
    analyticsApi.reports.query({
      ids: `channel==${channelId}`,
      startDate: dStr(7),
      endDate: dStr(1),
      metrics: 'views,estimatedMinutesWatched',
      dimensions: 'video',
      sort: '-views',
      maxResults: 200,
    }),
    analyticsApi.reports.query({
      ids: `channel==${channelId}`,
      startDate: dStr(14),
      endDate: dStr(8),
      metrics: 'views,estimatedMinutesWatched',
      dimensions: 'video',
      sort: '-views',
      maxResults: 200,
    }),
  ]);

  const recentMap = new Map<string, number>();
  for (const row of recentRes.data.rows ?? []) {
    recentMap.set(String(row[0]), n(row[1]));
  }

  const prevMap = new Map<string, number>();
  for (const row of prevRes.data.rows ?? []) {
    prevMap.set(String(row[0]), n(row[1]));
  }

  const viral: Omit<ViralVideo, 'title' | 'publishedAt'>[] = [];

  for (const [videoId, lastViews] of recentMap) {
    if (lastViews < 50) continue;

    const prevViews = prevMap.get(videoId) ?? 0;
    let growthRatio: number;
    let note: string;

    if (prevViews === 0) {
      // Video had no views in prev window but has significant views now
      if (lastViews < 200) continue;
      growthRatio = 5.0; // sentinel for "newly discovered"
      note = '前週ゼロから急浮上';
    } else {
      growthRatio = Math.round((lastViews / prevViews) * 10) / 10;
      if (growthRatio < 2.0) continue;
      note = `前週比 ${growthRatio}x の急増`;
    }

    viral.push({
      videoId,
      prev7dViews: prevViews,
      last7dViews: lastViews,
      growthRatio,
      detectedAt: dStr(0),
      note,
    });
  }

  viral.sort((a, b) => b.growthRatio - a.growthRatio);

  if (viral.length === 0) return [];

  // Fetch titles
  const ids = viral.map((v) => v.videoId);
  const titlesRes = await youtubeApi.videos.list({ part: ['snippet'], id: ids });
  const infoMap = new Map<string, { title: string; publishedAt: string }>();
  for (const item of titlesRes.data.items ?? []) {
    infoMap.set(item.id!, {
      title: item.snippet?.title ?? '(不明)',
      publishedAt: (item.snippet?.publishedAt ?? '').split('T')[0],
    });
  }

  return viral.map((v) => {
    const info = infoMap.get(v.videoId) ?? { title: '(不明)', publishedAt: '' };
    return { ...v, ...info };
  });
}

