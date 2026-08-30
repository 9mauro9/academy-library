import React, { useState } from 'react';
import { signInWithGoogle } from '../services/firebaseService';
import { BrainCircuit, ShieldAlert } from 'lucide-react';

export const Auth: React.FC = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
      // Auth state change is picked up by subscribeToAuth in App.tsx
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled. Please try again.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Pop-up blocked by your browser. Please allow pop-ups for this site.');
      } else {
        setError(err.message || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <BrainCircuit size={28} />
          </div>
          <h2>Academy Library</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            Sign in with your Google account to access the course library and content management system.
          </p>
        </div>

        {error && (
          <div style={{
            color: '#f87171',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            padding: '0.75rem',
            borderRadius: '6px',
            fontSize: '0.8rem',
            textAlign: 'center',
            lineHeight: 1.4,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <ShieldAlert size={14} style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="btn-action btn-primary"
          style={{
            width: '100%',
            justifyContent: 'center',
            padding: '0.75rem',
            gap: '0.75rem',
            fontSize: '0.95rem',
            fontWeight: 600,
            marginTop: '0.5rem'
          }}
        >
          {/* Google "G" SVG icon */}
          {!loading && (
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
              <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.548 0 9s.347 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
          )}
          {loading ? 'Signing in…' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  );
};
