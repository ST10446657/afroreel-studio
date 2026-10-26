# Portfolio notes

## Project summary

AfroReel Studio is a multilingual content operations platform I built for an independent UK media project. It brings five language brands into one dashboard for content planning, platform-specific captions, media previews, dry runs, scheduled background publishing and cross-platform analytics. It also includes a guided AI-assisted post-production workflow for dubbing, transcript comparison, translation review and episode-specific music generation.

## Problem

Managing Facebook, Instagram, TikTok and YouTube across English, Zulu, Hausa, Swahili and French created repetitive work and a high risk of posting with the wrong account, caption or media file. Publishing also needed to continue after the operator closed the browser, and the team needed to connect social reach with website viewing and signup behaviour.

## Contribution

- Translated a loosely defined operational process into a working product and an explicit workflow.
- Designed the multilingual workspace model and platform-specific publishing form.
- Implemented drafts, dry runs, immediate publishing and scheduled background dispatch.
- Integrated Meta Graph API and Zernio provider flows without exposing credentials to the client.
- Added direct media URLs, Google Drive imports, local uploads and post previews.
- Defined the analytics event contract from social views through episode viewing and signup.
- Built guarded ElevenLabs dubbing and QA stages that keep people in control of paid generation and language corrections.
- Diagnosed real account, permission, token and media-delivery failures during setup.

## Technical decisions

Posts and platform targets are stored separately so a failure on one destination does not hide the status of another. Scheduled publishing runs in the deployed Cloudflare worker, which removes dependence on a laptop remaining online. Provider credentials live in server-side secrets, and the interface exposes only readiness and diagnostic results. The post-production workflow requires approval at expensive or subjective stages because a successful API response does not prove translation quality or a good audio mix.

## What I learned

The largest challenge was integration reliability rather than interface code. Meta asset ownership, token permissions, direct media accessibility and asynchronous provider processing each fail differently. I learned to build diagnostic endpoints, retain provider responses, add dry-run paths, and separate deterministic automation from judgement-heavy review.

## What I would improve

I would introduce the provider adapter contract and automated integration tests earlier, add a durable queue with idempotency keys for every publish attempt, and establish structured observability before connecting all accounts. I would also separate the media worker from the dashboard from the start because video processing has different runtime and storage needs.
