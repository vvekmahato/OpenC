import { supabase } from './supabaseClient';

export interface UserProfile {
  id: string;
  username: string;
  avatarUrl?: string | null;
}

export interface ChatMessage {
  id: string;
  profile_id: string;
  username: string;
  content: string;
  created_at: string;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  recipient_id?: string | null;
  recipient_username?: string | null;
}

// ----------------------------------------------------
// LOCAL MOCK BACKEND (Fallback Mode)
// ----------------------------------------------------

const BROADCAST_CHANNEL_NAME = 'retro_chat_95_broadcast';
let mockBroadcastChannel: BroadcastChannel | null = null;

try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    mockBroadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  }
} catch (e) {
  console.error('Failed to create BroadcastChannel', e);
}

// Local mock subscription registry for same-tab instant updates
const mockMessageListeners = new Set<(msg: ChatMessage) => void>();

// Local mock users list: [{ id, username, password }]
const getMockUsers = (): any[] => {
  const users = localStorage.getItem('mock_users');
  return users ? JSON.parse(users) : [];
};

const saveMockUser = (user: any) => {
  const users = getMockUsers();
  users.push(user);
  localStorage.setItem('mock_users', JSON.stringify(users));
};

// Local mock messages list
const getMockMessages = (): ChatMessage[] => {
  const msgs = localStorage.getItem('mock_messages');
  return msgs ? JSON.parse(msgs) : [];
};

const saveMockMessage = (msg: ChatMessage) => {
  const msgs = getMockMessages();
  msgs.push(msg);
  localStorage.setItem('mock_messages', JSON.stringify(msgs));
};

// Local mock current session (uses sessionStorage so multiple tabs don't overwrite each other's active session)
const getMockSession = (): UserProfile | null => {
  const user = sessionStorage.getItem('mock_current_user');
  return user ? JSON.parse(user) : null;
};

const saveMockSession = (user: UserProfile | null) => {
  if (user) {
    sessionStorage.setItem('mock_current_user', JSON.stringify(user));
  } else {
    sessionStorage.removeItem('mock_current_user');
  }
};

// Mock online users database
const MOCK_BOTS: UserProfile[] = [
  { id: 'bot-clippy', username: 'Clippy_Assistant' },
  { id: 'bot-sk8r', username: 'Sk8rBoy99' },
  { id: 'bot-netscape', username: 'NetscapeNavigator' },
  { id: 'bot-neo', username: 'Neo_TheOne' }
];

// Helper to generate UUIDs locally
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// ----------------------------------------------------
// EXPORTED SERVICE INTERFACE
// ----------------------------------------------------

