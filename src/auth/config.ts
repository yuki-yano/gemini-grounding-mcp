import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import dotenv from "dotenv";
import type { AuthMethod } from "../types/index";
import { OAuth2Client } from "./oauth2";

dotenv.config();

export class AuthConfig {
  private apiKey: string | null = null;
  private oauthToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private authMethod: AuthMethod["type"] | null = null;
  private oauth2Client: OAuth2Client | null = null;

  constructor() {
    this._initialize();
  }

  private _initialize(): void {
    // First, try API key from environment
    if (process.env.GEMINI_API_KEY) {
      this.apiKey = process.env.GEMINI_API_KEY;
      this.authMethod = "api-key";
      return;
    }

    // Second, try OAuth credentials from ~/.gemini/oauth_creds.json
    try {
      const oauthPath = join(homedir(), ".gemini", "oauth_creds.json");
      const oauthData = JSON.parse(readFileSync(oauthPath, "utf8"));

      if (oauthData.access_token) {
        this.oauthToken = oauthData.access_token;
        this.refreshToken = oauthData.refresh_token;
        if (oauthData.expiry_date) {
          this.tokenExpiry = new Date(oauthData.expiry_date);
        }
        this.authMethod = "oauth";

        // Initialize OAuth2 client
        // The OAuth2Client will handle token refresh using the refresh token
        // from ~/.gemini/oauth_creds.json
        this.oauth2Client = new OAuth2Client("", "");
        return;
      }
    } catch (_error) {
      // OAuth file not found or invalid, continue
    }

    throw new Error(
      'No authentication method found. Please set GEMINI_API_KEY environment variable or run "gemini auth login"',
    );
  }

  isApiKey(): boolean {
    return this.authMethod === "api-key";
  }

  isOAuth(): boolean {
    return this.authMethod === "oauth";
  }

  getApiKey(): string {
    if (!this.isApiKey() || !this.apiKey) {
      throw new Error("API key not available");
    }
    return this.apiKey;
  }

  async getOAuthToken(): Promise<string> {
    if (!this.isOAuth() || !this.oauth2Client) {
      throw new Error("OAuth not available");
    }

    // Get valid token (refreshed if needed)
    const token = await this.oauth2Client.getValidToken();
    this.oauthToken = token;
    return token;
  }

  async getHeaders(): Promise<Record<string, string>> {
    if (this.isOAuth()) {
      const token = await this.getOAuthToken();
      return {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
    }
    return {};
  }
}
