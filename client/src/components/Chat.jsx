import React, { useEffect, useState, useRef } from 'react';
import EmojiPicker from 'emoji-picker-react';

export default function Chat({ username, room, socket }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [users, setUsers] = useState([]);
  const [typing, setTyping] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    socket.emit('join_room', { room, username });

    fetch(`http://localhost:4000/messages?room=${room}`)
      .then(r => r.json())
      .then(data => setMessages(data))
      .catch(err => console.error(err));

    socket.on('receive_message', msg => {
      setMessages(prev => [...prev, msg]);
      const audio = new Audio('https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3');
      audio.volume = 0.5;
      audio.play().catch(e => console.log('Audio play failed', e));
    });

    socket.on('room_users', (userList) => {
      setUsers([...new Set(userList)]);
    });

    socket.on('typing_status', ({ username: typer, isTyping }) => {
      if (isTyping) {
        setTyping(`${typer} is typing...`);
      } else {
        setTyping('');
      }
    });

    return () => {
      socket.off('receive_message');
      socket.off('room_users');
      socket.off('typing_status');
    }
  }, [socket, room, username]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const handleInput = (e) => {
    setText(e.target.value);
    socket.emit('typing', { room, isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', { room, isTyping: false });
    }, 2000);
  }

  const onEmojiClick = (emojiData) => {
    setText(prev => prev + emojiData.emoji);
    setShowPicker(false);
  };

  const handleFileSelect = (e) => {
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
  };

  function send() {
    if (!text.trim()) return;
    socket.emit('send_message', { username, text, room });
    socket.emit('typing', { room, isTyping: false });
    setText('');
  }

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
          <span style={{ fontSize: '0.9em', color: '#4ade80' }}>● Connected</span>
        </div>

        <div className="chat-body">
          {messages.map(m => {
            const isMe = m.username === username;
            return (
              <div key={m._id ?? crypto.randomUUID()} className={`message ${isMe ? 'me' : 'other'}`}>
                {!isMe && <span className="username-label">{m.username}</span>}

                {m.imageUrl && (
                  <img
                    src={m.imageUrl}
                    alt="uploaded"
                    style={{ maxWidth: '100%', borderRadius: 8, marginTop: 5, marginBottom: 5, display: 'block' }}
                  />
                )}

                {m.text && <span>{m.text}</span>}

                <span className="message-meta">
                  {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            );
          })}
          {typing && <div className="typing-indicator">{typing}</div>}
          <div ref={bottomRef} />
        </div>

        <div className="chat-footer">
          {showPicker && (
            <div style={{ position: 'absolute', bottom: '80px', left: '20px', zIndex: 100 }}>
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
          <button className="send-btn" onClick={send}>Send</button>
        </div>
      </div>
    </div>
  );
}
