import { Router, type Request, type Response } from 'express';
import { generateKeywordCandidates, analyzeKeywords } from '../services/claudeService';
import { getKeywordMetrics } from '../services/googleAdsService';
import { fetchVidiqKeywordData, isVidiqConfigured } from '../services/vidiqService';

const router = Router();

router.get('/analyze', async (req: Request, res: Response) => {
  const { theme } = req.query;

  if (!theme || typeof theme !== 'string' || theme.trim().length === 0) {
    res.status(400).json({ error: 'テーマを指定してください' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send('progress', { step: 1, total: 4, message: 'Claude AIがキーワード候補を生成中...' });
    const keywords = await generateKeywordCandidates(theme.trim());
    send('keywords_generated', { count: keywords.length });

    send('progress', { step: 2, total: 4, message: 'Google Ads APIで検索ボリュームと競合度を取得中...' });
    const metricsData = await getKeywordMetrics(keywords);

    send('progress', {
      step: 3,
      total: 4,
      message: isVidiqConfigured()
        ? 'vidIQでYouTube固有のキーワードデータを取得中...'
        : 'vidIQは未設定のためスキップ...',
    });
    const vidiqData = await fetchVidiqKeywordData(theme.trim(), keywords);

    if (vidiqData) {
      const vidiqMap = new Map(vidiqData.stats.map((s) => [s.keyword.toLowerCase(), s]));
      for (const metrics of metricsData) {
        const stat = vidiqMap.get(metrics.keyword.toLowerCase());
        if (stat) metrics.vidiq = stat;
      }
    }

    send('progress', { step: 4, total: 4, message: 'Claude AIがキーワードを分析・分類中...' });
    const analysis = await analyzeKeywords(theme.trim(), metricsData, vidiqData?.rawContext);

    send('complete', { result: analysis });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラーが発生しました';
    send('error', { message });
  } finally {
    res.end();
  }
});

export default router;
