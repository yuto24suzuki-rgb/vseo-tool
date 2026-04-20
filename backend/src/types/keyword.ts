export interface KeywordMetrics {
  keyword: string;
  avgMonthlySearches: number;
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  competitionIndex: number;
  lowTopOfPageBidMicros?: number;
  highTopOfPageBidMicros?: number;
}

export interface KeywordAnalysis {
  keyword: string;
  metrics?: KeywordMetrics;
  classification: 'target' | 'skip';
  priority?: 'high' | 'medium' | 'low';
  intent?: string;
  reason: string;
}

export interface AnalysisResult {
  theme: string;
  targetKeywords: KeywordAnalysis[];
  skipKeywords: KeywordAnalysis[];
  summary: string;
  generatedAt: string;
}
