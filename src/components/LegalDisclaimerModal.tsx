import React, { useEffect } from 'react';
import { ShieldAlert, X, AlertTriangle, CheckCircle } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface LegalDisclaimerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LegalDisclaimerModal: React.FC<LegalDisclaimerModalProps> = ({ isOpen, onClose }) => {
  const { t } = useI18n();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="disclaimer-overlay" 
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 9, 20, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div 
        className="disclaimer-card" 
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
          maxWidth: '680px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(245, 158, 11, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f59e0b'
            }}>
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2 id="disclaimer-title" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {t('disclaimerModal.title')}
              </h2>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {t('disclaimerModal.subtitle')}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '0.25rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s, background 0.15s'
            }}
            title="Close Disclaimer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div style={{
          padding: '1.5rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          fontSize: '0.85rem',
          lineHeight: '1.55',
          color: 'var(--text-secondary)'
        }}>
          <div style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-start'
          }}>
            <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
              {t('disclaimerModal.notice')}
            </div>
          </div>

          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>
              {t('disclaimerModal.s1Title')}
            </h4>
            <p style={{ margin: 0 }}>
              {t('disclaimerModal.s1Body')}
            </p>
          </div>

          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>
              {t('disclaimerModal.s2Title')}
            </h4>
            <p style={{ margin: 0 }}>
              {t('disclaimerModal.s2Body')}
            </p>
          </div>

          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>
              {t('disclaimerModal.s3Title')}
            </h4>
            <p style={{ margin: 0 }}>
              {t('disclaimerModal.s3Body')}
            </p>
          </div>

          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>
              {t('disclaimerModal.s4Title')}
            </h4>
            <p style={{ margin: 0 }}>
              {t('disclaimerModal.s4Body')}
            </p>
          </div>

          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>
              {t('disclaimerModal.s5Title')}
            </h4>
            <p style={{ margin: 0 }}>
              {t('disclaimerModal.s5Body')}
            </p>
          </div>

          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>
              {t('disclaimerModal.s6Title')}
            </h4>
            <p style={{ margin: 0 }}>
              {t('disclaimerModal.s6Body')}
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--border-color)',
          background: 'rgba(0, 0, 0, 0.1)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem'
        }}>
          <button 
            onClick={onClose}
            className="btn-action btn-primary"
            style={{
              padding: '0.5rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <CheckCircle size={14} />
            <span>{t('disclaimerModal.accept')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
