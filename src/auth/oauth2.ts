import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import fetch from "node-fetch";

interface OAuth2Token {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expiry_date: number;
}

export class OAuth2Client {
  private readonly tokenEndpoint = "https://oauth2.googleapis.com/token";
  private readonly oauthPath = join(homedir(), ".gemini", "oauth_creds.json");

  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {}

  async getValidToken(): Promise<string> {
    const token = this.loadToken();

    if (!token) {
      throw new Error("No OAuth token found");
    }

    // Check if token is expired
    const now = Date.now();
    if (token.expiry_date && token.expiry_date > now) {
      // Token is still valid
      return token.access_token;
    }

    // Token is expired, refresh it
    console.error("OAuth token expired, refreshing...");
    const refreshedToken = await this.refreshToken(token.refresh_token);
    this.saveToken(refreshedToken);
    return refreshedToken.access_token;
  }

  private loadToken(): OAuth2Token | null {
    try {
      const data = readFileSync(this.oauthPath, "utf8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private saveToken(token: OAuth2Token): void {
    try {
      writeFileSync(this.oauthPath, JSON.stringify(token, null, 2));
    } catch (error) {
      console.error("Failed to save OAuth token:", error);
    }
  }

  private async refreshToken(refreshToken: string): Promise<OAuth2Token> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const response = await fetch(this.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh token: ${error}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
      token_type: string;
    };

    // Calculate expiry date
    const expiryDate = Date.now() + data.expires_in * 1000;

    return {
      access_token: data.access_token,
      refresh_token: refreshToken, // Reuse existing refresh token
      token_type: data.token_type,
      expiry_date: expiryDate,
    };
  }
}
