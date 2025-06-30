#!/usr/bin/env node
import "dotenv/config";
import { GeminiClient } from "./gemini/client";
import type { BatchSearchResponse } from "./types/index";

function formatBatchResultAsMarkdown(result: BatchSearchResponse): string {
  let output = `# Batch Search Results\n\n`;
  output += `**Total Queries**: ${result.totalQueries}\n\n`;

  for (const [idx, queryResult] of result.results.entries()) {
    output += `## ${idx + 1}. ${queryResult.query}\n\n`;

    if (queryResult.error) {
      output += `> ❌ **Error**: ${queryResult.error}\n\n`;
      output += `---\n\n`;
      continue;
    }

    // Main summary content
    if (queryResult.summary) {
      output += queryResult.summary;
      output += "\n\n";
    }

    // Citations section (if present)
    if (queryResult.citations && queryResult.citations.length > 0) {
      output += "### Sources\n\n";
      for (const citation of queryResult.citations) {
        output += `[${citation.number}] **${citation.title}**  \n`;
        output += `${citation.url}\n\n`;
      }
    }

    // Scraped content summary (if present and contains content)
    if (queryResult.scrapedContent && queryResult.scrapedContent.length > 0) {
      const successfulScrapes = queryResult.scrapedContent.filter(
        (c) => !c.error,
      );
      if (successfulScrapes.length > 0) {
        output += `### Additional Content Summary\n\n`;
        output += `Successfully scraped ${successfulScrapes.length} out of ${queryResult.scrapedContent.length} sources.\n\n`;

        // Show brief summary of scraped content
        for (const content of successfulScrapes.slice(0, 3)) {
          output += `- **${content.title}**  \n`;
          if (content.content) {
            const shortExcerpt =
              content.content.substring(0, 150) +
              (content.content.length > 150 ? "..." : "");
            output += `  ${shortExcerpt}\n\n`;
          }
        }

        if (successfulScrapes.length > 3) {
          output += `\n*...and ${successfulScrapes.length - 3} more sources*\n\n`;
        }
      }
    }

    output += `---\n\n`;
  }

  return output.trim();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage:");
    console.log(
      "  pnpm cli <query>                            - Single search",
    );
    console.log(
      "  pnpm cli --batch <query1> <query2>         - Batch search (default: markdown + summary)",
    );
    console.log(
      "  pnpm cli --batch --format=json <queries>    - Batch search with JSON output",
    );
    console.log(
      "  pnpm cli --batch --no-scrape <queries>      - Batch search without scraping",
    );
    console.log(
      "  pnpm cli --batch --content-mode=full <queries> - Batch search with full content",
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
      let format = "markdown"; // Default to markdown format
      let scrapeContent = true;
      let contentMode: "excerpt" | "summary" | "full" = "summary"; // Default to summary mode
      const queries: string[] = [];

      for (let i = 1; i < args.length; i++) {
        if (args[i].startsWith("--format=")) {
          format = args[i].split("=")[1];
        } else if (args[i] === "--no-scrape") {
          scrapeContent = false;
        } else if (args[i].startsWith("--content-mode=")) {
          contentMode = args[i].split("=")[1] as "excerpt" | "summary" | "full";
        } else if (!args[i].startsWith("--")) {
          queries.push(args[i]);
        }
      }

      if (queries.length === 0) {
        console.error("Error: No queries provided for batch search");
        process.exit(1);
      }

      console.log(
        `Searching for ${queries.length} queries (format: ${format}, scraping: ${scrapeContent}, content mode: ${contentMode})...`,
      );
      const result = await client.batchSearch(queries, {
        scrapeContent,
        contentMode,
      });

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
