import { z } from "zod";
import { entitySet, fields, idColumn, parseSkills, participantInput, recordId, etag, validatePictureOrigin } from "./model.js";
import type { Participant, ParticipantInput } from "./model.js";

const rowSchema = z.record(z.string(), z.unknown());
const pageSchema = z.object({ value: z.array(rowSchema), "@odata.nextLink": z.string().optional() });

function text(row: Record<string, unknown>, column: string): string {
  const value = row[column];
  if (value === null || value === undefined) return "";
  return z.string().parse(value);
}

function decode(row: Record<string, unknown>): Participant {
  const rawSkills = text(row, fields.skills);
  return {
    id: recordId.parse(row[idColumn]),
    etag: etag.parse(row["@odata.etag"]),
    firstName: text(row, fields.firstName),
    lastName: text(row, fields.lastName),
    email: text(row, fields.email),
    company: text(row, fields.company),
    role: text(row, fields.role),
    skills: parseSkills(rawSkills),
    rawSkills,
    profilePictureUrl: text(row, fields.profilePictureUrl),
  };
}

export class Dataverse {
  private readonly base: string;
  public constructor(
    environment: string,
    private readonly token: () => Promise<string>,
    private readonly pictureOrigins: string[],
    private readonly request: typeof fetch = fetch,
  ) {
    const url = new URL(environment);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("DATAVERSE_URL must be an HTTPS environment origin.");
    }
    this.base = `${url.origin}/api/data/v9.2/`;
  }

  private async send(path: string, method = "GET", body?: unknown, version?: string): Promise<unknown> {
    const url = new URL(path, this.base);
    // Dataverse paging links must never send the access token to another origin.
    if (!url.href.startsWith(this.base)) throw new Error("Invalid Dataverse continuation URL.");
    const response = await this.request(url, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "OData-Version": "4.0",
        "OData-MaxVersion": "4.0",
        Prefer: "return=representation,odata.maxpagesize=50",
        ...(version ? { "If-Match": version } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const messages: Record<number, string> = {
        401: "Dataverse authentication expired. Sign in again.",
        403: "Your Dataverse permissions do not allow this operation.",
        404: "Participant not found. Refresh the list.",
        412: "This participant changed in another session. Refresh before editing or deleting.",
        429: "Dataverse is throttling requests. Wait and retry.",
      };
      // Do not return the upstream body: it can contain personal data or token details.
      throw new Error(messages[response.status] ?? `Dataverse request failed (HTTP ${response.status}).`);
    }
    return response.status === 204 ? undefined : response.json();
  }

  public async list(search = "", cursor?: string): Promise<{ participants: Participant[]; nextCursor?: string }> {
    if (cursor) {
      const url = new URL(cursor, this.base);
      if (url.origin !== new URL(this.base).origin || url.pathname !== new URL(entitySet, this.base).pathname) {
        throw new Error("Invalid Dataverse continuation URL.");
      }
    }
    const query = new URLSearchParams({
      "$select": [idColumn, ...Object.values(fields)].join(","),
      "$orderby": `${fields.lastName},${fields.firstName},${idColumn}`,
    });
    if (search) {
      const escaped = search.replaceAll("'", "''");
      query.set("$filter", [fields.firstName, fields.lastName, fields.email, fields.company, fields.role, fields.skills]
        .map((column) => `contains(${column},'${escaped}')`).join(" or "));
    }
    const page = pageSchema.parse(await this.send(cursor ?? `${entitySet}?${query}`));
    return { participants: page.value.map(decode), ...(page["@odata.nextLink"] ? { nextCursor: page["@odata.nextLink"] } : {}) };
  }

  public async listAll(search = ""): Promise<{ participants: Participant[] }> {
    const participants: Participant[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await this.list(search, cursor);
      participants.push(...page.participants);
      cursor = page.nextCursor;
      if (cursor) {
        if (seenCursors.has(cursor)) throw new Error("Dataverse returned a repeated continuation URL. Refresh the list.");
        seenCursors.add(cursor);
      }
    } while (cursor);
    return { participants };
  }

  private async checkEmail(email: string, excludingId?: string): Promise<void> {
    const query = new URLSearchParams({
      "$select": idColumn, "$top": "1",
      "$filter": `${fields.email} eq '${email.replaceAll("'", "''")}'${excludingId ? ` and ${idColumn} ne ${recordId.parse(excludingId)}` : ""}`,
    });
    const page = pageSchema.parse(await this.send(`${entitySet}?${query}`));
    if (page.value.length) throw new Error("A participant with this email already exists.");
  }

  public async save(input: ParticipantInput, id?: string, version?: string): Promise<Participant> {
    const data = participantInput.parse(input);
    if (!id) validatePictureOrigin(data.profilePictureUrl, this.pictureOrigins);
    if (id) { recordId.parse(id); etag.parse(version); }
    await this.checkEmail(data.email, id);
    let skillText = data.skills.join(", ");
    let preservePicture = false;
    if (id) {
      const existing = rowSchema.parse(await this.send(`${entitySet}(${id})?$select=${fields.skills},${fields.profilePictureUrl}`));
      preservePicture = data.profilePictureUrl === text(existing, fields.profilePictureUrl);
      if (!preservePicture) validatePictureOrigin(data.profilePictureUrl, this.pictureOrigins);
      const legacy = text(existing, fields.skills).split(",").map((value) => value.trim())
        .filter((value) => value && parseSkills(value).length === 0);
      skillText = [...data.skills, ...legacy].join(", ");
    }
    z.string().max(100).parse(skillText);
    // An unrelated edit must not rewrite a legacy picture or bypass checks for a replacement.
    const body = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== "profilePictureUrl" || !preservePicture).map(([key, column]) => [
      column, key === "skills" ? skillText : data[key as keyof ParticipantInput],
    ]));
    const row = rowSchema.parse(await this.send(id ? `${entitySet}(${id})` : entitySet, id ? "PATCH" : "POST", body, version));
    return decode(row);
  }

  public async remove(id: string, version: string): Promise<void> {
    await this.send(`${entitySet}(${recordId.parse(id)})`, "DELETE", undefined, etag.parse(version));
  }
}
