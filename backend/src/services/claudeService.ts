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

export async function generateKeywordCandidates(theme: string): Promise<string[]> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
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
  const jsonStr = extractJSON(text);
  const keywords: unknown = JSON.parse(jsonStr);
  if (!Array.isArray(keywords)) throw new Error('Claude からキーワード配列を取得できませんでした');
  return (keywords as unknown[])
    .filter((k): k is string => typeof k === 'string' && k.trim().length > 0);
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
    max_tokens: 8192,
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

JSONのみで回答してください（説明文不要）：
{
  "targetKeywords": [
    {
      "keyword": "キーワード",
      "classification": "target",
      "priority": "high|medium|low",
      "intent": "ユーザーが求めているもの（1行）",
      "reason": "このキーワードを狙うべき理由（2〜3文）"
    }
  ],
  "skipKeywords": [
    {
      "keyword": "キーワード",
      "classification": "skip",
      "reason": "見送る理由（1〜2文）"
    }
  ],
  "summary": "全体分析と戦略提案（3〜5文）"
}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonStr = extractJSON(text);
  const parsed = JSON.parse(jsonStr) as {
    targetKeywords: KeywordAnalysis[];
    skipKeywords: KeywordAnalysis[];
    summary: string;
  };

  const metricsMap = new Map(keywordsWithMetrics.map((m) => [m.keyword, m]));

  const enrichAnalysis = (items: KeywordAnalysis[]): KeywordAnalysis[] =>
    items.map((item) => ({ ...item, metrics: metricsMap.get(item.keyword) }));

  return {
    theme,
    targetKeywords: enrichAnalysis(parsed.targetKeywords ?? []),
    skipKeywords: enrichAnalysis(parsed.skipKeywords ?? []),
    summary: parsed.summary ?? '',
    generatedAt: new Date().toISOString(),
  };
}
