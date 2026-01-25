import React, { useEffect, useState } from 'react'
import Chat from './components/Chat'
import { socket } from './socket'


export default function App() {
    const [username, setUsername] = useState('');
    const [room, setRoom] = useState('');
    const [joined, setJoined] = useState(false);

    useEffect(() => {
        socket.on('connect', () => console.log('connected to socket', socket.id));
        return () => socket.off('connect');
    }, [])

    function handleJoin(e) {
        if (e && e.key && e.key !== 'Enter') return;
        if (!username.trim() || !room.trim()) return alert('Enter a username and room');
        setJoined(true);
    }

    return (
        <div className="app-container">
            {!joined ? (
                <div className="card join-card">
                    <h2>Join Chat</h2>
                    <div className="input-group">
                        <label className="label">Username</label>
                        <input
                            className="input-field"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            placeholder="e.g. Alice"
                        />
                    </div>
                    <div className="input-group">
                        <label className="label">Room ID</label>
                        <input
                            className="input-field"
                            value={room}
                            onChange={e => setRoom(e.target.value)}
                            onKeyDown={handleJoin}
                            placeholder="e.g. General"
                        />
                    </div>
                    <button className="btn-primary" onClick={() => handleJoin()}>Enter Room</button>
                </div>
            ) : (
                <Chat username={username} room={room} socket={socket} />
            )}
        </div>
    )
}