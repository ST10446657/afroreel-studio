# AfroReel Post-Production Automation

This document is the implementation contract for automating the approved AfroReel post-production workflow. Automation must preserve the required review steps and must not silently skip failed translations, captions, media outputs, or platform operations.

## Required input

- Completed English episode from the series `Renders` folder in Google Drive
- Series name and episode number
- Series script
- ElevenLabs account with Dubbing V2 and Music 2.5 access
- Bunny Stream destination library and series collection

## Required deliverables

An episode is complete only when it has all of the following:

- One silent 1080p MP4 containing the original episode visuals
- Five labelled WAV files: English, Zulu, Hausa, Swahili, and French
- Two reviewed SRT files: English and French
- The same approved background-music mix on all five WAV files
- Music below dialogue, initially targeting -20 dB and adjustable during review
- One multilingual video package accepted by Bunny
- Five selectable audio-language tracks in Bunny
- English and French captions in Bunny
- Verified Bunny playback and HLS URL
- HLS URL and episode name saved to the AfroReel backend

## Workflow state machine

1. `episode_imported`
2. `english_transcript_review`
3. `zulu_dub_review`
4. `remaining_dubs_processing`
5. `translation_review`
6. `music_prompt_review`
7. `music_review`
8. `audio_mix_review`
9. `caption_review`
10. `package_validation`
11. `bunny_processing`
12. `bunny_playback_review`
13. `afroreel_linked`
14. `complete`

Failures move the episode to `needs_attention` with the failed stage, error, and retry action retained. A user must explicitly approve every review state.

## Stage 1: Episode import

AfroReel Studio locates or accepts the completed English MP4 and series script from Google Drive. It records the Drive file IDs, source version, duration, dimensions, frame rate, audio format, and checksum so later retries use the same source.

## Stage 2: ElevenLabs dubbing

1. Create a Dubbing V2 project from the original English MP4.
2. Generate Zulu with Speaker Similarity `0`.
3. Present the auto-transcribed English dialogue beside the series script. Flag names, missing lines, additional lines, material wording changes, and timing differences.
4. Require transcript and Zulu approval.
5. After approval, generate Hausa and Swahili with Speaker Similarity `0`.
6. Create French separately from the original English MP4 with Speaker Similarity `5`.
7. Store each project ID, language job ID, settings, status, and output file.
8. Require a translation review focused on meaning and context. Pronunciation is not marked verified unless a reviewer explicitly confirms it.

If the ElevenLabs workspace does not allow transcript editing and segment regeneration through the API, the app must present the differences and provide a clear Open in ElevenLabs action. It may rerun a complete dub after correction, but may not claim that an individual segment was regenerated automatically.

## Stage 3: Background music

The music brief is generated from the original episode, series script, and timestamped dialogue. It describes episode-specific dramatic beats, dialogue-heavy sections, transitions, and the ending.

The user reviews the brief before it is sent to ElevenLabs Music 2.5. Generation uses one variation and a duration matching the episode. The generated track must be reviewed before mixing.

## Stage 4: Media preparation

A media-processing worker performs deterministic FFmpeg operations outside the Site runtime:

- Extract or render dialogue audio for English, Zulu, Hausa, Swahili, and French
- Align the approved music at `00:00` and trim it to the exact episode duration
- Mix the same music with each dialogue track
- Begin at -20 dB and allow a reviewer to adjust the music level
- Optionally duck music during detected dialogue without changing the approved base level
- Export five WAV files with identical duration, sample rate, channel layout, and loudness policy
- Generate English and French caption drafts
- Export one silent 1080p MP4 with all audio streams removed

The review player must support switching languages, toggling captions, seeking all variants together, comparing dialogue clarity, and approving or rejecting each output.

## Stage 5: Manifest validation and Bunny packaging

The package cannot proceed until the manifest contains exactly:

```text
episode-slug/
  episode-slug-silent-1080p.mp4
  episode-slug-en.wav
  episode-slug-zu.wav
  episode-slug-ha.wav
  episode-slug-sw.wav
  episode-slug-fr.wav
  episode-slug-en.srt
  episode-slug-fr.srt
```

