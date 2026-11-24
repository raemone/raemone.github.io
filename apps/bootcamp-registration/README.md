# Bootcamp registration MCP App

Organizer-only participant management backed by the existing Dataverse table
`cr7a7_bootcampparticipant`. This is an MCP App (interactive HTML resource plus
MCP tools), not a public registration website or a Copilot Studio agent.

Supports first name, last name, email, company, role, multiple skills (Cowork,
Copilot, Copilot Studio, Azure Foundry), and profile-picture **URLs**. Add, edit,
search, list all, page through, and delete participants. Deletion requires confirmation;
updates and deletes use Dataverse ETags to prevent overwriting concurrent changes.
The source lives in `apps/bootcamp-registration/` in
[`raemone/raemone.github.io`](https://github.com/raemone/raemone.github.io).
The site's Pages workflow excludes this folder from the published website.
The MCP server runs separately on Azure App Service; moving its source does not
change the running app, Dataverse data, or Entra app registrations.

## Local setup

Requires Node.js 22.12+ and Azure CLI. From this folder:

```powershell
npm ci
Copy-Item .env.example .env
# Edit .env; never commit it.
npm run build
npm test
az login --tenant <your-environment-tenant-id>
npm start
```

The default transport is stdio. It uses the signed-in Azure CLI user's Dataverse
permissions, not an application administrator identity. Select the correct tenant
and grant that organizer the minimum required read/create/write/delete privileges
on this table. No credentials or participant exports are written into the repo.

### GitHub Copilot

Configure an MCP server in your GitHub Copilot client's MCP configuration. Use
the client's supported configuration format; a VS Code `.vscode/mcp.json`
server entry looks like:

```json
{
  "servers": {
    "bootcamp-registration": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\path\\to\\apps\\bootcamp-registration\\dist\\server\\main.js"],
      "env": {
        "DATAVERSE_URL": "https://org02f9c7df.crm.dynamics.com/",
        "PROFILE_PICTURE_ORIGINS": ""
      }
    }
  }
}
```

Ask Copilot to call `open_registration`. Inline rendering depends on the specific
GitHub Copilot client's MCP Apps support; clients without it can still use the
six dashboard/CRUD/search tools. Merely opening `dist/index.html` in a browser does not
connect it to MCP.

### Participant directory

Invoke `list_all_participants` to open the searchable directory with every
participant across all Dataverse pages. The **List all participants** button
clears the current search and reloads the complete directory. UI search and
refresh retrieve all matching pages, not just the first 50 records. The UI uses
the original `list_participants` action and follows its cursors, so existing
connections do not need to discover the new tool to use the directory.

Each participant card has pencil (Edit) and trash (Delete) icon buttons in its
top-right corner, with participant-specific accessible labels and hover tooltips.
Delete still opens a confirmation dialog before removing a registration.

`list_participants` remains available for paginated results using `nextCursor`.
All directory actions retain the signed-in organizer's Dataverse permissions.
To let the agent invoke `list_all_participants` directly, refresh MCP tool
discovery and add/enable that action in the agent. Reopen the app after a UI update.

## Copilot Studio / HTTP setup

HTTP mode is **authenticated only**. No anonymous or development auth bypass is
provided. It requires a remotely reachable HTTPS endpoint and an Entra application.
Use the Azure deployment section below to provision them, or configure existing
hosting and authentication with the following steps.

1. Register a single-tenant Entra API application with v2 access tokens. Expose
   `api://<MCP_CLIENT_ID>/access_as_user` as a delegated scope.
2. Define a user app role with value `Bootcamp.Organizer`, and assign the approved
   organizers. Require user assignment on the enterprise application.
3. Grant the server application Dynamics CRM delegated `user_impersonation`
   permission with appropriate consent. The server uses on-behalf-of exchange,
   so Dataverse evaluates each caller's own permissions.
4. Configure the MCP OAuth client/connector with a registered callback URL,
   authorization-code flow, and that API scope. Client applications must be
   preregistered; this server does not implement dynamic client registration.
5. Set `MCP_TENANT_ID`, `MCP_CLIENT_ID`, `MCP_CLIENT_SECRET`, and `MCP_PUBLIC_URL`
   (HTTPS origin without a path). Use a secret manager for the server secret in
   hosted deployments. Set `HOST=0.0.0.0` only behind your authenticated HTTPS
   hosting/reverse-proxy configuration.
6. Run `npm run start:http`. Connect Copilot Studio to `https://<host>/mcp` with
   per-user OAuth, not a shared owner connection. Invoke `open_registration`.

Entra OAuth endpoints:

```text
Authorize: https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/authorize
Token:     https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token
Scope:     api://<MCP_CLIENT_ID>/access_as_user
```

Protected-resource discovery is available at
`/.well-known/oauth-protected-resource`; `/health` exposes only listener health,
not Dataverse connectivity. The app communicates exclusively through host-routed
MCP calls; it never receives bearer tokens or contacts Dataverse directly.

[Copilot Studio MCP Apps support](https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/mcp-apps)
currently includes preview chat and Microsoft 365 Copilot, **not Teams or web
chat**. Hosting, Entra configuration, and connecting an existing Copilot Studio
agent are separate from building this MCP server.

## Existing table mapping and limits

| App field | Dataverse column | Limit |
| --- | --- | --- |
| First name | `cr7a7_firstname` | 850 characters |
| Last name | `cr7a7_lastname` | 100 characters |
| Email | `cr7a7_email` | 100 characters |
| Company | `cr7a7_company` | 100 characters |
| Role | `cr7a7_role` | 100 characters |
| Skills | `cr7a7_skill` | 100 characters, comma-separated |
| Profile picture | `cr7a7_profilepictureurl` | 100 characters |

No schema changes are made. Existing unrecognized skill values are displayed and
preserved when editing. They count toward the skill column's limit. Email is
trimmed and lowercased before saving.

Participant identifiers are validated as GUIDs, not restricted to RFC UUID
versions: Dataverse can assign GUIDs whose version nibble is `f`. These identifiers
must work in create responses, listings, edits, and deletes without weakening
GUID-format or ETag checks.

**Duplicate caveat:** this table currently has no alternate email key. The server
checks for existing emails before writes, but two simultaneous requests can still
create duplicates. Strict uniqueness requires an administrator to clean existing
duplicates and activate an alternate key on `cr7a7_email` in Dataverse.

**Pictures:** configure `PROFILE_PICTURE_ORIGINS` with comma-separated approved
HTTPS origins, without trailing slashes or paths. Only those origins may be saved
and loaded; empty configuration disables new picture URLs. Use short,
non-secret URLs to organization-controlled images, not signed URLs or tracking
services. Images must be accessible to the iframe without the Dataverse token.
The resource declares these origins in its CSP and images use no-referrer.
Invalid, disallowed, or unavailable existing images fall back to initials.
To allow participant pictures from any HTTPS host, set `PROFILE_PICTURE_ORIGINS=*`
(or pass `-PictureOrigins '*'` to deployment). This explicitly enables broad
external static-resource origins in the MCP resource CSP; host policies may still
block them. UI image elements remain HTTPS-only, credential-free URLs and use
no-referrer. External image hosts can see viewer network requests, so an explicit
allowlist remains the more private option. Images must be real, directly accessible
image URLs; this setting does not repair placeholder URLs or bypass sign-in.
Some hosts restrict broad CSP sources. In that case, keep wildcard mode and
declare known photo origins explicitly, for example
`PROFILE_PICTURE_ORIGINS=*,https://photos.example`. Both the wildcard and exact
origins are advertised on the resource declaration and returned resource content.
An exact declaration is not a guarantee of host approval. If an image still
fails, inspect the host iframe's CSP console violation and effective `img-src`
policy; a public HTTP 200 response alone does not establish sandbox access.
Editing another field preserves an unchanged existing HTTPS picture URL, even
when its origin is no longer approved; the update does not rewrite that column.
New or changed picture URLs still require an approved origin. Clearing an
existing picture is allowed. Preserving its URL does not permit the UI to load
an image from an unapproved origin.

## Validation

`npm run build` checks strict TypeScript and bundles the UI into one HTML file.
`npm test` covers validation, mapping, duplicate checks, pagination, ETag
conflicts, legacy skills, organizer authorization, and MCP tool/resource behavior
with isolated fixtures. These tests do not modify the live table.

`npm run test:ui` runs the bundled app in an isolated Playwright browser with a
real MCP Apps host bridge and synthetic records. Install Playwright Chromium
first (`npx playwright install chromium`), or set `PLAYWRIGHT_CHANNEL=msedge`
to use an installed Edge browser on Windows. No existing browser profile is used.

Before production use, explicitly review the authentication/OBO setup and personal
data handling, exercise all operations in the intended MCP clients, verify
non-organizers are denied, and agree retention/deletion policies.

## Azure deployment

`infra/main.bicep` provisions a separate Linux B1 App Service plan with Node.js
24 LTS, an HTTPS-only web app, and a Key Vault. Basic publishing and FTP are
disabled. The app's managed identity has only secret-read access; the deploying
account receives only secret-write access to this dedicated vault.

The deployment script creates or reuses its named Entra application, assigns the
signed-in organizer, and grants Dynamics CRM delegation for that organizer only.
It does not grant tenant-wide consent or change the Dataverse table.

From this application folder, after selecting and approving a subscription,
region, and the billable resources:

```powershell
.\scripts\deploy.ps1 `
  -SubscriptionId <subscription-id> `
  -Location westeurope `
  -ArtifactDirectory (Join-Path $env:TEMP 'bootcamp-registration-deploy')
```

Azure CLI and Bicep are required. The account needs resource provisioning,
application management, role-assignment, and delegated-consent permissions in the
target tenant. Deployment artifacts contain compiled code and production
dependencies, not `.env`, participant data, or server credentials.

The script stores a new 180-day server credential directly in Key Vault when
needed. App settings contain a Key Vault reference, never the credential value.
Use `-RotateCredential` before expiry, and retire superseded Entra credentials
after validating the new one. The generated `deployment.json` contains only
endpoint/resource identifiers and the OAuth scope. Connecting the deployed
endpoint to a Copilot client and registering its OAuth callback remain separate
steps.

If regional App Service capacity is unavailable, obtain approval before switching
regions or using an existing plan. The script can resume using the same resource
group and Entra application without sharing compute with other apps.
