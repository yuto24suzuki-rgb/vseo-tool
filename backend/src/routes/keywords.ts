import { Router, type Request, type Response } from 'express';
import { generateKeywordCandidates, analyzeKeywords } from '../services/claudeService';
import { getKeywordMetrics } from '../services/googleAdsService';

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
    send('progress', { step: 1, total: 3, message: 'Claude AIがキーワード候補を生成中...' });
    const keywords = await generateKeywordCandidates(theme.trim());
    send('keywords_generated', { count: keywords.length });

    send('progress', { step: 2, total: 3, message: 'Google Ads APIで検索ボリュームと競合度を取得中...' });
    const { metrics: metricsData, error: adsError } = await getKeywordMetrics(keywords);
    if (adsError) {
      send('ads_warning', {
        message: `Google Ads API エラー: ${adsError} 検索データなしで分析を続行します。`,
      });
    }

    send('progress', { step: 3, total: 3, message: 'Claude AIがキーワードを分析・分類中...' });
    const analysis = await analyzeKeywords(theme.trim(), metricsData);

    send('complete', { result: analysis });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラーが発生しました';
    send('error', { message });
  } finally {
    res.end();
  }
});

export default router;
