'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import LstepForm, { type LstepFormValues } from '../../components/LstepForm';
import LstepResults from '../../components/LstepResults';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ProgressState {
  step: number;
  total: number;
  message: string;
  current?: number;
}

interface GeneratedLink {
  title: string;
  lstepUrl: string;
  createdAt: string;
}

interface SheetResult {
  updatedRange: string;
  updatedRows: number;
}

type AppState = 'idle' | 'loading' | 'done' | 'error';

export default function LstepPage() {
  const [state, setState] = useState<AppState>('idle');
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [links, setLinks] = useState<GeneratedLink[]>([]);
  const [sheet, setSheet] = useState<SheetResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const esRef = useRef<EventSource | null>(null);

  const handleSubmit = async (values: LstepFormValues) => {
    if (esRef.current) esRef.current.close();

    setState('loading');
    setProgress(null);
    setLinks([]);
    setSheet(null);
    setErrorMsg('');

    try {
      const response = await fetch(`${API_URL}/api/lstep/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const lines = part.split('\n');
          let event = '';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7);
            if (line.startsWith('data: ')) data = line.slice(6);
          }
          if (!event || !data) continue;

          const parsed = JSON.parse(data);
          if (event === 'progress') {
            setProgress(parsed as ProgressState);
          } else if (event === 'complete') {
            setLinks(parsed.links as GeneratedLink[]);
            setSheet(parsed.sheet as SheetResult);
            setState('done');
          } else if (event === 'error') {
            setErrorMsg(parsed.message);
            setState('error');
          }
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '接続エラーが発生しました');
      setState('error');
    }
  };

  const handleReset = () => {
    setState('idle');
    setProgress(null);
    setLinks([]);
    setSheet(null);
    setErrorMsg('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">L</span>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Lステップ 流入経路URL 一括発行</h1>
              <p className="text-xs text-gray-500">
                ブラウザ自動操作で流入経路タグ付きURLを一括作成 → スプレッドシートに自動書き込み
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            キーワードツールへ
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        {/* フォーム（完了時は非表示） */}
        {state !== 'done' && (
          <LstepForm onSubmit={handleSubmit} isLoading={state === 'loading'} />
        )}

        {/* 進捗表示 */}
        {state === 'loading' && progress && (
          <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-gray-800">{progress.message}</p>
            </div>
            {progress.current !== undefined && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>発行済み</span>
                  <span>{progress.current} / {progress.total} 件</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
            <p className="text-xs text-gray-400">
              ブラウザが自動操作されています。操作中はウィンドウを閉じないでください。
            </p>
          </div>
        )}

        {/* エラー */}
        {state === 'error' && (
          <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-2xl p-6 text-center space-y-3">
            <p className="text-red-600 font-semibold">エラーが発生しました</p>
            <p className="text-sm text-red-500 whitespace-pre-wrap">{errorMsg}</p>
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
            >
              やり直す
            </button>
          </div>
        )}

        {/* 結果 */}
        {state === 'done' && sheet && (
          <LstepResults links={links} sheet={sheet} onReset={handleReset} />
        )}

        {/* 使い方説明 (idle時のみ) */}
        {state === 'idle' && (
          <div className="max-w-2xl mx-auto space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">事前準備</h2>
            <div className="grid grid-cols-1 gap-3">
              {[
                {
                  step: '1',
                  title: 'Lステップ アカウント',
                  desc: '管理画面にログインできるメールアドレスとパスワードを用意してください',
                },
                {
                  step: '2',
                  title: 'Google サービスアカウント',
                  desc: 'バックエンドの .env に GOOGLE_SERVICE_ACCOUNT_JSON を設定してください。スプレッドシートをサービスアカウントのメールに共有する必要があります',
                },
                {
                  step: '3',
                  title: 'スプレッドシートID',
                  desc: 'URLの /spreadsheets/d/ 以降、/edit より前の文字列です',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex gap-4"
                >
                  <span className="w-7 h-7 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {item.step}
                  </span>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{item.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
