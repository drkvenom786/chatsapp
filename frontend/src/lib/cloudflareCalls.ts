const CF_APP_ID = import.meta.env.VITE_CLOUDFLARE_CALLS_APP_ID || "";
const CF_API_TOKEN = import.meta.env.VITE_CLOUDFLARE_CALLS_TOKEN || "";
const CF_BASE_PATH = (import.meta.env.VITE_CLOUDFLARE_CALLS_BASE_URL || "https://rtc.live.cloudflare.com/v1").replace(/\/+$/, "");

export interface TrackObject {
  location: "local" | "remote";
  mid?: string;
  trackName: string;
  sessionId?: string;
  kind?: string;
}

export class CloudflareRealtimeApp {
  public appId: string;
  public apiToken: string;
  public prefixPath: string;
  public sessionId: string | null = null;

  constructor(
    appId = CF_APP_ID,
    apiToken = CF_API_TOKEN,
    basePath = CF_BASE_PATH
  ) {
    this.appId = appId;
    this.apiToken = apiToken;
    this.prefixPath = appId ? `${basePath}/apps/${appId}` : basePath;
  }

  async sendRequest(url: string, body: any, method = "POST") {
    const response = await fetch(url, {
      method: method,
      mode: "cors",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Cloudflare API error: ${response.status} - ${errText}`);
    }
    return await response.json();
  }

  checkErrors(result: any, tracksCount = 0) {
    if (result.errorCode) {
      throw new Error(result.errorDescription || result.errorCode);
    }
    if (result.tracks && Array.isArray(result.tracks)) {
      for (let i = 0; i < Math.min(tracksCount, result.tracks.length); i++) {
        if (result.tracks[i]?.errorCode) {
          throw new Error(`Track error: ${result.tracks[i].errorDescription}`);
        }
      }
    }
  }

  async newSession(offerSDP: string) {
    const url = `${this.prefixPath}/sessions/new`;
    const body = {
      sessionDescription: {
        type: "offer",
        sdp: offerSDP,
      },
    };
    const result = await this.sendRequest(url, body);
    this.checkErrors(result);
    this.sessionId = result.sessionId;
    return result;
  }

  async newTracks(trackObjects: TrackObject[], offerSDP: string | null = null) {
    if (!this.sessionId) {
      throw new Error("Session ID is required for adding tracks");
    }
    const url = `${this.prefixPath}/sessions/${this.sessionId}/tracks/new`;
    const body: any = {
      tracks: trackObjects,
    };
    if (offerSDP) {
      body.sessionDescription = {
        type: "offer",
        sdp: offerSDP,
      };
    }
    const result = await this.sendRequest(url, body);
    this.checkErrors(result, trackObjects.length);
    return result;
  }

  async sendAnswerSDP(answerSDP: string) {
    if (!this.sessionId) {
      throw new Error("Session ID is required for sendAnswerSDP");
    }
    const url = `${this.prefixPath}/sessions/${this.sessionId}/renegotiate`;
    const body = {
      sessionDescription: {
        type: "answer",
        sdp: answerSDP,
      },
    };
    const result = await this.sendRequest(url, body, "PUT");
    this.checkErrors(result);
    return result;
  }
}

export async function createCloudflareCallSession(offer: { type: string; sdp: string }) {
  try {
    const app = new CloudflareRealtimeApp();
    return await app.newSession(offer.sdp);
  } catch (error: any) {
    console.error("Cloudflare Calls Session Error:", error);
    return {
      errorCode: "network_error",
      errorDescription: error?.message || "Failed to reach Cloudflare Calls SFU",
    };
  }
}
