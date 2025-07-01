import type {
  EnhancedCitation,
  ScrapedContent,
  SearchResult,
  SearchResultDetail,
  StructuredSearchResult,
  TextSegment,
} from "../types/index";

/**
 * Parse text with citation markers and create structured segments
 */
export function parseTextWithCitations(text: string): {
  segments: TextSegment[];
  citationNumbers: Set<number>;
} {
  const segments: TextSegment[] = [];
  const citationNumbers = new Set<number>();

  // Find all citation markers
  const citations = Array.from(text.matchAll(/\[(\d+)\]/g));
  let lastIndex = 0;

  for (const match of citations) {
    const citationNumber = parseInt(match[1], 10);
    citationNumbers.add(citationNumber);

    // Add text segment before citation if exists
    if (match.index !== undefined && match.index > lastIndex) {
      const segmentText = text.slice(lastIndex, match.index);
      if (segmentText.trim()) {
        segments.push({
          text: segmentText,
          citationIds: [],
          startIndex: lastIndex,
          endIndex: match.index,
        });
      }
    }

    // Find the end of the sentence or paragraph for this citation
    const matchIndex = match.index ?? 0;
    let endIndex = matchIndex + match[0].length;
    const remainingText = text.slice(endIndex);

    // Look for sentence endings
    const sentenceEndMatch = remainingText.match(/^[^.!?]*[.!?]/);
    if (sentenceEndMatch) {
      endIndex += sentenceEndMatch[0].length;
    }

    // Get the sentence/segment with the citation
    const segmentWithCitation = text.slice(matchIndex, endIndex);

    // Check if we need to merge with previous segment
    const lastSegment = segments[segments.length - 1];
    if (
      lastSegment &&
      lastSegment.endIndex === matchIndex &&
      lastSegment.citationIds.length > 0
    ) {
      // Merge with previous segment if they're adjacent and both have citations
      lastSegment.text += segmentWithCitation;
      lastSegment.citationIds.push(citationNumber);
      lastSegment.endIndex = endIndex;
    } else {
      // Create new segment
      segments.push({
        text: segmentWithCitation,
        citationIds: [citationNumber],
        startIndex: matchIndex,
        endIndex: endIndex,
      });
    }

    lastIndex = endIndex;
  }

  // Add any remaining text
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    if (remainingText.trim()) {
      segments.push({
        text: remainingText,
        citationIds: [],
        startIndex: lastIndex,
        endIndex: text.length,
      });
    }
  }

  return { segments, citationNumbers };
}

/**
 * Convert a regular SearchResult to StructuredSearchResult
 */
export function createStructuredSearchResult(
  searchResult: SearchResult & {
    searchResults?: SearchResultDetail[];
    targetResultCount?: number;
    processingTime?: number;
  },
  scrapedContent?: ScrapedContent[],
): StructuredSearchResult {
  const { segments, citationNumbers } = parseTextWithCitations(
    searchResult.summary,
  );

  // Create enhanced citations with additional metadata
  const citationMap = new Map<number, EnhancedCitation>();

  for (const citation of searchResult.citations) {
    const citationNumber = citation.number;
    if (citationNumbers.has(citationNumber)) {
      const enhancedCitation: EnhancedCitation = {
        ...citation,
      };

      // Use Gemini's segment.text for excerpt and context if available
      if (searchResult.searchResults && searchResult.searchResults.length > 0) {
        // Find the search result that matches this citation
        const matchingResult = searchResult.searchResults.find(
          (result) => result.url === citation.url,
        );
        if (matchingResult?.snippet) {
          // Use Gemini's snippet as both excerpt and context
          enhancedCitation.excerpt = matchingResult.snippet;
          enhancedCitation.context = matchingResult.snippet;
        }
      }

      citationMap.set(citationNumber, enhancedCitation);
    }
  }

  // Create citations array from map
  const enhancedCitations = Array.from(citationMap.values());

  return {
    query: searchResult.query,
    summary: searchResult.summary,
    citations: enhancedCitations,
    structured: {
      segments,
      citationMap,
    },
    searchResults: searchResult.searchResults,
    scrapedContent,
    metadata: {
      searchResultCount: searchResult.searchResults?.length,
      targetResultCount: searchResult.targetResultCount,
      processingTime: searchResult.processingTime,
      citationCount: enhancedCitations.length,
    },
  };
}
