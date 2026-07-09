import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createSeoPolishMcpServer } from "./server.js";

const closeables: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(closeables.splice(0).map((item) => item.close()));
});

describe("SEO Polish MCP server", () => {
  it("negotiates the MCP lifecycle, lists schemas and invokes a proposal tool", async () => {
    const server = createSeoPolishMcpServer();
    const client = new Client({ name: "seo-polish-test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    closeables.push(client, server);
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toContain("scan_site");
    expect(listed.tools.map((tool) => tool.name)).toContain("generate_llms_txt");
    expect(listed.tools.find((tool) => tool.name === "scan_site")?.inputSchema.required).toContain("url");

    const result = await client.callTool({
      name: "generate_llms_txt",
      arguments: { origin: "https://example.com" }
    });
    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", text: expect.stringContaining("example.com") })
      ])
    );

    const resource = await client.readResource({ uri: "seo-polish://report-contract" });
    expect(resource.contents[0]).toEqual(
      expect.objectContaining({ text: expect.stringContaining("No evidence") })
    );
  });
});
