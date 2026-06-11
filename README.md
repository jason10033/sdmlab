# SDMLab

Rapid development of shared decision-making (SDM) tools. A clinical team brings a decision, uploads existing materials, and SDMLab searches the literature, interviews the team about their population, and generates an IPDAS-structured decision aid in three formats (interactive patient tool, printable one-pager, provider conversation guide) plus a decision-specific training companion. Each tool moves through a managed lifecycle with human review gates, and live tools get weekly AI-triaged surveillance of PubMed and patient communities.

## Accounts, repository, and roles

- **Self-registration**: anyone can create an account (name, institution, email) and gets their own private workspace. Public pages: `/how-it-works`, `/repository`.
- **Public repository**: finalized (production) tools can be published for anyone to use or adapt. Adapting forks a full editable copy into your workspace, linked to the original. Contributing an adapted version back publishes immediately and records public provenance: who adapted it (email, institution) and why (a multi-select reasons checklist plus notes).
- **Maintenance**: after production, weekly monitoring continues; the builder signs off to stamp a public "evidence last reviewed" date.
- **Roles**: `superadmin` (the seeded account) sees a Site Admin page with cross-workspace usage, project stages, last activity, and median time between stages. Self-registered users are admins of their own workspace only.
- **Sharing**: the patient summary can be printed, emailed (mailto), or texted (sms:) from the user's own device.
- **Evaluation instruments**: SURE and Preparation for Decision Making (patients), IPDASi (provider, alpha), and AIM/IAM/FIM implementation measures (provider, beta), plus custom questions.

## Custom domain and per-tool subdomains (sdmlab.com)

The app serves a tool directly when reached at `<slug>.sdmlab.com`. To enable that once you own sdmlab.com:

1. In Render, add `sdmlab.com`, `www.sdmlab.com`, and a wildcard `*.sdmlab.com` as custom domains on the service.
2. At your DNS provider, point the apex/`www` at Render and add a wildcard CNAME `*.sdmlab.com` to the Render hostname.
3. No code change needed: the client reads the subdomain and loads that tool. Reserved subdomains (`www`, `app`, `api`) fall through to the builder app. The path form (`sdmlab.com/#/t/<slug>`) always works as a fallback.

## Lifecycle (IPDAS development model)

Scope -> Evidence -> Design -> Prototype -> Alpha -> Beta -> Production. Each stage shows IPDAS guidance and a checklist, and has a gate (overridable with an audit note). Alpha = controlled testing via single-use evaluation links (validated measures: IPDASi for providers; SURE and Preparation for Decision Making for patients). Beta = open field testing on the live site / subdomain, collecting anonymous validated evaluations. Production = live with weekly monitoring. The generated tool ends with a share-with-provider summary (patient and provider views, print, email), plus the printable one-pager and provider conversation guide.

## Lifecycle (detail)

1. **Intake** - upload PDFs, URLs, or pasted text; content is extracted as trusted source material
2. **Evidence scan** - AI-built PubMed queries for values, preferences, risks, benefits; abstracts screened and flagged; builder includes or dismisses each one; Reddit communities discovered and approved for monitoring
3. **Population interview** - structured questions about the patient population that shape language, values questions, and training
4. **Draft** - full tool generated with inline citations on every claim; regenerate or edit; every version kept
5. **Provider iteration** - single-use review links, structured questionnaires, gate at 5 reviews (overridable with audit note)
6. **Patient iteration** - same machinery, patient questions, gate at 10
7. **Live + monitoring** - public link, anonymous feedback, weekly PubMed + Reddit surveillance into a review queue; nothing changes a live tool without approval

## Running locally

Requirements: Node 22+.

```
npm install            # root
cd server && npm install
cd ../client && npm install
cd ..
npm run dev            # starts API (port 3002) + Vite client (port 5173)
```

First login: `admin@sdmlab.local` / `changeme` (override with SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD before first run). Change the password and add PTC staff via POST /api/auth/users.

Environment variables (server):

Server environment variables can live in `server/.env` (see `server/.env.example`); real environment variables always win.

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Required for live AI features (extraction, evidence scan, generation, surveillance triage) |
| `MOCK_AI` | `1` enables fallback mode when no key is set: real PubMed/Reddit data, clearly-labeled placeholder content where the AI would write. Ignored once a key exists. |
| `ANTHROPIC_MODEL` | Optional model override (default `claude-opus-4-8`) |
| `DATA_DIR` | Where sdmlab.db and uploads live (default: server/) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | First admin account |
| `CRON_SECRET` | Bearer token for external cron hitting POST /api/surveillance/run |

## Deployment (Render)

`render.yaml` defines the service: single Node web service serving the API and the built client, with a persistent disk mounted at /var/data for the SQLite database and uploads. Set the secret env vars in the Render dashboard. Weekly surveillance runs in-process; because Render free instances sleep, use a paid instance or add a Render Cron Job that POSTs to `/api/surveillance/run` with `Authorization: Bearer $CRON_SECRET`.

## Data governance

- Only builders (PTC staff) have accounts. Patients and reviewers never log in.
- Patient feedback and reviewer responses are anonymous; no identifiers are collected or stored.
- Analytics are aggregate event counts (view, complete, print) with timestamps only.
- Every content change, stage change, and gate override is recorded in the per-project audit trail.

## Repo layout

```
server/   Express API, node:sqlite DB, AI services (Anthropic, PubMed, Reddit), weekly surveillance
client/   React + Vite app: builder workspace, dashboard, training module, public tool, review portal
docs/     Technical guide and project documents
```

`server/sample-data.cjs` seeds a sample tool version for demos/testing without an API key.
