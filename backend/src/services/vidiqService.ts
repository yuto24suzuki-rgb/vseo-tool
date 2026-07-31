import axios from 'axios';
import type { VidiqKeywordStat } from '../types/keyword';

const MCP_PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_MCP_URL = 'https://mcp.vidiq.com/mcp';

export interface VidiqKeywordData {
  stats: VidiqKeywordStat[];
  rawContext: string;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, { type?: string; items?: { type?: string }; description?: string }>;
    required?: string[];
  };
}

interface McpToolCallResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export function isVidiqConfigured(): boolean {
  return !!process.env.VIDIQ_API_KEY;
}

function mcpUrl(): string {
  return process.env.VIDIQ_MCP_URL ?? DEFAULT_MCP_URL;
}

/**
 * SSE レスポンス（text/event-stream）から JSON-RPC レスポンスを抽出する。
 * Streamable HTTP の MCP サーバーは application/json と text/event-stream の
 * どちらでも応答しうるため両方を扱う。
 */
function parseRpcBody(body: string): JsonRpcResponse | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as JsonRpcResponse;
  }

  let last: JsonRpcResponse | null = null;
  for (const line of trimmed.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data) as JsonRpcResponse;
      if (parsed.result !== undefined || parsed.error !== undefined) last = parsed;
    } catch {
      // JSON でない SSE データは無視
    }
  }
  return last;
}

class VidiqMcpClient {
  private sessionId: string | null = null;
  private nextId = 1;

  private async post(payload: object): Promise<{ rpc: JsonRpcResponse | null; sessionId?: string }> {
    const response = await axios.post<string>(mcpUrl(), payload, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${process.env.VIDIQ_API_KEY}`,
        'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
        ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      },
      responseType: 'text',
      transformResponse: [(data: string) => data],
      timeout: 60_000,
    });

    const sessionId = response.headers['mcp-session-id'] as string | undefined;
    if (sessionId) this.sessionId = sessionId;
    return { rpc: parseRpcBody(response.data ?? '') };
  }

  private async request(method: string, params?: object): Promise<unknown> {
    const id = this.nextId++;
    const { rpc } = await this.post({ jsonrpc: '2.0', id, method, params });
    if (!rpc) throw new Error(`vidIQ MCP: ${method} から応答がありませんでした`);
    if (rpc.error) throw new Error(`vidIQ MCP: ${method} エラー — ${rpc.error.message}`);
    return rpc.result;
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'vseo-tool', version: '1.0.0' },
    });
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' });
  }

  async listTools(): Promise<McpTool[]> {
    const result = (await this.request('tools/list')) as { tools?: McpTool[] };
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    return (await this.request('tools/call', { name, arguments: args })) as McpToolCallResult;
  }
}

/**
 * ツールの inputSchema を見て、テーマ／キーワードリストを適切な引数名で渡す。
 * vidIQ MCP のツール名・引数名の変更に耐えられるよう動的にマッピングする。
 */
function buildToolArgs(tool: McpTool, theme: string, keywords: string[]): Record<string, unknown> {
  const props = tool.inputSchema?.properties ?? {};
  const args: Record<string, unknown> = {};

  const queryKey = Object.keys(props).find((key) =>
    /^(query|keyword|seed|term|q|search|topic)/i.test(key) && props[key].type !== 'array'
  );
  const listKey = Object.keys(props).find((key) => props[key].type === 'array');

  if (queryKey) args[queryKey] = theme;
  if (listKey) args[listKey] = keywords.slice(0, 50);

  // スキーマが取れない場合の素朴なフォールバック
  if (!queryKey && !listKey) args.query = theme;

  return args;
}

/** vidIQ のレスポンス JSON からキーワード統計をゆるくマイニングする */
function extractStats(value: unknown, stats: Map<string, VidiqKeywordStat>, depth = 0): void {
  if (depth > 6 || value == null) return;

  if (Array.isArray(value)) {
    for (const item of value) extractStats(item, stats, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;

  const obj = value as Record<string, unknown>;
  const keywordField = ['keyword', 'term', 'query', 'name', 'text'].find(
    (f) => typeof obj[f] === 'string' && (obj[f] as string).trim().length > 0
  );

  if (keywordField) {
    const toNumber = (v: unknown): number | undefined => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
      return undefined;
    };
    const findNumber = (patterns: RegExp): number | undefined => {
      for (const [key, v] of Object.entries(obj)) {
        if (patterns.test(key)) {
          const n = toNumber(v);
          if (n !== undefined) return n;
        }
      }
      return undefined;
    };

    const stat: VidiqKeywordStat = {
      keyword: (obj[keywordField] as string).trim(),
      searchVolume: findNumber(/volume|searches/i),
      competition: findNumber(/competition/i),
      score: findNumber(/^(score|overall|vidiq)/i),
    };
    if (stat.searchVolume !== undefined || stat.competition !== undefined || stat.score !== undefined) {
      const key = stat.keyword.toLowerCase();
      if (!stats.has(key)) stats.set(key, stat);
    }
  }

  for (const v of Object.values(obj)) extractStats(v, stats, depth + 1);
}

function collectResultText(result: McpToolCallResult): string {
  const parts: string[] = [];
  if (result.structuredContent !== undefined) {
    parts.push(JSON.stringify(result.structuredContent));
  }
  for (const item of result.content ?? []) {
    if (item.type === 'text' && item.text) parts.push(item.text);
  }
  return parts.join('\n');
}

/**
 * vidIQ MCP サーバーからテーマ関連のキーワードデータを取得する。
 * 未設定・エラー時は null を返し、パイプラインは vidIQ なしで続行する。
 */
export async function fetchVidiqKeywordData(
  theme: string,
  keywords: string[]
): Promise<VidiqKeywordData | null> {
  if (!isVidiqConfigured()) {
    console.warn('vidIQ API not configured — skipping vidIQ enrichment');
    return null;
  }

  try {
    const client = new VidiqMcpClient();
    await client.initialize();

    const tools = await client.listTools();
    const keywordTools = tools.filter((t) =>
      /keyword/i.test(`${t.name} ${t.description ?? ''}`)
    );
    if (keywordTools.length === 0) {
      console.warn('vidIQ MCP: キーワード関連ツールが見つかりませんでした');
      return null;
    }

    const stats = new Map<string, VidiqKeywordStat>();
    const rawParts: string[] = [];

    // キーワード関連ツールを最大2つまで呼び出す（リサーチ系＋関連キーワード系など）
    for (const tool of keywordTools.slice(0, 2)) {
      try {
        const result = await client.callTool(tool.name, buildToolArgs(tool, theme, keywords));
        if (result.isError) continue;
        const text = collectResultText(result);
        if (!text) continue;
        rawParts.push(`### ${tool.name}\n${text}`);
        try {
          extractStats(JSON.parse(text.trim()), stats);
        } catch {
          // JSON でないテキスト応答は rawContext としてのみ利用
        }
        if (result.structuredContent !== undefined) {
          extractStats(result.structuredContent, stats);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`vidIQ MCP: ツール ${tool.name} の呼び出しに失敗 — ${message}`);
      }
    }

    if (rawParts.length === 0) return null;

    const MAX_CONTEXT = 8000;
    const rawContext = rawParts.join('\n\n').slice(0, MAX_CONTEXT);
    return { stats: Array.from(stats.values()), rawContext };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`vidIQ MCP との連携に失敗しました — ${message}`);
    return null;
  }
}
