'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import KeywordForm from '../components/KeywordForm';
import LoadingState from '../components/LoadingState';
import KeywordResults from '../components/KeywordResults';
import type { AnalysisResult, ProgressState } from '../types/keyword';

type AppState = 'idle' | 'loading' | 'done' | 'error';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function Home() {
  const [state, setState] = useState<AppState>('idle');
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [keywordCount, setKeywordCount] = useState<number | undefined>(undefined);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const esRef = useRef<EventSource | null>(null);

  const handleSubmit = (theme: string) => {
    if (esRef.current) esRef.current.close();

    setState('loading');
    setProgress(null);
    setKeywordCount(undefined);
    setResult(null);
    setErrorMsg('');

    const url = `${API_URL}/api/keywords/analyze?theme=${encodeURIComponent(theme)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data) as ProgressState;
      setProgress(data);
    });

    es.addEventListener('keywords_generated', (e) => {
      const data = JSON.parse(e.data) as { count: number };
      setKeywordCount(data.count);
    });

    es.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data) as { result: AnalysisResult };
      setResult(data.result);
      setState('done');
      es.close();
    });

    es.addEventListener('error', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { message: string };
        setErrorMsg(data.message);
      } catch {
        setErrorMsg('予期しないエラーが発生しました');
      }
      setState('error');
      es.close();
    });

    es.onerror = () => {
      if (state !== 'done' && state !== 'error') {
        setErrorMsg('サーバーとの接続が切れました。バックエンドが起動しているか確認してください。');
        setState('error');
        es.close();
      }
    };
  };

  const handleReset = () => {
    if (esRef.current) esRef.current.close();
    setState('idle');
    setProgress(null);
    setKeywordCount(undefined);
    setResult(null);
    setErrorMsg('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-2xl">▶</span>
          <div>
            <h1 className="text-xl font-bold text-gray-900">YouTube VSEOキーワードツール</h1>
            <p className="text-xs text-gray-500">
              AI × Google Ads で「勝てるキーワード」を自動提案
            </p>
          </div>
          <Link
            href="/lstep"
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            Lステップ URL発行へ
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        {/* Form — always visible unless showing results */}
        {state !== 'done' && (
          <KeywordForm onSubmit={handleSubmit} isLoading={state === 'loading'} />
        )}

        {/* Loading */}
        {state === 'loading' && (
          <LoadingState progress={progress} keywordCount={keywordCount} />
        )}

        {/* Error */}
        {state === 'error' && (
          <div className="w-full max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-2xl p-6 text-center space-y-3">
            <p className="text-red-600 font-semibold">エラーが発生しました</p>
            <p className="text-sm text-red-500">{errorMsg}</p>
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
            >
              やり直す
            </button>
          </div>
        )}

        {/* Results */}
        {state === 'done' && result && (
          <KeywordResults result={result} onReset={handleReset} />
        )}

        {/* Hero info (only on idle) */}
        {state === 'idle' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
            {[
              {
                icon: '🤖',
                title: 'Claude AI',
                desc: 'テーマから100件のキーワード候補を自動生成',
              },
              {
                icon: '📊',
                title: 'Google Ads API',
                desc: '月間検索ボリューム・競合度をリアルタイム取得',
              },
              {
                icon: '🎯',
                title: 'AI分析・分類',
                desc: '狙うべき/見送るワードを理由付きで整理',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-center"
              >
                <p className="text-3xl mb-2">{item.icon}</p>
                <p className="font-semibold text-gray-800 text-sm mb-1">{item.title}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