export const chatService = {
  isMockMode(): boolean {
    return !supabase;
  },

  async signUp(username: string, password?: string): Promise<UserProfile> {
    const cleanedUsername = username.trim();
    if (cleanedUsername.length < 3 || cleanedUsername.length > 15) {
      throw new Error('Username must be between 3 and 15 characters.');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanedUsername)) {
      throw new Error('Username can only contain letters, numbers, and underscores.');
    }

    if (supabase) {
      // 1. Check if username is already taken in profiles table
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', cleanedUsername)
        .maybeSingle();

      if (existingUser) {
        throw new Error('Username is already taken.');
      }

      // 2. Perform actual supabase auth signup
      const virtualEmail = `${cleanedUsername.toLowerCase()}@retrochat.com`;
      const fallbackPassword = password || 'RetroPassword123!';
      
      const { data, error } = await supabase.auth.signUp({
        email: virtualEmail,
        password: fallbackPassword,
        options: {
          data: {
            username: cleanedUsername
          }
        }
      });

      if (error) throw error;
      if (!data.user) throw new Error('Failed to create account.');

      // Wait a moment for trigger to run and create profile, then fetch it
      let profile: UserProfile | null = null;
      for (let i = 0; i < 5; i++) {
        const { data: p } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', data.user.id)
          .maybeSingle();
        if (p) {
          profile = { id: p.id, username: p.username, avatarUrl: p.avatar_url };
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (!profile) {
        throw new Error('Profile creation timed out. Please try signing in.');
      }

      return profile;
    } else {
      // Mock Mode SignUp
      const users = getMockUsers();
      const exists = users.some(u => u.username.toLowerCase() === cleanedUsername.toLowerCase());
      if (exists) {
        throw new Error('Username is already taken.');
      }

      const id = generateUUID();
      const newUser = { id, username: cleanedUsername, password };
      saveMockUser(newUser);

      const profile = { id, username: cleanedUsername };
      saveMockSession(profile);

      // Broadcast new user
      if (mockBroadcastChannel) {
        mockBroadcastChannel.postMessage({ type: 'USER_JOINED', payload: profile });
      }

      return profile;
    }
  },

  async signIn(username: string, password?: string): Promise<UserProfile> {
    const cleanedUsername = username.trim();
    if (supabase) {
      const virtualEmail = `${cleanedUsername.toLowerCase()}@retrochat.com`;
      const fallbackPassword = password || 'RetroPassword123!';

      const { data, error } = await supabase.auth.signInWithPassword({
        email: virtualEmail,
        password: fallbackPassword
      });

      if (error) throw error;
      if (!data.user) throw new Error('Log in failed.');

      // Fetch user profile
      const { data: p, error: profileErr } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('id', data.user.id)
        .single();

      if (profileErr || !p) {
        throw new Error('Could not load user profile.');
      }

      return { id: p.id, username: p.username, avatarUrl: p.avatar_url };
    } else {
      // Mock Mode SignIn
      const users = getMockUsers();
      const user = users.find(
        u => u.username.toLowerCase() === cleanedUsername.toLowerCase()
      );

      if (!user) {
        throw new Error('Username not found. Please sign up first!');
      }

      if (password && user.password && user.password !== password) {
        throw new Error('Invalid password.');
      }

      const profile = { id: user.id, username: user.username };
      saveMockSession(profile);

      // Broadcast user online
      if (mockBroadcastChannel) {
        mockBroadcastChannel.postMessage({ type: 'USER_JOINED', payload: profile });
      }

      return profile;
    }
  },

  async signOut(): Promise<void> {
    if (supabase) {
      await supabase.auth.signOut();
    } else {
      const user = getMockSession();
      saveMockSession(null);
      if (user && mockBroadcastChannel) {
        mockBroadcastChannel.postMessage({ type: 'USER_LEFT', payload: user });
      }
    }
  },

  async getCurrentUser(): Promise<UserProfile | null> {
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) return null;

      const { data: p } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('id', data.session.user.id)
        .maybeSingle();

      if (!p) return null;
      return { id: p.id, username: p.username, avatarUrl: p.avatar_url };
    } else {
      return getMockSession();
    }
  },

  async getMessages(): Promise<ChatMessage[]> {
    const currentUser = await this.getCurrentUser();
    if (supabase) {
      const client = supabase;
      let query = client.from('messages').select('*');

      if (currentUser) {
        query = query.or(`recipient_id.is.null,recipient_id.eq.${currentUser.id},profile_id.eq.${currentUser.id}`);
      } else {
        query = query.filter('recipient_id', 'is', null);
      }

      const { data, error } = await query
        .order('created_at', { ascending: true })
        .limit(150);

      if (error) throw error;
      return data || [];
    } else {
      const msgs = getMockMessages();
      const filteredMsgs = msgs.filter((msg) => {
        if (!msg.recipient_id) return true; // public
        if (!currentUser) return false;
        return msg.recipient_id === currentUser.id || msg.profile_id === currentUser.id;
      });

      if (filteredMsgs.length === 0 && msgs.length === 0) {
        // Create initial welcoming messages
        const initialMsgs: ChatMessage[] = [
          {
            id: 'init-1',
            profile_id: 'bot-clippy',
            username: 'Clippy_Assistant',
            content: 'Hello! Welcome to Retro Chat 95. It looks like you are running in Mock Mode.',
            created_at: new Date(Date.now() - 600000).toISOString()
          },
          {
            id: 'init-2',
            profile_id: 'bot-netscape',
            username: 'NetscapeNavigator',
            content: 'To chat with yourself in real time, open another browser tab at the same URL! They will sync instantly.',
            created_at: new Date(Date.now() - 300000).toISOString()
          },
          {
            id: 'init-3',
            profile_id: 'bot-clippy',
            username: 'Clippy_Assistant',
            content: 'And once you are ready, add your Supabase credentials to .env to connect to the cloud database!',
            created_at: new Date(Date.now() - 100000).toISOString(),
            reply_to_id: 'init-2',
            reply_to_username: 'NetscapeNavigator'
          }
        ];
        localStorage.setItem('mock_messages', JSON.stringify(initialMsgs));
        return initialMsgs;
      }
      return filteredMsgs;
    }
  },

  async sendMessage(
    content: string,
    replyToId: string | null = null,
    replyToUsername: string | null = null,
    recipientId: string | null = null,
    recipientUsername: string | null = null
  ): Promise<ChatMessage> {
    const text = content.trim();
    if (!text) throw new Error('Message content cannot be empty.');

    const currentUser = await this.getCurrentUser();
    if (!currentUser) throw new Error('You must be signed in to send a message.');

    if (supabase) {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          profile_id: currentUser.id,
          username: currentUser.username,
          content: text,
          reply_to_id: replyToId,
          reply_to_username: replyToUsername,
          recipient_id: recipientId,
          recipient_username: recipientUsername
        })
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } else {
      const newMessage: ChatMessage = {
        id: generateUUID(),
        profile_id: currentUser.id,
        username: currentUser.username,
        content: text,
        created_at: new Date().toISOString(),
        reply_to_id: replyToId,
        reply_to_username: replyToUsername,
        recipient_id: recipientId,
        recipient_username: recipientUsername
      };

      saveMockMessage(newMessage);

      // Broadcast message to other tabs
      if (mockBroadcastChannel) {
        mockBroadcastChannel.postMessage({ type: 'NEW_MESSAGE', payload: newMessage });
      }

      // Trigger local subscribers in the same tab
      mockMessageListeners.forEach(cb => cb(newMessage));

      // Simulate a funny retro bot reply sometimes (lobby only)
      if (!recipientId && !replyToId && Math.random() > 0.6) {
        setTimeout(() => {
          this.simulateBotReply(newMessage);
        }, 1500 + Math.random() * 2000);
      }

      // Simulate a private DM bot reply if DMing a bot!
      if (recipientId && recipientId.startsWith('bot-')) {
        setTimeout(() => {
          this.simulateBotPrivateReply(newMessage, recipientId, recipientUsername || 'Bot');
        }, 1000 + Math.random() * 1500);
      }

      return newMessage;
    }
  },

  // Helper to simulate bot replies in mock mode for amusement
  simulateBotReply(parentMsg: ChatMessage) {
    const bot = MOCK_BOTS[Math.floor(Math.random() * MOCK_BOTS.length)];
    const responses = [
      'Woah, that is totally radical!',
      'I agree. Surfs up! 🏄‍♂️',
      'Please sign my guestbook!',
      'Check out my Geocities site, it has cool flame animations.',
      'Did you hear the new Daft Punk album?',
      'Let me dial in my modem, hold on... 📠 beep boop screech',
      'Totally tubular!'
    ];
    const content = responses[Math.floor(Math.random() * responses.length)];

    const botMessage: ChatMessage = {
      id: generateUUID(),
      profile_id: bot.id,
      username: bot.username,
      content,
      created_at: new Date().toISOString(),
      reply_to_id: parentMsg.id,
      reply_to_username: parentMsg.username
    };

    saveMockMessage(botMessage);

    if (mockBroadcastChannel) {
      mockBroadcastChannel.postMessage({ type: 'NEW_MESSAGE', payload: botMessage });
    }

    // Trigger local subscribers in the same tab
    mockMessageListeners.forEach(cb => cb(botMessage));
  },

  // Helper to simulate private bot replies in mock DMs
  simulateBotPrivateReply(parentMsg: ChatMessage, botId: string, botUsername: string) {
    const responses = [
      `Hi there! Thanks for writing to me privately. I love DMing.`,
      `Did you know I am running locally on your computer? Neat, huh!`,
      `A secret private message? Don't worry, your secrets are safe in localStorage.`,
      `Beep boop. I am a chatbot from 1995. Typing takes some processing power...`,
      `Have you checked out my animated graphics yet?`,
      `Let's chat privately. Tell me about your Pentium computer!`,
      `Wow! A direct message! I feel so special.`
    ];
    
    let content = responses[Math.floor(Math.random() * responses.length)];
    if (botId === 'bot-clippy') {
      content = `It looks like you are writing a private message to me! Would you like help with that? 📎`;
    }

    const botMessage: ChatMessage = {
      id: generateUUID(),
      profile_id: botId,
      username: botUsername,
      content,
      created_at: new Date().toISOString(),
      reply_to_id: parentMsg.id,
      reply_to_username: parentMsg.username,
      recipient_id: parentMsg.profile_id,
      recipient_username: parentMsg.username
    };

    saveMockMessage(botMessage);

    if (mockBroadcastChannel) {
      mockBroadcastChannel.postMessage({ type: 'NEW_MESSAGE', payload: botMessage });
    }

    // Trigger local subscribers in the same tab
    mockMessageListeners.forEach(cb => cb(botMessage));
  },

  subscribeToMessages(callback: (msg: ChatMessage) => void): () => void {
    const client = supabase;
    if (client) {
      const channel = client
        .channel('public:messages')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            callback(payload.new as ChatMessage);
          }
        )
        .subscribe();

      return () => {
        client.removeChannel(channel);
      };
    } else {
      mockMessageListeners.add(callback);

      const listener = (event: MessageEvent) => {
        if (event.data && event.data.type === 'NEW_MESSAGE') {
          callback(event.data.payload as ChatMessage);
        }
      };

      if (mockBroadcastChannel) {
        mockBroadcastChannel.addEventListener('message', listener);
      }

      return () => {
        mockMessageListeners.delete(callback);
        if (mockBroadcastChannel) {
          mockBroadcastChannel.removeEventListener('message', listener);
        }
      };
    }
  },

  // Online Users simulation + cross-tab synchronization
  getInitialOnlineUsers(): UserProfile[] {
    return MOCK_BOTS;
  },

  subscribeToOnlineUsers(
    onUserJoin: (user: UserProfile) => void,
    onUserLeave: (user: UserProfile) => void
  ): () => void {
    const client = supabase;
    if (client) {
      // Supabase Presence is the standard way to do this.
      // We will set up a presence channel to sync active user statuses
      const channel = client.channel('online_users', {
        config: {
          presence: {
            key: 'user'
          }
        }
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          // Sync presence callback placeholder
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          newPresences.forEach((pres: any) => {
            if (pres.username) {
              onUserJoin({ id: pres.id || key, username: pres.username });
            }
          });
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          leftPresences.forEach((pres: any) => {
            if (pres.username) {
              onUserLeave({ id: pres.id || key, username: pres.username });
            }
          });
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            const currentUser = await this.getCurrentUser();
            if (currentUser) {
              await channel.track({
                id: currentUser.id,
                username: currentUser.username,
                online_at: new Date().toISOString()
              });
            }
          }
        });

      return () => {
        client.removeChannel(channel);
      };
    } else {
      // Mock mode synchronization via BroadcastChannel
      const listener = (event: MessageEvent) => {
        if (event.data) {
          if (event.data.type === 'USER_JOINED') {
            onUserJoin(event.data.payload as UserProfile);
          } else if (event.data.type === 'USER_LEFT') {
            onUserLeave(event.data.payload as UserProfile);
          } else if (event.data.type === 'PING_PRESENCE') {
            // Reply to presence ping
            this.getCurrentUser().then(user => {
              if (user && mockBroadcastChannel) {
                mockBroadcastChannel.postMessage({
                  type: 'PONG_PRESENCE',
                  payload: user
                });
              }
            });
          } else if (event.data.type === 'PONG_PRESENCE') {
            onUserJoin(event.data.payload as UserProfile);
          }
        }
      };

      if (mockBroadcastChannel) {
        mockBroadcastChannel.addEventListener('message', listener);
        // Ping other tabs to see who is online
        mockBroadcastChannel.postMessage({ type: 'PING_PRESENCE' });
      }

      // Also announce our own presence immediately
      this.getCurrentUser().then(user => {
        if (user && mockBroadcastChannel) {
          mockBroadcastChannel.postMessage({ type: 'USER_JOINED', payload: user });
        }
      });

      return () => {
        if (mockBroadcastChannel) {
          mockBroadcastChannel.removeEventListener('message', listener);
        }
      };
    }
  }
};

