#!/usr/bin/env node
import "dotenv/config";
import { GeminiClient } from "./gemini/client.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage:");
    console.log("  pnpm cli search <query>             - Single search");
    console.log("  pnpm cli --batch <query1> <query2>  - Batch search");
    console.log("  pnpm cli --scrape <url>             - Scrape URL");
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
      const queries = args.slice(1);
      if (queries.length === 0) {
        console.error("Error: No queries provided for batch search");
        process.exit(1);
      }

      console.log(`Searching for ${queries.length} queries...`);
      const result = await client.batchSearch(queries);
      console.log(JSON.stringify(result, null, 2));
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
