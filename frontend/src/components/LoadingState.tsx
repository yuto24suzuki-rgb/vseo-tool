'use client';

import type { ProgressState } from '../types/keyword';

interface LoadingStateProps {
  progress: ProgressState | null;
  keywordCount?: number;
  adsWarning?: string;
}

const STEPS = [
  { icon: '🤖', label: 'キーワード候補を生成' },
  { icon: '📊', label: '検索ボリュームを取得' },
  { icon: '🎯', label: 'キーワードを分析・分類' },
];

export default function LoadingState({ progress, keywordCount, adsWarning }: LoadingStateProps) {
  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
      <div className="flex flex-col items-center gap-6">
        <div className="w-14 h-14 border-4 border-red-200 border-t-red-500 rounded-full animate-spin" />
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-800">
            {progress?.message ?? '分析を開始しています...'}
          </p>
          {keywordCount != null && (
            <p className="text-sm text-gray-500 mt-1">{keywordCount}件のキーワードを処理中</p>
          )}
        </div>

        <div className="w-full space-y-3 mt-2">
          {STEPS.map((step, i) => {
            const stepNum = i + 1;
            const isDone = (progress?.step ?? 0) > stepNum;
            const isActive = (progress?.step ?? 0) === stepNum;
            return (
              <div
                key={stepNum}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  isActive
                    ? 'bg-red-50 border border-red-200'
                    : isDone
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-gray-50 border border-gray-100'
                }`}
              >
                <span className="text-xl">{isDone ? '✅' : step.icon}</span>
                <span
                  className={`text-sm font-medium ${
                    isActive
                      ? 'text-red-700'
                      : isDone
                      ? 'text-green-700'
                      : 'text-gray-400'
                  }`}
                >
                  {step.label}
                  {isActive && (
                    <span className="ml-2 inline-flex gap-0.5">
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          className="inline-block w-1.5 h-1.5 bg-red-400 rounded-full animate-bounce"
                          style={{ animationDelay: `${d * 0.15}s` }}
                        />
                      ))}
                    </span>
                  )}
                </span>
                <span className="ml-auto text-xs text-gray-400">{stepNum}/3</span>
              </div>
            );
          })}
        </div>

        {adsWarning ? (
          <div className="w-full bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-xs text-yellow-800">
            <span className="font-semibold">⚠ Google Ads API:</span> {adsWarning}
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center">
            Claude AI + Google Ads API を使用中。通常30〜60秒かかります。
          </p>
        )}
      </div>
    </div>
  );
}
