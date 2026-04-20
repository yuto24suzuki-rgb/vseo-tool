import Anthropic from '@anthropic-ai/sdk';
import type { KeywordMetrics, KeywordAnalysis, AnalysisResult } from '../types/keyword';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractJSON(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const array = text.match(/\[[\s\S]*\]/);
  const object = text.match(/\{[\s\S]*\}/);
  if (array && object) {
    return (array.index ?? Infinity) < (object.index ?? Infinity) ? array[0] : object[0];
  }
  return array?.[0] ?? object?.[0] ?? text;
}

/**
 * Repairs truncated JSON by:
 * 1. Tracking nesting depth and the last "safe cut" point (after each complete element)
 * 2. Trimming to the last complete element and closing all open structures
 */
function repairJSON(raw: string): string {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  let lastSafeCut = -1;
  // Snapshot of the stack AT the safe cut point (not the final state)
  let stackAtCut: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\' && inString) { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (c === '[' || c === '{') {
      stack.push(c === '[' ? ']' : '}');
    } else if ((c === ']' || c === '}') && stack.length > 0) {
      stack.pop();
      // Closing a top-level element (back to depth 0 or 1) is a safe cut point
      if (stack.length <= 1) {
        lastSafeCut = i + 1;
        stackAtCut = [...stack];
      }
    } else if (c === ',' && stack.length > 0) {
      // Comma between elements — everything before this comma is complete
      lastSafeCut = i;
      stackAtCut = [...stack];
    }
  }

  if (stack.length === 0 && !inString) return raw; // already valid

  if (lastSafeCut === -1) {
    // No complete elements found — return an empty collection
    const first = raw.trimStart()[0];
    return first === '[' ? '[]' : '{}';
  }

  // Use the stack state AT the cut point, not the final (potentially deeper) state
  const closing = stackAtCut.slice().reverse().join('');
  return raw.slice(0, lastSafeCut) + closing;
}

function safeParseJSON<T>(text: string): T {
  const jsonStr = extractJSON(text);

  // 1st attempt: direct parse
  try {
    return JSON.parse(jsonStr) as T;
  } catch (e1) {
    console.warn('JSON parse failed, attempting repair:', (e1 as Error).message);
  }

  // 2nd attempt: repair then parse
  const repaired = repairJSON(jsonStr);
  try {
    const result = JSON.parse(repaired) as T;
    console.info('JSON repaired successfully');
    return result;
  } catch (e2) {
    throw new Error(
      `JSONパース失敗: ${(e2 as Error).message} ` +
        `| 元テキスト冒頭: ${text.substring(0, 200)}`
    );
  }
}

/** Extract raw quoted strings as last-resort fallback for keyword arrays */
function extractStringsFromText(text: string): string[] {
  const matches = [...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)];
  return matches
    .map((m) => m[1])
    .filter((s) => s.length > 1 && !s.startsWith('{')); // skip JSON keys
}

function isValidKeywordItem(item: unknown): item is KeywordAnalysis {
  return (
    typeof item === 'object' &&
    item !== null &&
    'keyword' in item &&
    typeof (item as Record<string, unknown>).keyword === 'string' &&
    'reason' in item
  );
}

export async function generateKeywordCandidates(theme: string): Promise<string[]> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: `YouTubeチャンネルのテーマ「${theme}」について、SEOキーワード候補を100件生成してください。

以下の多様な視点からキーワードを生成してください：
- ショートテール（1〜2語）: 10件程度
- ミドルテール（2〜3語）: 40件程度
- ロングテール（4語以上）: 50件程度
- 初心者向け・中級者向け・上級者向けをバランスよく
- ハウツー系・比較系・おすすめ系・原因解決系など多様なインテント
- 日本語のみ

実際にYouTubeや検索エンジンで検索されそうな、自然な日本語キーワードを生成してください。

JSONの配列形式のみで回答してください（説明文不要）：
["キーワード1", "キーワード2", ...]`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  try {
    const parsed = safeParseJSON<unknown>(text);
    if (Array.isArray(parsed)) {
      const keywords = (parsed as unknown[]).filter(
        (k): k is string => typeof k === 'string' && k.trim().length > 0
      );
      if (keywords.length > 0) return keywords;
    }
  } catch (err) {
    console.warn('safeParseJSON failed for keywords, falling back to regex:', err);
  }

  // Last-resort: extract quoted strings from the raw text
  const fallback = extractStringsFromText(text).filter((s) => s.length >= 2);
  if (fallback.length === 0) {
    throw new Error('Claude からキーワードを抽出できませんでした');
  }
  console.warn(`Regex fallback extracted ${fallback.length} keywords`);
  return fallback;
}

