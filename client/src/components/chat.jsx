import React, { useEffect, useState, useRef } from 'react';

export default function Chat({ username, socket }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    // Fetch messages from backend
    fetch('http://localhost:4000/messages')
      .then(r => r.json())
      .then(data => setMessages(data))
      .catch(err => console.error(err));

    // Listen for new messages
    socket.on('receive_message', msg => {
      setMessages(prev => [...prev, msg]);
    });

    return () => socket.off('receive_message');
  }, [socket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send() {
    if (!text.trim()) return;
    socket.emit('send_message', { username, text });
    setText('');
  }

  return (
    <div>
      <h3>Chat — logged in as {username}</h3>

      <div style={{ border: '1px solid #ddd', height: 400, overflow: 'auto', padding: 10 }}>
        {messages.map(m => (
          <div key={m._id ?? crypto.randomUUID()} style={{ marginBottom: 8 }}>
            <strong>{m.username}</strong>: <span>{m.text}</span>
            <div style={{ fontSize: 11, color: '#666' }}>
              {m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ marginTop: 10 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Type a message"
          style={{ width: '70%' }}
        />
        <button onClick={send}>Send</button>
      </div>
    </div>
  );
}
