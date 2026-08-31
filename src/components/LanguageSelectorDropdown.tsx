import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { FlagIcon } from '../i18n/flags';
import type { SupportedLocale } from '../i18n/types';

export const LanguageSelectorDropdown: React.FC = () => {
  const { locale, setLocale, supportedLocales, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const idx = supportedLocales.findIndex(l => l.code === locale);
      setFocusedIndex(idx >= 0 ? idx : 0);
    }
  }, [isOpen, locale, supportedLocales]);

  useEffect(() => {
    if (isOpen && listboxRef.current && focusedIndex >= 0) {
      const items = listboxRef.current.querySelectorAll<HTMLLIElement>('[role="option"]');
      if (items[focusedIndex]) {
        items[focusedIndex].focus();
      }
    }
  }, [focusedIndex, isOpen]);

  const handleToggle = () => {
    setIsOpen(prev => !prev);
  };

  const handleSelect = useCallback((newLocale: SupportedLocale) => {
    setLocale(newLocale);
    setIsOpen(false);
    buttonRef.current?.focus();
  }, [setLocale]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % supportedLocales.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + supportedLocales.length) % supportedLocales.length);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < supportedLocales.length) {
          handleSelect(supportedLocales[focusedIndex].code);
        }
        break;
      case 'Escape':
      case 'Tab':
        setIsOpen(false);
        buttonRef.current?.focus();
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(supportedLocales.length - 1);
        break;
    }
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`${t('nav.language')}: ${supportedLocales.find(l => l.code === locale)?.nativeName}`}
        className="btn-action"
        style={{
          height: '32px',
          padding: '0 0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.75rem',
          fontWeight: 600,
        }}
        title={`${t('nav.language')} (${locale})`}
      >
        <Globe size={13} style={{ color: 'var(--accent-color, #146095)' }} aria-hidden="true" />
        <FlagIcon locale={locale} size={15} />
        <span style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
          {locale.split('-')[0]}
        </span>
        <ChevronDown
          size={12}
          style={{
            color: 'var(--text-muted, #738a96)',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <ul
          ref={listboxRef}
          role="listbox"
          aria-label={t('nav.language')}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          style={{
            position: 'absolute',
            right: 0,
            marginTop: '4px',
            width: '180px',
            background: 'var(--bg-secondary, #0f182c)',
            border: '1px solid var(--border-color, rgba(115, 138, 150, 0.3))',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6)',
            padding: '4px 0',
            zIndex: 100,
            listStyle: 'none',
            marginBlockStart: '4px',
            marginBlockEnd: '0',
            paddingInlineStart: '0',
          }}
        >
          {supportedLocales.map((loc, index) => {
            const isSelected = loc.code === locale;
            const isFocused = index === focusedIndex;

            return (
              <li
                key={loc.code}
                role="option"
                id={`locale-option-${loc.code}`}
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => handleSelect(loc.code)}
                onMouseEnter={() => setFocusedIndex(index)}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  background: isSelected
                    ? 'rgba(20, 96, 149, 0.2)'
                    : isFocused
                    ? 'rgba(255, 255, 255, 0.05)'
                    : 'transparent',
                  color: isSelected
                    ? '#7396bf'
                    : 'var(--text-primary, #f9fafb)',
                  fontWeight: isSelected ? 700 : 400,
                  outline: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FlagIcon locale={loc.code} size={16} />
                  <span>{loc.nativeName}</span>
                </div>

                {isSelected ? (
                  <Check size={14} style={{ color: '#4473a9' }} aria-hidden="true" />
                ) : (
                  <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted, #738a96)' }}>
                    {loc.code.split('-')[0]}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
