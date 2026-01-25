import React, { useEffect, useState, useRef } from 'react';

export default function Chat({ username, room, socket }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    socket.emit('join_room', room);

    fetch(`http://localhost:4000/messages?room=${room}`)
      .then(r => r.json())
      .then(data => setMessages(data))
      .catch(err => console.error(err));

    socket.on('receive_message', msg => {
      setMessages(prev => [...prev, msg]);
    });

    return () => socket.off('receive_message');
  }, [socket, room]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  
  function send() {
    if (!text.trim()) return;
    socket.emit('send_message', { username, text, room });
    setText('');
  }

  return (
    <div className="card chat-window">
      <div className="chat-header">
        <h3>Live Chat <span style={{ fontSize: '0.8em', opacity: 0.6 }}>#{room}</span></h3>
        <span style={{ fontSize: '0.9em', color: '#4ade80' }}>● Online</span>
      </div>

      <div className="chat-body">
        {messages.map(m => {
          const isMe = m.username === username;
          return (
            <div key={m._id ?? crypto.randomUUID()} className={`message ${isMe ? 'me' : 'other'}`}>
              {!isMe && <span className="username-label">{m.username}</span>}
              <span>{m.text}</span>
              <span className="message-meta">
                {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="chat-footer">
        <input
          className="input-field"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Type a message..."
        />
        <button className="send-btn" onClick={send}>Send</button>
      </div>
    </div>
  );
}
