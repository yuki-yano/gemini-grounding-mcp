# Gemini Grounding MCP Server

A Model Context Protocol (MCP) server that provides AI-powered web search using Gemini AI's grounding feature. Unlike traditional search tools that return raw results, this server uses Gemini AI to synthesize information and provide comprehensive answers with citations.

## Features

- **AI-Powered Search**: Uses Gemini AI to search the web and provide synthesized answers
- **Smart Summaries**: Returns AI-generated summaries with proper citations and source URLs
- **Dual Authentication**: Supports both OAuth (recommended) and API key authentication
- **MCP Compatible**: Works seamlessly with Claude Code and other MCP clients
- **Inspired by**: [mcp-gemini-grounding](https://github.com/ml0-1337/mcp-gemini-grounding) (Go implementation)

## Prerequisites

- Node.js 18 or later
- pnpm (recommended) or npm
- Gemini API access (either OAuth credentials or API key)

## Installation

```bash
# Clone the repository
git clone https://github.com/yuki-yano/gemini-grounding-mcp.git
cd gemini-grounding-mcp

# Install dependencies (pnpm recommended)
pnpm install
```

## Configuration

### Authentication

The server supports two authentication methods:

#### 1. API Key (Recommended)
Set the `GEMINI_API_KEY` environment variable:

```bash
# Create .env file
cp .env.example .env

# Edit .env and add your API key
GEMINI_API_KEY=your-api-key-here
```

Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

#### 2. OAuth Credentials (Experimental)
The server can use OAuth credentials from `~/.gemini/oauth_creds.json` if available.
These are created when you authenticate with the Gemini CLI:

```bash
# Install Gemini CLI if not already installed
npm install -g @google/generative-ai

# Authenticate
gemini auth login
```

**Note**: OAuth authentication uses the Google Code Assist API, which is experimental and may have different behavior than the standard Gemini API. For production use, we recommend using API key authentication.

### Claude Code Configuration

Add to your Claude Code settings:

```json
{
  "mcpServers": {
    "gemini-grounding": {
      "command": "node",
      "args": ["/path/to/gemini-grounding-mcp/node_modules/.bin/tsx", "/path/to/gemini-grounding-mcp/src/index.ts"],
      "env": {
        "GEMINI_API_KEY": "$GEMINI_API_KEY"
      }
    }
  }
}
```

**Note**: The `env` section is optional if you're using OAuth authentication.

## Usage

Once configured, the `google_search` tool will be available in Claude Code. You can use it by asking Claude to search and summarize information:

### Examples

- "Search for the latest developments in quantum computing"
- "Find information about TypeScript 5.0 new features"
- "What are the current trends in sustainable energy?"

### Tool Schema

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
      }
    },
    "required": ["query"]
  }
}
```

## Output Format

The tool returns search results with:
- Main content with inline citations (e.g., [1], [2])
- List of sources with titles and URLs
- Proper formatting for easy reading

Example output:
```
Web search results for "TypeScript 5.0":

TypeScript 5.0 introduces several major features including decorators, const type parameters, and improved performance[1]. The new satisfies operator provides better type checking without affecting runtime behavior[2].

Sources:
[1] TypeScript 5.0 Release Notes - Microsoft (https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/)
[2] What's New in TypeScript 5.0 - TypeScript Handbook (https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html)
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
│       └── scraper.ts     # Web content scraping
├── .env.example           # Environment variables template
├── biome.json            # Biome configuration
├── package.json
├── tsconfig.json
└── README.md
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Gemini API Key (optional if using OAuth) | - |
| `NODE_ENV` | Environment mode | `production` |
| `BATCH_SIZE` | Number of queries to process concurrently in batch mode | `5` |
| `RATE_LIMIT_DELAY` | Delay in milliseconds between batch requests | `100` |

## Technology Stack

- **TypeScript** - Type-safe development
- **Node.js (ESM)** - Modern JavaScript runtime
- **@modelcontextprotocol/sdk** - MCP protocol implementation
- **@google/generative-ai** - Official Gemini AI SDK
- **Biome** - Fast formatter and linter
- **tsx** - TypeScript execution

## Troubleshooting

### Authentication Errors

1. Check OAuth credentials exist:
```bash
ls ~/.gemini/oauth_creds.json
```

2. Or ensure API key is set:
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