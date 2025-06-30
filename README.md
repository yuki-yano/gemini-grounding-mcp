# Gemini Grounding MCP Server

A Model Context Protocol (MCP) server that provides AI-powered web search using Gemini AI's grounding feature. Unlike traditional search tools that return raw results, this server uses Gemini AI to synthesize information and provide comprehensive answers with citations.

## Features

- **AI-Powered Search**: Uses Gemini AI to search the web and provide synthesized answers
- **Smart Summaries**: Returns AI-generated summaries with proper citations and source URLs
- **Batch Search**: Process multiple queries in parallel with optional content scraping
- **Flexible Content Modes**: Choose between AI-generated excerpts (1000 chars), summaries (3000 chars), or full content
- **Enhanced Citations**: Structured citation format with context, confidence scores, and intelligent text segmentation
- **Dual Authentication**: Supports OAuth (recommended) and API key authentication
- **MCP Compatible**: Works seamlessly with Claude Code and other MCP clients
- **Inspired by**: [mcp-gemini-grounding](https://github.com/ml0-1337/mcp-gemini-grounding) (Go implementation)

## Prerequisites

- Node.js 18 or later
- pnpm (recommended) or npm
- Gemini API access (OAuth credentials recommended, or API key)

## Installation

### Quick Start with npx (Recommended)

You can run the server directly without installation:

```bash
# Run as MCP server
npx gemini-grounding-mcp

# Test with CLI interface
npx gemini-grounding-mcp --cli
```

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/yuki-yano/gemini-grounding-mcp.git
cd gemini-grounding-mcp

# Install dependencies (pnpm recommended)
pnpm install
```

### Global Installation

```bash
# Install globally
npm install -g gemini-grounding-mcp

# Run the server
gemini-grounding-mcp
```

## Configuration

### Authentication

The server supports two authentication methods:

#### 1. OAuth Credentials (Recommended)
OAuth is the recommended authentication method as it provides better security and doesn't require managing API keys.

The server uses OAuth credentials from `~/.gemini/oauth_creds.json`, which are created when you authenticate with the Gemini CLI:

```bash
# Install Gemini CLI if not already installed
npm install -g @google/gemini-cli

# Authenticate with your Google account
gemini auth login
```

This will open your browser for authentication and save the credentials securely.

**Benefits of OAuth:**
- No API keys to manage or expose
- Automatic token refresh
- Better security through standard OAuth flow
- Uses Google Code Assist API with enhanced capabilities

#### 2. API Key (Alternative)
If you prefer using an API key or OAuth is not available in your environment:

```bash
# Create .env file
cp .env.example .env

# Edit .env and add your API key
GEMINI_API_KEY=your-api-key-here
```

Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

**Note**: While API keys are simpler to set up, OAuth is recommended for better security and features.

### Claude Code Configuration

Add to your Claude Code settings:

#### Option 1: Using npx (simplest)

```json
{
  "mcpServers": {
    "gemini-grounding": {
      "command": "npx",
      "args": ["gemini-grounding-mcp"]
    }
  }
}
```

#### Option 2: Local installation

```json
{
  "mcpServers": {
    "gemini-grounding": {
      "command": "node",
      "args": ["/path/to/gemini-grounding-mcp/node_modules/.bin/tsx", "/path/to/gemini-grounding-mcp/src/index.ts"]
    }
  }
}
```

**Note**: If you're using API key authentication instead of OAuth, add the `env` section to either configuration:

```json
{
  "mcpServers": {
    "gemini-grounding": {
      "command": "npx",
      "args": ["gemini-grounding-mcp"],
      "env": {
        "GEMINI_API_KEY": "$GEMINI_API_KEY"
      }
    }
  }
}
```

## Usage

Once configured, two tools will be available in Claude Code:

### 1. Single Search Tool (`google_search`)

Use this for single queries when you need to search and summarize information:

#### Examples

- "Search for the latest developments in quantum computing"
- "Find information about TypeScript 5.0 new features"
- "What are the current trends in sustainable energy?"

#### Tool Schema

```json
{
  "name": "google_search",
  "description": "Uses Google Search via Gemini AI grounding to find information and provide synthesized answers with citations. Returns AI-generated summaries rather than raw search results.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "The search query to find information on the web"
      },
      "includeSearchResults": {
        "type": "boolean",
        "description": "Include raw search results in addition to AI summary",
        "default": false
      },
      "maxResults": {
        "type": "number",
        "description": "Maximum number of search results to return",
        "default": 5
      }
    },
    "required": ["query"]
  }
}
```

### 2. Batch Search Tool (`google_search_batch`)

Use this for multiple related queries when you need comprehensive information. This tool processes queries in parallel for faster results and can optionally scrape full content from search results.

#### Examples

```javascript
// Research multiple aspects of a topic
["next.js 15 data fetching best practices 2025",
 "next.js 15 server component data fetching",
 "next.js 15 client component data fetching"]

