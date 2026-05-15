'use client';

interface GeneratedLink {
  title: string;
  lstepUrl: string;
  createdAt: string;
}

interface SheetResult {
  updatedRange: string;
  updatedRows: number;
}

interface Props {
  links: GeneratedLink[];
  sheet: SheetResult;
  onReset: () => void;
}

export default function LstepResults({ links, sheet, onReset }: Props) {
  const copyAll = () => {
    const text = links.map((l) => `${l.title}\t${l.lstepUrl}`).join('\n');
    navigator.clipboard.writeText(text);
  };

  const downloadCsv = () => {
    const header = '仮タイトル,Lステップ流入経路URL,作成日時\n';
    const rows = links.map((l) =>
      `"${l.title}","${l.lstepUrl}","${new Date(l.createdAt).toLocaleString('ja-JP')}"`
    ).join('\n');
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lstep_links_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* 完了バナー */}
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-green-700 font-semibold text-sm">完了</p>
          <p className="text-green-600 text-sm mt-1">
            {links.length}件のリンクを発行しました。
            スプレッドシートの {sheet.updatedRange} に {sheet.updatedRows} 行追記しました。
          </p>
        </div>
        <button
          onClick={onReset}
          className="text-xs text-green-600 border border-green-300 rounded-lg px-3 py-1.5 hover:bg-green-100 transition-colors whitespace-nowrap"
        >
          最初に戻る
        </button>
      </div>

      {/* ツールバー */}
      <div className="flex gap-2 justify-end">
        <button
          onClick={copyAll}
          className="text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
        >
          全件コピー（タブ区切り）
        </button>
        <button
          onClick={downloadCsv}
          className="text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
        >
          CSV ダウンロード
        </button>
      </div>

      {/* 結果テーブル */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-32">仮タイトル</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Lステップ流入経路URL</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 w-44">作成日時</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {links.map((link, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">{link.title}</td>
                <td className="px-4 py-3">
                  {link.lstepUrl ? (
                    <a
                      href={link.lstepUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-600 hover:underline font-mono text-xs break-all"
                    >
                      {link.lstepUrl}
                    </a>
                  ) : (
                    <span className="text-gray-400 text-xs">URL未取得</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(link.createdAt).toLocaleString('ja-JP')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
