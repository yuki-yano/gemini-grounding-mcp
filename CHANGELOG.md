# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Content mode usage guide in README explaining when to use excerpt, summary, or full mode

### Changed
- Enhanced citation information now uses only data provided by Gemini API (removed custom confidence scores)
- Citation excerpt and context now use Gemini's segment.text data instead of custom extraction

### Fixed
- Batch search results now correctly display citation sources with titles and URLs
- Fixed missing citations field in formatBatchResults function

### Removed
- Removed confidence score from EnhancedCitation type (avoiding unreliable custom calculations)

## [0.0.2] - 2024-12-30

Initial release with MCP server implementation for Gemini AI web search with grounding.