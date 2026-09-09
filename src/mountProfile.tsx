import { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider, AuthGate, UserProfileButton, useAuth } from '@academy/auth-core';

function LibraryAppShellManager() {
  const { currentUser } = useAuth();

  useEffect(() => {
    const shell = document.getElementById('library-app-shell');
    const gateRoot = document.getElementById('library-gate-root');
    const profileContainer = document.getElementById('profileBtnContainer');

    if (currentUser) {
      if (shell) {
        shell.style.display = 'flex';
      }
      if (gateRoot) {
        gateRoot.style.display = 'none';
      }
      if (profileContainer && !(profileContainer as any)._reactRoot) {
        const root = ReactDOM.createRoot(profileContainer);
        (profileContainer as any)._reactRoot = root;
        root.render(
          <AuthProvider appId="library">
            <UserProfileButton appId="library" />
          </AuthProvider>
        );
      }
      // If the CMS app object exists, trigger data load if needed
      if ((window as any).app && typeof (window as any).app.init === 'function') {
        (window as any).app.loadDashboardData?.();
      }
    } else {
      if (shell) {
        shell.style.display = 'none';
      }
      if (gateRoot) {
        gateRoot.style.display = 'flex';
      }
    }

    return () => {
      if (shell) {
        shell.style.display = 'none';
      }
      if (gateRoot) {
        gateRoot.style.display = 'flex';
      }
    };
  }, [currentUser]);

  return null;
}

function LibraryGateRoot() {
  return (
    <AuthProvider appId="library">
      <AuthGate appId="library" appName="Academy Library">
        <LibraryAppShellManager />
      </AuthGate>
    </AuthProvider>
  );
}

function mount() {
  const gateContainer = document.getElementById('library-gate-root');
  if (gateContainer && !(gateContainer as any)._reactRoot) {
    const root = ReactDOM.createRoot(gateContainer);
    (gateContainer as any)._reactRoot = root;
    root.render(<LibraryGateRoot />);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
