import { extract, toMarkdown } from "@mizchi/readability";
import fetch from "node-fetch";
import type { ScrapedContent } from "../types/index.js";

interface CacheEntry {
  content: ScrapedContent;
  timestamp: number;
}

export class Scraper {
  private cache = new Map<string, CacheEntry>();
  private cacheTTL: number;

  constructor() {
    this.cacheTTL = Number.parseInt(process.env.CACHE_TTL || "3600", 10) * 1000;
  }

  async scrapeUrl(url: string): Promise<ScrapedContent> {
    // Check cache first
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.content;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

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

      // Extract readable content
      const extracted = extract(html, {
        charThreshold: 100,
      });

      if (!extracted || !extracted.root) {
        throw new Error("Failed to extract content from URL");
      }

      // Convert to Markdown
      const markdown = toMarkdown(extracted.root);

      // Add metadata
      const result: ScrapedContent = {
        url,
        title: "Scraped Content", // readabilityのextractはtitleを返さない
        content: markdown,
        excerpt: markdown.slice(0, 500) + (markdown.length > 500 ? "..." : ""),
        scrapedAt: new Date().toISOString(),
      };

      // Cache the result
      this.cache.set(url, {
        content: result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to scrape ${url}:`, errorMessage);

      // Return error result
      return {
        url,
        title: "Error",
        content: null,
        excerpt: `Failed to scrape content: ${errorMessage}`,
        error: errorMessage,
        scrapedAt: new Date().toISOString(),
      };
    }
  }

  async scrapeUrls(urls: string[]): Promise<ScrapedContent[]> {
    const batchSize = Number.parseInt(process.env.BATCH_SIZE || "5", 10);
    const results: ScrapedContent[] = [];

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((url) => this.scrapeUrl(url)),
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
