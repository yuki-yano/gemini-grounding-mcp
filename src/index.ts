import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { GeminiClient } from "./gemini/client";
import type { BatchSearchResponse, SearchResult } from "./types/index";

// Get package.json version
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
);

// Initialize server
const server = new Server(
  {
    name: "gemini-grounding",
    vendor: "gemini-grounding-mcp",
    version: packageJson.version,
    description: packageJson.description,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Initialize Gemini client
let geminiClient: GeminiClient;

try {
  geminiClient = new GeminiClient();
} catch (error) {
  console.error("Failed to initialize Gemini client:", error);
  process.exit(1);
}

// Define tools
const TOOLS = [
  {
    name: "google_search",
    description:
      "Uses Google Search via Gemini AI grounding to find information and provide synthesized answers with citations. Returns AI-generated summaries rather than raw search results.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to find information on the web",
        },
        includeSearchResults: {
          type: "boolean",
          description: "Include raw search results in addition to AI summary",
          default: false,
        },
        maxResults: {
          type: "number",
          description: "Maximum number of search results to return",
          default: 5,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "google_search_batch",
    description:
      "Search multiple queries in parallel and optionally scrape content from results. Processes up to 10 queries simultaneously for comprehensive research.",
    inputSchema: {
      type: "object",
      properties: {
        queries: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Array of search queries (max 10)",
          minItems: 1,
          maxItems: 10,
        },
        scrapeContent: {
          type: "boolean",
          description: "Whether to scrape full content from search result URLs",
          default: true,
        },
        contentMode: {
          type: "string",
          enum: ["excerpt", "summary", "full"],
          description:
            "Content extraction mode: excerpt (AI summary ~1000 chars), summary (AI summary ~3000 chars), or full",
          default: "full",
        },
        maxContentLength: {
          type: "number",
          description: "Maximum content length for full mode (default: 10000)",
          default: 10000,
        },
      },
      required: ["queries"],
    },
  },
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "google_search": {
        if (!args?.query || typeof args.query !== "string") {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Query parameter is required and must be a string",
          );
        }

        const result = await geminiClient.searchWithOptions(args.query, {
          includeSearchResults: args.includeSearchResults as
            | boolean
            | undefined,
          maxResults: args.maxResults as number | undefined,
        });

        if ("error" in result && result.error) {
          throw new McpError(ErrorCode.InternalError, result.message);
        }

        return {
          content: [
            {
              type: "text",
              text: formatSearchResult(result as SearchResult),
            },
          ],
        };
      }

      case "google_search_batch": {
        if (!args?.queries || !Array.isArray(args.queries)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Queries parameter is required and must be an array",
          );
        }

        if (args.queries.length === 0 || args.queries.length > 10) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Queries array must contain between 1 and 10 items",
          );
        }

        const scrapeContent = args.scrapeContent !== false;
        const result = await geminiClient.batchSearch(args.queries, {
          scrapeContent,
          contentMode: args.contentMode as
            | "excerpt"
            | "summary"
            | "full"
            | undefined,
          maxContentLength: args.maxContentLength as number | undefined,
        });

        return {
          content: [
            {
              type: "text",
              text: formatBatchSearchResult(result),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    console.error(`Error in tool ${name}:`, error);
    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : "An unknown error occurred",
    );
  }
});

// Format search result for display
function formatSearchResult(result: SearchResult): string {
  let output = `Query: "${result.query}"\n\n`;
  output += `${result.summary}\n`;

  if (result.citations && result.citations.length > 0) {
    output += "\nCitations:\n";
    for (const citation of result.citations) {
      output += `[${citation.number}] ${citation.title}\n    ${citation.url}\n`;
    }
  }

  return output;
}

// Format batch search result for display
function formatBatchSearchResult(result: BatchSearchResponse): string {
  let output = `# Batch Search Results (${result.totalQueries} ${result.totalQueries === 1 ? "query" : "queries"})\n\n`;
  output += `${"=".repeat(50)}\n\n`;

  let queryIndex = 0;
  for (const queryResult of result.results) {
    queryIndex++;
    output += `## Query ${queryIndex}: "${queryResult.query}"\n\n`;

    if (queryResult.error) {
      output += `❌ **Error**: ${queryResult.error}\n\n`;
      output += `${"-".repeat(50)}\n\n`;
      continue;
    }

    // Summary with proper formatting
    if (queryResult.summary) {
      output += `### Summary\n\n${queryResult.summary}\n\n`;
    }

    // Citations
    if (queryResult.citations && queryResult.citations.length > 0) {
      output += `### Citations\n`;
      for (const citation of queryResult.citations) {
        output += `[${citation.number}] ${citation.title}\n    ${citation.url}\n`;
      }
      output += "\n";
    }

    // Search results with count indicator
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

    // Scraped content with better formatting
    if (queryResult.scrapedContent && queryResult.scrapedContent.length > 0) {
      output += `### Scraped Content\n\n`;

      let successCount = 0;
      let failureCount = 0;

      for (const content of queryResult.scrapedContent) {
        if (content.error) {
          failureCount++;
          output += `#### ❌ Failed: ${content.title}\n`;
          output += `- URL: ${content.url}\n`;
          output += `- Error: ${content.error}\n\n`;
        } else {
          successCount++;
          output += `#### ✅ ${content.title}\n`;
          output += `- URL: ${content.url}\n`;
          if (content.content) {
            const contentPreview = content.content.slice(0, 200);
            output += `- Content Preview: ${contentPreview}${content.content.length > 200 ? "..." : ""}\n`;
            output += `- Full Length: ${content.content.length} characters\n`;
          }
          output += "\n";
        }
      }

      if (successCount > 0 || failureCount > 0) {
        output += `📊 **Scraping Stats**: ${successCount} succeeded, ${failureCount} failed\n\n`;
      }
    }

    output += `${"-".repeat(50)}\n\n`;
  }

  return output;
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gemini Grounding MCP server started");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
