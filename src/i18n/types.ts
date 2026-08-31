export type SupportedLocale = 'en-US' | 'es-ES' | 'it-IT' | 'fr-FR' | 'de-DE' | 'pl-PL';

export interface LocaleConfig {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  flagCode: string;
  dateFormat: string;
}

export interface TranslationSchema {
  nav: {
    appName: string;
    tagline: string;
    disclaimer: string;
    manualPath: string;
    aiPath: string;
    sandbox: string;
    firestoreLive: string;
    guest: string;
    signOut: string;
    themeToggle: string;
    language: string;
  };
  disclaimerModal: {
    title: string;
    subtitle: string;
    notice: string;
    s1Title: string;
    s1Body: string;
    s2Title: string;
    s2Body: string;
    s3Title: string;
    s3Body: string;
    s4Title: string;
    s4Body: string;
    s5Title: string;
    s5Body: string;
    s6Title: string;
    s6Body: string;
    accept: string;
  };
  common: {
    search: string;
    filter: string;
    clear: string;
    reset: string;
    loading: string;
    error: string;
    success: string;
    save: string;
    cancel: string;
    close: string;
  };
}
