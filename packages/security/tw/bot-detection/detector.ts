/**
 * Bot Detection -- detects automated bots, crawlers, and scrapers
 * using User-Agent analysis, behavioral patterns, and challenge
 * responses.
 *
 * @module security/bot-detection/detector
 */

/** Bot detection result. */
export interface BotDetectionResult {
  isBot: boolean;
  confidence: number;  // 0-1
  botName?: string;
  botType: "search-engine" | "social-media" | "scraper" | "monitor" | "spam" | "unknown" | "none";
  reasons: string[];
}

/** Known bot patterns. */
const BOT_PATTERNS: Array<{ pattern: RegExp; name: string; type: BotDetectionResult["botType"] }> = [
  { pattern: /googlebot/i, name: "Googlebot", type: "search-engine" },
  { pattern: /bingbot/i, name: "Bingbot", type: "search-engine" },
  { pattern: /yandexbot/i, name: "Yandexbot", type: "search-engine" },
  { pattern: /baiduspider/i, name: "Baiduspider", type: "search-engine" },
  { pattern: /duckduckbot/i, name: "DuckDuckBot", type: "search-engine" },
  { pattern: /slurp/i, name: "Slurp (Yahoo)", type: "search-engine" },
  { pattern: /facebookexternalhit/i, name: "Facebook", type: "social-media" },
  { pattern: /twitterbot/i, name: "Twitter", type: "social-media" },
  { pattern: /linkedinbot/i, name: "LinkedIn", type: "social-media" },
  { pattern: /whatsapp/i, name: "WhatsApp", type: "social-media" },
  { pattern: /telegrambot/i, name: "Telegram", type: "social-media" },
  { pattern: /discordbot/i, name: "Discord", type: "social-media" },
  { pattern: /slackbot/i, name: "Slack", type: "social-media" },
  { pattern: /scrapy/i, name: "Scrapy", type: "scraper" },
  { pattern: /curl/i, name: "curl", type: "scraper" },
  { pattern: /wget/i, name: "Wget", type: "scraper" },
  { pattern: /python-requests/i, name: "Python Requests", type: "scraper" },
  { pattern: /node-fetch/i, name: "Node Fetch", type: "scraper" },
  { pattern: /go-http-client/i, name: "Go HTTP", type: "scraper" },
  { pattern: /java\/[\d.]+/i, name: "Java", type: "scraper" },
  { pattern: /ahrefs/i, name: "Ahrefs", type: "monitor" },
  { pattern: /semrush/i, name: "Semrush", type: "monitor" },
  { pattern: /\bmoz\b/i, name: "Moz", type: "monitor" },
  { pattern: /uptime/i, name: "Uptime Monitor", type: "monitor" },
  { pattern: /pingdom/i, name: "Pingdom", type: "monitor" },
  { pattern: /statuscake/i, name: "StatusCake", type: "monitor" },
  { pattern: /sentry/i, name: "Sentry", type: "monitor" },
  { pattern: /nikto/i, name: "Nikto", type: "spam" },
  { pattern: /sqlmap/i, name: "SQLMap", type: "spam" },
  { pattern: /nmap/i, name: "Nmap", type: "spam" },
  { pattern: /masscan/i, name: "Masscan", type: "spam" },
  { pattern: /dirbuster/i, name: "DirBuster", type: "spam" },
  { pattern: /wpscan/i, name: "WPScan", type: "spam" },
  { pattern: /hydra/i, name: "Hydra", type: "spam" },
];

/** Suspicious patterns in User-Agent. */
const SUSPICIOUS_PATTERNS = [
  /bot\b/i,
  /crawler\b/i,
  /spider\b/i,
  /scraper\b/i,
  /scanner\b/i,
  /checker\b/i,
  /validator\b/i,
  /fetcher\b/i,
  /indexer\b/i,
  /agent\b/i,
  /http/i,
  /libwww/i,
  /www-mechanize/i,
  /mechanize/i,
  /phantomjs/i,
  /headless/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /webdriver/i,
];

/** Configuration for the bot detector. */
export interface BotDetectorConfig {
  /** Known good bots (allowlist by name). */
  allowedBots?: string[];
  /** Challenge threshold -- confidence above this triggers a challenge. */
  challengeThreshold?: number;
  /** Block threshold -- confidence above this triggers a block. */
  blockThreshold?: number;
  /** Custom patterns. */
  customPatterns?: Array<{ pattern: RegExp; name: string; type: BotDetectionResult["botType"] }>;
  /** Whether to check behavioral signals. */
  behavioralAnalysis?: boolean;
}

/**
 * Bot Detector -- identifies automated traffic using User-Agent
 * analysis and behavioral signals.
 */
export class BotDetector {
  private patterns: Array<{ pattern: RegExp; name: string; type: BotDetectionResult["botType"] }>;
  private suspiciousPatterns: RegExp[];
  private allowedBots: Set<string>;
  private challengeThreshold: number;
  private blockThreshold: number;
  private behavioralAnalysis: boolean;
  private requestCounts: Map<string, { count: number; firstRequest: number; lastRequest: number }> = new Map();

