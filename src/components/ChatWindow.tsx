import React, { useState, useEffect, useRef } from 'react';
import { chatService } from '../services/chatService';
import type { ChatMessage, UserProfile } from '../services/chatService';
import { soundManager } from '../utils/sounds';

interface ChatWindowProps {
  currentUser: UserProfile;
  onSignOut: () => void;
  crtFilter: boolean;
  setCrtFilter: (val: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  currentUser,
  onSignOut,
  crtFilter,
  setCrtFilter,
  soundEnabled,
  setSoundEnabled
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>(chatService.getInitialOnlineUsers());
  const [inputVal, setInputVal] = useState('');
  
  // Tab key state: can be 'public', 'users' (mobile), or 'dm:userId'
  const [activeTabKey, setActiveTabKey] = useState<string>('public');
  
  // List of active private direct message rooms
  const [activeDMs, setActiveDMs] = useState<UserProfile[]>([]);

  // Reply tracking
  const [replyTo, setReplyTo] = useState<{ id: string; username: string; content: string } | null>(null);
  
  // Highlight tracking (when clicking a reply header)
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load existing messages and subscribe to new ones
  useEffect(() => {
    let active = true;

    const loadData = async () => {
      try {
        const msgs = await chatService.getMessages();
        if (active) {
          setMessages(msgs);
          scrollToBottom('auto');
        }
      } catch (e) {
        console.error('Failed to load messages:', e);
      }
    };

    loadData();

    // Subscribe to real-time messages
    const unsubscribe = chatService.subscribeToMessages((newMsg) => {
      setMessages((prev) => {
        // Prevent duplicate insertions
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        
        // Play notification sounds
        if (newMsg.profile_id === currentUser.id) {
          soundManager.playMessageOutgoing();
        } else {
          soundManager.playMessageIncoming();
        }

        // If it is a private DM addressed to current user from someone else,
        // automatically create the DM tab if it doesn't exist
        if (newMsg.recipient_id === currentUser.id && newMsg.profile_id !== currentUser.id) {
          const senderId = newMsg.profile_id;
          const senderUsername = newMsg.username;
          
          setActiveDMs((prevDMs) => {
            if (!prevDMs.some((dm) => dm.id === senderId)) {
              return [...prevDMs, { id: senderId, username: senderUsername }];
            }
            return prevDMs;
          });
        }

        return [...prev, newMsg];
      });

      // Scroll down
      setTimeout(() => scrollToBottom('smooth'), 50);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [currentUser.id]);

  // Handle online presence synchronization
  useEffect(() => {
    const onlineMap = new Map<string, UserProfile>();
    
    // Seed with initial bots
    chatService.getInitialOnlineUsers().forEach(u => onlineMap.set(u.id, u));
    
    // Add current user
    onlineMap.set(currentUser.id, currentUser);
    setOnlineUsers(Array.from(onlineMap.values()));

    const unsubscribe = chatService.subscribeToOnlineUsers(
      (joinedUser: UserProfile) => {
        onlineMap.set(joinedUser.id, joinedUser);
        setOnlineUsers(Array.from(onlineMap.values()));
      },
      (leftUser: UserProfile) => {
        if (leftUser.id !== currentUser.id) {
          onlineMap.delete(leftUser.id);
          setOnlineUsers(Array.from(onlineMap.values()));
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentUser]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    const text = inputVal;
    setInputVal('');
    
    const replyId = replyTo?.id || null;
    const replyUsername = replyTo?.username || null;
    setReplyTo(null);

    // Determine recipient if we are in a DM tab
    let recipientId: string | null = null;
    let recipientUsername: string | null = null;
    if (activeTabKey.startsWith('dm:')) {
      recipientId = activeTabKey.substring(3);
      const dmUser = activeDMs.find((u) => u.id === recipientId) || onlineUsers.find((u) => u.id === recipientId);
      if (dmUser) {
        recipientUsername = dmUser.username;
      }
    }

    try {
      const sentMsg = await chatService.sendMessage(text, replyId, replyUsername, recipientId, recipientUsername);
      // Optimistically display the message instantly
      setMessages((prev) => {
        if (prev.some((m) => m.id === sentMsg.id)) return prev;
        soundManager.playMessageOutgoing();
        return [...prev, sentMsg];
      });
      setTimeout(() => handleScrollToMessage(sentMsg.id), 100);
    } catch (err: any) {
      soundManager.playError();
      alert(`Message failed to send: ${err.message}`);
    }

    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Reply selection trigger
  const handleInitiateReply = (msg: ChatMessage) => {
    soundManager.playClick();
    setReplyTo({
      id: msg.id,
      username: msg.username,
      content: msg.content
    });
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Click on a reply tag -> Scroll to original message and highlight it
  const handleScrollToMessage = (targetId: string) => {
    const element = document.getElementById(`msg-${targetId}`);
    if (element) {
      soundManager.playClick();
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      setHighlightedMsgId(targetId);
      setTimeout(() => {
        setHighlightedMsgId(null);
      }, 2000);
    } else {
      soundManager.playError();
    }
  };

  // Trigger starting a DM with a user
  const handleStartDM = (targetUser: UserProfile) => {
    if (targetUser.id === currentUser.id) return;
    soundManager.playClick();
    
    // Add to DM rooms if not already there
    if (!activeDMs.some((dm) => dm.id === targetUser.id)) {
      setActiveDMs((prev) => [...prev, targetUser]);
    }
    
    // Switch view
    setActiveTabKey(`dm:${targetUser.id}`);
  };

  // Close a DM conversation tab
  const handleCloseDM = (targetUserId: string) => {
    setActiveDMs((prev) => prev.filter((dm) => dm.id !== targetUserId));
    if (activeTabKey === `dm:${targetUserId}`) {
      setActiveTabKey('public');
    }
  };

  // Format timestamp like [12:04:45 PM]
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  // Filter messages list to display based on the active tab context
  const filteredMessages = messages.filter((msg) => {
    if (activeTabKey === 'public') {
      return !msg.recipient_id; // Public lobby messages only
    }
    if (activeTabKey.startsWith('dm:')) {
      const partnerId = activeTabKey.substring(3);
      return (
        msg.recipient_id &&
        ((msg.profile_id === currentUser.id && msg.recipient_id === partnerId) ||
          (msg.profile_id === partnerId && msg.recipient_id === currentUser.id))
      );
    }
    return false;
  });

  // Group replies under parents recursively for the filtered subset
  const messageIds = new Set(filteredMessages.map((m) => m.id));
  const rootMessages: ChatMessage[] = [];
  const repliesMap: { [parentId: string]: ChatMessage[] } = {};

  filteredMessages.forEach((msg) => {
    if (msg.reply_to_id && messageIds.has(msg.reply_to_id)) {
      if (!repliesMap[msg.reply_to_id]) {
        repliesMap[msg.reply_to_id] = [];
      }
      repliesMap[msg.reply_to_id].push(msg);
    } else {
      rootMessages.push(msg);
    }
  });

  const renderMessageNode = (msg: ChatMessage, depth: number = 0) => {
    const childReplies = repliesMap[msg.id] || [];
    const isMine = msg.profile_id === currentUser.id;

    return (
      <div
        key={msg.id}
        style={{
          marginLeft: !isMine && depth > 0 ? `${Math.min(depth, 3) * 16}px` : '0px',
          marginRight: isMine && depth > 0 ? `${Math.min(depth, 3) * 16}px` : '0px',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          alignItems: isMine ? 'flex-end' : 'flex-start'
        }}
      >
        <div
          id={`msg-${msg.id}`}
          className={`message-item ${isMine ? 'message-mine' : 'message-others'} ${highlightedMsgId === msg.id ? 'highlighted' : ''}`}
          style={{
            borderLeft: !isMine && depth > 0 ? '2px dotted var(--win-border-dark)' : 'none',
            borderRight: isMine && depth > 0 ? '2px dotted var(--win-border-dark)' : 'none',
            paddingLeft: !isMine && depth > 0 ? '8px' : '0px',
            paddingRight: isMine && depth > 0 ? '8px' : '0px',
            marginTop: '4px',
            marginBottom: '4px'
          }}
        >
          <div className="message-header">
            {!activeTabKey.startsWith('dm:') && (
              <span
                className="message-sender"
                onClick={() => handleStartDM({ id: msg.profile_id, username: msg.username })}
                title={`Click to DM @${msg.username}`}
                style={{
                  color: isMine ? 'var(--win-title-active)' : '#404040'
                }}
              >
                @{msg.username}
              </span>
            )}
            <span className="message-time">[{formatTime(msg.created_at)}]</span>
          </div>

          <div className="message-body">{msg.content}</div>

          {!(activeTabKey.startsWith('dm:') && isMine) && (
            <button
              className="message-reply-btn"
              onClick={() => handleInitiateReply(msg)}
              style={{
                alignSelf: isMine ? 'flex-end' : 'flex-start'
              }}
            >
              Reply
            </button>
          )}
        </div>
        {childReplies.map((child) => renderMessageNode(child, depth + 1))}
      </div>
    );
  };

  // Sort online users list: Current user first, then human users, then bots last
  const sortedUsers = [...onlineUsers].sort((a, b) => {
    if (a.id === currentUser.id) return -1;
    if (b.id === currentUser.id) return 1;

    const aIsBot = a.id.startsWith('bot-');
    const bIsBot = b.id.startsWith('bot-');
    if (aIsBot && !bIsBot) return 1;
    if (!aIsBot && bIsBot) return -1;

    return a.username.localeCompare(b.username);
  });

  return (
    <div
      className="win-container outset-deep"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 500,
        border: '4px solid',
        borderTopColor: 'var(--win-border-light)',
        borderLeftColor: 'var(--win-border-light)',
        borderRightColor: 'var(--win-border-shadow)',
        borderBottomColor: 'var(--win-border-shadow)',
        boxShadow: 'none'
      }}
    >
      {/* Title Bar */}
      <div className="win-header">
        <div className="win-header-title" style={{ fontSize: '14px' }}>
          <span>💬</span>
          <span>
            {activeTabKey === 'public'
              ? 'World Chat Lobby - Chat95'
              : activeTabKey.startsWith('dm:')
              ? `🔒 Private Conversation with @${
                  activeDMs.find((dm) => dm.id === activeTabKey.substring(3))?.username || 'User'
                }`
              : 'Channel Directory - Chat95'}
          </span>
        </div>
        <div className="win-header-controls">
          <button
            className="btn-retro"
            onClick={() => {
              soundManager.playClick();
              onSignOut();
            }}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 'bold',
              height: '22px'
            }}
          >
            🔌 Log Out
          </button>
        </div>
      </div>

      {/* Main Layout (Split View) */}
      <div className="win-body" style={{ padding: '6px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Navigation Tabs (World Chat, Open DM rooms, Active Users directory on mobile) */}
        <div className="tabs-container">
          <button
            className={`tab-item ${activeTabKey === 'public' ? '' : 'inactive'}`}
            onClick={() => {
              soundManager.playClick();
              setActiveTabKey('public');
            }}
          >
            💬 World Lobby
          </button>
          
          {activeDMs.map((dm) => (
            <button
              key={dm.id}
              className={`tab-item ${activeTabKey === `dm:${dm.id}` ? '' : 'inactive'}`}
              onClick={() => {
                soundManager.playClick();
                setActiveTabKey(`dm:${dm.id}`);
              }}
              style={{ gap: '6px', paddingRight: '6px' }}
            >
              <span>🔒 @{dm.username}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  soundManager.playClick();
                  handleCloseDM(dm.id);
                }}
                style={{
                  fontSize: '11px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  width: '12px',
                  height: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--win-border-dark)',
                  border: '1px solid transparent'
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = '#ff0000')}
                onMouseOut={(e) => (e.currentTarget.style.color = 'var(--win-border-dark)')}
                title="Close Tab"
              >
                ✕
              </span>
            </button>
          ))}

          <button
            className={`tab-item desktop-hide ${activeTabKey === 'users' ? '' : 'inactive'}`}
            onClick={() => {
              soundManager.playClick();
              setActiveTabKey('users');
            }}
          >
            👥 Users ({onlineUsers.length})
          </button>
        </div>

        <div className="chat-layout" style={{ flexGrow: 1, minHeight: 0 }}>
          
          {/* Left panel: Chat Messages (Visible if activeTab is public or a DM, or always on desktop) */}
          <div className={`chat-main-section ${activeTabKey === 'users' ? 'mobile-hide' : ''}`}>
            <div
              ref={messagesContainerRef}
              className="messages-list-wrapper inset-deep"
              style={{ backgroundColor: '#ffffff' }}
            >
              {filteredMessages.length === 0 ? (
                <div style={{ color: '#808080', textAlign: 'center', marginTop: '60px', fontStyle: 'italic', fontSize: '13px' }}>
                  {activeTabKey.startsWith('dm:') 
                    ? 'This is the start of your private conversation. Messages are encrypted & secure.' 
                    : 'Lobby is empty. Send a message to get started!'}
                </div>
              ) : (
                rootMessages.map((msg) => renderMessageNode(msg, 0))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Section */}
            <form onSubmit={handleSend} className="chat-input-area">
              {/* Active Reply Tag */}
              {replyTo && (
                <div className="reply-active-bar border-thin-inset">
                  <div className="reply-active-info">
                    Replying to <strong>@{replyTo.username}</strong>:{' '}
                    <span style={{ fontStyle: 'italic' }}>
                      "{replyTo.content.substring(0, 40)}{replyTo.content.length > 40 ? '...' : ''}"
                    </span>
                  </div>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                    onClick={() => {
                      soundManager.playClick();
                      setReplyTo(null);
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="chat-input-row">
                <input
                  ref={inputRef}
                  type="text"
                  className="input-retro inset-deep"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder={
                    activeTabKey === 'public'
                      ? `Type a message to public lobby...`
                      : `Send private message to @${activeDMs.find((d) => d.id === activeTabKey.substring(3))?.username || 'user'}...`
                  }
                  maxLength={1000}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="btn-retro"
                  style={{ fontWeight: 'bold', width: '70px' }}
                  disabled={!inputVal.trim()}
                >
                  Send
                </button>
              </div>
            </form>
          </div>

          {/* Right panel: Active Users Panel (Visible on desktop, toggled via tab on mobile) */}
          <div className={`users-panel outset-deep ${activeTabKey === 'users' ? '' : 'mobile-hide'}`}>
            <div className="users-panel-title">
              👥 Channel Users ({onlineUsers.length})
            </div>
            <div style={{ fontSize: '11px', color: '#606060', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px dotted #808080' }}>
              ℹ️ Click a user to send a private direct message.
            </div>
            <ul className="users-list">
              {sortedUsers.map((user) => (
                <li
                  key={user.id}
                  className="user-list-item"
                  onClick={() => handleStartDM(user)}
                  style={{
                    cursor: user.id === currentUser.id ? 'default' : 'pointer',
                    borderRadius: '2px',
                    transition: 'background 0.1s'
                  }}
                  onMouseOver={(e) => {
                    if (user.id !== currentUser.id) {
                      e.currentTarget.style.backgroundColor = 'rgba(0,0,128,0.08)';
                    }
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title={user.id === currentUser.id ? 'This is you' : `Click to DM @${user.username}`}
                >
                  <span className="user-online-dot"></span>
                  <span
                    style={{
                      fontWeight: user.id === currentUser.id ? 'bold' : 'normal',
                      textDecoration: user.id.startsWith('bot-') ? 'underline dotted' : 'none'
                    }}
                  >
                    {user.username}
                  </span>
                  {user.id === currentUser.id && (
                    <span style={{ fontSize: '10px', color: '#808080' }}>(You)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>

      {/* Window Status Bar */}
      <div className="win-status-bar" style={{ padding: '4px 6px' }}>
        <div className="win-status-pane border-thin-inset" style={{ flexGrow: 3 }}>
          Joined as @{currentUser.username} ({currentUser.id.substring(0, 8)})
        </div>
        <div className="win-status-pane border-thin-inset">
          {chatService.isMockMode() ? 'Offline Mode' : 'Cloud Database'}
        </div>
        <div className="win-status-pane border-thin-inset" style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', minWidth: '160px' }}>
          <button 
            onClick={() => { soundManager.playClick(); setCrtFilter(!crtFilter); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '11px', fontFamily: 'var(--font-sys)', color: '#000' }}
            title="Toggle CRT Screen Scanlines"
          >
            {crtFilter ? '📺 CRT: ON' : '💻 CRT: OFF'}
          </button>
          <span style={{ color: 'var(--win-border-dark)' }}>|</span>
          <button 
            onClick={() => { setSoundEnabled(!soundEnabled); soundManager.playClick(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '11px', fontFamily: 'var(--font-sys)', color: '#000' }}
            title="Toggle Retro Sound Effects"
          >
            {soundEnabled ? '🔊 Sound: ON' : '🔇 Sound: OFF'}
          </button>
        </div>
      </div>
    </div>
  );
};
