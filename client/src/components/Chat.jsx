import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import EmojiPicker from 'emoji-picker-react';
import { API_URL } from '../config';

const notificationSound = new Audio('https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3');
notificationSound.volume = 0.5;

// Avatar component
const Avatar = ({ username, size = 32 }) => {
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
};

export default function Chat({ username, room, socket }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [users, setUsers] = useState([]);
  const [typing, setTyping] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(localStorage.getItem('soundEnabled') !== 'false');
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    socket.emit('join_room', { room, username });

    fetch(`${API_URL}/messages?room=${room}`)
      .then(r => r.json())
      .then(data => setMessages(data))
      .catch(err => console.error(err));

    const handleReceiveMessage = (msg) => {
      setMessages(prev => [...prev, msg]);
      notificationSound.play().catch(e => console.log('Audio play failed', e));
    };

    const handleRoomUsers = (userList) => {
      setUsers([...new Set(userList)]);
    };

    const handleTypingStatus = ({ username: typer, isTyping }) => {
      if (isTyping) {
        setTyping(`${typer} is typing...`);
      } else {
        setTyping('');
      }
    };

    const handleMessageUpdated = (updatedMessage) => {
      setMessages(prev => prev.map(m => m._id === updatedMessage._id ? updatedMessage : m));
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('room_users', handleRoomUsers);
    socket.on('typing_status', handleTypingStatus);
    socket.on('message_updated', handleMessageUpdated);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('room_users', handleRoomUsers);
      socket.off('typing_status', handleTypingStatus);
      socket.off('message_updated', handleMessageUpdated);
    }
  }, [socket, room, username]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const handleInput = useCallback((e) => {
    setText(e.target.value);
    socket.emit('typing', { room, isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', { room, isTyping: false });
    }, 2000);
  }, [socket, room]);

  const onEmojiClick = useCallback((emojiData) => {
    setText(prev => prev + emojiData.emoji);
    setShowPicker(false);
  }, []);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        // Send image message immediately
        socket.emit('send_message', { username, text: '', imageUrl: base64, room });
      };
      reader.readAsDataURL(file);
    }
  }, [socket, username, room]);

  const send = useCallback(() => {
    if (!text.trim()) return;
    socket.emit('send_message', { username, text, room });
    socket.emit('typing', { room, isTyping: false });
    setText('');
  }, [socket, username, text, room]);

  const addReaction = useCallback((messageId, emoji) => {
    socket.emit('add_reaction', { messageId, emoji, username, room });
  }, [socket, username, room]);

  const handleReaction = useCallback((messageId, emoji) => {
    socket.emit('toggle_reaction', { messageId, emoji, username, room });
  }, [socket, username, room]);

  return (
    <div className="card chat-window" style={{ flexDirection: 'row' }}>

      <div className="user-sidebar">
        <h4>Users ({users.length})</h4>
        <ul>
          {users.map((u, i) => (
            <li key={i} style={{ color: u === username ? '#6366f1' : 'inherit' }}>
              {u === username ? 'You' : u}
            </li>
          ))}
        </ul>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div className="chat-header">
          <h3>#{room}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.9em', color: '#4ade80' }}>● Connected</span>
            <button
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                localStorage.setItem('soundEnabled', !soundEnabled);
              }}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.2rem',
                cursor: 'pointer',
                opacity: soundEnabled ? 1 : 0.5,
                transition: 'opacity 0.2s'
              }}
              title={soundEnabled ? 'Disable Sound' : 'Enable Sound'}
            >
              🔊
            </button>
          </div>
        </div>

        <div className="chat-body">
          {messages.map(m => {
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

                  {/* Reactions */}
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
                      onClick={() => addReaction(m._id, '👍')}
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
                      👍
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
              <EmojiPicker onEmojiClick={onEmojiClick} theme="dark" />
            </div>
          )}

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*"
            style={{ display: 'none' }}
          />

          <button
            onClick={() => fileInputRef.current.click()}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', paddingRight: '10px', color: '#94a3b8' }}
            title="Send Image"
          >
            📷
          </button>

          <button
            onClick={() => setShowPicker(!showPicker)}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', paddingRight: '10px' }}>
            😀
          </button>
          <input
            className="input-field"
            value={text}
            onChange={handleInput}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Type a message..."
          />
          <button className="send-btn" onClick={send} disabled={isSending}>
            {isSending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
