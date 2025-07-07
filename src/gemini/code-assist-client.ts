import type { AuthConfig } from "../auth/config";

interface CodeAssistRequest {
  model: string;
  request: {
    contents: Array<{
      role: string;
      parts: Array<{
        text: string;
      }>;
    }>;
    tools: Array<{
      googleSearch: Record<string, never>;
    }>;
  };
  project?: string;
}

interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string;
  currentTier?: {
    id: string;
    name: string;
  };
  allowedTiers?: Array<{
    id: string;
    name: string;
    isDefault?: boolean;
  }>;
}

interface OnboardUserResponse {
  operation?: {
    name: string;
    done?: boolean;
    response?: {
      cloudaicompanionProject?: {
        id: string;
      };
    };
  };
}

interface OperationResponse {
  name: string;
  done?: boolean;
  response?: {
    cloudaicompanionProject?: {
      id: string;
    };
  };
}

interface GenerateContentResponse {
  response?: {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
      groundingMetadata?: unknown;
    }>;
  };
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    groundingMetadata?: unknown;
  }>;
}

export class CodeAssistClient {
  private baseURL = "https://cloudcode-pa.googleapis.com";
  private projectId: string | null = null;
  private auth: AuthConfig;

  constructor(auth: AuthConfig) {
    this.auth = auth;
  }

  async makeAuthenticatedRequest(
    url: string,
    body: unknown,
  ): Promise<Response> {
    const headers = await this.auth.getHeaders();

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    // Note: node-fetch doesn't support timeout in RequestInit
    // In production, you'd use AbortController for timeout

    return response;
  }

  async ensureProjectId(): Promise<string> {
    if (this.projectId) {
      return this.projectId;
    }

    // Run onboarding process
    // Step 1: Load Code Assist to get allowed tiers
    const loadResponse = await this.makeAuthenticatedRequest(
      `${this.baseURL}/v1internal:loadCodeAssist`,
      {},
    );

    if (!loadResponse.ok) {
      const error = await loadResponse.text();
      throw new Error(`Failed to load Code Assist: ${error}`);
    }

    const loadData = (await loadResponse.json()) as LoadCodeAssistResponse;

    // Check if project ID is already available
    if (loadData.cloudaicompanionProject) {
      this.projectId = loadData.cloudaicompanionProject;
      return this.projectId;
    }

    // Check if already onboarded but no project ID
    if (loadData.currentTier) {
      // Continue with onboarding to get project ID
    }

    const tiers = loadData.allowedTiers || [];

    // Select default tier or first available
    const defaultTier = tiers.find((t) => t.isDefault);
    const selectedTier = defaultTier || tiers[0];

    if (!selectedTier) {
      throw new Error("No available tiers for Code Assist");
    }

    // Step 2: Onboard user with selected tier
    const onboardBody = { tier: selectedTier.id };

    const onboardResponse = await this.makeAuthenticatedRequest(
      `${this.baseURL}/v1internal:onboardUser`,
      onboardBody,
    );

    if (!onboardResponse.ok) {
      const error = await onboardResponse.text();
      throw new Error(`Failed to onboard user: ${error}`);
    }

    const onboardData = (await onboardResponse.json()) as OnboardUserResponse;

    if (!onboardData.operation) {
      throw new Error("No operation returned from onboarding");
    }

    // Poll for completion
    let operation = onboardData.operation;
    const MAX_POLLING_RETRIES = 30; // 30 seconds max
    const POLLING_INTERVAL_MS = 1000; // 1 second
    let retries = 0;

    while (!operation.done && retries < MAX_POLLING_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS));

      // Get operation status
      const opUrl = `${this.baseURL}/${operation.name}`;
      const opResponse = await fetch(opUrl, {
        method: "GET",
        headers: await this.auth.getHeaders(),
      });

      if (!opResponse.ok) {
        const error = await opResponse.text();
        throw new Error(`Failed to get operation status: ${error}`);
      }

      operation = (await opResponse.json()) as OperationResponse;
      retries++;
    }

    if (!operation.done) {
      throw new Error("Onboarding operation timed out");
    }

    // Extract project ID from response
    this.projectId = operation.response?.cloudaicompanionProject?.id || null;

    if (!this.projectId) {
      throw new Error("Failed to obtain project ID from onboarding");
    }

    return this.projectId;
  }

  async generateContent(model: string, query: string): Promise<unknown> {
    const projectId = await this.ensureProjectId();

    const request: CodeAssistRequest = {
      model,
      request: {
        contents: [
          {
            role: "user",
            parts: [{ text: query }],
          },
        ],
        tools: [
          {
            googleSearch: {},
          },
        ],
      },
      project: projectId,
    };

    // Retry configuration
    const MAX_RETRIES = 3;
    const INITIAL_DELAY_MS = 4000; // Start with 4 seconds
    const MAX_DELAY_MS = 60000; // Maximum 60 seconds

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.makeAuthenticatedRequest(
          `${this.baseURL}/v1internal:generateContent`,
          request,
        );

        if (!response.ok) {
          const errorText = await response.text();

          // Retry on 429 error (rate limit)
          if (response.status === 429 && attempt < MAX_RETRIES) {
            // Exponential backoff: 1s, 2s, 4s, ...
            const delay = Math.min(
              INITIAL_DELAY_MS * 2 ** attempt,
              MAX_DELAY_MS,
            );

            // Parse error content to check if it's a quota error
            try {
              JSON.parse(errorText);
            } catch {
              // Retry on 429 even if JSON parsing fails
            }

            console.error(
              `Rate limit hit (attempt ${attempt + 1}/${MAX_RETRIES + 1}). ` +
                `Retrying in ${delay / 1000} seconds...`,
            );

            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          throw new Error(
            `Code Assist API error: ${response.status} - ${errorText}`,
          );
        }

        const result = (await response.json()) as GenerateContentResponse;

        // Code Assist API wraps the response in a 'response' field
        return result.response || result;
      } catch (error) {
        // Throw error on final attempt
        if (attempt === MAX_RETRIES) {
          throw error;
        }

        // Retry on network errors and other failures
        const delay = Math.min(INITIAL_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);

        console.error(
          `Request failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${error}. ` +
            `Retrying in ${delay / 1000} seconds...`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Should not reach here, but just in case
    throw new Error("Failed to generate content after all retries");
  }
}
