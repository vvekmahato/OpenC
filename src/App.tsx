import { useState, useEffect } from 'react';
import { AuthWindow } from './components/AuthWindow';
import { ChatWindow } from './components/ChatWindow';
import { chatService } from './services/chatService';
import type { UserProfile } from './services/chatService';
import { soundManager } from './utils/sounds';

function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [showAuth, setShowAuth] = useState(true);
  
  // Settings
  const [crtFilter, setCrtFilter] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Load user session on startup
  useEffect(() => {
    chatService.getCurrentUser().then((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setShowAuth(false);
      }
    });
  }, []);

  // Update sound manager toggle state
  useEffect(() => {
    soundManager.toggleSound(soundEnabled);
  }, [soundEnabled]);

  const handleAuthSuccess = (authenticatedUser: UserProfile) => {
    setUser(authenticatedUser);
    setShowAuth(false);
  };

  const handleSignOut = async () => {
    await chatService.signOut();
    setUser(null);
    setShowAuth(true);
  };

  return (
    <div 
      className={`crt-effect ${crtFilter ? 'crt-flicker' : ''}`} 
      style={{ 
        width: '100vw', 
        height: '100vh', 
        position: 'relative', 
        backgroundColor: 'var(--win-desktop)',
        overflow: 'hidden'
      }}
    >
      <div className="crt-vignette" />

      {/* Login Screen (Teal Background with Centered Login Window) */}
      {showAuth && (
        <div 
          style={{ 
            width: '100%', 
            height: '100%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}
        >
          <AuthWindow onAuthSuccess={handleAuthSuccess} />
        </div>
      )}

      {/* Maximized Chat Screen */}
      {!showAuth && user && (
        <ChatWindow
          currentUser={user}
          onSignOut={handleSignOut}
          crtFilter={crtFilter}
          setCrtFilter={setCrtFilter}
          soundEnabled={soundEnabled}
          setSoundEnabled={setSoundEnabled}
        />
      )}
    </div>
  );
}

export default App;
