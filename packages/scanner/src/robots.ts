export interface RobotsInfo {
  sitemapUrls: string[];
  disallowAll: boolean;
  hasAiPolicySignal: boolean;
  hasPrivateDisallows: boolean;
}

export function parseRobotsTxt(body: string): RobotsInfo {
  const sitemapUrls: string[] = [];
  let appliesToAll = false;
  let disallowAll = false;
  let hasAiPolicySignal = false;
  let hasPrivateDisallows = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      if (/ai-|ai_|content-signal|ai input|ai train/i.test(line)) {
        hasAiPolicySignal = true;
      }
      continue;
    }

    const [rawKey, ...rest] = line.split(":");
    const key = rawKey?.trim().toLowerCase() ?? "";
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      appliesToAll = value === "*";
    }

    if (key === "sitemap" && value) {
      sitemapUrls.push(value);
    }

    if (appliesToAll && key === "disallow") {
      if (value === "/") {
        disallowAll = true;
      }
      if (/admin|account|login|logout|checkout|cart|payment|private|preview|api\/internal/i.test(value)) {
        hasPrivateDisallows = true;
      }
    }

    if (/content-signal|ai-input|ai-train|gptbot|google-extended|ccbot/i.test(line)) {
      hasAiPolicySignal = true;
    }
  }

  return {
    sitemapUrls,
    disallowAll,
    hasAiPolicySignal,
    hasPrivateDisallows
  };
}
