import axios from 'axios';
import type { KeywordMetrics } from '../types/keyword';

const GOOGLE_ADS_API_VERSION = 'v18';

async function getAccessToken(): Promise<string> {
  const response = await axios.post<{ access_token: string }>(
    'https://oauth2.googleapis.com/token',
    {
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }
  );
  return response.data.access_token;
}

interface GoogleAdsMetricsResult {
  text: string;
  keywordMetrics?: {
    avgMonthlySearches?: string;
    competition?: string;
    competitionIndex?: string;
    lowTopOfPageBidMicros?: string;
    highTopOfPageBidMicros?: string;
  };
}

async function fetchMetricsBatch(
  keywords: string[],
  accessToken: string,
  customerId: string
): Promise<KeywordMetrics[]> {
  const response = await axios.post<{ results?: GoogleAdsMetricsResult[] }>(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/keywordPlanIdeas:generateKeywordHistoricalMetrics`,
    {
      keywords,
      language: 'languageConstants/1017',
      geoTargetConstants: ['geoTargetConstants/2392'],
      keywordPlanNetwork: 'GOOGLE_SEARCH',
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
        'Content-Type': 'application/json',
      },
    }
  );

  return (response.data.results ?? []).map((result) => {
    const m = result.keywordMetrics;
    return {
      keyword: result.text,
      avgMonthlySearches: m?.avgMonthlySearches ? parseInt(m.avgMonthlySearches, 10) : 0,
      competition: (m?.competition ?? 'UNKNOWN') as KeywordMetrics['competition'],
      competitionIndex: m?.competitionIndex ? parseInt(m.competitionIndex, 10) : 0,
      lowTopOfPageBidMicros: m?.lowTopOfPageBidMicros
        ? parseInt(m.lowTopOfPageBidMicros, 10)
        : undefined,
      highTopOfPageBidMicros: m?.highTopOfPageBidMicros
        ? parseInt(m.highTopOfPageBidMicros, 10)
        : undefined,
    };
  });
}

function isGoogleAdsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID
  );
}

export async function getKeywordMetrics(keywords: string[]): Promise<KeywordMetrics[]> {
  if (!isGoogleAdsConfigured()) {
    console.warn('Google Ads API not configured — returning UNKNOWN metrics');
    return keywords.map((keyword) => ({
      keyword,
      avgMonthlySearches: 0,
      competition: 'UNKNOWN',
      competitionIndex: 0,
    }));
  }

  const accessToken = await getAccessToken();
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, '');

  const BATCH_SIZE = 50;
  const batches: string[][] = [];
  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    batches.push(keywords.slice(i, i + BATCH_SIZE));
  }

  const batchResults = await Promise.all(
    batches.map((batch) => fetchMetricsBatch(batch, accessToken, customerId))
  );

  const resultMap = new Map<string, KeywordMetrics>();
  for (const result of batchResults.flat()) {
    resultMap.set(result.keyword, result);
  }

  return keywords.map(
    (keyword) =>
      resultMap.get(keyword) ?? {
        keyword,
        avgMonthlySearches: 0,
        competition: 'UNKNOWN',
        competitionIndex: 0,
      }
  );
}
