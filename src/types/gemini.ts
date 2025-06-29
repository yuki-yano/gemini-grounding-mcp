// Gemini API Response Types

export interface GeminiResponse {
  candidates?: GeminiCandidate[];
  text: () => string;
}

export interface GeminiCandidate {
  content?: {
    parts?: {
      text?: string;
    }[];
  };
  groundingMetadata?: GroundingMetadata;
}

export interface GroundingMetadata {
  groundingSupports?: GroundingSupport[];
  groundingChunks?: GroundingChunk[];
}

export interface GroundingSupport {
  endIndex?: number; // For API key auth
  groundingChunkIndices?: number[];
  segment?: {
    text?: string;
    startIndex?: number;
    endIndex?: number; // For OAuth/Code Assist API
  };
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title?: string;
  };
}

export interface GeminiOAuthResponse {
  candidates?: GeminiCandidate[];
  // Code Assist API may return nested response structure
  response?: {
    candidates?: GeminiCandidate[];
  };
}
