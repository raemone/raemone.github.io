import { App } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { participantInput, skills, recordId, etag, parseSkills, isPictureOriginAllowed } from "./model.js";
import type { Participant } from "./model.js";
import "./ui.css";

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing UI element: ${id}.`);
  return value as T;
}
const app = new App({ name: "Bootcamp registration", version: "0.1.0" });
const status = element("status");
const form = element<HTMLFormElement>("participant-form");
const dialog = element<HTMLDialogElement>("delete-dialog");
let rows: Participant[] = [];
let cursor: string | undefined;
let loadedSearch = "";
let selected: Participant | undefined;
let deletion: Participant | undefined;
let pictureOrigins: string[] = [];
let connected = false;
let busy = false;
const rowSchema = z.object({
  id: recordId, etag, rawSkills: z.string(), firstName: z.string(), lastName: z.string(),
  email: z.string(), company: z.string(), role: z.string(), profilePictureUrl: z.string(),
  skills: z.array(z.enum(skills)),
});
const listSchema = z.object({ participants: z.array(rowSchema), nextCursor: z.string().optional(), pictureOrigins: z.array(z.string()) });

function showStatus(message: string, error = false): void {
  status.textContent = message;
  status.classList.toggle("error", error);
}
function setBusy(value: boolean): void {
  busy = value;
  document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = value || !connected; });
  form.querySelectorAll<HTMLInputElement>("input").forEach((input) => { input.disabled = value || !connected; });
}
async function run(operation: () => Promise<void>): Promise<void> {
  if (busy || !connected) return;
  setBusy(true);
  try { await operation(); }
  catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" ")
      : error instanceof Error ? error.message : "The operation failed.";
    showStatus(message, true);
    if (dialog.open) element("delete-error").textContent = message;
  }
  finally { setBusy(false); }
}
async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await app.callServerTool({ name, arguments: args });
  if (result.isError) throw new Error(result.content?.find((item) => item.type === "text")?.text ?? "The operation failed.");
  return z.record(z.string(), z.unknown()).parse(result.structuredContent);
}
function reset(): void {
  selected = undefined;
  form.reset();
  element("form-title").textContent = "Add participant";
  element("save").textContent = "Add participant";
  element("cancel").hidden = true;
  element("legacy-skills").hidden = true;
}
function edit(row: Participant): void {
  selected = row;
  for (const key of ["firstName", "lastName", "email", "company", "role", "profilePictureUrl"] as const) {
    element<HTMLInputElement>(key).value = row[key];
  }
  form.querySelectorAll<HTMLInputElement>('input[name="skill"]').forEach((input) => { input.checked = row.skills.includes(input.value as typeof skills[number]); });
  const legacy = row.rawSkills.split(",").map((item) => item.trim()).filter((item) => item && !parseSkills(item).length);
  element("legacy-skills").hidden = legacy.length === 0;
  element("legacy-skills").textContent = `Additional existing skills will be preserved: ${legacy.join(", ")}`;
  element("form-title").textContent = "Edit participant";
  element("save").textContent = "Save changes";
  element("cancel").hidden = false;
  element("firstName").focus();
}
function actionIcon(pathData: string): SVGSVGElement {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.75");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  icon.append(path);
  return icon;
}
function render(): void {
  const directory = element("participants");
  directory.replaceChildren();
  element("count").textContent = `${rows.length} loaded`;
  element("more").hidden = !cursor;
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.textContent = "No participants found.";
    directory.append(empty);
  }
  for (const row of rows) {
    const card = document.createElement("article");
    card.className = "participant-card";
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = `${row.firstName.charAt(0)}${row.lastName.charAt(0)}`.toUpperCase();
    card.append(avatar);
    let url: URL | undefined;
    try { if (row.profilePictureUrl) url = new URL(row.profilePictureUrl); } catch { /* Show initials for invalid legacy picture URLs. */ }
    if (url?.protocol === "https:" && !url.username && !url.password && isPictureOriginAllowed(url.origin, pictureOrigins)) {
      const image = document.createElement("img");
      image.src = url.href;
      image.alt = "";
      image.className = "avatar";
      image.referrerPolicy = "no-referrer";
      image.loading = "lazy";
      image.addEventListener("error", () => { avatar.title = "Profile picture could not be loaded."; image.replaceWith(avatar); });
      avatar.replaceWith(image);
    }
    const body = document.createElement("div");
    const heading = document.createElement("div");
    heading.className = "participant-heading";
    const name = document.createElement("p");
    name.className = "participant-name";
    name.textContent = `${row.firstName} ${row.lastName}`;
    heading.append(name);
    body.append(heading);
    for (const value of [row.email, [row.company, row.role].filter(Boolean).join(" / ")]) {
      const detail = document.createElement("p");
      detail.className = "participant-detail";
      detail.textContent = value;
      body.append(detail);
    }
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const skill of row.rawSkills.split(",").map((value) => value.trim()).filter(Boolean)) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = skill;
      chips.append(chip);
    }
    body.append(chips);
    const actions = document.createElement("div");
    actions.className = "participant-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "icon-button";
    editButton.append(actionIcon("m16 3 5 5-12 12-6 2 2-6 12-12Z M14 5l5 5"));
    editButton.setAttribute("aria-label", `Edit ${row.firstName} ${row.lastName}`);
    editButton.title = `Edit ${row.firstName} ${row.lastName}`;
    editButton.addEventListener("click", () => { edit(row); });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "icon-button delete-button";
    deleteButton.append(actionIcon("M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7"));
    deleteButton.setAttribute("aria-label", `Delete ${row.firstName} ${row.lastName}`);
    deleteButton.title = `Delete ${row.firstName} ${row.lastName}`;
    deleteButton.addEventListener("click", () => {
      deletion = row;
      element("delete-error").textContent = "";
      element("delete-message").textContent = `${row.firstName} ${row.lastName} (${row.email})`;
      dialog.showModal();
      element("delete-cancel").focus();
    });
    actions.append(editButton, deleteButton);
    heading.append(actions);
    card.append(body);
    directory.append(card);
  }
}
async function load(more = false): Promise<void> {
  const search = more ? loadedSearch : element<HTMLInputElement>("search").value;
  const participants: Participant[] = [];
  const seenCursors = new Set<string>();
  let nextCursor = more ? cursor : undefined;
  let origins = pictureOrigins;
  do {
    // Existing connections can use the directory without discovering a newly added tool.
    const data = listSchema.parse(await call("list_participants", {
      search,
      ...(nextCursor ? { cursor: nextCursor } : {}),
    }));
    participants.push(...data.participants);
    nextCursor = data.nextCursor;
    origins = data.pictureOrigins;
    if (!more && nextCursor) {
      if (seenCursors.has(nextCursor)) throw new Error("Dataverse returned a repeated continuation URL. Refresh the list.");
      seenCursors.add(nextCursor);
    }
  } while (!more && nextCursor);
  rows = [...new Map([...(more ? rows : []), ...participants].map((row) => [row.id, row])).values()];
  cursor = nextCursor;
  pictureOrigins = origins;
  loadedSearch = search;
  render();
  showStatus("Registrations loaded from Dataverse.");
}
async function reloadAfterMutation(message: string): Promise<void> {
  try { await load(); showStatus(message); }
  catch { showStatus(`${message} Refresh failed; do not repeat the operation. Use Refresh to reload the list.`, true); }
}
for (const skill of skills) {
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox"; checkbox.name = "skill"; checkbox.value = skill;
  label.append(checkbox, document.createTextNode(skill));
  element("skills").append(label);
}
element("refresh").addEventListener("click", () => { void run(() => load()); });
element("list-all").addEventListener("click", () => {
  void run(async () => {
    element<HTMLInputElement>("search").value = "";
    await load();
  });
});
element("more").addEventListener("click", () => { void run(() => load(true)); });
element("cancel").addEventListener("click", reset);
element("search-button").addEventListener("click", () => { void run(() => load()); });
function saveParticipant(): void {
  if (!form.reportValidity()) return;
  void run(async () => {
    const input = participantInput.parse({
      ...Object.fromEntries(["firstName", "lastName", "email", "company", "role", "profilePictureUrl"].map((key) => [key, element<HTMLInputElement>(key).value])),
      skills: [...form.querySelectorAll<HTMLInputElement>('input[name="skill"]:checked')].map((item) => item.value),
    });
    await call(selected ? "update_participant" : "create_participant", selected ? { id: selected.id, etag: selected.etag, participant: input } : input);
    reset();
    await reloadAfterMutation("Participant saved to Dataverse.");
  });
}
element("save").addEventListener("click", saveParticipant);
// MCP hosts can forbid native form submissions even when a submit handler cancels them.
for (const target of [form, element("search-form")]) {
  target.addEventListener("keydown", (event) => {
    if (event instanceof KeyboardEvent && event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      if (target === form) saveParticipant();
      else void run(() => load());
    }
  });
  target.addEventListener("submit", (event) => { event.preventDefault(); });
}
element("delete-cancel").addEventListener("click", () => { deletion = undefined; dialog.close(); });
dialog.addEventListener("cancel", () => { deletion = undefined; });
element("delete-confirm").addEventListener("click", () => {
  void run(async () => {
    if (!deletion) return;
    const target = deletion;
    await call("delete_participant", { id: target.id, etag: target.etag, confirmed: true });
    if (selected?.id === target.id) reset();
    deletion = undefined;
    dialog.close();
    await reloadAfterMutation("Participant deleted from Dataverse.");
  });
});
app.ontoolresult = (result: CallToolResult): void => {
  if (busy) return;
  if (result.isError) { showStatus(result.content?.find((item) => item.type === "text")?.text ?? "The operation failed.", true); return; }
  const data = listSchema.safeParse(result.structuredContent);
  if (data.success) { rows = data.data.participants; cursor = data.data.nextCursor; pictureOrigins = data.data.pictureOrigins; render(); showStatus("Registrations loaded from Dataverse."); }
};
app.onhostcontextchanged = (context): void => {
  if (context.theme) document.documentElement.setAttribute("data-theme", context.theme);
};
setBusy(false);
void app.connect().then(() => {
  connected = true;
  const theme = app.getHostContext()?.theme;
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  setBusy(false);
  if (!rows.length) void run(() => load());
}).catch(() => { showStatus("Open this app through an MCP Apps-compatible host. The MCP connection could not be established.", true); });