// Compare different technologies
["react vs vue performance 2025",
 "angular vs react enterprise applications",
 "svelte advantages and disadvantages"]
```

#### Tool Schema

```json
{
  "name": "google_search_batch",
  "description": "Search multiple queries in parallel and optionally scrape content from results. Processes up to 10 queries simultaneously for comprehensive research.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "queries": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Array of search queries (max 10)",
        "minItems": 1,
        "maxItems": 10
      },
      "scrapeContent": {
        "type": "boolean",
        "description": "Whether to scrape full content from search result URLs",
        "default": true
      },
      "contentMode": {
        "type": "string",
        "enum": ["excerpt", "summary", "full"],
        "description": "Content extraction mode: excerpt (AI summary ~1000 chars), summary (AI summary ~3000 chars), or full",
        "default": "full"
      },
      "maxContentLength": {
        "type": "number",
        "description": "Maximum content length for full mode (default: 10000)",
        "default": 10000
      }
    },
    "required": ["queries"]
  }
}
```

#### Content Modes

When using `google_search_batch`, you can control how scraped content is processed:

- **`excerpt`**: AI-generated summary limited to ~1000 characters - ideal for quick overviews
- **`summary`**: AI-generated summary limited to ~3000 characters - balanced detail and brevity
- **`full`**: Complete content up to `maxContentLength` - for comprehensive analysis

Example with content mode:
```javascript
// Get concise AI summaries for multiple articles
{
  "queries": ["react hooks best practices", "react performance optimization"],
  "scrapeContent": true,
  "contentMode": "excerpt"  // Returns 1000-char AI summaries
}
```

#### Benefits of Batch Search

- **Parallel Processing**: All queries are processed simultaneously for faster results
- **Comprehensive Research**: Get multiple perspectives on a topic in one request
- **Flexible Content Control**: Choose between AI summaries or full content based on your needs
- **Smart Retries**: Failed scraping attempts are automatically retried with exponential backoff
- **Cost Effective**: Multiple searches count as separate API calls but are processed efficiently

## Output Format

### Single Search Output

The `google_search` tool returns:
- Main content with inline citations (e.g., [1], [2])
- List of sources with titles and URLs
- Enhanced citation information including:
  - Context where each citation was used
  - Confidence scores for each source (0-1 scale)
  - Relevant excerpts from the sources
- Proper formatting for easy reading

Example output:
```
Web search results for "TypeScript 5.0":

TypeScript 5.0 introduces several major features including decorators, const type parameters, and improved performance[1]. The new satisfies operator provides better type checking without affecting runtime behavior[2].

Sources:
[1] TypeScript 5.0 Release Notes - Microsoft (https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/)
[2] What's New in TypeScript 5.0 - TypeScript Handbook (https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html)
```

### Batch Search Output

The `google_search_batch` tool returns structured results for each query:
- Query-specific summaries with inline citations
- Citations section with source references
- Search results count (e.g., "3/5" indicating 3 results found out of target 5)
- Scraped content from each URL (when enabled)
  - **Excerpt mode**: AI-generated summary limited to ~1000 characters
  - **Summary mode**: AI-generated summary limited to ~3000 characters
  - **Full mode**: Complete content with optional truncation
- Clear separation between different queries

Example output:
```
Batch Search Results (3 queries)
==================================================

