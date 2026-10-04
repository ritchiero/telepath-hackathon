import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { topBeliefs, contribute, correctBelief } from "@/lib/mind-server";

export const dynamic = "force-dynamic";

// Telepath MCP server — agents interact with the shared mind DIRECTLY.
// No human bridging: recall / contribute / correct are live tools.
//
// Auth: if MCP_BEARER_TOKEN is set, clients must send
// `Authorization: Bearer <token>`. If unset, the endpoint is open
// (hackathon demo mode).

function checkAuth(req: Request): Response | null {
  const required = process.env.MCP_BEARER_TOKEN;
  if (!required) return null;
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== required) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

function createServer(): McpServer {
  const server = new McpServer({ name: "telepath", version: "1.0.0" });

  server.registerTool(
    "recall",
    {
      title: "Recall from the shared mind",
      description:
        "Search the shared mind for beliefs about a topic. Returns matching beliefs with their confidence, source agent, and IDs. Use this before answering questions about the user, so all agents share the same knowledge.",
      inputSchema: {
        query: z.string().describe("Topic or question to search for in the shared mind."),
        limit: z.number().int().min(1).max(50).optional().describe("Max beliefs to return (default 10)."),
      },
    },
    async ({ query, limit }) => {
      const beliefs = await topBeliefs(query, limit ?? 10);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(beliefs, null, 2) }],
      };
    }
  );

  server.registerTool(
    "contribute",
    {
      title: "Contribute to the shared mind",
      description:
        "Add new beliefs about the user to the shared mind. Every agent connected to Telepath will immediately be able to use them. Only contribute specific, durable facts you learned — no greetings, no opinions, no one-off remarks.",
      inputSchema: {
        items: z
          .array(
            z.object({
              content: z.string().describe("The belief, in English. One specific fact."),
              confidence: z.number().min(0).max(1).optional().describe("0..1 (default 0.7)."),
            })
          )
          .min(1)
          .max(20)
          .describe("Beliefs to add."),
        agent: z.string().describe("Your agent id (e.g. grok, dot, fo, muse)."),
      },
    },
    async ({ items, agent }) => {
      const result = await contribute(
        items.map((i) => ({ content: i.content, confidence: i.confidence })),
        agent
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "correct",
    {
      title: "Correct a belief",
      description:
        "Correct a belief in the shared mind. The user is ground truth: a correction sets confidence to 95%. All agents will use the corrected version from now on.",
      inputSchema: {
        id: z.string().describe("The belief ID to correct (from recall)."),
        correction: z.string().describe("The corrected text, in English."),
        by: z.string().optional().describe("Who is correcting (default 'agent')."),
      },
    },
    async ({ id, correction, by }) => {
      const updated = await correctBelief(id, correction, by || "agent");
      if (!updated) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "belief not found", id }) }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  return server;
}

async function handle(req: Request): Promise<Response> {
  const authFail = checkAuth(req);
  if (authFail) return authFail;

  // Stateless mode: fresh server + transport per request (Vercel serverless).
  // Do NOT close the server here — the Response stream must stay open
  // for Next.js to send it. The function instance cleans up on freeze.
  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);
  return transport.handleRequest(req);
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}

export async function DELETE(req: Request) {
  return handle(req);
}
