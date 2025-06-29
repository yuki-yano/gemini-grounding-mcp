#!/usr/bin/env node

const { spawn } = require("node:child_process");
const { join } = require("node:path");

const args = process.argv.slice(2);

// If --help is passed, show usage
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Gemini Grounding MCP Server

Usage:
  npx gemini-grounding-mcp       Start the MCP server
  npx gemini-grounding-mcp --cli Run the CLI interface for testing

Options:
  --help, -h     Show this help message
  --cli          Run the CLI interface for testing

Environment Variables:
  GEMINI_API_KEY  Gemini API Key (only needed if not using OAuth)

For more information, visit: https://github.com/yuki-yano/gemini-grounding-mcp
`);
  process.exit(0);
}

// Check if we're running from npm package (dist exists) or development
const fs = require("node:fs");
const distPath = join(__dirname, "..", "dist");
const isProduction = fs.existsSync(distPath);

let scriptPath;
let nodeArgs;

if (isProduction) {
  // Running from npm package - use compiled JS
  scriptPath = args.includes("--cli")
    ? join(__dirname, "..", "dist", "cli.js")
    : join(__dirname, "..", "dist", "index.js");

  nodeArgs = [scriptPath, ...args.filter((arg) => arg !== "--cli")];
} else {
  // Running in development - use tsx with TypeScript files
  scriptPath = args.includes("--cli")
    ? join(__dirname, "..", "src", "cli.ts")
    : join(__dirname, "..", "src", "index.ts");

  const tsxPath = join(__dirname, "..", "node_modules", ".bin", "tsx");
  nodeArgs = [tsxPath, scriptPath, ...args.filter((arg) => arg !== "--cli")];
}

// Spawn the process
const child = spawn("node", nodeArgs, {
  stdio: "inherit",
  env: process.env,
});

child.on("error", (error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code || 0);
});
