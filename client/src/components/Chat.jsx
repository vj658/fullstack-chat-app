import React, { Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { API_URL } from '../config';
import { Volume2, VolumeX, Image as ImageIcon, Smile, Send, Users, ShieldAlert, Hash, ThumbsUp } from 'lucide-react';

const notificationSound = new Audio('https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3');
notificationSound.volume = 0.5;

const EmojiPicker = React.lazy(() => import('emoji-picker-react'));

const Avatar = React.memo(({ username, size = 32 }) => {
  const initials = username.slice(0, 2).toUpperCase();
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
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
        notificationSound.play().catch(() => { });
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
    <div className="glass-panel chat-layout">
      {/* Sidebar Overlay structure handles desktop cleanly, for mobile you'd want a Drawer but standard works here */}
      <div className="sidebar" style={{ display: typeof window !== 'undefined' && window.innerWidth < 601 ? 'none' : 'flex' }}>
        <div className="sidebar-header">
          <h4 className="flex-row gap-2" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Users size={16} /> Members ({users.length})
          </h4>
        </div>
        <div className="sidebar-content flex-col gap-1">
          {users.map((u) => (
            <div key={u} className="list-item" style={{ background: 'transparent', border: 'none', padding: '0.75rem', marginBottom: 0 }}>
              <span style={{ color: u === username ? 'var(--primary)' : 'var(--text-primary)', fontWeight: u === username ? '600' : '400' }}>
                {u === username ? 'You' : u}
              </span>
              {isCreator && u !== username && (
                <button
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to kick ${u}?`)) {
                      socket.emit('kick_user', { targetUsername: u });
                    }
                  }}
                  className="btn-icon text-danger"
                  style={{ padding: '0.25rem' }}
                  title={`Kick ${u}`}
                >
                  <ShieldAlert size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="chat-main" style={{ position: 'relative' }}>
        <div className="chat-header">
          <div className="flex-row gap-2">
            <Hash className="text-muted" size={24} />
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{room}</h3>
          </div>
          <div className="flex-row gap-4">
            <span className="flex-row gap-2 text-success text-sm" style={{ fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', display: 'inline-block', boxShadow: '0 0 8px var(--success)' }}></span>
              Connected
            </span>
            <button
              onClick={() => setSoundEnabled((prev) => !prev)}
              className="btn-icon"
              title={soundEnabled ? 'Disable Sound notifications' : 'Enable Sound notifications'}
              style={{ opacity: soundEnabled ? 1 : 0.5 }}
            >
              {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
          </div>
        </div>

        <div className="chat-messages">
          {messages.map((m) => {
            const isMe = m.username === username;
            return (
              <div key={m._id} className={`message-wrapper ${isMe ? 'me' : 'other'}`}>
                {!isMe && <Avatar username={m.username} size={36} />}

                <div className="message-content">
                  {!isMe && <span className="username-tag">{m.username}</span>}

                  {m.imageUrl && (
                    <img
                      src={m.imageUrl}
                      alt="uploaded"
                      style={{ maxWidth: '100%', borderRadius: 16, marginTop: 5, marginBottom: 5, display: 'block', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}
                    />
                  )}

                  {m.text && <div className="message-bubble">{m.text}</div>}

                  <span className="message-meta">
                    {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>

                  <div className="reactions-row">
                    {m.reactions && m.reactions.map((reaction, idx) => {
                      const isActive = reaction.users.includes(username);
                      return (
                        <button
                          key={idx}
                          onClick={() => handleReaction(m._id, reaction.emoji)}
                          className={`reaction-btn ${isActive ? 'active' : ''}`}
                          data-active={isActive}
                        >
                          {reaction.emoji} {reaction.users.length}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => handleReaction(m._id, '👍')}
                      className="reaction-btn"
                      title="React with Thumbs Up"
                    >
                      <ThumbsUp size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {typing && <div className="text-muted text-sm" style={{ fontStyle: 'italic', paddingLeft: '1rem', animation: 'fadeInUp 0.3s' }}>{typing}</div>}
          <div ref={bottomRef} style={{ height: 1 }} />
        </div>

        <div className="chat-input-area">
          {showPicker && (
            <div style={{
              position: 'absolute',
              bottom: '90px',
              left: '20px',
              zIndex: 100,
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--glass-border)',
              borderRadius: '16px',
              boxShadow: 'var(--panel-shadow)',
              overflow: 'hidden'
            }}>
              <Suspense fallback={<div style={{ padding: '16px', color: 'var(--text-secondary)' }}>Loading...</div>}>
                <EmojiPicker onEmojiClick={onEmojiClick} theme={localStorage.getItem('theme') || 'dark'} />
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
            className="btn-icon"
            title="Send Image"
          >
            <ImageIcon size={22} />
          </button>

          <button
            onClick={() => setShowPicker((prev) => !prev)}
            className="btn-icon"
            title="Choose Emoji"
          >
            <Smile size={22} />
          </button>

          <input
            className="modern-input"
            value={text}
            onChange={handleInput}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Type a message..."
            style={{ flex: 1, padding: '1rem' }}
          />
          <button className="btn btn-primary" onClick={send} disabled={!text.trim()} style={{ padding: '1rem' }}>
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