  constructor(config: BotDetectorConfig = {}) {
    this.patterns = [...BOT_PATTERNS, ...(config.customPatterns ?? [])];
    this.suspiciousPatterns = [...SUSPICIOUS_PATTERNS];
    this.allowedBots = new Set(config.allowedBots ?? ["Googlebot", "Bingbot"]);
    this.challengeThreshold = config.challengeThreshold ?? 0.5;
    this.blockThreshold = config.blockThreshold ?? 0.8;
    this.behavioralAnalysis = config.behavioralAnalysis ?? true;
  }

  /**
   * Detects if a request is from a bot.
   */
  detect(userAgent: string, options?: {
    ip?: string;
    requestRate?: number; // requests per minute
    acceptsCookies?: boolean;
    hasJavaScript?: boolean;
  }): BotDetectionResult {
    const reasons: string[] = [];
    let confidence = 0;
    let botName: string | undefined;
    let botType: BotDetectionResult["botType"] = "none";

    // 1. Check known bot patterns
    for (const { pattern, name, type } of this.patterns) {
      if (pattern.test(userAgent)) {
        botName = name;
        botType = type;
        confidence = 1.0;
        reasons.push(`User-Agent matches known bot: ${name}`);

        // Check if bot is allowed
        if (this.allowedBots.has(name)) {
          return {
            isBot: true,
            confidence: 1.0,
            botName,
            botType,
            reasons,
          };
        }
        break;
      }
    }

    // 2. Check suspicious patterns
    if (confidence < 1.0) {
      let suspiciousCount = 0;
      for (const pattern of this.suspiciousPatterns) {
        if (pattern.test(userAgent)) {
          suspiciousCount++;
          reasons.push(`Suspicious UA pattern: ${pattern.source}`);
        }
      }
      confidence += suspiciousCount * 0.2;
    }

    // 3. Check for empty or very short User-Agent
    if (!userAgent || userAgent.length < 10) {
      confidence += 0.3;
      reasons.push("Empty or very short User-Agent");
    }

    // 4. Check for missing standard browser headers
    if (!userAgent.includes("Mozilla/")) {
      confidence += 0.2;
      reasons.push("Missing Mozilla/ in User-Agent");
    }

    // 5. Behavioral analysis
    if (this.behavioralAnalysis && options) {
      // High request rate
      if (options.requestRate !== undefined && options.requestRate > 60) {
        confidence += 0.3;
        reasons.push(`High request rate: ${options.requestRate}/min`);
      }

      // No cookies
      if (options.acceptsCookies === false) {
        confidence += 0.1;
        reasons.push("Does not accept cookies");
      }

      // No JavaScript
      if (options.hasJavaScript === false) {
        confidence += 0.2;
        reasons.push("No JavaScript execution detected");
      }
    }

    confidence = Math.min(1.0, confidence);
    const isBot = confidence >= this.challengeThreshold;

    if (!isBot) {
      botType = "none";
    }

    return {
      isBot,
      confidence,
      botName,
      botType,
      reasons,
    };
  }

  /**
   * Tracks request rate for behavioral analysis.
   * Call this on every request to maintain rate data.
   */
  trackRequest(ip: string): number {
    // Returns current requests per minute
    const now = Date.now();
    let entry = this.requestCounts.get(ip);

    if (!entry) {
      entry = { count: 0, firstRequest: now, lastRequest: now };
      this.requestCounts.set(ip, entry);
    }

    entry.count++;
    entry.lastRequest = now;

    // Calculate requests per minute
    const elapsedMs = now - entry.firstRequest;
    if (elapsedMs > 60000) {
      // Reset window
      entry.count = 1;
      entry.firstRequest = now;
      return 1;
    }

    return Math.round((entry.count / elapsedMs) * 60000);
  }

  /**
   * Determines the action to take for a detected bot.
   */
  getAction(result: BotDetectionResult): "allow" | "challenge" | "block" {
    if (!result.isBot) return "allow";
    if (result.botName && this.allowedBots.has(result.botName)) return "allow";
    if (result.confidence >= this.blockThreshold) return "block";
    if (result.confidence >= this.challengeThreshold) return "challenge";
    return "allow";
  }

  /**
   * Generates a simple challenge (math problem) for bot verification.
   */
  generateChallenge(): { question: string; answer: number } {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    const ops = ["+", "-", "*"] as const;
    const op = ops[Math.floor(Math.random() * ops.length)];

    let answer: number;
    switch (op) {
      case "+": answer = a + b; break;
      case "-": answer = a - b; break;
      case "*": answer = a * b; break;
    }

    return { question: `${a} ${op} ${b} = ?`, answer };
  }

  /** Adds a custom bot pattern. */
  addPattern(pattern: RegExp, name: string, type: BotDetectionResult["botType"]): void {
    this.patterns.push({ pattern, name, type });
  }

  /** Adds a bot to the allowlist. */
  allowBot(name: string): void {
    this.allowedBots.add(name);
  }

  /** Removes a bot from the allowlist. */
  blockBot(name: string): void {
    this.allowedBots.delete(name);
  }

  /** Returns statistics. */
  getStats(): {
    totalPatterns: number;
    allowedBots: number;
    trackedIps: number;
  } {
    return {
      totalPatterns: this.patterns.length,
      allowedBots: this.allowedBots.size,
      trackedIps: this.requestCounts.size,
    };
  }
}

/** Creates a new bot detector. */
export function createBotDetector(config?: BotDetectorConfig): BotDetector {
  return new BotDetector(config);
}
