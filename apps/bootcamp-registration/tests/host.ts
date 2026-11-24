import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { z } from "zod";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { participantInput } from "../src/model.js";
import type { Participant } from "../src/model.js";

declare global {
  interface Window { registrationTest: { failNextList: boolean; repeatCursor: boolean; conflictDelete: boolean; pictureOrigins: string[]; bridge: AppBridge }; }
}
let rows: Participant[] = [{
  id: "12345678-1234-f111-8234-123456789abc", etag: 'W/"1"',
  firstName: "Alex", lastName: "Example", email: "alex@example.com",
  company: "Example Company", role: "Architect", skills: ["Copilot Studio"],
  rawSkills: "Copilot Studio", profilePictureUrl: "https://photos.fixture.test/avatar.png",
}, {
  id: "87654321-1234-f111-8234-123456789abc", etag: 'W/"1"',
  firstName: "Morgan", lastName: "Directory", email: "morgan@example.com",
  company: "Another Company", role: "Organizer", skills: ["Cowork"],
  rawSkills: "Cowork", profilePictureUrl: "https://photos.fixture.test/missing.png",
}];
const bridge = new AppBridge(null, { name: "isolated-test-host", version: "1.0.0" }, { serverTools: {} }, { hostContext: { theme: "light" } });
window.registrationTest = { failNextList: false, repeatCursor: false, conflictDelete: false, pictureOrigins: ["*"], bridge };
bridge.oncalltool = async ({ name, arguments: args }) => {
  const state = window.registrationTest;
  if (name === "list_participants") {
    if (state.failNextList) { state.failNextList = false; return { isError: true, content: [{ type: "text", text: "Dataverse request failed (HTTP 500)." }] }; }
    const input = z.object({ search: z.string().optional(), cursor: z.coerce.number().int().min(0).optional() }).parse(args);
    const search = input.search?.toLowerCase() ?? "";
    const matches = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search));
    const offset = input.cursor ?? 0;
    return {
      content: [],
      structuredContent: {
        participants: matches.slice(offset, offset + 1), pictureOrigins: state.pictureOrigins,
        ...(state.repeatCursor || offset + 1 < matches.length ? { nextCursor: state.repeatCursor ? "1" : String(offset + 1) } : {}),
      },
    };
  }
  if (name === "create_participant") {
    const input = participantInput.parse(args);
    if (rows.some((row) => row.email === input.email)) return { isError: true, content: [{ type: "text", text: "A participant with this email already exists." }] };
    const row = { ...input, id: crypto.randomUUID(), etag: 'W/"1"', rawSkills: input.skills.join(", ") };
    rows.push(row);
    return { content: [], structuredContent: { participant: row } };
  }
  if (name === "update_participant") {
    const input = z.object({ id: z.string(), participant: participantInput }).parse(args);
    rows = rows.map((row) => row.id === input.id ? { ...row, ...input.participant, rawSkills: input.participant.skills.join(", "), etag: 'W/"2"' } : row);
    return { content: [], structuredContent: { updated: true } };
  }
  if (name === "delete_participant") {
    if (state.conflictDelete) return { isError: true, content: [{ type: "text", text: "This participant changed in another session. Refresh before editing or deleting." }] };
    const input = z.object({ id: z.string(), confirmed: z.literal(true) }).parse(args);
    rows = rows.filter((row) => row.id !== input.id);
    return { content: [], structuredContent: { deleted: true } };
  }
  throw new McpError(-32000, "Unknown tool");
};
const iframe = document.getElementById("app");
if (!(iframe instanceof HTMLIFrameElement) || !iframe.contentWindow) throw new Error("Missing test iframe.");
await bridge.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow));
iframe.src = "/dist/index.html";
