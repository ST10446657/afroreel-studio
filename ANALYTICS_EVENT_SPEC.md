# AfroReel analytics event specification

## Reporting tabs

### 1. Full funnel snapshot

Display the funnel in this order:

1. Video views
2. Profile visits
3. Bio link clicks
4. Site visits
5. Episode 1 starts
6. Episode 1 completions
7. Episode 2 starts
8. Continued watching
9. Signups

Each stage must include its count and conversion rate from the preceding stage. The selected date, platform and language filters must apply to every stage.

### 2. Social metrics

- Total video views
- Completed video views
- Video completion rate
- Profile visits
- Bio or tracked-link clicks
- Followers gained

Filters:

- Platform: all, Facebook, Instagram, TikTok or YouTube
- Language/region: English, Zulu, Hausa, Swahili or French
- Date: 1, 7, 30 or 90 days

### 3. Platform metrics

- Unique visitors
- Episode 1 starts
- Episode 1 completions
- Episode 2 starts
- Subsequent episode starts/views
- Average episodes watched per visitor
- Signups

Use the same platform, language and date filters as the full funnel.

## Website events

The AfroReel website must send the following events to its analytics backend:

| Event | When it fires | Required event properties |
| --- | --- | --- |
| `site_visit` | First page view in a session | Common properties |
| `episode_start` | Playback begins for an episode | Common properties plus `series_id`, `episode_id`, `episode_number` |
| `episode_complete` | The viewer reaches the agreed completion threshold | Common properties plus `series_id`, `episode_id`, `episode_number`, `completion_percent` |
| `signup_complete` | Account registration succeeds | Common properties plus `user_id` when available |

Common properties:

- `event_id`: unique event identifier used for deduplication
- `occurred_at`: ISO 8601 timestamp in UTC
- `anonymous_id`: stable first-party visitor identifier
- `session_id`: stable identifier for the current browsing session
- `user_id`: account identifier after signup, if available
- `platform`: `facebook`, `instagram`, `tiktok`, `youtube`, `direct` or `unknown`
- `language`: `en`, `zu`, `ha`, `sw` or `fr`
- `content_id`: social post or campaign identifier, if available
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`: original acquisition values
- `landing_url`, `referrer`, `page_url`

`anonymous_id`, the original attribution fields, and `content_id` must persist for the visitor and be attached to later episode and signup events. When a visitor signs up, the website must associate the new `user_id` with the existing `anonymous_id`.

## Social-link attribution

Every social bio or campaign link should pass identifiable values to AfroReel, for example:

```text
https://afroreel.app/watch?utm_source=instagram&utm_medium=social&utm_campaign=launch&utm_content=en_bio&lang=en
```

Use a tracked redirect when the platform does not expose bio-link clicks through its API. The redirect should record a `bio_link_click` event and then send the visitor to AfroReel with the attribution parameters intact.

The required reporting path is:

```text
platform + language -> site visit -> episode watching -> signup
```

## Analytics API response

The Studio website-analytics endpoint should accept:

```text
GET ?from=<ISO timestamp>&to=<ISO timestamp>&platform=<value|all>&language=<code|all>
```

It should return:

```json
{
  "period": { "from": "...", "to": "..." },
  "filters": { "platform": "all", "language": "all" },
  "uniqueVisitors": 0,
  "siteVisits": 0,
  "episode1Starts": 0,
  "episode1Completions": 0,
  "episode2Starts": 0,
  "continuedWatching": 0,
  "subsequentEpisodeStarts": 0,
  "averageEpisodesPerVisitor": 0,
  "signups": 0,
  "attribution": [
    {
      "platform": "instagram",
      "language": "en",
      "siteVisits": 0,
      "episode1Starts": 0,
      "episode1Completions": 0,
      "episode2Starts": 0,
      "continuedWatching": 0,
      "signups": 0
    }
  ]
}
```

## Metric definitions

- **Unique visitor:** distinct `anonymous_id` in the selected period.
- **Episode start:** one start per visitor, episode and viewing session; repeated player events are deduplicated.
- **Episode completion:** one completion per visitor, episode and viewing session at the agreed completion threshold.
- **Continued watching:** a visitor who starts episode 2 or any later episode after starting episode 1.
- **Average episodes watched per visitor:** distinct episode starts divided by unique visitors.
- **Signup:** successful account creation, deduplicated by `user_id` or event ID.
- **Followers gained:** ending follower count minus starting follower count for the selected period, when the social provider supplies historical snapshots.

## Current implementation gap

AfroReel Studio currently receives social post views and aggregate website visitors, episode views and signups. The website endpoint must add the episode-specific and attribution fields above. Profile visits, completed social-video views and follower change also depend on each social provider returning those metrics; tracked redirects should be used for bio-link clicks when a provider does not expose them.
