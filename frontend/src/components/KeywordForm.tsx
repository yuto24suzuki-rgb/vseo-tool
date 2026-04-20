'use client';

import { useState } from 'react';

interface KeywordFormProps {
  onSubmit: (theme: string) => void;
  isLoading: boolean;
}

export default function KeywordForm({ onSubmit, isLoading }: KeywordFormProps) {
  const [theme, setTheme] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (theme.trim() && !isLoading) onSubmit(theme.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">チャンネルのメインテーマを入力</h2>
        <p className="text-sm text-gray-500 mb-6">
          例：「プログラミング初心者向け Python」「筋トレ 自宅トレーニング」「料理 時短レシピ」
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="チャンネルのテーマを入力してください"
            disabled={isLoading}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent text-gray-800 placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-400 transition"
          />
          <button
            type="submit"
            disabled={!theme.trim() || isLoading}
            className="px-6 py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl transition-colors duration-200 whitespace-nowrap"
          >
            {isLoading ? '分析中...' : 'キーワード分析'}
          </button>
        </div>
      </div>
    </form>
  );
}
