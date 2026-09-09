import { AuthProvider, ProtectedRoute, useAuth, useAudit } from '@academy/auth-core';
import { I18nProvider } from './i18n/I18nContext';
import { Header } from './components/Header';
import { DataManager } from './components/DataManager';
import { useEffect } from 'react';

function LibraryMain() {
  const { currentUser, isSuperAdmin, role, signOut } = useAuth();
  const { logNavigation } = useAudit({ appId: 'library' });

  useEffect(() => {
    logNavigation('library_catalog', { view: 'data_manager' });
  }, [logNavigation]);

  return (
    <>
      <Header
        currentUser={currentUser}
        isSuperAdmin={isSuperAdmin}
        role={role}
        onLogout={signOut}
      />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <ProtectedRoute>
          <DataManager />
        </ProtectedRoute>
      </main>
    </>
  );
}

export function App() {
  return (
    <AuthProvider appId="library">
      <I18nProvider>
        <LibraryMain />
      </I18nProvider>
    </AuthProvider>
  );
}

export default App;
