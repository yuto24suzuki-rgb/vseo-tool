'use client';

import { useState } from 'react';
import type { AnalysisResult, KeywordAnalysis } from '../types/keyword';

interface KeywordResultsProps {
  result: AnalysisResult;
  onReset: () => void;
  adsWarning?: string;
}

const competitionLabel: Record<string, { label: string; color: string }> = {
  LOW: { label: '低', color: 'bg-green-100 text-green-700' },
  MEDIUM: { label: '中', color: 'bg-yellow-100 text-yellow-700' },
  HIGH: { label: '高', color: 'bg-red-100 text-red-700' },
  UNKNOWN: { label: '不明', color: 'bg-gray-100 text-gray-500' },
};

const priorityLabel: Record<string, { label: string; color: string }> = {
  high: { label: '優先度：高', color: 'bg-orange-100 text-orange-700 border border-orange-200' },
  medium: { label: '優先度：中', color: 'bg-blue-100 text-blue-700 border border-blue-200' },
  low: { label: '優先度：低', color: 'bg-gray-100 text-gray-600 border border-gray-200' },
};

function formatVolume(vol: number): string {
  if (vol === 0) return '不明';
  if (vol >= 10000) return `${Math.round(vol / 1000)}万`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}千`;
  return String(vol);
}

function KeywordCard({ kw, type }: { kw: KeywordAnalysis; type: 'target' | 'skip' }) {
  const comp = kw.metrics?.competition ?? 'UNKNOWN';
  const vol = kw.metrics?.avgMonthlySearches ?? 0;
  const compInfo = competitionLabel[comp] ?? competitionLabel.UNKNOWN;

  return (
    <div
      className={`rounded-xl border p-4 transition-shadow hover:shadow-md ${
        type === 'target'
          ? 'bg-white border-green-200 hover:border-green-300'
          : 'bg-white border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex flex-wrap items-start gap-2 mb-2">
        <h3 className="text-base font-bold text-gray-800 flex-1 min-w-0 break-words">
          {kw.keyword}
        </h3>
        {kw.priority && priorityLabel[kw.priority] && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${priorityLabel[kw.priority].color}`}>
            {priorityLabel[kw.priority].label}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
          <span>🔍</span>
          <span>月間 {formatVolume(vol)} 検索</span>
        </span>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${compInfo.color}`}>
          競合: {compInfo.label}
        </span>
        {kw.metrics?.competitionIndex != null && kw.metrics.competitionIndex > 0 && (
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
            CI: {kw.metrics.competitionIndex}
          </span>
        )}
      </div>

      {kw.intent && (
        <p className="text-xs text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg mb-2 font-medium">
          意図: {kw.intent}
        </p>
      )}

      <p className="text-xs text-gray-600 leading-relaxed">{kw.reason}</p>
    </div>
  );
}

function exportCSV(result: AnalysisResult) {
  const BOM = '\uFEFF';
  const rows: string[] = [
    '分類,優先度,キーワード,月間検索ボリューム,競合度,競合度指数,ユーザー意図,理由',
  ];

  const toCSVField = (v: string | number | undefined | null) => {
    const s = String(v ?? '');
    return `"${s.replace(/"/g, '""')}"`;
  };

  for (const kw of result.targetKeywords) {
    rows.push(
      [
        'target',
        kw.priority ?? '',
        kw.keyword,
        kw.metrics?.avgMonthlySearches ?? 0,
        kw.metrics?.competition ?? 'UNKNOWN',
        kw.metrics?.competitionIndex ?? 0,
        kw.intent ?? '',
        kw.reason,
      ]
        .map(toCSVField)
        .join(',')
    );
  }

  for (const kw of result.skipKeywords) {
    rows.push(
      [
        'skip',
        '',
        kw.keyword,
        kw.metrics?.avgMonthlySearches ?? 0,
        kw.metrics?.competition ?? 'UNKNOWN',
        kw.metrics?.competitionIndex ?? 0,
        '',
        kw.reason,
      ]
        .map(toCSVField)
        .join(',')
    );
  }

  const blob = new Blob([BOM + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vseo-keywords-${result.theme.replace(/\s+/g, '-')}-${
    new Date().toISOString().split('T')[0]
  }.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function KeywordResults({ result, onReset, adsWarning }: KeywordResultsProps) {
  const [showSkip, setShowSkip] = useState(false);
  const sortedTarget = [...result.targetKeywords].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority ?? 'low'] ?? 2) - (order[b.priority ?? 'low'] ?? 2);
  });

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white rounded-2xl border border-gray-100 shadow px-6 py-4">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">テーマ</p>
          <p className="text-xl font-bold text-gray-800">{result.theme}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => exportCSV(result)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <span>📥</span> CSV出力
          </button>
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-colors"
          >
            <span>↩</span> やり直す
          </button>
        </div>
      </div>

      {/* Google Ads warning banner */}
      {adsWarning && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-3 text-sm text-yellow-800 flex items-start gap-2">
          <span className="mt-0.5 shrink-0">⚠</span>
          <span>
            <span className="font-semibold">Google Ads API エラー:</span> {adsWarning}
            　検索ボリューム・競合度は取得できませんでしたが、Claude AI による分析は完了しています。
          </span>
        </div>
      )}

      {/* Summary */}
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-6">
        <h2 className="font-bold text-indigo-800 mb-2 flex items-center gap-2">
          <span>💡</span> 戦略サマリー
        </h2>
        <p className="text-sm text-indigo-700 leading-relaxed">{result.summary}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: '狙うべきワード',
            value: result.targetKeywords.length,
            color: 'text-green-600',
            bg: 'bg-green-50 border-green-200',
          },
          {
            label: '高優先度',
            value: result.targetKeywords.filter((k) => k.priority === 'high').length,
            color: 'text-orange-600',
            bg: 'bg-orange-50 border-orange-200',
          },
          {
            label: '見送るワード',
            value: result.skipKeywords.length,
            color: 'text-gray-500',
            bg: 'bg-gray-50 border-gray-200',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`rounded-xl border p-4 text-center ${stat.bg}`}
          >
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Target keywords */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🎯</span>
          <h2 className="text-lg font-bold text-gray-800">
            狙うべきワード ({result.targetKeywords.length}件)
          </h2>
          <span className="text-xs text-gray-400 ml-auto">優先度順</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sortedTarget.map((kw) => (
            <KeywordCard key={kw.keyword} kw={kw} type="target" />
          ))}
        </div>
      </section>

      {/* Skip keywords (collapsible) */}
      <section>
        <button
          onClick={() => setShowSkip((v) => !v)}
          className="flex items-center gap-2 mb-4 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <span>{showSkip ? '▼' : '▶'}</span>
          <h2 className="text-lg font-bold">
            見送るワード ({result.skipKeywords.length}件)
          </h2>
          <span className="text-xs text-gray-400 ml-2">クリックで展開</span>
        </button>
        {showSkip && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {result.skipKeywords.map((kw) => (
              <KeywordCard key={kw.keyword} kw={kw} type="skip" />
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-center text-gray-400 pb-4">
        生成日時: {new Date(result.generatedAt).toLocaleString('ja-JP')}
      </p>
    </div>
  );
}
