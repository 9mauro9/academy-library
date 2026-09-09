import React, { useState, useEffect } from 'react';
import { BrainCircuit, ShieldCheck, Database, Moon, Sun, ShieldAlert } from 'lucide-react';
import { UserProfileButton } from '@academy/auth-core';
import { isSandboxMode, logoutUser } from '../../services/firebaseService';
import { LegalDisclaimerModal } from '../LegalDisclaimerModal';
import { LanguageSelectorDropdown } from '../LanguageSelectorDropdown';
import { useI18n } from '../../i18n/I18nContext';

export interface TopBarProps {
  onSignOutComplete?: () => void;
  className?: string;
}

export const TopBar: React.FC<TopBarProps> = ({ onSignOutComplete, className = '' }) => {
  const { t } = useI18n();
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('academy_library_theme') || 'dark';
  });

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem('academy_library_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleSignOutComplete = async () => {
    await logoutUser();
    if (onSignOutComplete) {
      onSignOutComplete();
    }
  };

  const sandbox = isSandboxMode();

  return (
    <>
      <header className={`app-header ${className}`}>
        <div className="brand-section">
          <div className="logo-container">
            <BrainCircuit size={16} />
          </div>
          <div className="brand-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <h1>{t('nav.appName')}</h1>
              <button
                type="button"
                onClick={() => setShowDisclaimer(true)}
                className="disclaimer-badge-btn"
                title="View Legal Disclaimer & Terms of Use"
                style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  color: '#f59e0b',
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  lineHeight: '1.2',
                }}
              >
                <ShieldAlert size={10} />
                <span>{t('nav.disclaimer')}</span>
              </button>
            </div>
            <p>{t('nav.tagline')}</p>
          </div>
        </div>

        <div className="controls-section">
          <div
            className="control-group"
            style={{
              marginLeft: '1rem',
              borderLeft: '1px solid var(--border-color)',
              paddingLeft: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <LanguageSelectorDropdown />

            {sandbox ? (
              <span
                className="fit-badge ok"
                style={{ background: 'var(--break-bg)', color: 'var(--break-text)' }}
                title="Local Sandbox offline simulator"
              >
                <Database size={10} style={{ marginRight: '0.15rem' }} />
                {t('nav.sandbox')}
              </span>
            ) : (
              <span
                className="fit-badge ok"
                style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-color)' }}
                title="Connected to Cloud Firestore"
              >
                <ShieldCheck size={10} style={{ marginRight: '0.15rem' }} />
                {t('nav.firestoreLive')}
              </span>
            )}

            {/* Universal Profile Button */}
            <UserProfileButton
              appId="library"
              onSignOutComplete={handleSignOutComplete}
            />

            <button
              className="btn-action"
              id="themeToggleBtn"
              onClick={toggleTheme}
              style={{ width: '32px', height: '32px', justifyContent: 'center', padding: '0' }}
              title={t('nav.themeToggle')}
            >
              {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
            </button>
          </div>
        </div>
      </header>
      <LegalDisclaimerModal
        isOpen={showDisclaimer}
        onClose={() => setShowDisclaimer(false)}
      />
    </>
  );
};
