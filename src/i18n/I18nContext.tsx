import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import type { SupportedLocale, LocaleConfig, TranslationSchema } from './types';
import { enUS } from './locales/en-US';
import { esES } from './locales/es-ES';
import { itIT } from './locales/it-IT';
import { frFR } from './locales/fr-FR';
import { deDE } from './locales/de-DE';
import { ptBR } from './locales/pt-BR';
import { plPL } from './locales/pl-PL';

export const SUPPORTED_LOCALES: LocaleConfig[] = [
  { code: 'en-US', name: 'English', nativeName: 'English', flagCode: 'US', dateFormat: 'MM/DD/YYYY' },
  { code: 'es-ES', name: 'Spanish', nativeName: 'Español', flagCode: 'ES', dateFormat: 'DD/MM/YYYY' },
  { code: 'it-IT', name: 'Italian', nativeName: 'Italiano', flagCode: 'IT', dateFormat: 'DD/MM/YYYY' },
  { code: 'fr-FR', name: 'French', nativeName: 'Français', flagCode: 'FR', dateFormat: 'DD/MM/YYYY' },
  { code: 'de-DE', name: 'German', nativeName: 'Deutsch', flagCode: 'DE', dateFormat: 'DD.MM.YYYY' },
  { code: 'pt-BR', name: 'Portuguese', nativeName: 'Português', flagCode: 'BR', dateFormat: 'DD/MM/YYYY', displayCode: 'BR' },
  { code: 'pl-PL', name: 'Polish', nativeName: 'Polski', flagCode: 'PL', dateFormat: 'DD.MM.YYYY' },
];

const LOCALES_MAP: Record<SupportedLocale, TranslationSchema> = {
  'en-US': enUS,
  'es-ES': esES,
  'it-IT': itIT,
  'fr-FR': frFR,
  'de-DE': deDE,
  'pt-BR': ptBR,
  'pl-PL': plPL,
};

const STORAGE_KEY = 'academy_preferred_locale';
const BROADCAST_CHANNEL_NAME = 'academy_i18n_sync';

function getInitialLocale(): SupportedLocale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (saved in LOCALES_MAP)) {
      return saved as SupportedLocale;
    }
  } catch {}

  try {
    const browserLang = navigator.language || (navigator as any).userLanguage || '';
    if (browserLang.startsWith('es')) return 'es-ES';
    if (browserLang.startsWith('it')) return 'it-IT';
    if (browserLang.startsWith('fr')) return 'fr-FR';
    if (browserLang.startsWith('de')) return 'de-DE';
    if (browserLang.startsWith('pt')) return 'pt-BR';
    if (browserLang.startsWith('pl')) return 'pl-PL';
  } catch {}

  return 'en-US';
}

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  currentLocaleConfig: LocaleConfig;
  supportedLocales: LocaleConfig[];
  t: (path: string, params?: Record<string, string | number>) => string;
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<SupportedLocale>(getInitialLocale);

  const setLocale = useCallback((newLocale: SupportedLocale) => {
    if (!(newLocale in LOCALES_MAP)) return;
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
      document.documentElement.lang = newLocale === 'pt-BR' ? 'pt-BR' : newLocale.split('-')[0];
    } catch {}

    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        channel.postMessage({ type: 'LOCALE_CHANGED', locale: newLocale });
        channel.close();
      }
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'pt-BR' ? 'pt-BR' : locale.split('-')[0];

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        channel.onmessage = (event) => {
          if (event.data?.type === 'LOCALE_CHANGED' && event.data?.locale in LOCALES_MAP) {
            setLocaleState(event.data.locale);
            document.documentElement.lang = event.data.locale === 'pt-BR' ? 'pt-BR' : event.data.locale.split('-')[0];
          }
        };
      }
    } catch {}

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && e.newValue in LOCALES_MAP) {
        setLocaleState(e.newValue as SupportedLocale);
        document.documentElement.lang = e.newValue === 'pt-BR' ? 'pt-BR' : e.newValue.split('-')[0];
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      if (channel) {
        channel.close();
      }
      window.removeEventListener('storage', handleStorage);
    };
  }, [locale]);

  const currentLocaleConfig = useMemo(() => {
    return SUPPORTED_LOCALES.find(l => l.code === locale) || SUPPORTED_LOCALES[0];
  }, [locale]);

  const t = useCallback((path: string, params?: Record<string, string | number>): string => {
    const keys = path.split('.');
    
    let current: any = LOCALES_MAP[locale];
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        current = undefined;
        break;
      }
    }

    if (typeof current !== 'string') {
      let fallback: any = LOCALES_MAP['en-US'];
      for (const key of keys) {
        if (fallback && typeof fallback === 'object' && key in fallback) {
          fallback = fallback[key];
        } else {
          fallback = undefined;
          break;
        }
      }
      current = typeof fallback === 'string' ? fallback : path;
    }

    if (params && typeof current === 'string') {
      return current.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return params[key] !== undefined ? String(params[key]) : `{{${key}}}`;
      });
    }

    return typeof current === 'string' ? current : path;
  }, [locale]);

  const formatDate = useCallback((date: Date | string | number, options?: Intl.DateTimeFormatOptions): string => {
    try {
      const d = typeof date === 'object' ? date : new Date(date);
      return new Intl.DateTimeFormat(locale, options || { dateStyle: 'medium' }).format(d);
    } catch {
      return String(date);
    }
  }, [locale]);

  const formatNumber = useCallback((value: number, options?: Intl.NumberFormatOptions): string => {
    try {
      return new Intl.NumberFormat(locale, options).format(value);
    } catch {
      return String(value);
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    currentLocaleConfig,
    supportedLocales: SUPPORTED_LOCALES,
    t,
    formatDate,
    formatNumber,
  }), [locale, setLocale, currentLocaleConfig, t, formatDate, formatNumber]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = (): I18nContextValue => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
