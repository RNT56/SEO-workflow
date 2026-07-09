import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { collectCruxMetrics, collectSearchConsoleMetrics, submitIndexNow } from "./index.js";

const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("data providers", () => {
  it("normalizes owner-authorized Search Console rows", async () => {
    const endpoint = await mockEndpoint((request, response) => {
      expect(request.headers.authorization).toBe("Bearer token");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          rows: [
            {
              keys: ["https://example.com/page", "example query", "MOBILE", "deu"],
              clicks: 12,
              impressions: 400,
              ctr: 0.03,
              position: 8.4
            }
          ]
        })
      );
    });

    const result = await collectSearchConsoleMetrics({
      accessToken: "token",
      siteUrl: "sc-domain:example.com",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      endpoint
    });

    expect(result.status).toBe("ok");
    expect(result.metrics.find((metric) => metric.metric === "impressions")?.value).toBe(400);
    expect(result.metrics.every((metric) => metric.source.provider === "google-search-console")).toBe(true);
  });

  it("normalizes CrUX p75 field metrics", async () => {
    const endpoint = await mockEndpoint((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          record: {
            metrics: {
              largest_contentful_paint: { percentiles: { p75: 2200 } },
              cumulative_layout_shift: { percentiles: { p75: "0.08" } }
            }
          }
        })
      );
    });

    const result = await collectCruxMetrics({ apiKey: "key", origin: "https://example.com", endpoint });

    expect(result.status).toBe("ok");
    expect(result.metrics).toEqual(
      expect.arrayContaining([expect.objectContaining({ metric: "largest_contentful_paint", value: 2200 })])
    );
  });

  it("requires approval and host confinement for IndexNow", async () => {
    await expect(
      submitIndexNow({
        host: "example.com",
        key: "abcdefgh",
        urls: ["https://example.com/a"],
        approved: false
      })
    ).rejects.toThrow("explicit owner approval");

    const endpoint = await mockEndpoint((_request, response) => {
      response.writeHead(202);
      response.end();
    });
    const result = await submitIndexNow({
      host: "example.com",
      key: "abcdefgh",
      urls: ["https://example.com/a"],
      approved: true,
      endpoint
    });
    expect(result).toEqual({ status: "submitted", httpStatus: 202, submittedUrls: 1 });
  });
});

async function mockEndpoint(handler: Parameters<typeof createServer>[0]): Promise<string> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unexpected server address.");
  return `http://127.0.0.1:${address.port}`;
}
