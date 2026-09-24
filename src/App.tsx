import { AuthProvider, AuthGate, useAuth, useAudit } from '@academy/auth-core';
import { spokeOps } from '@/telemetry/spokeOpsClient';
import { I18nProvider } from './i18n/I18nContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Header } from './components/Header';
import { DataManager } from './components/DataManager';
import { useEffect } from 'react';

function LibraryMain() {
  const { currentUser, isSuperAdmin, role, signOut } = useAuth();
  const { logNavigation } = useAudit({ appId: 'library' });

  useEffect(() => {
    if (currentUser) {
      spokeOps.init({
        uid: currentUser.uid,
        email: currentUser.email || "user@academy.internal",
        roles: (currentUser as any).roles || ((currentUser as any).role ? [(currentUser as any).role] : ["instructor"])
      });
    } else {
      spokeOps.closeSession();
    }
    return () => {
      spokeOps.closeSession();
    };
  }, [currentUser]);

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
        <DataManager />
      </main>
    </>
  );
}

export function App() {
  return (
    <ErrorBoundary spokeName="LibraryApp">
      <AuthProvider appId="library">
        <I18nProvider>
          <AuthGate appId="library" appName="Academy Library">
            <LibraryMain />
          </AuthGate>
        </I18nProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
