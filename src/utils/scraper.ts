import type { ScrapedContent } from "../types/index";

// Dynamic import for ESM module
let readabilityModule: any = null;
const getReadability = async () => {
  if (!readabilityModule) {
    readabilityModule = await import("@mizchi/readability");
  }
  return readabilityModule;
};

interface CacheEntry {
  content: ScrapedContent;
  timestamp: number;
}

export class Scraper {
  private cache = new Map<string, CacheEntry>();
  private cacheTTL: number;
  private scrapeTimeout: number;
  private scrapeRetries: number;
  private excerptLength: number;
  private summaryLength: number;
  private geminiClient?: {
    summarize: (text: string, maxLength: number) => Promise<string>;
  };

  constructor(geminiClient?: {
    summarize: (text: string, maxLength: number) => Promise<string>;
  }) {
    this.geminiClient = geminiClient;
    this.cacheTTL = Number.parseInt(process.env.CACHE_TTL || "3600", 10) * 1000;
    this.scrapeTimeout = Number.parseInt(
      process.env.SCRAPE_TIMEOUT || "10000",
      10,
    );
    this.scrapeRetries = Number.parseInt(process.env.SCRAPE_RETRIES || "3", 10);
    this.excerptLength = Number.parseInt(
      process.env.EXCERPT_LENGTH || "1000",
      10,
    );
    this.summaryLength = Number.parseInt(
      process.env.SUMMARY_LENGTH || "5000",
      10,
    );

    // Log configuration for debugging
    if (process.env.DEBUG === "true") {
      console.log("Scraper configuration:", {
        excerptLength: this.excerptLength,
        summaryLength: this.summaryLength,
      });
    }
  }

  async scrapeUrl(
    url: string,
    options?: {
      retries?: number;
      contentMode?: "excerpt" | "summary" | "full";
      maxContentLength?: number;
    },
  ): Promise<ScrapedContent> {
    const maxRetries = options?.retries ?? this.scrapeRetries;
    const contentMode = options?.contentMode ?? "full";
    const maxContentLength = options?.maxContentLength ?? 10000;

    // Check cache first
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.content;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.scrapeTimeout,
        );

        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; GeminiGroundingMCP/1.0)",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();

        // Get readability module
        const { extract, toMarkdown } = await getReadability();

        // Extract readable content
        const extracted = extract(html, {
          charThreshold: 100,
          url: url,
        });

        if (!extracted || !extracted.root) {
          throw new Error("Failed to extract content from URL");
        }

        // Convert to Markdown
        const fullMarkdown = toMarkdown(extracted.root);

        // Process content based on mode
        let processedContent: string;

        switch (contentMode) {
          case "excerpt":
            // Use Gemini to create an excerpt
            if (
              this.geminiClient &&
              fullMarkdown.length > this.excerptLength * 1.5
            ) {
              try {
                processedContent = await this.geminiClient.summarize(
                  fullMarkdown,
                  this.excerptLength,
                );
              } catch (error) {
                console.error(
                  "Failed to generate AI excerpt, falling back to truncation:",
                  error,
                );
                // Fallback to simple truncation
                processedContent = fullMarkdown.slice(0, this.excerptLength);
                if (fullMarkdown.length > this.excerptLength) {
                  processedContent += "...";
                }
              }
            } else {
              // For short content or no Gemini client, just truncate
              processedContent = fullMarkdown.slice(0, this.excerptLength);
              if (fullMarkdown.length > this.excerptLength) {
                processedContent += "...";
              }
            }
            break;

          case "summary":
            // Use Gemini to create a summary
            if (
              this.geminiClient &&
              fullMarkdown.length > this.summaryLength * 1.2
            ) {
              try {
                processedContent = await this.geminiClient.summarize(
                  fullMarkdown,
                  this.summaryLength,
                );
              } catch (error) {
                console.error(
                  "Failed to generate AI summary, falling back to truncation:",
                  error,
                );
                // Fallback to truncation
                processedContent = fullMarkdown.slice(0, this.summaryLength);
                if (fullMarkdown.length > this.summaryLength) {
                  processedContent +=
                    "\n\n[Content truncated for summary mode]";
                }
              }
            } else {
              // For short content or no Gemini client, just truncate
              processedContent = fullMarkdown.slice(0, this.summaryLength);
              if (fullMarkdown.length > this.summaryLength) {
                processedContent += "\n\n[Content truncated for summary mode]";
              }
            }
            break;
          default:
            // Apply maxContentLength if specified
            if (fullMarkdown.length > maxContentLength) {
              processedContent = fullMarkdown.slice(0, maxContentLength);
              processedContent += `\n\n[Content truncated at ${maxContentLength} characters]`;
            } else {
              processedContent = fullMarkdown;
            }
            break;
        }

        // Add metadata
        const result: ScrapedContent = {
          url,
          title: extracted.metadata?.title || "Scraped Content",
          content: processedContent,
          scrapedAt: new Date().toISOString(),
        };

        // Cache the result
        this.cache.set(url, {
          content: result,
          timestamp: Date.now(),
        });

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");
        console.error(
          `Failed to scrape ${url} (attempt ${attempt}/${maxRetries}):`,
          lastError.message,
        );

        // If not the last attempt, wait before retrying
        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, 2 ** (attempt - 1) * 1000),
          ); // Exponential backoff
        }
      }
    }

    // All retries failed, return error result
    const errorMessage = lastError?.message || "Unknown error";
    return {
      url,
      title: "Error",
      content: null,
      error: errorMessage,
      scrapedAt: new Date().toISOString(),
    };
  }

  async scrapeUrls(
    urls: string[],
    options?: {
      contentMode?: "excerpt" | "summary" | "full";
      maxContentLength?: number;
    },
  ): Promise<ScrapedContent[]> {
    const batchSize = Number.parseInt(process.env.BATCH_SIZE || "5", 10);
    const results: ScrapedContent[] = [];

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((url) => this.scrapeUrl(url, options)),
      );
      results.push(...batchResults);

      // Add small delay between batches
      if (i + batchSize < urls.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
