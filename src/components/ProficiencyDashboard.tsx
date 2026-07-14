import React, { useState } from 'react';
import { Gauge, Clock, Award, Play, BookOpen } from 'lucide-react';

interface ProficiencyDashboardProps {
  onGenerate: (scores: Record<string, number>, settings: { duration: number; speed: string }) => void;
  loading: boolean;
}

const ROLE_DEFAULTS: Record<string, Record<string, number>> = {
  entry: {
    'OSI Model/Layers 1–3': 4,
    'TCP/IP & Subnetting': 4,
    'Core Protocols': 2,
    'EOS Familiarity': 3,
    'Leaf-Spine Architecture': 2,
    'VXLAN/EVPN Concepts': 1,
    'Data Center Operations': 3,
    'Campus Network Design': 2,
    'Network Automation & Scripting': 2,
    'Telemetry & Monitoring': 2,
    'Security Fundamentals': 3,
    'Troubleshooting Methodology': 3
  },
  ops: {
    'OSI Model/Layers 1–3': 6,
    'TCP/IP & Subnetting': 6,
    'Core Protocols': 5,
    'EOS Familiarity': 5,
    'Leaf-Spine Architecture': 4,
    'VXLAN/EVPN Concepts': 3,
    'Data Center Operations': 6,
    'Campus Network Design': 4,
    'Network Automation & Scripting': 4,
    'Telemetry & Monitoring': 5,
    'Security Fundamentals': 5,
    'Troubleshooting Methodology': 6
  },
  mid: {
    'OSI Model/Layers 1–3': 6,
    'TCP/IP & Subnetting': 6,
    'Core Protocols': 5,
    'EOS Familiarity': 5,
    'Leaf-Spine Architecture': 4,
    'VXLAN/EVPN Concepts': 3,
    'Data Center Operations': 5,
    'Campus Network Design': 5,
    'Network Automation & Scripting': 4,
    'Telemetry & Monitoring': 4,
    'Security Fundamentals': 5,
    'Troubleshooting Methodology': 6
  },
  senior_eng: {
    'OSI Model/Layers 1–3': 8,
    'TCP/IP & Subnetting': 8,
    'Core Protocols': 8,
    'EOS Familiarity': 7,
    'Leaf-Spine Architecture': 7,
    'VXLAN/EVPN Concepts': 7,
    'Data Center Operations': 7,
    'Campus Network Design': 7,
    'Network Automation & Scripting': 6,
    'Telemetry & Monitoring': 7,
    'Security Fundamentals': 7,
    'Troubleshooting Methodology': 8
  },
  senior: {
    'OSI Model/Layers 1–3': 9,
    'TCP/IP & Subnetting': 9,
    'Core Protocols': 9,
    'EOS Familiarity': 8,
    'Leaf-Spine Architecture': 9,
    'VXLAN/EVPN Concepts': 8,
    'Data Center Operations': 8,
    'Campus Network Design': 8,
    'Network Automation & Scripting': 7,
    'Telemetry & Monitoring': 8,
    'Security Fundamentals': 8,
    'Troubleshooting Methodology': 9
  }
};

const SKILL_GROUPS = [
  {
    title: 'Foundational Knowledge',
    skills: [
      { key: 'OSI Model/Layers 1–3', label: '1. OSI Model/Layers 1–3 (Cabling/Switching/Routing)' },
      { key: 'TCP/IP & Subnetting', label: '2. TCP/IP & Subnetting' },
      { key: 'Core Protocols', label: '3. Core Protocols (BGP/OSPF/STP)' }
    ]
  },
  {
    title: 'Arista & Data Center Specifics',
    skills: [
      { key: 'EOS Familiarity', label: '4. EOS Familiarity' },
      { key: 'Leaf-Spine Architecture', label: '5. Leaf-Spine Architecture' },
      { key: 'VXLAN/EVPN Concepts', label: '6. VXLAN/EVPN Concepts' },
      { key: 'Data Center Operations', label: '7. Data Center Operations & Troubleshooting' },
      { key: 'Campus Network Design', label: '8. Campus Network Design' }
    ]
  },
  {
    title: 'Operational & Automation Skills',
    skills: [
      { key: 'Network Automation & Scripting', label: '9. Network Automation & Scripting (Python/Ansible)' },
      { key: 'Telemetry & Monitoring', label: '10. Telemetry & Monitoring' },
      { key: 'Security Fundamentals', label: '11. Security Fundamentals (Segmentation/Firewalls)' },
      { key: 'Troubleshooting Methodology', label: '12. Troubleshooting Methodology' }
    ]
  }
];

