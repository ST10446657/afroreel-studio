export const languageCodes = ['en', 'zu', 'ha', 'sw', 'fr'] as const;
export type Language = typeof languageCodes[number];

export const languageNames: Record<Language, string> = {
  en: 'English',
  zu: 'Zulu',
  ha: 'Hausa',
  sw: 'Swahili',
  fr: 'French',
};

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && languageCodes.includes(value as Language);

// Keep the original Zulu secret names so existing deployments continue to work.
export const metaPrefix = (language: Language) =>
  language === 'zu' ? 'META' : `META_${language.toUpperCase()}`;

export const zernioPrefix = (language: Language) =>
  `ZERNIO_${language.toUpperCase()}`;