Validation checks file presence, duration tolerance, readable codecs, silent-video audio absence, unique language metadata, caption timing bounds, and output checksums.

FFmpeg packages the silent video and five WAV tracks into one multilingual source file. Track metadata uses ISO 639-1 codes `en`, `zu`, `ha`, `sw`, and `fr`. English is the default track unless the episode configuration says otherwise.

## Stage 6: Bunny and AfroReel

1. Create the video in the correct Bunny series collection.
2. Upload the multilingual package.
3. Poll Bunny until processing reaches a terminal state.
4. Verify that all five named audio tracks appear.
5. Add or verify English (`en`) and French (`fr`) captions.
6. Test playback, audio switching, caption switching, and HLS availability.
7. Save the final HLS URL and episode name to the AfroReel backend.
8. Mark the episode complete only after the saved AfroReel URL matches the verified Bunny asset.

## Stage 7: Social exports

The approved episode can produce full or ranged exports. Accepted commands include:

- `Export`
- `Export 10-51`
- `Export 10-30, 35-55`

The interface must state whether ranges are seconds, timecodes, or clip numbers before creating media. Each export retains its source episode, selected ranges, output files, captions, and approval status.

## Application architecture

### AfroReel Studio

- Episode intake and Google Drive selection
- Workflow state and audit history
- Transcript comparison
- Review players and approval actions
- Job status and retry controls
- Bunny playback verification
- AfroReel episode linking

### Media worker

- Large file downloads and uploads
- FFmpeg probing, extraction, mixing, caption conversion, and muxing
- Long-running ElevenLabs and Bunny orchestration
- Temporary encrypted working storage with automatic cleanup

### Integrations

- Google Drive OAuth with least-privilege access
- ElevenLabs API key stored as a server-side secret
- Bunny Stream library ID and API key stored as server-side secrets
- AfroReel backend write credential stored as a server-side secret

Credentials, media files, transcripts, and generated outputs must never be committed to the public GitHub repository.

## Delivery phases

### Phase 1: Guided production

Add episode intake, the workflow checklist, file manifest validation, review gates, status history, and downloadable job instructions. Existing manual ElevenLabs and Bunny steps remain available.

### Phase 2: Automated preparation

Add the external media worker, automatic WAV/SRT/silent-MP4 generation, synchronized review player, multilingual packaging, and downloadable validated bundle.

### Phase 3: End-to-end integrations

Add Google Drive discovery, ElevenLabs jobs, Music 2.5 generation, Bunny upload and validation, AfroReel HLS linking, and social range exports.

Each phase must be tested against one complete episode and compared with a previously approved manual delivery before becoming the default production path.

## Existing Music Supervisor migration package

The private `AfroReel AI Music Supervisor` migration bundle (version 0.1.3, 15 October 2026) provides three validated specifications that should be reused rather than rewritten:

- `music-supervisor`: dialogue-first emotional scoring maps and standalone ElevenLabs Music prompts with exact timestamp sections and a verified limit of 3,999 Unicode/UTF-16 units.
- `multilingual-mp4`: FFmpeg mapping, language metadata, default-track behavior, embedded selectable subtitles, fast-start packaging, and verification for Bunny.
- `separate-video-export`: full and ranged per-language MP4 exports, caption timing adjustment, and the approved caption appearance.

The approved 1080 x 1920 caption specification uses Nimbus Sans Bold at 42 px, white text, a rounded black background at approximately 61% opacity, 30 px horizontal padding, 19 px vertical padding, a 23 px radius, a maximum line width of 970 px, and a box bottom at y=1548. English captions apply to English, Zulu, Hausa, and Swahili exports; French exports use French captions.

The migration archive is an implementation reference and must remain private. It contains no service credentials, media, Drive authorization, or runtime binaries. The Nimbus Sans Bold font file is not included and must be provided or replaced with a disclosed metrically similar typeface.
