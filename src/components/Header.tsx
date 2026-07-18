import React from 'react';
import { BrainCircuit, Database, ShieldCheck, Sun, Moon, Calendar } from 'lucide-react';
import { isSandboxMode } from '../services/firebaseService';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  const [theme, setTheme] = React.useState(() => {
    const saved = localStorage.getItem('academy_builder_theme');
    return saved || 'dark';
  });

  React.useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem('academy_builder_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const sandbox = isSandboxMode();

  return (
    <header className="app-header">
      <div className="brand-section">
        <div className="logo-container">
          <BrainCircuit size={16} />
        </div>
        <div className="brand-title">
          <h1>Academy Builder</h1>
          <p>Personalized Learning Path Builder</p>
        </div>
      </div>

      <div className="controls-section">
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
          <button 
            className={`tab-button ${activeTab === 'timeliner' ? 'active' : ''}`}
            onClick={() => setActiveTab('timeliner')}
          >
            <Calendar size={13} style={{ marginRight: 4 }} />
            Timeliner
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
