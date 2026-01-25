import React, { useEffect, useState } from 'react'
import Chat from './components/Chat'
import { socket } from './socket'


export default function App() {
    const [username, setUsername] = useState('');
    const [room, setRoom] = useState('');
    const [joined, setJoined] = useState(false);


    useEffect(() => {
        // reconnect logic can be added
        socket.on('connect', () => console.log('connected to socket', socket.id));
        return () => socket.off('connect');
    }, [])


    function handleJoin() {
        if (!username.trim() || !room.trim()) return alert('Enter a username and room');
        setJoined(true);
    }


    return (
        <div style={{ maxWidth: 800, margin: '20px auto', fontFamily: 'system-ui, sans-serif' }}>
            {!joined ? (
                <div>
                    <h2>Join a Chat Room</h2>
                    <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Your name" style={{ display: 'block', marginBottom: 10 }} />
                    <input value={room} onChange={e => setRoom(e.target.value)} placeholder="Room ID" style={{ display: 'block', marginBottom: 10 }} />
                    <button onClick={handleJoin}>Join</button>
                </div>
            ) : (
                <Chat username={username} room={room} socket={socket} />
            )}
        </div>
    )
}