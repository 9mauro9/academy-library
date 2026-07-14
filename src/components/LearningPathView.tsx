import React from 'react';
import { Clock, BookOpen, Layers, ShieldCheck, AlertCircle, Hourglass } from 'lucide-react';

interface LearningPathViewProps {
  path: any;
  loading?: boolean;
}

export const LearningPathView: React.FC<LearningPathViewProps> = ({ path, loading }) => {

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <Hourglass size={48} className="text-secondary spin-hourglass" style={{ color: 'var(--accent-color)' }} />
          <h3 style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Assembling Personalized Path...</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '320px' }}>
            We are analyzing our topic catalog and organizing your optimized roadmap.
          </p>
        </div>
      </div>
    );
  }

  if (!path || !path.modules || path.modules.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center' }}>
        <Layers size={48} className="text-secondary" style={{ marginBottom: '1rem', opacity: 0.5 }} />
        <h3>No Learning Path Active</h3>
        <p style={{ fontSize: '0.85rem', maxWidth: '380px', marginTop: '0.5rem' }}>
          Adjust the proficiency diagnostic sliders on the left and click "Generate Learning Path", or prompt the AI Architect in the chat panel to generate a custom curriculum.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Summary KPI row inside the roadmap workspace */}
      <section className="summary-bar" style={{ padding: '1.25rem 1.5rem', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-color)' }}>
        <div className="kpi-card">
          <div className="kpi-details">
            <h4>Total Path Duration</h4>
            <div className="value">{path.totalDuration || '0 hrs'}</div>
          </div>
          <div className="kpi-icon">
            <Clock size={20} />
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-details">
            <h4>Prerequisite Sequencing</h4>
            <div className="value" style={{ marginTop: '0.25rem' }}>
              {path.sequenceStatus === 'valid' ? (
                <span className="fit-badge ok">
                  <ShieldCheck size={12} /> Sequence Valid
                </span>
              ) : (
                <span className="fit-badge warn">
                  <AlertCircle size={12} /> Check Sequence
                </span>
              )}
            </div>
          </div>
          <div className="kpi-icon">
            <Layers size={20} />
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-details">
            <h4>Modules Selected</h4>
            <div className="value">{path.modules.length} Lessons / Topics</div>
          </div>
          <div className="kpi-icon">
            <BookOpen size={20} />
          </div>
        </div>
      </section>

      {/* Path Title & Actions */}
      <div className="view-header" style={{ borderBottom: 'none' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{path.title || 'Personalized Learning Roadmap'}</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{path.description || 'Custom structured curriculum designed for your experience level.'}</p>
        </div>
      </div>

      {/* Timeline Roadmaps */}
      <div className="timeline-list">
        {path.modules.map((mod: any, index: number) => (
          <div key={index} className="timeline-item">
            <div className="timeline-header">
              <div className="timeline-title-group">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span className="fit-badge ok" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                    Step {index + 1}
                  </span>
                  <span className="timeline-subtitle">{mod.topic}</span>
                </div>
                <h3>{mod.lesson}</h3>
              </div>
              <div className="badge-row">
                <span className="fit-badge ok">{mod.duration}</span>
                <span className="fit-badge warn" style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', color: 'var(--accent-color)' }}>
                  Diff: {mod.difficultyLevel || mod.difficulty || '5'}/10
                </span>
                {mod.skillTag && (
                  <span className="fit-badge ok" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                    {mod.skillTag}
                  </span>
                )}
              </div>
            </div>

            <p className="timeline-desc" style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
              {mod.topic || 'General'} / {mod.subTrack || 'Foundations'} / {mod.lesson || 'Lesson'} / {mod.curriculumTopic || 'Topic'} / {mod.asset_name || 'Sub Topic'}
            </p>

            <div className="timeline-footer">
              <div>
                {mod.prerequisites ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#fbbf24' }}>
                    <AlertCircle size={12} /> Prerequisite: {mod.prerequisites}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>No Prerequisites</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
