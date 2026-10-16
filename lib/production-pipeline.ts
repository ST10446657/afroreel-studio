export const dubbingLanguages = [
  {key: 'zu', name: 'Zulu', similarity: 0, order: 1, gate: 'pilot'},
  {key: 'ha', name: 'Hausa', similarity: 0, order: 2, gate: 'after_zulu_approval'},
  {key: 'sw', name: 'Swahili', similarity: 0, order: 3, gate: 'after_zulu_approval'},
  {key: 'fr', name: 'French', similarity: 5, order: 4, gate: 'after_zulu_approval'},
] as const;

export const bunnyPackageFiles = [
  {key: 'video', label: 'Silent 1080p MP4', pattern: 'silent.mp4'},
  {key: 'en_audio', label: 'English WAV', pattern: 'en.wav'},
  {key: 'zu_audio', label: 'Zulu WAV', pattern: 'zu.wav'},
  {key: 'ha_audio', label: 'Hausa WAV', pattern: 'ha.wav'},
  {key: 'sw_audio', label: 'Swahili WAV', pattern: 'sw.wav'},
  {key: 'fr_audio', label: 'French WAV', pattern: 'fr.wav'},
  {key: 'en_captions', label: 'English SRT', pattern: 'en.srt'},
  {key: 'fr_captions', label: 'French SRT', pattern: 'fr.srt'},
] as const;

export const creditPolicy = {
  referenceEpisode: 4,
  firstAutomatedEpisode: 6,
  requireTranscriptApproval: true,
  requireZuluApproval: true,
  automaticPaidRetries: 0,
  musicVariations: 1,
  musicModel: 'music_v2_5',
} as const;

export function productionPlan() {
  return {
    version: 1,
    policy: creditPolicy,
    dubbing: dubbingLanguages,
    package: bunnyPackageFiles,
    stages: [
      'source_validation',
      'local_transcript_preflight',
      'human_transcript_approval',
      'zulu_pilot',
      'human_zulu_approval',
      'remaining_dubs',
      'translation_review',
      'music_direction',
      'music_generation',
      'audio_and_caption_exports',
      'package_validation',
      'bunny_upload',
      'afroreel_hls_link',
    ],
  };
}
