import { google } from 'googleapis';
import type { GeneratedLink } from './lstepService';

function getAuth() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON が設定されていません。' +
      'Google Cloudのサービスアカウントキー(JSON)をBase64エンコードして設定してください。'
    );
  }

  let credentials: object;
  try {
    // Base64デコードを試みる。失敗した場合はそのままJSONとして解析
    const decoded = Buffer.from(credentialsJson, 'base64').toString('utf-8');
    credentials = JSON.parse(decoded);
  } catch {
    credentials = JSON.parse(credentialsJson);
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export interface SheetWriteConfig {
  spreadsheetId: string;
  sheetName?: string;
}

export async function appendLinksToSheet(
  links: GeneratedLink[],
  config: SheetWriteConfig
): Promise<{ updatedRange: string; updatedRows: number }> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const { spreadsheetId, sheetName = 'シート1' } = config;

  // ヘッダー行の存在確認（A1セルが空ならヘッダーを追加）
  const headerCheck = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1`,
  });

  const rows: string[][] = [];

  if (!headerCheck.data.values || headerCheck.data.values[0][0] !== '仮タイトル') {
    rows.push(['仮タイトル', 'Lステップ流入経路URL', '作成日時']);
  }

  for (const link of links) {
    rows.push([
      link.title,
      link.lstepUrl,
      new Date(link.createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
    ]);
  }

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  return {
    updatedRange: response.data.updates?.updatedRange ?? '',
    updatedRows: response.data.updates?.updatedRows ?? 0,
  };
}
