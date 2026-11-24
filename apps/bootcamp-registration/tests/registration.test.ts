import assert from "node:assert/strict";
import test from "node:test";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Dataverse } from "../src/dataverse.js";
import { authorizeClaims } from "../src/auth.js";
import { participantInput, recordId, idColumn, fields, entitySet, skills, validatePictureOrigin } from "../src/model.js";
import { createServer, resourceUri } from "../src/server.js";

const environment = "https://example.crm.dynamics.com/";
const id = "12345678-1234-f111-8234-123456789abc";
const version = 'W/"123"';
const input = { firstName: "Alex", lastName: "Example", email: "alex@example.com", company: "Example", role: "Architect", skills: ["Copilot Studio" as const], profilePictureUrl: "" };
const record = {
  [idColumn]: id, "@odata.etag": version,
  ...Object.fromEntries(Object.entries(fields).map(([key, column]) => [column, key === "skills" ? "Copilot Studio" : input[key as keyof typeof input]])),
};
function mockStore(replies: Array<{ status?: number; body?: unknown }>, pictureOrigins: string[] = []): { store: Dataverse; calls: Array<{ url: URL; init?: RequestInit }> } {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const request: typeof fetch = async (url, init) => {
    calls.push({ url: new URL(String(url)), init });
    const reply = replies.shift();
    assert.ok(reply, "Unexpected Dataverse request.");
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "Content-Type": "application/json" } });
  };
  return { store: new Dataverse(environment, async () => "test-only-token", pictureOrigins, request), calls };
}

test("normalizes email, validates field limits, and rejects invalid skills and unsafe pictures", () => {
  assert.equal(participantInput.parse({ ...input, email: " ALEX@EXAMPLE.COM " }).email, input.email);
  for (const invalid of [
    { firstName: "" }, { lastName: "x".repeat(101) }, { email: "invalid" },
    { skills: ["Copilot", "Copilot"] }, { skills: ["Other"] },
    { profilePictureUrl: "javascript:alert(1)" }, { profilePictureUrl: "https://user:pass@example.com/x" },
    { profilePictureUrl: `https://example.com/${"x".repeat(100)}` },
  ]) assert.equal(participantInput.safeParse({ ...input, ...invalid }).success, false);
  assert.throws(() => validatePictureOrigin("https://unknown.example/x", ["https://approved.example"]));
});

test("accepts Dataverse GUIDs without UUID version restrictions and rejects malformed identifiers", () => {
  assert.equal(recordId.parse(id), id);
  assert.equal(recordId.parse("12345678-1234-4234-8234-123456789abc"), "12345678-1234-4234-8234-123456789abc");
  for (const invalid of ["invalid", `{${id}}`, id.replaceAll("-", ""), `${id})?$select=cr7a7_email`]) {
    assert.equal(recordId.safeParse(invalid).success, false);
  }
});

test("wildcard picture policy allows any HTTPS host but not unsafe schemes or URL credentials", async () => {
  for (const picture of ["https://photos.example/avatar.png", "https://another.example:8443/avatar.jpg"]) {
    validatePictureOrigin(picture, ["*"]);
    assert.throws(() => validatePictureOrigin(picture, []), /configured PROFILE_PICTURE_ORIGINS/);
  }
  for (const picture of ["http://photos.example/avatar.png", "https://user:password@photos.example/a.jpg", "data:image/png;base64,abc"]) {
    assert.throws(() => validatePictureOrigin(picture, ["*"]), /configured PROFILE_PICTURE_ORIGINS/);
  }
  const picture = "https://photos.example/avatar.png";
  const { store, calls } = mockStore([
    { body: { value: [] } }, { status: 201, body: { ...record, [fields.profilePictureUrl]: picture } },
  ], ["*"]);
  const saved = await store.save({ ...input, profilePictureUrl: picture });
  assert.equal(saved.profilePictureUrl, picture);
  assert.equal(JSON.parse(String(calls[1].init?.body))[fields.profilePictureUrl], picture);
});

