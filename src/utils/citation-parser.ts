import type {
  Citation,
  EnhancedCitation,
  TextSegment,
  StructuredSearchResult,
  SearchResult,
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
  
  // Regex to find citation markers like [1], [2], etc.
  const citationRegex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  while ((match = citationRegex.exec(text)) !== null) {
    const citationNumber = parseInt(match[1], 10);
    citationNumbers.add(citationNumber);
    
    // Add text segment before citation if exists
    if (match.index > lastIndex) {
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
    let endIndex = match.index + match[0].length;
    const remainingText = text.slice(endIndex);
    
    // Look for sentence endings
    const sentenceEndMatch = remainingText.match(/^[^.!?]*[.!?]/);
    if (sentenceEndMatch) {
      endIndex += sentenceEndMatch[0].length;
    }
    
    // Get the sentence/segment with the citation
    const segmentWithCitation = text.slice(match.index, endIndex);
    
    // Check if we need to merge with previous segment
    const lastSegment = segments[segments.length - 1];
    if (
      lastSegment &&
      lastSegment.endIndex === match.index &&
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
        startIndex: match.index,
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
  searchResult: SearchResult,
  scrapedContent?: any[],
): StructuredSearchResult {
  const { segments, citationNumbers } = parseTextWithCitations(
    searchResult.summary,
  );
  
  // Create enhanced citations with additional metadata
  const enhancedCitations: EnhancedCitation[] = searchResult.citations.map(
    (citation) => {
      // Find segments that reference this citation
      const relevantSegments = segments.filter((seg) =>
        seg.citationIds.includes(citation.number),
      );
      
      // Extract context from the segments
      const context = relevantSegments
        .map((seg) => seg.text.replace(/\[\d+\]/g, "").trim())
        .join(" ... ");
      
      return {
        ...citation,
        context: context || undefined,
        confidence: 0.95, // Default high confidence for Gemini grounding
      };
    },
  );
  
  // Create citation map for quick lookup
  const citationMap = new Map<number, EnhancedCitation>();
  enhancedCitations.forEach((citation) => {
    citationMap.set(citation.number, citation);
  });
  
  return {
    query: searchResult.query,
    summary: searchResult.summary,
    citations: enhancedCitations,
    structured: {
      segments,
      citationMap,
    },
    scrapedContent,
    metadata: {
      citationCount: citationNumbers.size,
    },
  };
}

/**
 * Format structured result for display
 */
export function formatStructuredSearchResult(
  result: StructuredSearchResult,
): string {
  let output = `Query: "${result.query}"\n\n`;
  
  // Add summary
  output += `${result.summary}\n`;
  
  // Add enhanced citations
  if (result.citations && result.citations.length > 0) {
    output += "\nCitations:\n";
    for (const citation of result.citations) {
      output += `[${citation.number}] ${citation.title}\n`;
      output += `    ${citation.url}\n`;
      if (citation.context) {
        output += `    Context: "${citation.context}"\n`;
      }
      if (citation.confidence !== undefined) {
        output += `    Confidence: ${(citation.confidence * 100).toFixed(0)}%\n`;
      }
    }
  }
  
  // Add metadata
  if (result.metadata?.citationCount) {
    output += `\nTotal citations: ${result.metadata.citationCount}`;
  }
  
  return output;
}