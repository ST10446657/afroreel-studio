# AfroReel Studio

AfroReel Studio is a multilingual content operations platform for AfroReel's English, Zulu, Hausa, Swahili and French brands. It combines cross-platform scheduling, background publishing, social and website-funnel analytics, and a guarded AI-assisted post-production workflow in one dashboard.

The project was built for a real independent media workflow spanning Facebook, Instagram, TikTok and YouTube. It focuses on the practical problems that appear after a prototype: account-specific credentials, direct media delivery, platform-specific copy, scheduled execution when a laptop is offline, per-target failure reporting, transcript QA and human approval of paid AI generations.

## Highlights

- Five language workspaces with isolated social destinations and credentials
- Facebook, Instagram, TikTok and YouTube publishing from one plan
- Separate YouTube title/description and platform-specific captions
- Direct media URLs, Google Drive imports, local uploads and post previews
- Drafts, private dry runs, immediate publishing and scheduled background dispatch
- Cloudflare scheduled worker, so due posts do not depend on an open browser
- Per-platform readiness checks, diagnostics and result tracking
- Social metrics and a full attribution funnel from views to episode watching and signup
- ElevenLabs dubbing intake, transcript comparison, translation review and music generation stages
- Cloudflare D1 schema and migrations committed with the source

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system design and [PORTFOLIO.md](PORTFOLIO.md) for the problem, contribution, technical decisions and lessons learned.

## Local setup

Requirements:

- Node.js 22.13 or newer
- npm

Install and verify the source:

```bash
npm ci
npm run build
npx tsc --noEmit
```

Start the local Cloudflare-compatible development server:

```bash
npm run build
npm start
```

The production build adds a Cloudflare scheduled handler that checks for due posts every minute. A computer does not need to remain online after deployment.

## Runtime services

The deployed application uses:

- Cloudflare D1 through the `DB` binding
- Meta Graph API for Facebook and Instagram
- Zernio for TikTok, YouTube and media storage
- Lovable analytics for website funnel data
- Sites authentication and access control

The schema and migration are committed under `db/` and `drizzle/`.

## Environment configuration

Production credentials are intentionally excluded from this public repository. The deployment requires the Meta, Zernio, scheduler and analytics variables listed by the application source. Obtain their current values from the private owner handoff or configure replacement credentials in the destination deployment's secret manager.

Never commit `.env` files or production database exports to this public repository.

## Production handoff

The public repository contains the complete source and Git history. The private owner handoff separately contains:

- Environment-variable inventory and recoverable credentials
- Database snapshots for `posts`, `post_targets` and `scheduler_state`
- Sites deployment metadata
- Runtime archives and restoration instructions

Live production logs and database access are account capabilities. They cannot be transferred through source control; the new owner must deploy the project or receive access to the existing Sites project.

## Safe verification

Use **Settings → Run dry publish test** in each language workspace. The test verifies Facebook, Instagram, TikTok and YouTube credentials and account IDs without publishing content.

An actual provider publication cannot be fully proven without creating a real post. Use a controlled test asset when the owner is ready to verify the final public publishing step.
