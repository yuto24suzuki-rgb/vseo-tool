# YouTube VSEOキーワード提案ツール

チャンネルのメインテーマを入力するだけで、**Claude AI × Google Ads API × vidIQ** が「勝てるキーワード」を自動提案するWebアプリです。

## 処理フロー

```
テーマ入力
  → Claude AI がキーワード候補を100件生成
      （vidIQ 連携時: vidIQ の YouTube 実データを参照して生成）
  → Google Ads API で月間検索ボリューム・競合度を取得
  → Claude AI が分析・分類（狙うべきワード / 見送るワード）
      （vidIQ 連携時: YouTube 上の検索ボリューム・競合度も加味）
  → 結果表示 + CSVエクスポート
```

## vidIQ 連携（オプション）

Claude API の [MCP コネクタ](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector) 経由で [vidIQ 公式 MCP サーバー](https://vidiq.com/mcp/)（`https://mcp.vidiq.com/mcp`）に接続します。連携すると、Claude がキーワード生成・分析の際に vidIQ の YouTube 実データ（検索ボリューム・競合度・関連キーワード）をツールとして直接参照できるようになります。

1. [app.vidiq.com/account/settings/mcp](https://app.vidiq.com/account/settings/mcp) で vidIQ の MCP API キーを発行
   （vidIQ の MCP 利用には対応プランへの加入が必要です。キーはいつでも失効・再発行できます）
2. `backend/.env` に追加：

   ```env
   VIDIQ_MCP_API_KEY=vidiq_...
   ```

`VIDIQ_MCP_API_KEY` が未設定の場合は、従来どおり Claude + Google Ads API のみで動作します。

## プロジェクト構成

```
vseo-tool/
├── backend/              # Node.js + Express (ポート 3001)
│   └── src/
│       ├── index.ts
│       ├── routes/keywords.ts    # SSE エンドポイント
│       ├── services/
│       │   ├── claudeService.ts  # Anthropic SDK
│       │   └── googleAdsService.ts
│       └── types/keyword.ts
├── frontend/             # Next.js 14 + TypeScript (ポート 3000)
│   └── src/
│       ├── app/page.tsx          # メインページ（SSE クライアント）
│       ├── components/
│       │   ├── KeywordForm.tsx
│       │   ├── LoadingState.tsx
│       │   └── KeywordResults.tsx
│       └── types/keyword.ts
└── .env.example
```

## セットアップ

### 1. 環境変数を設定

```bash
cp .env.example backend/.env
```

`backend/.env` を編集：

```env
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_ADS_DEVELOPER_TOKEN=...
GOOGLE_ADS_CLIENT_ID=...
GOOGLE_ADS_CLIENT_SECRET=...
GOOGLE_ADS_REFRESH_TOKEN=...
GOOGLE_ADS_CUSTOMER_ID=123-456-7890
```

> **Note:** Google Ads API の環境変数を設定しない場合、検索ボリューム・競合度が UNKNOWN になりますが、Claude のキーワード生成・分析は動作します。

フロントエンド用 `.env.local` も作成：

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > frontend/.env.local
```

### 2. 依存パッケージをインストール

```bash
# バックエンド
cd backend && npm install

# フロントエンド
cd frontend && npm install
```

### 3. 起動

**バックエンド（ターミナル1）:**
```bash
cd backend && npm run dev
```

**フロントエンド（ターミナル2）:**
```bash
cd frontend && npm run dev
```

ブラウザで `http://localhost:3000` を開く。

## 必要な環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | Claude AI API キー | ✅ |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads 開発者トークン | 推奨 |
| `GOOGLE_ADS_CLIENT_ID` | OAuth2 クライアント ID | 推奨 |
| `GOOGLE_ADS_CLIENT_SECRET` | OAuth2 クライアントシークレット | 推奨 |
| `GOOGLE_ADS_REFRESH_TOKEN` | OAuth2 リフレッシュトークン | 推奨 |
| `GOOGLE_ADS_CUSTOMER_ID` | Google Ads 顧客 ID（ハイフンあり可） | 推奨 |
| `VIDIQ_MCP_API_KEY` | vidIQ MCP API キー（YouTube 実データ連携） | 任意 |

## Google Ads API のセットアップ

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成し OAuth2 クライアントを設定
2. [Google Ads API Center](https://developers.google.com/google-ads/api/docs/start) で開発者トークンを申請
3. OAuth2 リフレッシュトークンを取得（[OAuth Playground](https://developers.google.com/oauthplayground/) を利用）
   - スコープ: `https://www.googleapis.com/auth/adwords`

## API エンドポイント

### `GET /api/keywords/analyze?theme=<テーマ>`

Server-Sent Events（SSE）ストリームを返します。

**イベント:**
- `progress` — `{ step: 1|2|3, total: 3, message: string }`
- `keywords_generated` — `{ count: number }`
- `complete` — `{ result: AnalysisResult }`
- `error` — `{ message: string }`

## 使用技術

- **フロントエンド:** Next.js 14, TypeScript, Tailwind CSS
- **バックエンド:** Node.js, Express, TypeScript, tsx
- **AI:** Anthropic Claude (claude-sonnet-4-6) + MCP コネクタ
- **データ:** Google Ads API v18 (Keyword Planner), vidIQ MCP サーバー（オプション）
- **リアルタイム通信:** Server-Sent Events (SSE)