export async function analyzeKeywords(
  theme: string,
  keywordsWithMetrics: KeywordMetrics[]
): Promise<AnalysisResult> {
  const metricsJson = JSON.stringify(
    keywordsWithMetrics.map((k) => ({
      keyword: k.keyword,
      monthlySearches: k.avgMonthlySearches,
      competition: k.competition,
      competitionIndex: k.competitionIndex,
    })),
    null,
    2
  );

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16384,
    messages: [
      {
        role: 'user',
        content: `YouTubeチャンネルのテーマ「${theme}」について、以下のキーワードデータを分析してください。

## キーワードデータ（月間検索ボリューム・競合度付き）
${metricsJson}

## 分析基準

### 狙うべきワード（target）
- 月間検索ボリューム100以上（UNKNOWNは慎重に判断）
- 競合度がLOW〜MEDIUMで参入余地がある
- YouTubeで動画として価値のあるユーザー意図（ハウツー、解説、比較など）
- チャンネルのテーマと直接的な関連性がある

### 見送るワード（skip）
- 月間検索ボリューム50未満
- 競合度HIGHで大手チャンネルと直接競合する
- テキスト記事・ECサイト向けインテント（購入・価格比較など）
- テーマとの関連性が薄い・重複キーワード

### 優先度（targetのみ）
- high: 即座に動画制作すべき最重要キーワード
- medium: 積極的に取り組む価値があるキーワード
- low: 余裕があれば取り組むキーワード

【重要】各フィールドは必ず簡潔に（reason・intentは1文以内）。

JSONのみで回答してください（説明文不要）：
{
  "targetKeywords": [
    {
      "keyword": "キーワード",
      "classification": "target",
      "priority": "high|medium|low",
      "intent": "ユーザー意図（15字以内）",
      "reason": "狙う理由（1文）"
    }
  ],
  "skipKeywords": [
    {
      "keyword": "キーワード",
      "classification": "skip",
      "reason": "見送り理由（1文）"
    }
  ],
  "summary": "全体戦略（2〜3文）"
}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  let parsed: {
    targetKeywords?: unknown[];
    skipKeywords?: unknown[];
    summary?: string;
  };

  try {
    parsed = safeParseJSON<typeof parsed>(text);
  } catch (err) {
    console.error('analyzeKeywords JSON parse failed even after repair:', err);
    // Return a minimal valid result so the app does not crash
    parsed = { targetKeywords: [], skipKeywords: [], summary: '' };
  }

  const metricsMap = new Map(keywordsWithMetrics.map((m) => [m.keyword, m]));

  const enrichAnalysis = (items: unknown[]): KeywordAnalysis[] =>
    items
      .filter(isValidKeywordItem)
      .map((item) => ({ ...item, metrics: metricsMap.get(item.keyword) }));

  const targetKeywords = enrichAnalysis(parsed.targetKeywords ?? []);
  const skipKeywords = enrichAnalysis(parsed.skipKeywords ?? []);

  // Surface a warning in the summary if we got very few results (likely truncation)
  const totalClassified = targetKeywords.length + skipKeywords.length;
  const summaryNote =
    totalClassified < keywordsWithMetrics.length * 0.5
      ? `（注: レスポンスが途中で切れたため、${totalClassified}件のみ分類できました） `
      : '';

  return {
    theme,
    targetKeywords,
    skipKeywords,
    summary: summaryNote + (parsed.summary ?? ''),
    generatedAt: new Date().toISOString(),
  };
}