export const ProficiencyDashboard: React.FC<ProficiencyDashboardProps> = ({ onGenerate, loading }) => {
  const [primaryRole, setPrimaryRole] = useState<string>('entry');
  const [scores, setScores] = useState<Record<string, number>>({ ...ROLE_DEFAULTS.entry });
  const [duration, setDuration] = useState(24); // default 24 hours
  const [speed, setSpeed] = useState('standard');

  const handleRoleChange = (role: string) => {
    setPrimaryRole(role);
    if (ROLE_DEFAULTS[role]) {
      setScores({ ...ROLE_DEFAULTS[role] });
    }
  };

  const handleScoreChange = (skill: string, val: number) => {
    setScores(prev => ({
      ...prev,
      [skill]: val
    }));
  };

  const handleGenerate = () => {
    onGenerate(scores, { duration, speed });
  };

  const getDifficultyLabel = (score: number) => {
    if (score === 0) return 'No prior experience';
    if (score <= 3) return 'Novice / Beginner concepts';
    if (score <= 7) return 'Intermediate / Standard operations';
    return 'Advanced Architecture / Expert';
  };

  return (
    <aside className="sidebar-tree" style={{ width: '380px', minWidth: '320px', borderRight: '1px solid var(--border-color)' }}>
      <div className="sidebar-header">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Gauge size={18} className="text-secondary" />
          <span>Diagnostic Dashboard</span>
        </h2>
      </div>

      <div className="tree-scroll-container">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
          
          {/* Primary Role Selector */}
          <div className="view-card" style={{ padding: '0.85rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 700, marginBottom: '0.75rem' }}>
              <BookOpen size={14} className="text-secondary" />
              <span>Primary Role Profile</span>
            </h3>
            <select 
              className="select-control"
              value={primaryRole}
              onChange={(e) => handleRoleChange(e.target.value)}
              style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', background: '#090d16', color: '#f9fafb', border: '1px solid var(--border-color)' }}
            >
              <option value="entry">Entry-Level Engineer</option>
              <option value="mid">Mid-Level Engineer</option>
              <option value="senior_eng">Senior-Level Engineer</option>
              <option value="ops">Operations Support</option>
              <option value="senior">Senior Architect</option>
            </select>
          </div>

          {/* Diagnostic Sliders */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {SKILL_GROUPS.map(group => (
              <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.25rem' }}>
                  {group.title}
                </h3>
                
                {group.skills.map(skill => {
                  const score = scores[skill.key] !== undefined ? scores[skill.key] : 5;
                  return (
                    <div key={skill.key} className="slider-group">
                      <div className="slider-label-row">
                        <span className="slider-title" style={{ fontSize: '0.8rem', fontWeight: 500 }}>{skill.label}</span>
                        <span className="slider-val" style={{ fontSize: '0.8rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'var(--border-color)' }}>{score}</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="10" 
                        className="range-slider"
                        value={score}
                        onChange={(e) => handleScoreChange(skill.key, parseInt(e.target.value, 10))}
                      />
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {getDifficultyLabel(score)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Path Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
            <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 700 }}>
              Path Objectives
            </h3>

            <div className="slider-group">
              <div className="slider-label-row">
                <span className="slider-title" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Clock size={14} className="text-secondary" />
                  <span>Target Path Duration</span>
                </span>
                <span className="slider-val" style={{ background: 'var(--lab-bg)', color: 'var(--lab-text)' }}>
                  {duration} hrs
                </span>
              </div>
              <input 
                type="range" 
                min="4" 
                max="40" 
                step="4"
                className="range-slider"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value, 10))}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Maximum duration of the recommended learning path.
              </span>
            </div>

            <div className="slider-group">
              <span className="slider-title" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
                <Award size={14} className="text-secondary" />
                <span>Learning Depth</span>
              </span>
              <select 
                className="select-control"
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="fast">Fast-Paced (Core elements & High-level summaries)</option>
                <option value="standard">Standard (Balanced lectures, labs, and exercises)</option>
                <option value="deep">Deep-Dive (Complete modules, detailed labs, prerequisites focus)</option>
              </select>
            </div>
          </div>

          {/* Action Button */}
          <button 
            className="btn-action btn-primary" 
            style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', marginTop: '0.5rem' }}
            onClick={handleGenerate}
            disabled={loading}
          >
            <Play size={14} style={{ fill: 'currentColor' }} />
            <span>{loading ? 'Assembling Path...' : 'Generate Learning Path'}</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
