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
    sandbox: string;
    firestoreLive: string;
    signOut: string;
    guest: string;
    themeToggle: string;
    language: string;
  };
  library: {
    title: string;
    subtitle: string;
    totalCourses: string;
    totalLessons: string;
    searchPlaceholder: string;
    filterByCategory: string;
    filterByTrack: string;
    allTracks: string;
    syncSheets: string;
    addNewCourse: string;
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
    delete: string;
    close: string;
    actions: string;
    edit: string;
  };
}
