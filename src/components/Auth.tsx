import React, { useState } from 'react';
import { loginUser, registerUser, signInAnonymously, isSandboxMode, setSandboxMode } from '../services/firebaseService';
import { BrainCircuit, Lock, Mail, Sparkles, Database } from 'lucide-react';
export const Auth: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sandbox, setSandbox] = useState(isSandboxMode());

  const handleSandboxToggle = (checked: boolean) => {
    setSandbox(checked);
    setSandboxMode(checked);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await (isRegistering ? registerUser(email, password) : loginUser(email, password));
      window.location.reload(); // Reload to refresh subscribers
    } catch (err: any) {
      console.error(err);
      if (!sandbox) {
        setError(`${err.message || 'Auth failed'}. Try enabling 'Offline Sandbox Mode' below to bypass Firebase connection issues.`);
      } else {
        setError(err.message || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAnonymous = async () => {
    setError('');
    setLoading(true);
    try {
      await signInAnonymously();
      window.location.reload(); // Reload to refresh subscribers
    } catch (err: any) {
      console.error(err);
      setError(`${err.message || 'Guest sign-in failed'}. Switching to Offline Sandbox Mode...`);
      handleSandboxToggle(true);
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
          <h2>{isRegistering ? 'Create Academy Builder Profile' : 'Welcome to Academy Builder'}</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            {isRegistering 
              ? 'Join the recommendation engine to build personalized learning paths.' 
              : 'Sign in to access your proficiency dashboard and learning roadmap.'}
          </p>
        </div>

        {/* Sandbox Mode Toggle */}        <div style={{ 
          background: sandbox ? 'var(--break-bg)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${sandbox ? 'var(--break-border)' : 'var(--border-color)'}`,
          borderRadius: '10px',
          padding: '0.75rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.5rem'
        }}>          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Database size={16} className={sandbox ? 'text-success' : 'text-secondary'} style={{ color: sandbox ? 'var(--break-text)' : undefined }} />
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: sandbox ? 'var(--break-text)' : 'white' }}>
                {sandbox ? 'Offline Sandbox Active' : 'Real Firebase connection'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Bypasses database/functions emulator issues
              </div>
            </div>
          </div>
          <input 
            type="checkbox" 
            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
            checked={sandbox} 
            onChange={(e) => handleSandboxToggle(e.target.checked)} 
          />
        </div>

        <form onSubmit={handleSubmit} className="auth-body">
          {error && (
            <div style={{ color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.8rem', textAlign: 'center', lineHeight: 1.4 }}>
              {error}
            </div>
          )}

          <div className="auth-input-group">
            <label className="auth-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="email" 
                required 
                className="auth-input" 
                style={{ paddingLeft: '2.5rem', width: '100%' }}
                placeholder="you@academybuilder.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="auth-input-group">
            <label className="auth-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="password" 
                required 
                className="auth-input" 
                style={{ paddingLeft: '2.5rem', width: '100%' }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="btn-action btn-primary" 
            style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', marginTop: '0.5rem' }}
            disabled={loading}
          >
            {loading ? 'Processing...' : (isRegistering ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.25rem 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>OR</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
        </div>

        <button 
          onClick={handleAnonymous}
          className="btn-action" 
          style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}
          disabled={loading}
        >
          <Sparkles size={14} />
          <span>Continue as Guest</span>
        </button>

        <div className="auth-switch">
          {isRegistering ? (
            <>Already have an account? <span onClick={() => setIsRegistering(false)}>Sign In</span></>
          ) : (
            <>New to Academy Builder? <span onClick={() => setIsRegistering(true)}>Create Profile</span></>
          )}
        </div>
      </div>
    </div>
  );
};
