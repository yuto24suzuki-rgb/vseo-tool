import { chromium, Browser, Page } from 'playwright';

export interface LstepConfig {
  email: string;
  password: string;
  count: number;
  prefix: string;
  headless?: boolean;
  onProgress?: (current: number, total: number, message: string) => void;
}

export interface GeneratedLink {
  title: string;
  lstepUrl: string;
  createdAt: string;
}

// ---- Lステップ UIセレクタ設定 ----
// 実際のLステップ管理画面のHTML構造に合わせて調整してください
const SELECTORS = {
  loginEmail: 'input[type="email"], input[name="email"], input[name="login_id"]',
  loginPassword: 'input[type="password"], input[name="password"]',
  loginButton: 'button[type="submit"], input[type="submit"]',
  // 流入経路ページへのナビリンク (サイドバー等)
  trackingNavLink: 'a[href*="tracking"], a[href*="inflow"], a:has-text("流入経路")',
  // 「追加」「新規作成」ボタン
  addButton: 'button:has-text("追加"), button:has-text("新規作成"), button:has-text("作成"), a:has-text("追加")',
  // タグ名入力フィールド
  tagNameInput: 'input[name="name"], input[name="tag_name"], input[placeholder*="タグ名"], input[placeholder*="名前"], input[placeholder*="name"]',
  // 保存ボタン
  saveButton: 'button[type="submit"]:has-text("保存"), button:has-text("保存"), button:has-text("登録"), button:has-text("作成")',
  // 生成されたURL (読み取り専用input、またはテキスト要素)
  generatedUrl: 'input[readonly], input[disabled], .tracking-url, [class*="url"] input, [class*="url"] span, td:has-text("https://")',
};

const LSTEP_BASE_URL = 'https://manager.lstep.app';

export async function generateLstepLinks(config: LstepConfig): Promise<GeneratedLink[]> {
  const { email, password, count, prefix, headless = false, onProgress } = config;
  const results: GeneratedLink[] = [];

  const browser: Browser = await chromium.launch({
    headless,
    slowMo: 300,
    args: ['--no-sandbox'],
  });

  const page: Page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    // ---- Step 1: ログイン ----
    onProgress?.(0, count, 'Lステップにログイン中...');
    await page.goto(`${LSTEP_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector(SELECTORS.loginEmail);
    await page.fill(SELECTORS.loginEmail, email);
    await page.fill(SELECTORS.loginPassword, password);
    await page.click(SELECTORS.loginButton);
    await page.waitForLoadState('networkidle');

    onProgress?.(0, count, 'ログイン成功。流入経路ページへ移動中...');

    // ---- Step 2: 流入経路ページへ移動 ----
    // 直接URLで移動を試みる（チャンネルIDが必要な場合はenv変数から取得）
    const channelId = process.env.LSTEP_CHANNEL_ID ?? '';
    const trackingUrl = channelId
      ? `${LSTEP_BASE_URL}/channels/${channelId}/inflow`
      : `${LSTEP_BASE_URL}/inflow`;

    await page.goto(trackingUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // ナビリンクからも試みる
    const navLink = page.locator(SELECTORS.trackingNavLink).first();
    if (await navLink.isVisible()) {
      await navLink.click();
      await page.waitForLoadState('networkidle');
    }

    // ---- Step 3: 各リンクを作成 ----
    for (let i = 1; i <= count; i++) {
      const title = `${prefix}${String(i).padStart(3, '0')}`;
      onProgress?.(i - 1, count, `(${i}/${count}) "${title}" を作成中...`);

      // 追加ボタンをクリック
      await page.waitForSelector(SELECTORS.addButton, { timeout: 15000 });
      await page.click(SELECTORS.addButton);

      // タグ名入力フィールドが表示されるまで待機
      await page.waitForSelector(SELECTORS.tagNameInput, { timeout: 15000 });
      await page.fill(SELECTORS.tagNameInput, title);

      // 保存
      await page.click(SELECTORS.saveButton);
      await page.waitForLoadState('networkidle');

      // 生成されたURLを取得
      // Lステップの流入経路URLは通常「https://line.me/R/...」や「https://lstep.app/...」形式
      const lstepUrl = await extractGeneratedUrl(page);

      results.push({
        title,
        lstepUrl,
        createdAt: new Date().toISOString(),
      });

      onProgress?.(i, count, `(${i}/${count}) "${title}" 完了: ${lstepUrl || 'URL取得中...'}`);

      // 次のリンク作成のため一覧ページに戻る（必要な場合）
      await page.waitForTimeout(500);
    }

    return results;
  } finally {
    await browser.close();
  }
}

async function extractGeneratedUrl(page: Page): Promise<string> {
  // 複数のパターンでURLを取得を試みる
  const patterns = [
    // 読み取り専用inputからURL取得
    async () => {
      const inputs = await page.$$('input[readonly], input[disabled]');
      for (const input of inputs) {
        const val = await input.inputValue();
        if (val.startsWith('https://') || val.startsWith('http://')) return val;
      }
      return '';
    },
    // data属性からURL取得
    async () => {
      return page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[data-url], [data-tracking-url]'));
        for (const el of els) {
          const url = el.getAttribute('data-url') ?? el.getAttribute('data-tracking-url');
          if (url) return url;
        }
        return '';
      });
    },
    // テキスト内のURL抽出
    async () => {
      return page.evaluate(() => {
        const text = document.body.innerText;
        const match = text.match(/https:\/\/[^\s"'<>]+lstep[^\s"'<>]*/);
        return match ? match[0] : '';
      });
    },
  ];

  for (const pattern of patterns) {
    const url = await pattern();
    if (url) return url;
  }

  return '';
}
