export interface SearchResult {
  query: string;
  summary: string;
  citations: Citation[];
}

export interface Citation {
  number: number;
  title: string;
  url: string;
}

export interface SearchResultDetail {
  title: string;
  url: string;
  snippet: string;
}

export interface ScrapedContent {
  url: string;
  title: string;
  content: string | null;
  excerpt: string;
  error?: string;
  scrapedAt: string;
}

export interface BatchSearchResult {
  query: string;
  summary?: string;
  searchResults?: SearchResultDetail[];
  scrapedContent?: ScrapedContent[];
  error?: string;
  searchResultCount?: number;
  targetResultCount?: number;
}

export interface BatchSearchResponse {
  totalQueries: number;
  results: BatchSearchResult[];
}

export interface ErrorResponse {
  error: boolean;
  message: string;
  context: unknown;
  timestamp: string;
}

export interface AuthMethod {
  type: "api-key" | "oauth";
  value: string;
}
