import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { GeminiClient } from "./gemini/client.js";
import type { BatchSearchResponse, SearchResult } from "./types/index.js";

// Initialize server
const server = new Server(
  {
    name: "gemini-grounding",
    vendor: "gemini-grounding-mcp",
    version: "1.0.0",
    description: "MCP server for Gemini AI web search with grounding",
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
      "Search the web using Google via Gemini AI grounding and get AI-generated summaries with citations",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "google_search_batch",
    description:
      "Search multiple queries in parallel and optionally scrape content from results",
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

        const result = await geminiClient.search(args.query);

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
  let output = `Batch Search Results (${result.totalQueries} queries)\n`;
  output += `${"=".repeat(50)}\n\n`;

  for (const queryResult of result.results) {
    output += `Query: "${queryResult.query}"\n`;
    output += `${"-".repeat(40)}\n`;

    if (queryResult.error) {
      output += `Error: ${queryResult.error}\n\n`;
      continue;
    }

    if (queryResult.summary) {
      output += `Summary: ${queryResult.summary}\n\n`;
    }

    if (queryResult.searchResults && queryResult.searchResults.length > 0) {
      output += "Search Results:\n";
      for (const [idx, result] of queryResult.searchResults.entries()) {
        output += `${idx + 1}. ${result.title}\n`;
        output += `   URL: ${result.url}\n`;
        if (result.snippet) {
          output += `   Snippet: ${result.snippet}\n`;
        }
      }
      output += "\n";
    }

    if (queryResult.scrapedContent && queryResult.scrapedContent.length > 0) {
      output += "Scraped Content:\n";
      for (const content of queryResult.scrapedContent) {
        output += `- ${content.title} (${content.url})\n`;
        if (content.error) {
          output += `  Error: ${content.error}\n`;
        } else if (content.excerpt) {
          output += `  Excerpt: ${content.excerpt}\n`;
        }
      }
    }

    output += "\n";
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
