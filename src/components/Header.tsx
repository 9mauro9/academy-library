import React from 'react';
import { BrainCircuit, Database, ShieldCheck, Sun, Moon, LogOut, User } from 'lucide-react';
import { isSandboxMode, logoutUser } from '../services/firebaseService';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser?: any;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, currentUser, onLogout }) => {
  const [theme, setTheme] = React.useState(() => {
    const saved = localStorage.getItem('academy_library_theme') || localStorage.getItem('academy_builder_theme');
    return saved || 'dark';
  });

  React.useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem('academy_library_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleLogout = async () => {
    await logoutUser();
    if (onLogout) {
      onLogout();
    }
  };

  const sandbox = isSandboxMode();

  return (
    <header className="app-header">
      <div className="brand-section">
        <div className="logo-container">
          <BrainCircuit size={16} />
        </div>
        <div className="brand-title">
          <h1>Academy Library</h1>
          <p>Arista Academy Course Library & CMS</p>
        </div>
      </div>

      <div className="controls-section">
        <div className="tab-container">
          <button 
            className={"tab-button " + (activeTab === 'dashboard' ? 'active' : '')}
            onClick={() => setActiveTab('dashboard')}
          >
            Manual Path
          </button>
          <button 
            className={"tab-button " + (activeTab === 'chat' ? 'active' : '')}
            onClick={() => setActiveTab('chat')}
          >
            AI Path
          </button>
        </div>

        <div className="control-group" style={{ marginLeft: '1rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {sandbox ? (
            <span className="fit-badge ok" style={{ background: 'var(--break-bg)', color: 'var(--break-text)' }} title="Local Sandbox offline simulator">
              <Database size={10} style={{ marginRight: '0.15rem' }} />
              Sandbox
            </span>
          ) : (
            <span className="fit-badge ok" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-color)' }} title="Connected to Cloud Firestore">
              <ShieldCheck size={10} style={{ marginRight: '0.15rem' }} />
              Firestore Live
            </span>
          )}

          {currentUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <User size={12} />
              <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser.email || (currentUser.isAnonymous ? 'Guest' : 'User')}
              </span>
              <button
                className="btn-action"
                onClick={handleLogout}
                style={{ padding: '0.25rem 0.5rem', height: '26px', fontSize: '0.7rem' }}
                title="Sign out & wipe session state"
              >
                <LogOut size={12} style={{ marginRight: '0.2rem' }} />
                Sign Out
              </button>
            </div>
          )}
          
          <button 
            className="btn-action" 
            id="themeToggleBtn"
            onClick={toggleTheme} 
            style={{ width: '32px', height: '32px', justifyContent: 'center', padding: '0' }} 
            title="Toggle Light/Dark Theme"
          >
            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          </button>
        </div>
      </div>
    </header>
  );
};