Query: "next.js 15 data fetching"
----------------------------------------
Summary: Next.js 15 introduces improved data fetching with React Server Components[1]. The new approach simplifies data management and improves performance[2]...

### Citations
[1] Next.js 15 Data Fetching Guide
    https://nextjs.org/docs/data-fetching
[2] Server Components in Next.js 15
    https://blog.example.com/nextjs-15-server

Search Results (5/5):
1. Next.js 15 Data Fetching Guide
   URL: https://nextjs.org/docs/data-fetching
   Snippet: Comprehensive guide to data fetching patterns...

2. Server Components in Next.js 15
   URL: https://blog.example.com/nextjs-15-server
   Snippet: Deep dive into server component architecture...

Scraped Content:
- Next.js 15 Data Fetching Guide (https://nextjs.org/docs/data-fetching)
  Excerpt: Next.js 15 revolutionizes data fetching with React Server Components, enabling seamless integration between server and client rendering...
  
Query: "next.js 15 server components"
----------------------------------------
[Additional results...]
```

## Development

```bash
# Development mode (watches for file changes)
pnpm dev

# Type checking
pnpm typecheck

# Code formatting (Biome)
pnpm format

# Linting
pnpm lint

# Run all checks
pnpm check
```

## Project Structure

```
gemini-grounding-mcp/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── cli.ts             # CLI interface for testing
│   ├── auth/
│   │   ├── config.ts      # Authentication configuration
│   │   └── oauth2.ts      # OAuth2 token management
│   ├── gemini/
│   │   ├── client.ts      # Gemini API client
│   │   └── code-assist-client.ts  # Code Assist API client
│   ├── types/             # TypeScript type definitions
│   │   ├── index.ts       # Main type exports
│   │   └── gemini.ts      # Gemini-specific types
│   └── utils/             # Utility functions
│       ├── formatter.ts   # Response formatting
│       ├── scraper.ts     # Web content scraping
│       └── citation-parser.ts  # Citation parsing and text segmentation
├── .env.example           # Environment variables template
├── biome.json            # Biome configuration
├── package.json
├── tsconfig.json
└── README.md
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Gemini API Key (only needed if not using OAuth) | - |
| `NODE_ENV` | Environment mode | `production` |
| `BATCH_SIZE` | Number of queries to process concurrently in batch mode | `5` |
| `RATE_LIMIT_DELAY` | Delay in milliseconds between batch requests | `100` |
| `CACHE_TTL` | Cache time-to-live in seconds for scraped content | `3600` (1 hour) |
| `SCRAPE_TIMEOUT` | Timeout in milliseconds for each scraping attempt | `10000` (10 seconds) |
| `SCRAPE_RETRIES` | Number of retry attempts for failed scraping | `3` |

## Technology Stack

- **TypeScript** - Type-safe development
- **Node.js (ESM)** - Modern JavaScript runtime
- **@modelcontextprotocol/sdk** - MCP protocol implementation
- **@google/generative-ai** - Official Gemini AI SDK
- **Biome** - Fast formatter and linter
- **tsx** - TypeScript execution

## Troubleshooting

### Authentication Errors

1. **For OAuth (recommended)**: Check credentials exist:
```bash
ls ~/.gemini/oauth_creds.json
```

If not found, authenticate with:
```bash
gemini auth login
```

2. **For API key**: Ensure it's set:
```bash
echo $GEMINI_API_KEY
```

### Connection Issues

- Ensure you have internet connectivity
- Verify Gemini API is accessible in your region
- Check API key or OAuth credentials are valid

### No Results

- Try different search queries
- Check Gemini API status
- Ensure you haven't exceeded rate limits

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

This project is inspired by and references:
- [mcp-gemini-grounding](https://github.com/ml0-1337/mcp-gemini-grounding) - The original Go implementation