test("lists and searches with escaped OData literals and stable paging", async () => {
  const nextCursor = `${environment}api/data/v9.2/${entitySet}?%24skiptoken=next`;
  const { store, calls } = mockStore([{ body: { value: [record], "@odata.nextLink": nextCursor } }, { body: { value: [] } }]);
  const page = await store.list("O'Brien");
  assert.equal(page.participants[0].email, input.email);
  assert.equal(page.nextCursor, nextCursor);
  assert.match(calls[0].url.searchParams.get("$filter") ?? "", /O''Brien/);
  await store.list("", page.nextCursor);
  assert.equal(calls[1].url.href, nextCursor);
});

test("rejects malicious cursor before obtaining a token or making requests", async () => {
  const { store, calls } = mockStore([]);
  for (const cursor of ["https://attacker.example/", `${environment}api/data/v9.2/../../other`, `${environment}api/data/v9.2/systemusers`, "https://example.crm.dynamics.com.evil.test/api/data/v9.2/"]) {
    await assert.rejects(store.list("", cursor), /Invalid Dataverse continuation/);
  }
  assert.equal(calls.length, 0);
});

test("lists all search results across Dataverse pages", async () => {
  const nextCursor = `${environment}api/data/v9.2/${entitySet}?%24skiptoken=next`;
  const second = { ...record, [idColumn]: "87654321-1234-f111-8234-123456789abc" };
  const { store, calls } = mockStore([
    { body: { value: [record], "@odata.nextLink": nextCursor } },
    { body: { value: [second] } },
  ]);
  const page = await store.listAll("O'Brien");
  assert.deepEqual(page.participants.map((row) => row.id), [id, second[idColumn]]);
  assert.equal("nextCursor" in page, false);
  assert.match(calls[0].url.searchParams.get("$filter") ?? "", /O''Brien/);
  assert.equal(calls[1].url.href, nextCursor);
});

test("listing all participants rejects repeated cursors and does not return a partial result on failure", async () => {
  const nextCursor = `${environment}api/data/v9.2/${entitySet}?%24skiptoken=next`;
  const repeated = mockStore([
    { body: { value: [record], "@odata.nextLink": nextCursor } },
    { body: { value: [], "@odata.nextLink": nextCursor } },
  ]);
  await assert.rejects(repeated.store.listAll(), /Dataverse returned a repeated continuation URL/);
  assert.equal(repeated.calls.length, 2);
  const failed = mockStore([
    { body: { value: [record], "@odata.nextLink": nextCursor } },
    { status: 403 },
  ]);
  await assert.rejects(failed.store.listAll(), /Your Dataverse permissions/);
});

test("creates with mapped fields and comma-separated skill list", async () => {
  const { store, calls } = mockStore([{ body: { value: [] } }, { status: 201, body: record }]);
  const saved = await store.save(input);
  assert.equal(saved.id, id);
  assert.equal(calls[1].init?.method, "POST");
  const body = JSON.parse(String(calls[1].init?.body));
  assert.equal(body[fields.skills], "Copilot Studio");
  assert.equal(body[fields.email], input.email);
});

test("duplicate email prevents create", async () => {
  const { store, calls } = mockStore([{ body: { value: [{ [idColumn]: id }] } }]);
  await assert.rejects(store.save(input), /already exists/);
  assert.equal(calls.length, 1);
});

test("updates preserve unrecognized existing skills and send If-Match", async () => {
  const { store, calls } = mockStore([
    { body: { value: [] } }, { body: { [fields.skills]: "Copilot, Existing specialty" } },
    { body: { ...record, [fields.skills]: "Copilot Studio, Existing specialty" } },
  ]);
  const saved = await store.save(input, id, version);
  assert.equal(saved.rawSkills, "Copilot Studio, Existing specialty");
  assert.equal(new Headers(calls[2].init?.headers).get("If-Match"), version);
  assert.equal(calls[2].init?.method, "PATCH");
  assert.match(calls[0].url.searchParams.get("$filter") ?? "", new RegExp(`ne ${id}`));
});

test("company-only updates preserve an unchanged picture from an unconfigured origin", async () => {
  const picture = "https://legacy.example/avatar.jpg";
  const updated = { ...input, company: "Updated company", profilePictureUrl: picture };
  const { store, calls } = mockStore([
    { body: { value: [] } },
    { body: { [fields.skills]: "Copilot Studio", [fields.profilePictureUrl]: picture } },
    { body: { ...record, [fields.company]: updated.company, [fields.profilePictureUrl]: picture } },
  ]);
  const saved = await store.save(updated, id, version);
  assert.equal(saved.company, updated.company);
  assert.equal(saved.profilePictureUrl, picture);
  assert.ok(calls[1].url.searchParams.get("$select")?.split(",").includes(fields.profilePictureUrl));
  const body = JSON.parse(String(calls[2].init?.body));
  assert.equal(body[fields.company], updated.company);
  assert.equal(Object.hasOwn(body, fields.profilePictureUrl), false);
  assert.equal(new Headers(calls[2].init?.headers).get("If-Match"), version);
});

