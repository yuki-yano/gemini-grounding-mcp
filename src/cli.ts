#!/usr/bin/env node
import "dotenv/config";
import { GeminiClient } from "./gemini/client";
import type { BatchSearchResponse } from "./types/index";

function formatBatchResultAsMarkdown(result: BatchSearchResponse): string {
  let output = `# Batch Search Results (${result.totalQueries} ${result.totalQueries === 1 ? "query" : "queries"})\n\n`;

  let queryIndex = 0;
  for (const queryResult of result.results) {
    queryIndex++;
    output += `## Query ${queryIndex}: "${queryResult.query}"\n\n`;

    if (queryResult.error) {
      output += `❌ **Error**: ${queryResult.error}\n\n`;
      output += `---\n\n`;
      continue;
    }

    if (queryResult.summary) {
      output += `### Summary\n\n${queryResult.summary}\n\n`;
    }

    if (queryResult.searchResults && queryResult.searchResults.length > 0) {
      const resultCount =
        queryResult.searchResultCount || queryResult.searchResults.length;
      const targetCount = queryResult.targetResultCount || 5;
      output += `### Search Results (${resultCount}/${targetCount})\n\n`;

      for (const [idx, result] of queryResult.searchResults.entries()) {
        output += `**${idx + 1}. ${result.title}**\n`;
        output += `- URL: ${result.url}\n`;
        if (result.snippet) {
          output += `- Snippet: ${result.snippet}\n`;
        }
        output += "\n";
      }
    }

    if (queryResult.scrapedContent && queryResult.scrapedContent.length > 0) {
      output += `### Scraped Content\n\n`;

      for (const content of queryResult.scrapedContent) {
        if (content.error) {
          output += `❌ **Failed**: ${content.title}\n`;
          output += `- URL: ${content.url}\n`;
          output += `- Error: ${content.error}\n\n`;
        } else {
          output += `✅ **${content.title}**\n`;
          output += `- URL: ${content.url}\n`;
          if (content.excerpt) {
            output += `- Excerpt: ${content.excerpt}\n`;
          }
          output += "\n";
        }
      }
    }

    output += `---\n\n`;
  }

  return output;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage:");
    console.log(
      "  pnpm cli search <query>                     - Single search",
    );
    console.log("  pnpm cli --batch <query1> <query2>          - Batch search");
    console.log(
      "  pnpm cli --batch --format=markdown <queries> - Batch search with markdown output",
    );
    console.log(
      "  pnpm cli --batch --no-scrape <queries>      - Batch search without scraping",
    );
    console.log("  pnpm cli --scrape <url>                     - Scrape URL");
    process.exit(0);
  }

  try {
    const client = new GeminiClient();

    if (args[0] === "search" && args.length > 1) {
      // Single search with "search" command
      const query = args.slice(1).join(" ");
      console.log(`Searching for: "${query}"...`);

      const result = await client.search(query);

      if ("error" in result) {
        console.error(`Error: ${result.message}`);
        process.exit(1);
      }

      console.log(`\n${result.summary}`);

      if (result.citations && result.citations.length > 0) {
        console.log("\nSources:");
        for (const citation of result.citations) {
          console.log(`[${citation.number}] ${citation.title}`);
          console.log(`    ${citation.url}`);
        }
      }
    } else if (args[0] === "--batch") {
      // Parse options
      let format = "json";
      let scrapeContent = true;
      const queries: string[] = [];

      for (let i = 1; i < args.length; i++) {
        if (args[i].startsWith("--format=")) {
          format = args[i].split("=")[1];
        } else if (args[i] === "--no-scrape") {
          scrapeContent = false;
        } else if (!args[i].startsWith("--")) {
          queries.push(args[i]);
        }
      }

      if (queries.length === 0) {
        console.error("Error: No queries provided for batch search");
        process.exit(1);
      }

      console.log(
        `Searching for ${queries.length} queries (format: ${format}, scraping: ${scrapeContent})...`,
      );
      const result = await client.batchSearch(queries, { scrapeContent });

      if (format === "markdown") {
        // Format as markdown
        console.log(formatBatchResultAsMarkdown(result));
      } else {
        // Default JSON format
        console.log(JSON.stringify(result, null, 2));
      }
    } else if (args[0] === "--scrape") {
      const url = args[1];
      if (!url) {
        console.error("Error: No URL provided for scraping");
        process.exit(1);
      }

      console.log(`Scraping ${url}...`);
      const result = await client.scrapeUrl(url);
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Single search
      const query = args.join(" ");
      console.log(`Searching for: "${query}"...`);

      const result = await client.search(query);

      if ("error" in result) {
        console.error(`Error: ${result.message}`);
        process.exit(1);
      }

      console.log(`\n${result.summary}`);

      if (result.citations && result.citations.length > 0) {
        console.log("\nSources:");
        for (const citation of result.citations) {
          console.log(`[${citation.number}] ${citation.title}`);
          console.log(`    ${citation.url}`);
        }
      }
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
