/**
 * Sealed Case for Alexa+ — Streamable HTTP entry point.
 *
 *   npm start            -> http://127.0.0.1:3000/mcp
 *   PORT=8080 npm start  -> http://127.0.0.1:8080/mcp
 *
 * Stateful Streamable HTTP: the server issues an `Mcp-Session-Id` on
 * initialize, and every later request carrying that id is routed to the same
 * transport, the same McpServer and the same game. Several players can play at
 * once without seeing each other's notes.
 */

import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createGame } from "./game.js";
import { buildMcpServer } from "./mcp.js";
import { CASE } from "./engine.js";

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 60 * 60 * 1000);
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 500);

function rpcError(res, status, code, message) {
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

/**
 * @param {object} [opts]
 * @param {object} [opts.caseData]  the case to play (tests pass an alternate one)
 * @param {string} [opts.host]      bind host; localhost enables DNS-rebinding protection
 * @param {string[]} [opts.allowedHosts]
 */
export function createApp({ caseData = CASE, host = "127.0.0.1", allowedHosts } = {}) {
  const app = createMcpExpressApp({ host, ...(allowedHosts ? { allowedHosts } : {}) });
  app.disable("x-powered-by");

  /** sessionId -> { transport, server, game, lastSeen } */
  const sessions = new Map();

  async function closeSession(id) {
    const s = sessions.get(id);
    if (!s) return;
    sessions.delete(id);
    await s.transport.close().catch(() => {});
    await s.server.close().catch(() => {});
  }

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) if (now - s.lastSeen > SESSION_TTL_MS) closeSession(id);
  }, 60 * 1000);
  sweeper.unref();

  app.get("/", (_req, res) => {
    res.type("text/plain").send("Sealed Case MCP server. Connect an MCP client to /mcp (Streamable HTTP).\n");
  });

  app.post("/mcp", async (req, res) => {
    const sid = req.headers["mcp-session-id"];
    const existing = typeof sid === "string" ? sessions.get(sid) : undefined;

    if (existing) {
      existing.lastSeen = Date.now();
      await existing.transport.handleRequest(req, res, req.body);
      return;
    }
    if (sid) return rpcError(res, 404, -32001, "Session not found. Start a new session.");
    if (!isInitializeRequest(req.body)) {
      return rpcError(res, 400, -32000, "Bad Request: send initialize first, without an Mcp-Session-Id header.");
    }
    if (sessions.size >= MAX_SESSIONS) {
      return rpcError(res, 503, -32000, "Too many open games right now. Try again shortly.");
    }

    const game = createGame(caseData);
    const server = buildMcpServer(game);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, server, game, lastSeen: Date.now() });
      },
      onsessionclosed: (id) => {
        closeSession(id);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const bySession = async (req, res) => {
    const sid = req.headers["mcp-session-id"];
    const s = typeof sid === "string" ? sessions.get(sid) : undefined;
    if (!s) return rpcError(res, sid ? 404 : 400, -32000, "Missing or unknown Mcp-Session-Id.");
    s.lastSeen = Date.now();
    await s.transport.handleRequest(req, res);
  };
  app.get("/mcp", bySession);
  app.delete("/mcp", bySession);

  async function shutdown() {
    clearInterval(sweeper);
    await Promise.all([...sessions.keys()].map(closeSession));
  }

  return { app, sessions, shutdown };
}

export function listen({ port = 3000, host = "127.0.0.1", ...rest } = {}) {
  const { app, sessions, shutdown } = createApp({ host, ...rest });
  return new Promise((resolve, reject) => {
    const http = app.listen(port, host, (err) => {
      if (err) return reject(err);
      http.off("error", reject);
      resolve({
        url: `http://${host}:${http.address().port}/mcp`,
        sessions,
        async close() {
          await shutdown();
          await new Promise((r) => http.close(() => r()));
        },
      });
    });
    http.on("error", reject);
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";
  const allowedHosts = process.env.ALLOWED_HOSTS
    ? process.env.ALLOWED_HOSTS.split(",").map((h) => h.trim()).filter(Boolean)
    : undefined;
  const { url } = await listen({ port, host, allowedHosts });
  console.log(`Sealed Case MCP server listening on ${url}`);
}
