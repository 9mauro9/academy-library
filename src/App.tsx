import { useState, useEffect, useRef } from 'react';
import { generatePath } from './services/firebaseService';
import { Header } from './components/Header';
import { ProficiencyDashboard } from './components/ProficiencyDashboard';
import { LearningPathView } from './components/LearningPathView';
import { AIArchitectPanel } from './components/AIArchitectPanel';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const [activePath, setActivePath] = useState<any>(null);
  const [loadingPath, setLoadingPath] = useState(false);

  const resizerRef = useRef<HTMLDivElement>(null);

  // Resizer logic cloning Academy Timeliner behavior
  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(280, Math.min(600, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleGenerateFromDiagnostic = async (
    scores: Record<string, number>, 
    settings: { duration: number; speed: string }
  ) => {
    setLoadingPath(true);
    try {
      const res = await generatePath(scores, settings);
      if (res && res.learningPath) {
        setActivePath(res.learningPath);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Error generating path: ${err.message || 'Check functions log.'}`);
    } finally {
      setLoadingPath(false);
    }
  };

  return (
    <>
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <div className="main-layout">
        {/* Left Sidebar (Only visible in Manual Path mode) */}
        <div 
          style={{ 
            width: `${sidebarWidth}px`, 
            display: activeTab === 'dashboard' ? 'flex' : 'none', 
            flexDirection: 'column', 
            overflow: 'hidden' 
          }}
        >
          <ProficiencyDashboard 
            onGenerate={handleGenerateFromDiagnostic} 
            loading={loadingPath} 
          />
        </div>
        <div 
          ref={resizerRef} 
          className={`resizer ${isResizing ? 'resizing' : ''}`} 
          style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}
          onMouseDown={startResizing}
        />

        {/* Main Workspace Area */}
        <main className="workspace" style={{ padding: 0, gap: 0 }}>
          <div 
            style={{ 
              display: activeTab === 'dashboard' ? 'flex' : 'none', 
              flexDirection: 'column', 
              flex: 1, 
              overflow: 'hidden' 
            }}
          >
            <LearningPathView 
              path={activePath} 
              loading={loadingPath}
            />
          </div>

          <div 
            style={{ 
              display: activeTab === 'chat' ? 'flex' : 'none', 
              flexDirection: 'column', 
              flex: 1, 
              overflow: 'hidden' 
            }}
          >
            <AIArchitectPanel 
              onPathExtracted={(path) => setActivePath(path)} 
              onLoadingChange={setLoadingPath}
            />
          </div>
        </main>
      </div>
    </>
  );
}

export default App;
