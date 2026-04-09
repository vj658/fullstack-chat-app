import React, { Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { API_URL } from '../config';

const notificationSound = new Audio('https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3');
notificationSound.volume = 0.5;

const CONNECTED_DOT = '\u25CF';
const THUMBS_UP = '\uD83D\uDC4D';
const SPEAKER_ICON = '\uD83D\uDD0A';
const CAMERA_ICON = '\uD83D\uDCF7';
const SMILE_ICON = '\uD83D\uDE00';
const EmojiPicker = React.lazy(() => import('emoji-picker-react'));

const Avatar = React.memo(({ username, size = 32 }) => {
  const initials = username.slice(0, 2).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: size * 0.4,
        fontWeight: 'bold',
        marginRight: 8,
      }}
    >
      {initials}
    </div>
  );
});

Avatar.displayName = 'Avatar';

export default function Chat({ username, room, socket, onLeave }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [users, setUsers] = useState([]);
  const [typing, setTyping] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(localStorage.getItem('soundEnabled') !== 'false');
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    localStorage.setItem('soundEnabled', String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    if (!room || !username) {
      return undefined;
    }

    const abortController = new AbortController();

    socket.emit('join_room', { room, username });
    setMessages([]);
    setUsers([]);
    setTyping('');
    setIsCreator(false);

    fetch(`${API_URL}/messages?room=${encodeURIComponent(room)}`, {
      signal: abortController.signal,
    })
      .then((r) => {
        if (!r.ok) {
          throw new Error('Failed to load messages');
        }
        return r.json();
      })
      .then((data) => {
        setMessages(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('Failed to load messages', err);
        }
      });

    const handleReceiveMessage = (msg) => {
      setMessages((prev) => {
        if (prev.some((existing) => existing._id === msg._id)) {
          return prev;
        }
        return [...prev, msg];
      });

      if (msg.username !== username && soundEnabledRef.current) {
        notificationSound.currentTime = 0;
        notificationSound.play().catch(() => {});
      }
    };

    const handleRoomUsers = (userList) => {
      setUsers([...new Set(userList)]);
    };

    const handleTypingStatus = ({ username: typer, isTyping }) => {
      setTyping(isTyping ? `${typer} is typing...` : '');
    };

    const handleMessageUpdated = (updatedMessage) => {
      setMessages((prev) => {
        let found = false;
        const nextMessages = prev.map((message) => {
          if (message._id !== updatedMessage._id) {
            return message;
          }

          found = true;
          return updatedMessage;
        });

        return found ? nextMessages : [...nextMessages, updatedMessage];
      });
    };

    const handleRoomInfo = ({ isCreator: isRoomCreator }) => {
      setIsCreator(!!isRoomCreator);
    };

    const handleKicked = () => {
      alert("You have been kicked from the room.");
      if (onLeave) onLeave();
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('room_users', handleRoomUsers);
    socket.on('typing_status', handleTypingStatus);
    socket.on('message_updated', handleMessageUpdated);
    socket.on('room_info', handleRoomInfo);
    socket.on('kicked', handleKicked);

    return () => {
      abortController.abort();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      socket.emit('typing', { isTyping: false });
      socket.emit('leave_room', { room });
      socket.off('receive_message', handleReceiveMessage);
      socket.off('room_users', handleRoomUsers);
      socket.off('typing_status', handleTypingStatus);
      socket.off('message_updated', handleMessageUpdated);
      socket.off('room_info', handleRoomInfo);
      socket.off('kicked', handleKicked);
    };
  }, [socket, room, username, onLeave]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const handleInput = useCallback((e) => {
    const nextValue = e.target.value;
    setText(nextValue);
    socket.emit('typing', { isTyping: nextValue.trim().length > 0 });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', { isTyping: false });
    }, 2000);
  }, [socket]);

  const onEmojiClick = useCallback((emojiData) => {
    setText((prev) => prev + emojiData.emoji);
    setShowPicker(false);
  }, []);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = typeof reader.result === 'string' ? reader.result : '';
      if (base64) {
        socket.emit('send_message', { imageUrl: base64 });
      }
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  }, [socket]);

  const send = useCallback(() => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return;
    }

    socket.emit('send_message', { text: trimmedText });
    socket.emit('typing', { isTyping: false });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    setText('');
  }, [socket, text]);

  const handleReaction = useCallback((messageId, emoji) => {
    socket.emit('toggle_reaction', { messageId, emoji });
  }, [socket]);

  return (
    <div className="card chat-window" style={{ flexDirection: 'row' }}>
      <div className="user-sidebar">
        <h4>Users ({users.length})</h4>
        <ul>
          {users.map((u) => (
            <li key={u} style={{ color: u === username ? '#6366f1' : 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{u === username ? 'You' : u}</span>
              {isCreator && u !== username && (
                <button
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to kick ${u}?`)) {
                      socket.emit('kick_user', { targetUsername: u });
                    }
                  }}
                  style={{
                    background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px',
                    padding: '2px 6px', fontSize: '0.7rem', cursor: 'pointer', opacity: 0.9,
                    transition: 'all 0.2s', marginLeft: '8px'
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '1'}
                  onMouseLeave={(e) => e.target.style.opacity = '0.9'}
                >
                  Kick
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div className="chat-header">
          <h3>#{room}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.9em', color: '#4ade80' }}>{CONNECTED_DOT} Connected</span>
            <button
              onClick={() => setSoundEnabled((prev) => !prev)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.2rem',
                cursor: 'pointer',
                opacity: soundEnabled ? 1 : 0.5,
                transition: 'opacity 0.2s'
              }}
              title={soundEnabled ? 'Disable Sound' : 'Enable Sound'}
              aria-label={soundEnabled ? 'Disable sound notifications' : 'Enable sound notifications'}
            >
              {SPEAKER_ICON}
            </button>
          </div>
        </div>

        <div className="chat-body">
          {messages.map((m) => {
            const isMe = m.username === username;
            return (
              <div key={m._id} className={`message ${isMe ? 'me' : 'other'}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                {!isMe && <Avatar username={m.username} size={32} />}

                <div style={{ flex: 1 }}>
                  {!isMe && <span className="username-label" style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>{m.username}</span>}

                  {m.imageUrl && (
                    <img
                      src={m.imageUrl}
                      alt="uploaded"
                      style={{ maxWidth: '100%', borderRadius: 12, marginTop: 5, marginBottom: 5, display: 'block', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}
                    />
                  )}

                  {m.text && <span style={{ display: 'block', marginBottom: '4px' }}>{m.text}</span>}

                  <span className="message-meta" style={{ fontSize: '0.7rem', opacity: 0.6 }}>
                    {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>

                  <div className="message-reactions" style={{ marginTop: '8px' }}>
                    {m.reactions && m.reactions.map((reaction, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleReaction(m._id, reaction.emoji)}
                        style={{
                          background: reaction.users.includes(username) ? 'var(--primary-color)' : 'var(--glass-bg)',
                          color: reaction.users.includes(username) ? 'white' : 'var(--text-secondary)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: 16,
                          padding: '4px 8px',
                          marginRight: 6,
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          transition: 'all 0.2s',
                          backdropFilter: 'blur(10px)'
                        }}
                        onMouseEnter={(e) => e.target.style.transform = 'scale(1.1)'}
                        onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                      >
                        {reaction.emoji} {reaction.users.length}
                      </button>
                    ))}
                    <button
                      onClick={() => handleReaction(m._id, THUMBS_UP)}
                      style={{
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: 16,
                        padding: '4px 8px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        transition: 'all 0.2s',
                        backdropFilter: 'blur(10px)'
                      }}
                      onMouseEnter={(e) => e.target.style.transform = 'scale(1.1)'}
                      onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                    >
                      {THUMBS_UP}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {typing && <div className="typing-indicator">{typing}</div>}
          <div ref={bottomRef} />
        </div>

        <div className="chat-footer">
          {showPicker && (
            <div style={{
              position: 'absolute',
              bottom: '80px',
              left: '20px',
              zIndex: 100,
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--glass-border)',
              borderRadius: '16px',
              boxShadow: 'var(--shadow)',
              overflow: 'hidden'
            }}>
              <Suspense fallback={<div style={{ padding: '16px', color: 'var(--text-secondary)' }}>Loading...</div>}>
                <EmojiPicker onEmojiClick={onEmojiClick} theme="dark" />
              </Suspense>
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*"
            style={{ display: 'none' }}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', paddingRight: '10px', color: '#94a3b8' }}
            title="Send Image"
            aria-label="Send image"
          >
            {CAMERA_ICON}
          </button>

          <button
            onClick={() => setShowPicker((prev) => !prev)}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', paddingRight: '10px' }}
            aria-label="Open emoji picker"
          >
            {SMILE_ICON}
          </button>
          <input
            className="input-field"
            value={text}
            onChange={handleInput}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Type a message..."
          />
          <button className="send-btn" onClick={send} disabled={!text.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
