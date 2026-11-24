# raemone.github.io

Source for [raemone.github.io](https://raemone.github.io/), including the
bilingual portfolio, standalone demo pages, and sample applications.

## Repository layout

| Path | Purpose |
| --- | --- |
| `whois/` | Astro portfolio published at the site root. See the [portfolio README](whois/README.md) for content editing and development. |
| `demos.html` | Index of selected standalone chatbot demos. |
| `WebReactSSO/` | React and TypeScript WebChat integration sample. See its [setup guide](WebReactSSO/README.md). |
| `WebChatCodeSample/` | Standalone WebChat sample page. |
| `LCYC/`, `okta/`, `OralB/`, `PowerUp/` | Additional demo pages and supporting assets. |
| `apps/bootcamp-registration/` | Dataverse-backed MCP App, hosted separately from GitHub Pages. See its [README](apps/bootcamp-registration/README.md) for setup and deployment. |
| `img/` | Shared image assets. |
| `.github/workflows/` | Site deployment and article synchronization workflows. |

Other HTML files at the repository root are standalone demo pages.
Each Node.js application manages its own dependencies; there is no root-level
package or shared build command.

## Develop the portfolio

Use Node.js 22 to match the site deployment workflow. From the repository root:

```powershell
Set-Location whois
npm ci
npm run dev
```

Open `http://localhost:4321`. Portfolio content lives in `whois/src/data/`.
From the `whois` directory, use `npm test` to run tests, `npm run build` to
type-check and build, and `npm run preview` to preview the production output.

For the WebChat sample or bootcamp registration app, follow the linked
application-specific README instead.

## Deployment

The [Deploy site workflow](.github/workflows/deploy.yml) runs on pushes to
`main` and can also be started manually. It type-checks, tests, and builds the
portfolio, then combines its output with the existing static demo files for
GitHub Pages.

The portfolio is served at `/`; `/whois/` redirects to the site root. Existing
demo pages keep their paths. The `apps/bootcamp-registration/` directory is
explicitly excluded from the Pages deployment and its MCP server runs
separately on Azure App Service.

## Configuration and secrets

Do not commit credentials, access tokens, local `.env` files, or participant
exports. Follow each application's configuration instructions and review
environment-specific endpoints and authentication settings before running a demo.
