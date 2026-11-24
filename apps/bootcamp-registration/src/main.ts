import { AzureCliCredential } from "@azure/identity";
import express from "express";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { Dataverse } from "./dataverse.js";
import { createServer } from "./server.js";
import { httpAuth, required } from "./auth.js";

async function main(): Promise<void> {
  const environment = required("DATAVERSE_URL");
  const pictureOrigins = (process.env.PROFILE_PICTURE_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  for (const origin of pictureOrigins) {
    if (origin === "*") continue;
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin) throw new Error("Picture origins must be HTTPS origins without paths.");
  }
  if (!process.argv.includes("--http")) {
    const credential = new AzureCliCredential();
    const store = new Dataverse(environment, async () => {
      const token = await credential.getToken(`${new URL(environment).origin}/.default`);
      if (!token) throw new Error("Azure CLI authentication failed.");
      return token.token;
    }, pictureOrigins);
    await createServer(store, pictureOrigins).connect(new StdioServerTransport());
    return;
  }
  const auth = httpAuth(environment);
  const publicUrl = new URL(required("MCP_PUBLIC_URL"));
  if (publicUrl.protocol !== "https:" || publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password) {
    throw new Error("MCP_PUBLIC_URL must be the public HTTPS origin.");
  }
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  const authority = `https://login.microsoftonline.com/${auth.tenant}/oauth2/v2.0`;
  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({ resource: `${publicUrl.origin}/mcp`, authorization_servers: [`https://login.microsoftonline.com/${auth.tenant}/v2.0`], scopes_supported: [`api://${auth.clientId}/access_as_user`] });
  });
  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
      issuer: `https://login.microsoftonline.com/${auth.tenant}/v2.0`,
      authorization_endpoint: `${authority}/authorize`, token_endpoint: `${authority}/token`,
      response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
      scopes_supported: [`api://${auth.clientId}/access_as_user`, "offline_access"],
    });
  });
  app.get("/health", (_req, res) => { res.json({ status: "ok" }); });
  app.all("/mcp", async (req, res) => {
    // Server-to-server and stdio clients do not need browser cross-origin access.
    if (req.headers.origin && req.headers.origin !== publicUrl.origin) { res.sendStatus(403); return; }
    const authorization = req.headers.authorization ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    try { await auth.verify(token); }
    catch {
      res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${publicUrl.origin}/.well-known/oauth-protected-resource"`);
      res.status(401).json({ error: "A valid organizer access token is required." });
      return;
    }
    const store = new Dataverse(environment, () => auth.dataverseToken(token), pictureOrigins);
    const server = createServer(store, pictureOrigins);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void Promise.all([transport.close(), server.close()]).catch(() => { console.error("MCP connection cleanup failed."); });
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      console.error("MCP request failed.");
      if (!res.headersSent) res.status(500).json({ error: "MCP request failed." });
    }
  });
  const port = z.coerce.number().int().min(1).max(65535).parse(process.env.PORT ?? 3001);
  const httpServer = app.listen(port, process.env.HOST ?? "127.0.0.1", () => { console.error(`Bootcamp MCP HTTP server listening on port ${port}.`); });
  httpServer.on("error", () => { console.error("HTTP listener failed."); process.exitCode = 1; });
  const shutdown = (): void => { httpServer.close(); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main().catch((error: unknown) => {
  if (error instanceof Error && error.message.startsWith("Missing required configuration:")) console.error(error.message);
  else console.error("Startup failed. Check required configuration, authentication, and build output.");
  process.exitCode = 1;
});
