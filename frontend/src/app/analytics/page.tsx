'use client';

import { useState, useEffect } from 'react';

interface StatusResponse {
  configured: boolean;
  spreadsheetId: string | null;
  channelId: string;
}

interface SyncResult {
  success: boolean;
  completedAt: string;
  sheets: string[];
  error?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function AnalyticsPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/analytics/status`)
      .then((r) => r.json())
      .then((data: StatusResponse) => setStatus(data))
      .catch(() => setStatus(null));
  }, []);

  async function handleSync() {
    setSyncing(true);
    setLastResult(null);
    try {
      const res = await fetch(`${API_URL}/api/analytics/sync`, { method: 'POST' });
      const data = (await res.json()) as SyncResult;
      setLastResult(data);
    } catch {
      setLastResult({ success: false, completedAt: new Date().toISOString(), sheets: [], error: 'ネットワークエラー' });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">YouTube Analytics 自動同期</h1>
        <p className="text-gray-500 text-sm mb-8">
          毎日 06:00 JST に自動実行されます。手動で今すぐ実行することも可能です。
        </p>

        {/* 設定状態 */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">設定状態</h2>
          {status === null ? (
            <p className="text-gray-400 text-sm">確認中...</p>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">API 接続</dt>
                <dd>
                  {status.configured ? (
                    <span className="text-green-600 font-medium">設定済み</span>
                  ) : (
                    <span className="text-red-500 font-medium">未設定</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">スプレッドシート ID</dt>
                <dd className="text-gray-800 font-mono truncate max-w-xs">
                  {status.spreadsheetId ?? '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">チャンネル ID</dt>
                <dd className="text-gray-800 font-mono">{status.channelId}</dd>
              </div>
            </dl>
          )}
        </section>

        {/* 取得シート一覧 */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">更新されるシート</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            {[
              { name: 'チャンネル概要（日別）', desc: '過去 90 日の日別指標（視聴回数・視聴時間・登録者・いいね等）' },
              { name: '動画別パフォーマンス', desc: '過去 90 日の上位 50 動画の指標' },
              { name: 'トラフィックソース', desc: '過去 28 日の流入元別視聴回数と割合' },
              { name: '視聴者の地域', desc: '過去 28 日の国別視聴回数と割合' },
            ].map((sheet) => (
              <li key={sheet.name} className="flex gap-3">
                <span className="text-blue-500 mt-0.5">&#9632;</span>
                <div>
                  <span className="font-medium">{sheet.name}</span>
                  <span className="text-gray-400 ml-2">{sheet.desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 手動実行 */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-700 mb-4">手動実行</h2>

          {!status?.configured && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-800">
              環境変数が未設定です。<code className="font-mono bg-amber-100 px-1 rounded">backend/.env</code> に
              YouTube / Google Sheets の認証情報を追加してください。
            </div>
          )}

          <button
            onClick={handleSync}
            disabled={syncing || !status?.configured}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors"
          >
            {syncing ? '同期中...' : '今すぐ同期'}
          </button>

          {lastResult && (
            <div
              className={`mt-4 rounded-lg p-4 text-sm ${
                lastResult.success
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              {lastResult.success ? (
                <>
                  <p className="font-medium mb-1">同期完了</p>
                  <p className="text-xs text-green-600 mb-2">
                    {new Date(lastResult.completedAt).toLocaleString('ja-JP')}
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {lastResult.sheets.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p className="font-medium mb-1">同期失敗</p>
                  <p className="text-xs">{lastResult.error}</p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
