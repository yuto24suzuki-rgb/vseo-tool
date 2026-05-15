'use client';

import { useState } from 'react';

export interface LstepFormValues {
  email: string;
  password: string;
  count: number;
  prefix: string;
  spreadsheetId: string;
  sheetName: string;
}

interface Props {
  onSubmit: (values: LstepFormValues) => void;
  isLoading: boolean;
}

export default function LstepForm({ onSubmit, isLoading }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [count, setCount] = useState(10);
  const [prefix, setPrefix] = useState('動画');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('シート1');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ email, password, count, prefix, spreadsheetId, sheetName });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5 max-w-2xl mx-auto">
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Lステップ 流入経路URL 一括発行</h2>
        <p className="text-xs text-gray-500">
          仮タイトルで流入経路タグ付きURLを自動発行し、スプレッドシートに書き込みます
        </p>
      </div>

      {/* Lステップ認証情報 */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-700 mb-2">Lステップ ログイン情報</legend>
        <div>
          <label className="block text-xs text-gray-600 mb-1">メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="example@email.com"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">パスワード</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
            >
              {showPassword ? '隠す' : '表示'}
            </button>
          </div>
        </div>
      </fieldset>

      {/* リンク設定 */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-700 mb-2">リンク設定</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">作成件数</label>
            <input
              type="number"
              value={count}
              min={1}
              max={200}
              onChange={(e) => setCount(Number(e.target.value))}
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <p className="text-xs text-gray-400 mt-1">最大200件</p>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">仮タイトルのプレフィックス</label>
            <input
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              required
              placeholder="動画"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <p className="text-xs text-gray-400 mt-1">例: 「動画」→ 動画001, 動画002...</p>
          </div>
        </div>
      </fieldset>

      {/* スプレッドシート設定 */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-700 mb-2">スプレッドシート設定</legend>
        <div>
          <label className="block text-xs text-gray-600 mb-1">スプレッドシートID</label>
          <input
            type="text"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
            required
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <p className="text-xs text-gray-400 mt-1">
            スプレッドシートURLの /d/ 以降、/edit より前の部分
          </p>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">シート名</label>
          <input
            type="text"
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            placeholder="シート1"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
      >
        {isLoading ? '処理中...' : `${count}件のリンクを発行してスプレッドシートに書き込む`}
      </button>
    </form>
  );
}