test("new and changed pictures still require approved origins, including changes within a legacy origin", async () => {
  const picture = "https://legacy.example/avatar.jpg";
  const created = mockStore([]);
  await assert.rejects(created.store.save({ ...input, profilePictureUrl: picture }), /configured PROFILE_PICTURE_ORIGINS/);
  assert.equal(created.calls.length, 0);
  for (const replacement of ["https://unapproved.example/new.jpg", "https://legacy.example/new.jpg"]) {
    const updated = mockStore([
      { body: { value: [] } },
      { body: { [fields.skills]: "Copilot Studio", [fields.profilePictureUrl]: picture } },
    ]);
    await assert.rejects(updated.store.save({ ...input, profilePictureUrl: replacement }, id, version), /configured PROFILE_PICTURE_ORIGINS/);
    assert.equal(updated.calls.some((call) => call.init?.method === "PATCH"), false);
  }
});

test("an existing unapproved picture can be cleared", async () => {
  const { store, calls } = mockStore([
    { body: { value: [] } },
    { body: { [fields.skills]: "Copilot Studio", [fields.profilePictureUrl]: "https://legacy.example/avatar.jpg" } },
    { body: record },
  ]);
  await store.save(input, id, version);
  assert.equal(JSON.parse(String(calls[2].init?.body))[fields.profilePictureUrl], "");
});

test("delete is guarded by a valid id and version and reports concurrency conflicts", async () => {
  const { store, calls } = mockStore([{ status: 412 }]);
  await assert.rejects(store.remove(id, version), /changed in another session/);
  assert.equal(calls[0].init?.method, "DELETE");
  assert.equal(new Headers(calls[0].init?.headers).get("If-Match"), version);
  await assert.rejects(store.remove("invalid", version));
  await assert.rejects(store.remove(id, "*"));
  assert.equal(calls.length, 1);
});

test("Dataverse error bodies never leak personal information", async () => {
  const { store } = mockStore([{ status: 500, body: { error: { message: "private participant information" } } }]);
  await assert.rejects(store.list(), (error: Error) => error.message === "Dataverse request failed (HTTP 500).");
});

test("HTTP access requires delegated scope and organizer role", () => {
  authorizeClaims({ scp: "access_as_user", roles: ["Bootcamp.Organizer"] });
  for (const claims of [{}, { scp: "access_as_user" }, { roles: ["Bootcamp.Organizer"] }, { scp: "access_as_user", roles: ["Other"] }]) {
    assert.throws(() => authorizeClaims(claims), /Organizer access required/);
  }
});

