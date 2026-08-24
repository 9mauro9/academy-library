import React, { useState, useRef, useEffect } from 'react';
import { Grid, ExternalLink, ChevronDown, BookOpen, Clock, BrainCircuit, Search, Cable, Layers } from 'lucide-react';

interface AcademyApp {
  id: string;
  name: string;
  subtitle: string;
  url: string;
  icon: React.ReactNode;
  color: string;
}

interface AcademySuiteMenuProps {
  currentAppId?: 'toolkit' | 'builder' | 'insight' | 'library' | 'timeliner' | 'live';
}

export const AcademySuiteMenu: React.FC<AcademySuiteMenuProps> = ({ currentAppId = 'library' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const apps: AcademyApp[] = [
    {
      id: 'toolkit',
      name: 'Academy Toolkit',
      subtitle: 'Network Engineering & Protocol Suite',
      url: 'https://academy-toolkit.web.app',
      icon: <Cable size={14} />,
      color: '#06b6d4',
    },
    {
      id: 'builder',
      name: 'Academy Builder',
      subtitle: 'Personalized Learning Path Builder',
      url: 'https://academy-builder.web.app',
      icon: <BrainCircuit size={14} />,
      color: '#3b82f6',
    },
    {
      id: 'insight',
      name: 'Academy Insight',
      subtitle: 'RAG Search & Learning Assistant',
      url: 'https://academy-insight.web.app',
      icon: <Search size={14} />,
      color: '#8b5cf6',
    },
    {
      id: 'library',
      name: 'Academy Library',
      subtitle: 'Course Library & Curriculum CMS',
      url: 'https://academy-library.web.app',
      icon: <BookOpen size={14} />,
      color: '#10b981',
    },
    {
      id: 'timeliner',
      name: 'Academy Timeliner',
      subtitle: 'Multi-Day Agenda & Timeline Architect',
      url: 'https://academy-timeliner.web.app',
      icon: <Clock size={14} />,
      color: '#f59e0b',
    },
    {
      id: 'live',
      name: 'Academy Live',
      subtitle: 'Virtual Classroom Orchestrator',
      url: 'https://academy-live-builder.web.app',
      icon: <Layers size={14} />,
      color: '#ec4899',
    },
  ];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2.5 py-1.5 rounded-lg border border-slate-700/60 bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs font-mono font-medium flex items-center gap-1.5 transition shadow"
        title="Academy Application Suite"
        style={{
          border: '1px solid var(--border-color, rgba(115, 138, 150, 0.2))',
          background: 'var(--bg-tertiary, #162544)',
          color: 'var(--text-primary, #f9fafb)',
        }}
      >
        <Grid size={13} className="text-cyan-400" />
        <span className="hidden sm:inline">Academy Suite</span>
        <ChevronDown size={11} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-72 rounded-xl shadow-2xl border z-50 p-2 font-mono text-xs animate-in fade-in zoom-in-95 duration-150"
          style={{
            background: 'var(--bg-secondary, #0f182c)',
            borderColor: 'var(--border-color, rgba(115, 138, 150, 0.2))',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div className="px-2 py-1.5 border-b mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400" style={{ borderColor: 'var(--border-color)' }}>
            <span>Academy Suite Ecosystem</span>
            <span className="text-cyan-400 font-bold">6 Apps</span>
          </div>

          <div className="space-y-1">
            {apps.map((app) => {
              const isActive = app.id === currentAppId;
              return (
                <a
                  key={app.id}
                  href={app.url}
                  target={isActive ? '_self' : '_blank'}
                  rel="noreferrer"
                  onClick={() => !isActive && setIsOpen(false)}
                  className={`p-2 rounded-lg flex items-center justify-between transition ${
                    isActive
                      ? 'bg-cyan-950/40 border border-cyan-500/40 text-cyan-300'
                      : 'hover:bg-slate-800/60 text-slate-300 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center text-white"
                      style={{ backgroundColor: app.color }}
                    >
                      {app.icon}
                    </div>
                    <div>
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        {app.name}
                        {isActive && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-normal">Active</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[170px]">{app.subtitle}</div>
                    </div>
                  </div>
                  {!isActive && <ExternalLink size={12} className="text-slate-500" />}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
