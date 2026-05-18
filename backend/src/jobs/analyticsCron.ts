import cron from 'node-cron';
import { runAnalyticsSync } from '../services/analyticsSync';
import { isYouTubeConfigured } from '../services/youtubeAnalyticsService';

// Runs daily at 06:00 JST (21:00 UTC) — YouTube Analytics data is available by then
const CRON_SCHEDULE = '0 21 * * *';

export function startAnalyticsCronJob(): void {
  if (!isYouTubeConfigured()) {
    console.warn(
      '[analytics cron] YouTube/Sheets env vars not set — cron job will not start. ' +
        'Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN, GOOGLE_SHEETS_SPREADSHEET_ID.'
    );
    return;
  }

  console.log('[analytics cron] Scheduled daily sync at 06:00 JST (21:00 UTC)');

  cron.schedule(CRON_SCHEDULE, async () => {
    console.log('[analytics cron] Starting scheduled sync...');
    const result = await runAnalyticsSync();
    if (result.success) {
      console.log(`[analytics cron] Sync succeeded. Sheets updated: ${result.sheets.join(', ')}`);
    } else {
      console.error(`[analytics cron] Sync failed: ${result.error}`);
    }
  });
}
