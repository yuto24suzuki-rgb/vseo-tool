import {
  getChannelDailyMetrics,
  getVideoMetrics,
  getTrafficSources,
  getGeographyMetrics,
  getMilestoneMetrics,
  detectViralVideos,
} from './youtubeAnalyticsService';
import {
  writeChannelDailyMetrics,
  writeVideoMetrics,
  writeTrafficSources,
  writeGeography,
  writeMilestoneMetrics,
  writeSpecialNotes,
} from './googleSheetsService';

export interface SyncResult {
  success: boolean;
  completedAt: string;
  sheets: string[];
  error?: string;
}

export async function runAnalyticsSync(): Promise<SyncResult> {
  const completedSheets: string[] = [];

  try {
    console.log('[analytics] Fetching channel daily metrics...');
    const daily = await getChannelDailyMetrics();
    await writeChannelDailyMetrics(daily);
    completedSheets.push('チャンネル概要（日別）');

    console.log('[analytics] Fetching video performance metrics...');
    const videos = await getVideoMetrics();
    await writeVideoMetrics(videos);
    completedSheets.push('動画別パフォーマンス');

    console.log('[analytics] Fetching milestone metrics (per-video daily queries)...');
    const milestones = await getMilestoneMetrics(videos);
    await writeMilestoneMetrics(milestones);
    completedSheets.push('動画マイルストーン');

    console.log('[analytics] Detecting viral / sudden-reach videos...');
    const viral = await detectViralVideos();
    await writeSpecialNotes(viral);
    completedSheets.push('特記事項（急伸検知）');

    console.log('[analytics] Fetching traffic sources...');
    const traffic = await getTrafficSources();
    await writeTrafficSources(traffic);
    completedSheets.push('トラフィックソース');

    console.log('[analytics] Fetching geography metrics...');
    const geo = await getGeographyMetrics();
    await writeGeography(geo);
    completedSheets.push('視聴者の地域');

    console.log('[analytics] Sync complete.');
    return { success: true, completedAt: new Date().toISOString(), sheets: completedSheets };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[analytics] Sync failed:', message);
    return {
      success: false,
      completedAt: new Date().toISOString(),
      sheets: completedSheets,
      error: message,
    };
  }
}
