import { useState, useEffect } from 'react';
import { subscribeToAuth } from './services/firebaseService';
import { Header } from './components/Header';
import { Auth } from './components/Auth';
import { DataManager } from './components/DataManager';

function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = () => {
    setCurrentUser(null);
  };

  if (authLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--text-secondary)',
        fontSize: '0.9rem'
      }}>
        Loading Academy Library…
      </div>
    );
  }

  if (!currentUser) {
    return <Auth />;
  }

  return (
    <>
      <Header
        currentUser={currentUser}
        onLogout={handleLogout}
      />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <DataManager />
      </main>
    </>
  );
}

export default App;
