import { useState, useEffect, useRef } from 'react';
import { subscribeToAuth, generatePath } from './services/firebaseService';
import { Header } from './components/Header';
import { ProficiencyDashboard } from './components/ProficiencyDashboard';
import { LearningPathView } from './components/LearningPathView';
import { AIArchitectPanel } from './components/AIArchitectPanel';

function App() {
  // Set default mock user to completely bypass authentication wall for testing
  const [currentUser, setCurrentUser] = useState<any>({
    email: 'testing.guest@academybuilder.com',
    uid: 'sandbox-test-user-id',
    isAnonymous: true
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const [activePath, setActivePath] = useState<any>(null);
  const [loadingPath, setLoadingPath] = useState(false);

  const resizerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Keep auth state subscribed in case we want to support logout, but fallback to testing user
    const unsubscribe = subscribeToAuth((user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        // Force mock user even if signed out
        setCurrentUser({
          email: 'testing.guest@academybuilder.com',
          uid: 'sandbox-test-user-id',
          isAnonymous: true
        });
      }
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);
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

  if (authLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', backgroundColor: '#090d16', color: '#f9fafb', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Loading Academy Builder Architecture...</h2>
          <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.5rem' }}>Securing database session...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Header currentUser={currentUser} activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <div className="main-layout">
        {/* Left Sidebar (Only visible in Diagnostic Dashboard mode) */}
        {activeTab === 'dashboard' && currentUser && (
          <>
            <div style={{ width: `${sidebarWidth}px`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <ProficiencyDashboard 
                onGenerate={handleGenerateFromDiagnostic} 
                loading={loadingPath} 
              />
            </div>
            <div 
              ref={resizerRef} 
              className={`resizer ${isResizing ? 'resizing' : ''}`} 
              onMouseDown={startResizing}
            />
          </>
        )}

        {/* Main Workspace Area */}
        <main className="workspace" style={{ padding: 0, gap: 0 }}>
          {currentUser && (
            <>
              {activeTab === 'dashboard' && (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                  <LearningPathView 
                    path={activePath} 
                    currentUser={currentUser} 
                  />
                </div>
              )}

              {activeTab === 'chat' && (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                  <AIArchitectPanel onPathExtracted={(path) => setActivePath(path)} />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}

export default App;
