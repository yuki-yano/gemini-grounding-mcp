import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import fetch from "node-fetch";
import { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET } from "../const";

interface OAuth2Token {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expiry_date: number;
}

export class OAuth2Client {
  private readonly oauthPath = join(homedir(), ".gemini", "oauth_creds.json");
  private readonly tokenEndpoint = "https://oauth2.googleapis.com/token";


  async getValidToken(): Promise<string> {
    const token = this.loadToken();

    if (!token) {
      throw new Error(
        "No OAuth token found. Please authenticate using 'gemini' command first.",
      );
    }

    // Check if token is expired
    const now = Date.now();
    if (token.expiry_date && token.expiry_date > now) {
      // Token is still valid
      return token.access_token;
    }

    // Token is expired, refresh it
    console.log("OAuth token expired, refreshing...");
    try {
      const refreshedToken = await this.refreshToken(token.refresh_token);
      this.saveToken(refreshedToken);
      return refreshedToken.access_token;
    } catch (error) {
      console.error("Token refresh failed:", error);
      throw new Error(
        "OAuth token has expired and refresh failed. Please re-authenticate using 'gemini' command.",
      );
    }
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
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
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
