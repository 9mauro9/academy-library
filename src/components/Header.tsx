import React from 'react';
import { BrainCircuit, LogOut, User, Database, ShieldCheck } from 'lucide-react';
import { logoutUser, isSandboxMode } from '../services/firebaseService';

interface HeaderProps {
  currentUser: any;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentUser, activeTab, setActiveTab }) => {
  const handleSignOut = async () => {
    await logoutUser();
    window.location.reload(); // Refresh auth listener
  };

  const sandbox = isSandboxMode();

  return (
    <header className="app-header">
      <div className="brand-section">
        <div className="logo-container">
          <BrainCircuit size={22} />
        </div>
        <div className="brand-title">
          <h1>Academy Builder 1</h1>
          <p>Personalized Learning Path Architect</p>
        </div>
      </div>

      <div className="controls-section">
        {currentUser && (
          <>
            <div className="tab-container">
              <button 
                className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                Manual Path
              </button>
              <button 
                className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                AI Path
              </button>
            </div>

            <div className="control-group" style={{ marginLeft: '1rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '1rem' }}>
              {sandbox ? (
                <span className="fit-badge ok" style={{ marginRight: '0.5rem', background: 'var(--break-bg)', color: 'var(--break-text)' }} title="Local Sandbox offline simulator">
                  <Database size={10} style={{ marginRight: '0.15rem' }} />
                  Sandbox
                </span>
              ) : (
                <span className="fit-badge ok" style={{ marginRight: '0.5rem', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-color)' }} title="Connected to Cloud Firestore">
                  <ShieldCheck size={10} style={{ marginRight: '0.15rem' }} />
                  Firestore Live
                </span>
              )}
              
              <User size={16} className="text-secondary" style={{ marginRight: '0.25rem' }} />
              <span className="multiplier-label" style={{ marginRight: '0.75rem', textTransform: 'none' }}>
                {currentUser.email || 'Guest Session'}
              </span>
              <button className="btn-action" onClick={handleSignOut} title="Sign Out">
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
};
