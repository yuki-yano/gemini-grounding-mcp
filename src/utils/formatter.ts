import type { GroundingMetadata, GroundingSupport } from "../types/gemini.js";
import type {
  BatchSearchResponse,
  BatchSearchResult,
  Citation,
  ErrorResponse,
  SearchResult,
  SearchResultDetail,
} from "../types/index.js";

interface FormatterResponse {
  text?: string;
  citations?: Citation[];
}

export class Formatter {
  static formatSearchResult(
    response: FormatterResponse,
    query: string,
  ): SearchResult | ErrorResponse {
    if (!response || !response.text) {
      return {
        query,
        summary: `No results found for query: "${query}"`,
        citations: [],
      };
    }

    return {
      query,
      summary: response.text,
      citations: response.citations || [],
    };
  }

  static formatBatchResults(results: BatchSearchResult[]): BatchSearchResponse {
    return {
      totalQueries: results.length,
      results: results.map((result) => ({
        query: result.query,
        summary: result.summary,
        searchResults: result.searchResults || [],
        scrapedContent: result.scrapedContent || [],
        error: result.error,
        searchResultCount: result.searchResultCount,
        targetResultCount: result.targetResultCount,
      })),
    };
  }

  static extractSearchResults(
    groundingMetadata?: GroundingMetadata,
  ): SearchResultDetail[] {
    if (!groundingMetadata || !groundingMetadata.groundingSupports) {
      return [];
    }

    const results: SearchResultDetail[] = [];
    const seen = new Set<string>();

    for (const support of groundingMetadata.groundingSupports) {
      if (
        support.groundingChunkIndices &&
        support.groundingChunkIndices.length > 0
      ) {
        const chunkIndex = support.groundingChunkIndices[0];
        const chunk = groundingMetadata.groundingChunks?.[chunkIndex];

        if (chunk?.web) {
          const url = chunk.web.uri;
          if (!seen.has(url)) {
            seen.add(url);
            results.push({
              title: chunk.web.title || "Untitled",
              url,
              snippet: support.segment?.text || "",
            });
          }
        }
      }
    }

    const MAX_SEARCH_RESULTS = 5;
    return results.slice(0, MAX_SEARCH_RESULTS);
  }

  static insertCitations(
    text: string,
    groundingSupports: GroundingSupport[],
  ): string {
    if (!groundingSupports || groundingSupports.length === 0) {
      return text;
    }

    // Sort supports by endIndex in descending order to avoid index shifting
    const sortedSupports = [...groundingSupports].sort((a, b) => {
      const aIndex = a.endIndex ?? a.segment?.endIndex ?? 0;
      const bIndex = b.endIndex ?? b.segment?.endIndex ?? 0;
      return bIndex - aIndex;
    });

    let result = text;
    const insertedPositions = new Set<number>();

    for (const support of sortedSupports) {
      if (
        support.groundingChunkIndices &&
        support.groundingChunkIndices.length > 0
      ) {
        // Collect all citation numbers for this support
        const citations = support.groundingChunkIndices
          .map((idx) => `[${idx + 1}]`)
          .join("");

        // Avoid duplicate citations at the same position
        const position = support.endIndex ?? support.segment?.endIndex;

        if (!position) {
          continue;
        }

        if (!insertedPositions.has(position)) {
          insertedPositions.add(position);
          result =
            result.slice(0, position) + citations + result.slice(position);
        }
      }
    }

    return result;
  }

  static formatError(error: Error, context: unknown): ErrorResponse {
    return {
      error: true,
      message: error.message || "An unknown error occurred",
      context,
      timestamp: new Date().toISOString(),
    };
  }
}
