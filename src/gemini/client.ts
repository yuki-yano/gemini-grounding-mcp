import {
  type GenerativeModel,
  GoogleGenerativeAI,
  type GoogleSearchRetrievalTool,
} from "@google/generative-ai";
import { AuthConfig } from "../auth/config";
import type {
  GeminiOAuthResponse,
  GeminiResponse,
  GroundingChunk,
  GroundingMetadata,
} from "../types/gemini";
import type {
  BatchSearchResponse,
  BatchSearchResult,
  Citation,
  ErrorResponse,
  SearchResult,
  SearchResultDetail,
} from "../types/index";
import {
  extractSearchResults,
  formatBatchResults,
  formatError,
  formatSearchResult,
  insertCitations,
} from "../utils/formatter";
import { Scraper } from "../utils/scraper";
import { CodeAssistClient } from "./code-assist-client";

interface SearchWithDetailsResult {
  summary: string;
  searchResults: SearchResultDetail[];
  citations: Citation[];
}

export class GeminiClient {
  private auth: AuthConfig;
  private scraper: Scraper;
  private model: GenerativeModel | null = null;
  private codeAssistClient: CodeAssistClient | null = null;

  constructor() {
    this.auth = new AuthConfig();
    this.scraper = new Scraper(this);
    this._initializeModel();

    // Initialize Code Assist client for OAuth
    if (this.auth.isOAuth()) {
      this.codeAssistClient = new CodeAssistClient(this.auth);
    }
  }

