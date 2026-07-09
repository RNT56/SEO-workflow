import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { fetchUrl } from "./fetch.js";

const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("fetchUrl redirects", () => {
  it("records redirect hops and returns the final public response", async () => {
    const origin = await fixtureServer((request, response) => {
      if (request.url === "/start") {
        response.writeHead(301, { location: "/middle" });
        response.end();
        return;
      }
      if (request.url === "/middle") {
        response.writeHead(302, { location: "/final" });
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html><body>Final</body></html>");
    });

    const result = await fetchUrl(`${origin}/start`, { timeoutMs: 2_000, userAgent: "test" });

    expect(result.status).toBe(200);
    expect(result.finalUrl).toBe(`${origin}/final`);
    expect(result.redirectChain).toEqual([
      { url: `${origin}/start`, status: 301, location: `${origin}/middle` },
      { url: `${origin}/middle`, status: 302, location: `${origin}/final` }
    ]);
  });

  it("refuses redirects into private application paths", async () => {
    const origin = await fixtureServer((_request, response) => {
      response.writeHead(302, { location: "/account/settings" });
      response.end();
    });

    await expect(fetchUrl(`${origin}/start`, { timeoutMs: 2_000, userAgent: "test" })).rejects.toThrow(
      "Redirect target is not a safe public URL"
    );
  });
});

async function fixtureServer(handler: Parameters<typeof createServer>[0]): Promise<string> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unexpected address.");
  return `http://127.0.0.1:${address.port}`;
}
