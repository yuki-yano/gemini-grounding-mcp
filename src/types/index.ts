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

// Enhanced citation formats
export interface EnhancedCitation extends Citation {
  excerpt?: string;      // Relevant excerpt from the source
  confidence?: number;   // Citation confidence score (0-1)
  context?: string;      // Context where citation was used
}

export interface TextSegment {
  text: string;
  citationIds: number[];  // Citation numbers associated with this segment
  startIndex: number;     // Start position in original text
  endIndex: number;       // End position in original text
}

export interface StructuredSearchResult {
  query: string;
  summary: string;          // Text with citation markers
  citations: EnhancedCitation[];
  structured: {
    segments: TextSegment[];  // Text broken down by citations
    citationMap: Map<number, EnhancedCitation>;
  };
  searchResults?: SearchResultDetail[];
  scrapedContent?: ScrapedContent[];
  metadata?: {
    searchResultCount?: number;
    targetResultCount?: number;
    processingTime?: number;
    citationCount?: number;
  };
}