import { Router, type Request, type Response } from 'express';
import { runAnalyticsSync } from '../services/analyticsSync';
import { isYouTubeConfigured } from '../services/youtubeAnalyticsService';

const router = Router();

router.get('/status', (_req: Request, res: Response) => {
  res.json({
    configured: isYouTubeConfigured(),
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? null,
    channelId: process.env.YOUTUBE_CHANNEL_ID ?? 'mine',
  });
});

router.post('/sync', async (_req: Request, res: Response) => {
  if (!isYouTubeConfigured()) {
    res.status(503).json({
      success: false,
      error: 'YouTube Analytics / Google Sheets の環境変数が設定されていません。',
    });
    return;
  }

  const result = await runAnalyticsSync();
  res.status(result.success ? 200 : 500).json(result);
});

export default router;
