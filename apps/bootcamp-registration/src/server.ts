import { readFile } from "node:fs/promises";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { Dataverse } from "./dataverse.js";
import { participantInput, recordId, etag, skills } from "./model.js";

export const resourceUri = "ui://bootcamp/registration.html";

async function result(operation: () => Promise<Record<string, unknown>>, message: string): Promise<CallToolResult> {
  try {
    return { content: [{ type: "text", text: message }], structuredContent: await operation() };
  } catch (error) {
    const text = error instanceof z.ZodError
      ? "Invalid participant data or Dataverse response. Check field values and refresh."
      : error instanceof Error && !["AuthenticationError", "CredentialUnavailableError"].includes(error.name)
        && (error.message.startsWith("Dataverse") || error.message.startsWith("This participant")
          || error.message.startsWith("Your Dataverse") || error.message.startsWith("Participant not")
          || error.message.startsWith("A participant") || error.message.startsWith("The picture URL"))
        ? error.message : "The operation failed. Check server authentication, connectivity, and configuration.";
    return { isError: true, content: [{ type: "text", text }] };
  }
}

export function createServer(store: Dataverse, pictureOrigins: string[], html?: string): McpServer {
  const server = new McpServer({ name: "bootcamp-registration", version: "0.1.0" });
  const ui = { resourceUri };
  // Keep explicit origins even in wildcard mode: hosts may restrict broad CSP sources.
  const csp = {
    connectDomains: [],
    resourceDomains: pictureOrigins.includes("*")
      ? ["https://*:*", ...pictureOrigins.filter((origin) => origin !== "*")]
      : pictureOrigins,
  };
  registerAppTool(server, "open_registration", {
    description: "Open the organizer bootcamp registration app and list participants. Contains personal information.",
    inputSchema: {}, annotations: { readOnlyHint: true }, _meta: { ui },
  }, async () => result(async () => ({ ...await store.list(), skills, pictureOrigins }), "Bootcamp registration dashboard."));
  registerAppTool(server, "list_participants", {
    description: "Search participants by name, email, company, role, or skill. Continue with the returned nextCursor.",
    inputSchema: { search: z.string().trim().max(100).default(""), cursor: z.string().max(8192).optional() },
    annotations: { readOnlyHint: true }, _meta: { ui },
  }, async ({ search, cursor }) => result(async () => ({ ...await store.list(search, cursor), skills, pictureOrigins }), "Participant results."));
  registerAppTool(server, "list_all_participants", {
    description: "List every participant or every search match across all Dataverse pages in the searchable registration app. Contains personal information.",
    inputSchema: { search: z.string().trim().max(100).default("") },
    annotations: { readOnlyHint: true }, _meta: { ui },
  }, async ({ search }) => result(async () => ({ ...await store.listAll(search), skills, pictureOrigins }), "All participant results."));
  registerAppTool(server, "create_participant", {
    description: "Register a participant. Check for duplicate email; picture URLs must use an approved origin.",
    inputSchema: participantInput.shape,
    annotations: { readOnlyHint: false, destructiveHint: false }, _meta: { ui },
  }, async (input) => result(async () => ({ participant: await store.save(input) }), "Participant created."));
  registerAppTool(server, "update_participant", {
    description: "Replace participant fields using the latest etag. Preserve existing skills unless explicitly changed.",
    inputSchema: { id: recordId, etag, participant: participantInput },
    annotations: { readOnlyHint: false, destructiveHint: true }, _meta: { ui },
  }, async (input) => result(async () => ({ participant: await store.save(input.participant, input.id, input.etag) }), "Participant updated."));
  registerAppTool(server, "delete_participant", {
    description: "Permanently delete a participant only after explicit confirmation. Requires the latest etag.",
    inputSchema: { id: recordId, etag, confirmed: z.literal(true) },
    annotations: { readOnlyHint: false, destructiveHint: true }, _meta: { ui },
  }, async (input) => result(async () => {
    await store.remove(input.id, input.etag);
    return { deleted: true };
  }, "Participant deleted."));
  registerAppResource(server, "registration-ui", resourceUri, {
    mimeType: RESOURCE_MIME_TYPE,
    _meta: { ui: { csp } },
  }, async () => ({
    contents: [{
      uri: resourceUri, mimeType: RESOURCE_MIME_TYPE,
      text: html ?? await readFile(new URL("../index.html", import.meta.url), "utf8"),
      _meta: { ui: { csp } },
    }],
  }));
  return server;
}