test("MCP create succeeds for a Dataverse-assigned GUID and subsequent listing returns the record", async () => {
  const { store, calls } = mockStore([
    { body: { value: [] } }, { status: 201, body: record }, { body: { value: [record] } },
  ]);
  const server = createServer(store, [], "<!DOCTYPE html><title>Registration</title>");
  const client = new Client({ name: "registration-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const created = await client.callTool({ name: "create_participant", arguments: input });
    assert.equal(created.isError, undefined);
    const expected = { ...input, id, etag: version, rawSkills: "Copilot Studio" };
    assert.deepEqual(created.structuredContent, { participant: expected });
    const listed = await client.callTool({ name: "list_participants", arguments: {} });
    assert.equal(listed.isError, undefined);
    assert.deepEqual(listed.structuredContent, { participants: [expected], skills, pictureOrigins: [] });
    assert.equal(calls.filter((call) => call.init?.method === "POST").length, 1);
  } finally { await client.close(); await server.close(); }
});

test("MCP advertises the UI resource, returns data, and requires explicit deletion confirmation", async () => {
  const { store, calls } = mockStore([{ body: { value: [record] } }, { body: { value: [record] } }, { status: 204 }]);
  const server = createServer(store, ["*", "https://photos.example"], "<!DOCTYPE html><title>Registration</title>");
  const client = new Client({ name: "registration-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 6);
    assert.equal(tools.tools.find((tool) => tool.name === "open_registration")?._meta?.ui && JSON.stringify(tools.tools.find((tool) => tool.name === "open_registration")?._meta?.ui), JSON.stringify({ resourceUri }));
    const resource = await client.readResource({ uri: resourceUri });
    assert.equal(resource.contents[0].mimeType, "text/html;profile=mcp-app");
    const expectedMeta = { ui: { csp: { connectDomains: [], resourceDomains: ["https://*:*", "https://photos.example"] } } };
    assert.deepEqual(resource.contents[0]._meta, expectedMeta);
    const resources = await client.listResources();
    assert.deepEqual(resources.resources[0]._meta, expectedMeta);
    const opened = await client.callTool({ name: "open_registration", arguments: {} });
    assert.equal(opened.isError, undefined);
    assert.ok(opened.structuredContent);
    const all = await client.callTool({ name: "list_all_participants", arguments: {} });
    assert.equal(all.isError, undefined);
    assert.deepEqual(all.structuredContent, opened.structuredContent);
    const denied = await client.callTool({ name: "delete_participant", arguments: { id, etag: version, confirmed: false } });
    assert.equal(denied.isError, true);
    assert.equal(calls.length, 2);
    const deleted = await client.callTool({ name: "delete_participant", arguments: { id, etag: version, confirmed: true } });
    assert.equal(deleted.isError, undefined);
    assert.equal(calls.length, 3);
  } finally { await client.close(); await server.close(); }
});

test("HTTP endpoint rejects anonymous access and foreign origins without exposing data", { timeout: 15_000 }, async () => {
  const reservation = createNetServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve) => { reservation.close(() => { resolve(); }); });
  const child = spawn(process.execPath, ["--import", "tsx", "src/main.ts", "--http"], {
    cwd: process.cwd(),
    env: {
      ...process.env, DATAVERSE_URL: environment, PORT: String(port), HOST: "127.0.0.1",
      MCP_TENANT_ID: "11111111-1111-4111-8111-111111111111",
      MCP_CLIENT_ID: "22222222-2222-4222-8222-222222222222",
      MCP_CLIENT_SECRET: "synthetic-test-fixture", MCP_PUBLIC_URL: "https://mcp.example.com",
      PROFILE_PICTURE_ORIGINS: "*",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });

  try {
    assert.ok(child.stderr);
    await once(child.stderr, "data", { signal: AbortSignal.timeout(10_000) });
    const base = `http://127.0.0.1:${port}`;
    const health = await fetch(`${base}/health`);
    assert.deepEqual(await health.json(), { status: "ok" });
    const discovery = await fetch(`${base}/.well-known/oauth-protected-resource`);
    assert.equal((await discovery.json()).resource, "https://mcp.example.com/mcp");
    const denied = await fetch(`${base}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get("WWW-Authenticate") ?? "", /resource_metadata/);
    const foreign = await fetch(`${base}/mcp`, { method: "POST", headers: { Origin: "https://attacker.example" } });
    assert.equal(foreign.status, 403);
  } finally {
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await once(child, "exit");
  }
});

test("deployment maps Graph secretText to the Key Vault payload and rejects a missing value", { skip: process.platform !== "win32" }, () => {
  const script = `
    $ErrorActionPreference = 'Stop'
    $ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) 'scripts\\deploy.ps1'), [ref]$null, [ref]$null)
    $definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'New-VaultSecretBody' }, $true)
    Invoke-Expression $definition.Extent.Text
    $expiry = [DateTimeOffset]::Parse('2027-01-01T00:00:00Z')
    $payload = New-VaultSecretBody @{ secretText = 'synthetic-fixture' } $expiry | ConvertFrom-Json
    if ($payload.value -ne 'synthetic-fixture' -or $payload.attributes.exp -ne $expiry.ToUnixTimeSeconds()) { throw 'Credential mapping failed.' }
    $rejected = $false
    try { New-VaultSecretBody @{ passwordText = 'synthetic-fixture' } $expiry | Out-Null } catch { $rejected = $true }
    if (!$rejected) { throw 'Missing secretText was not rejected.' }
    Write-Output 'passed'
  `;
  assert.equal(execFileSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" }).trim(), "passed");
});
