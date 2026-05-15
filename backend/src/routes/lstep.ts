import { Router, Request, Response } from 'express';
import { generateLstepLinks } from '../services/lstepService';
import { appendLinksToSheet } from '../services/sheetsService';

const router = Router();

// POST /api/lstep/generate
// SSEでリアルタイム進捗を送信しながらLステップリンクを発行→スプレッドシートに書き込む
router.post('/generate', async (req: Request, res: Response): Promise<void> => {
  const {
    email,
    password,
    count,
    prefix,
    spreadsheetId,
    sheetName,
    headless,
  } = req.body as {
    email: string;
    password: string;
    count: number;
    prefix: string;
    spreadsheetId: string;
    sheetName?: string;
    headless?: boolean;
  };

  if (!email || !password) {
    res.status(400).json({ error: 'Lステップのメールアドレスとパスワードが必要です' });
    return;
  }
  if (!count || count < 1 || count > 200) {
    res.status(400).json({ error: '作成数は1〜200の範囲で指定してください' });
    return;
  }
  if (!spreadsheetId) {
    res.status(400).json({ error: 'スプレッドシートIDが必要です' });
    return;
  }

  // SSEヘッダー設定
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send('progress', { step: 1, total: 3, message: 'Lステップに接続中...' });

    const links = await generateLstepLinks({
      email,
      password,
      count: Number(count),
      prefix: prefix ?? '動画',
      headless: headless ?? false,
      onProgress: (current, total, message) => {
        send('progress', { step: 2, total: 3, message, current, itemTotal: total });
      },
    });

    send('progress', { step: 3, total: 3, message: 'スプレッドシートに書き込み中...' });

    const sheetResult = await appendLinksToSheet(links, {
      spreadsheetId,
      sheetName: sheetName ?? 'シート1',
    });

    send('complete', {
      links,
      sheet: sheetResult,
      message: `${links.length}件のリンクを発行し、スプレッドシートに書き込みました`,
    });

    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
    send('error', { message });
    res.end();
  }
});

export default router;
