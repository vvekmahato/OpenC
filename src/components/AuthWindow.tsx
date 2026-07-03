import React, { useState } from 'react';
import { chatService } from '../services/chatService';
import type { UserProfile } from '../services/chatService';
import { soundManager } from '../utils/sounds';

interface AuthWindowProps {
  onAuthSuccess: (user: UserProfile) => void;
  onClose?: () => void;
}

export const AuthWindow: React.FC<AuthWindowProps> = ({ onAuthSuccess, onClose }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [systemError, setSystemError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setIsLoading(true);
    setSystemError(null);
    soundManager.playClick();

    try {
      let user: UserProfile;
      if (isSignUp) {
        user = await chatService.signUp(username, password);
      } else {
        user = await chatService.signIn(username, password);
      }
      
      soundManager.playStartup();
      onAuthSuccess(user);
    } catch (err: any) {
      soundManager.playError();
      setSystemError(err.message || 'An error occurred during authentication.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseError = () => {
    soundManager.playClick();
    setSystemError(null);
  };

  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
      <div
        className="win-container outset-deep"
        style={{
          width: '90%',
          maxWidth: '360px',
          zIndex: 9990,
          position: 'relative'
        }}
      >
        {/* Title Bar */}
        <div className="win-header">
          <div className="win-header-title">
            <span style={{ fontSize: '16px' }}>🔑</span>
            <span>{isSignUp ? 'New User Signup' : 'Enter Network Password'}</span>
          </div>
          <div className="win-header-controls">
            {onClose && (
              <button className="btn-control" onClick={() => { soundManager.playClick(); onClose(); }}>
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Dialog Body */}
        <form onSubmit={handleSubmit} className="win-body" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              🖥️
            </div>
            <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
              {isSignUp ? (
                <>Type a user name and password to register a new account on the Retro Chat Network.</>
              ) : (
                <>Type a user name and password to log on to the Retro Chat Network.</>
              )}
            </div>
          </div>

          <div className="inset-deep" style={{ padding: '12px', marginBottom: '14px', backgroundColor: '#f0f0f0' }}>
            {/* Username Field */}
            <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '80px 1fr', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <label className="label-retro" htmlFor="username">User name:</label>
              <input
                id="username"
                type="text"
                className="input-retro inset-deep"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                autoFocus
                maxLength={15}
                required
              />
            </div>

            {/* Password Field */}
            <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '80px 1fr', alignItems: 'center', gap: '8px' }}>
              <label className="label-retro" htmlFor="password">Password:</label>
              <input
                id="password"
                type="password"
                className="input-retro inset-deep"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                placeholder="Optional (Mock Mode)"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="submit"
              className="btn-retro"
              disabled={isLoading || !username.trim()}
              style={{ width: '80px', fontWeight: 'bold' }}
            >
              {isLoading ? 'Wait...' : 'OK'}
            </button>
            
            <button
              type="button"
              className="btn-retro"
              onClick={() => {
                soundManager.playClick();
                setIsSignUp(!isSignUp);
                setSystemError(null);
              }}
              style={{ minWidth: '110px' }}
            >
              {isSignUp ? 'I have an account' : 'Create Account'}
            </button>
          </div>
        </form>

        <div className="win-status-bar">
          <div className="win-status-pane border-thin-inset">
            {chatService.isMockMode() ? '🔴 Local Storage Mode (Offline)' : '🟢 Supabase Cloud Connected'}
          </div>
        </div>
      </div>

      {/* Retro Windows 95 Style Error Alert Modal */}
      {systemError && (
        <div
          className="win-container outset-deep"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90%',
            maxWidth: '320px',
            zIndex: 10000,
            boxShadow: '4px 4px 20px rgba(0,0,0,0.5)'
          }}
        >
          {/* Error Alert Header */}
          <div className="win-header">
            <div className="win-header-title">
              <span>⚠️</span>
              <span>System Error</span>
            </div>
            <div className="win-header-controls">
              <button className="btn-control" onClick={handleCloseError}>
                ✕
              </button>
            </div>
          </div>

          {/* Error Alert Body */}
          <div className="win-body" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontSize: '32px', color: '#ffcc00' }}>⚠️</div>
              <div style={{ fontSize: '13px', lineHeight: '1.4', color: '#000000' }}>
                {systemError}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                className="btn-retro"
                onClick={handleCloseError}
                style={{ width: '80px', fontWeight: 'bold' }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