  private _initializeModel(): void {
    if (this.auth.isApiKey()) {
      const genAI = new GoogleGenerativeAI(this.auth.getApiKey());
      const searchTool: GoogleSearchRetrievalTool = {
        googleSearchRetrieval: {},
      };
      this.model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        tools: [searchTool],
      });
    }
  }

  async summarize(text: string, maxLength = 500): Promise<string> {
    try {
      const prompt = `Please provide a concise summary of the following text in about ${maxLength} characters. Focus on the main points and key information:\n\n${text}`;

      if (this.auth.isApiKey() && this.model) {
        const result = await this.model.generateContent(prompt);
        return result.response.text();
      } else {
        // Use OAuth path
        const response = await this._oauthRequest(prompt);
        return (
          response.candidates?.[0]?.content?.parts?.[0]?.text ||
          "Summary generation failed"
        );
      }
    } catch (error) {
      console.error("Summarization error:", error);
      // Fallback to excerpt if summarization fails
      return `${text.slice(0, maxLength)}...`;
    }
  }

  async searchWithOptions(
    query: string,
    _options?: {
      includeSearchResults?: boolean;
      maxResults?: number;
    },
  ): Promise<SearchResult | ErrorResponse> {
    // For now, call the regular search and we'll enhance it later
    const result = await this.search(query);

    // If includeSearchResults is requested, we need to fetch search results
    // This will be implemented after we refactor the search functionality

    return result;
  }

  async search(query: string): Promise<SearchResult | ErrorResponse> {
    try {
      let response: GeminiResponse;

      if (this.auth.isApiKey() && this.model) {
        // Use SDK for API key auth
        const result = await this.model.generateContent(query);
        response = result.response as GeminiResponse;

        // Process grounding metadata
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        if (groundingMetadata?.groundingSupports) {
          let text = response.text();
          text = insertCitations(text, groundingMetadata.groundingSupports);

          const result = formatSearchResult(
            {
              text,
              citations: this._extractCitations(groundingMetadata),
            },
            query,
          ) as SearchResult;

          return result;
        }

        return formatSearchResult(
          {
            text: response.text(),
            citations: [],
          },
          query,
        ) as SearchResult;
      } else {
        // Use direct API call for OAuth
        const oauthResponse = await this._oauthSearch(query);

        // Handle potential nested response structure from Code Assist API
        const candidates =
          oauthResponse.candidates || oauthResponse.response?.candidates;
        if (!candidates || candidates.length === 0) {
          throw new Error("No valid response from Code Assist API");
        }

        response = {
          candidates: candidates,
          text: () => candidates[0]?.content?.parts?.[0]?.text || "",
        };

        const candidate = candidates[0];
        if (candidate?.content?.parts?.[0]?.text) {
          let text = candidate.content.parts[0].text;
          const groundingMetadata = candidate.groundingMetadata;

          // Check if text already contains citations
          const citationPattern = /\[\d+\]/g;
          const existingCitations = text.match(citationPattern);

          if (existingCitations && existingCitations.length > 0) {
            // Text already has citations, remove duplicates
            text = this._removeDuplicateContent(text);
          } else if (groundingMetadata?.groundingSupports) {
            // Insert citations if not already present
            text = insertCitations(text, groundingMetadata.groundingSupports);
          }

          return formatSearchResult(
            {
              text,
              citations: this._extractCitations(groundingMetadata),
            },
            query,
          ) as SearchResult;
        }

        throw new Error("No valid response from Code Assist API");
      }
    } catch (error) {
      console.error("Search error:", error);
      return formatError(error as Error, { query });
    }
  }

  async batchSearch(
    queries: string[],
    options: {
      scrapeContent?: boolean;
      contentMode?: "excerpt" | "summary" | "full";
      maxContentLength?: number;
    } = { scrapeContent: true },
  ): Promise<BatchSearchResponse> {
    const results: BatchSearchResult[] = [];
    const DEFAULT_BATCH_SIZE = 5;
    const DEFAULT_RATE_LIMIT_DELAY_MS = 100;
    const batchSize = Number.parseInt(
      process.env.BATCH_SIZE || String(DEFAULT_BATCH_SIZE),
      10,
    );
    const delay = Number.parseInt(
      process.env.RATE_LIMIT_DELAY || String(DEFAULT_RATE_LIMIT_DELAY_MS),
      10,
    );

    // Process queries in batches
    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      const batchPromises = batch.map(
        async (query): Promise<BatchSearchResult> => {
          try {
            const searchResult = await this._searchWithDetails(query);

            // Extract URLs from search results
            const urls = searchResult.searchResults.map((r) => r.url);

            // Scrape content if requested
            const scrapedContent =
              options.scrapeContent && urls.length > 0
                ? await this.scraper.scrapeUrls(urls, {
                    contentMode: options.contentMode,
                    maxContentLength: options.maxContentLength,
                  })
                : [];

            return {
              query,
              summary: searchResult.summary,
              citations: searchResult.citations,
              searchResults: searchResult.searchResults,
              scrapedContent,
              searchResultCount: searchResult.searchResults.length,
              targetResultCount: 5,
            };
          } catch (error) {
            console.error(`Error processing query "${query}":`, error);
            return {
              query,
              error: (error as Error).message,
            };
          }
        },
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Rate limiting between batches
      if (i + batchSize < queries.length) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return formatBatchResults(results);
  }

  private async _searchWithDetails(
    query: string,
  ): Promise<SearchWithDetailsResult> {
    try {
      let response: GeminiResponse;

      if (this.auth.isApiKey() && this.model) {
        const result = await this.model.generateContent(query);
        response = result.response as GeminiResponse;
      } else {
        const apiResponse = await this._oauthSearch(query);
        const candidates =
          apiResponse.candidates || apiResponse.response?.candidates;
        response = {
          text: () => candidates?.[0]?.content?.parts?.[0]?.text || "",
          candidates: candidates,
        };
      }

      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const searchResults = extractSearchResults(groundingMetadata);

      let summary = response.text();

      // Check if text already contains citations
      const citationPattern = /\[\d+\]/g;
      const existingCitations = summary.match(citationPattern);

      if (!existingCitations && groundingMetadata?.groundingSupports) {
        summary = insertCitations(summary, groundingMetadata.groundingSupports);
      }

      return {
        summary,
        searchResults,
        citations: this._extractCitations(groundingMetadata),
      };
    } catch (error) {
      console.error("Search details error:", error);
      throw error;
    }
  }

  private async _oauthSearch(query: string): Promise<GeminiOAuthResponse> {
    if (!this.codeAssistClient) {
      throw new Error("Code Assist client not initialized");
    }

    // Use Code Assist API with proper project ID handling
    const response = await this.codeAssistClient.generateContent(
      "gemini-2.5-flash",
      query,
    );

    // Response from Code Assist API may have nested structure
    return response as GeminiOAuthResponse;
  }

  private async _oauthRequest(prompt: string): Promise<GeminiOAuthResponse> {
    if (!this.codeAssistClient) {
      throw new Error("Code Assist client not initialized");
    }

    // Use Code Assist API for general requests (without grounding)
    const response = await this.codeAssistClient.generateContent(
      "gemini-2.5-flash",
      prompt,
    );

    return response as GeminiOAuthResponse;
  }

  private _extractCitations(
    groundingMetadata: GroundingMetadata | undefined,
  ): Citation[] {
    if (!groundingMetadata || !groundingMetadata.groundingChunks) {
      return [];
    }

    return groundingMetadata.groundingChunks
      .filter((chunk: GroundingChunk) => chunk.web)
      .map((chunk: GroundingChunk, index: number) => ({
        number: index + 1,
        title: chunk.web?.title || "Untitled",
        url: chunk.web?.uri || "",
      }));
  }

  async scrapeUrl(url: string) {
    return this.scraper.scrapeUrl(url);
  }

  private _removeDuplicateContent(text: string): string {
    // Remove duplicate sentences that appear with different citation numbers
    // This handles the case where Code Assist API returns the same content
    // multiple times with different citations like [1], [4], [5], etc.
    const sentencePattern = /(?<=[.!?])(?:\[\d+\])*\s*/g;
    const sentences = text.split(sentencePattern).filter((s) => s.trim());

    const seenSentences = new Map<string, string>();
    const result: string[] = [];

    for (const sentence of sentences) {
      if (sentence.trim()) {
        // Create a normalized key by removing citations and extra whitespace
        const normalizedKey = sentence
          .replace(/\[\d+\]/g, "") // Remove citations
          .replace(/\s+/g, " ") // Normalize whitespace
          .trim()
          .toLowerCase();

        // If we haven't seen this sentence, add it
        if (!seenSentences.has(normalizedKey)) {
          seenSentences.set(normalizedKey, sentence);
          result.push(sentence);
        } else {
          // If the existing sentence doesn't have citations but this one does, use this one
          const existing = seenSentences.get(normalizedKey) || "";
          const existingHasCitations = /\[\d+\]/.test(existing);
          const currentHasCitations = /\[\d+\]/.test(sentence);

          if (!existingHasCitations && currentHasCitations) {
            // Replace with the version that has citations
            const index = result.indexOf(existing);
            if (index !== -1) {
              result[index] = sentence;
              seenSentences.set(normalizedKey, sentence);
            }
          }
        }
      }
    }

    // Join sentences back together
    return result
      .join(". ")
      .replace(/\.\s*\./g, ".")
      .trim();
  }
}
