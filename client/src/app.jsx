import React, { useEffect, useState } from 'react';
import Chat from './components/Chat';
import { socket } from './socket';
import { API_URL } from './config';

export default function App() {
    const [user, setUser] = useState(null); // { username, token }
    const [room, setRoom] = useState('');
    const [joined, setJoined] = useState(false);
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
    
    // Room Features State
    const [roomPassword, setRoomPassword] = useState('');
    const [joinMode, setJoinMode] = useState('join');
    const [history, setHistory] = useState({ createdRooms: [], joinedRooms: [] });

    // Auth Form State
    const [isLogin, setIsLogin] = useState(true);
    const [authUsername, setAuthUsername] = useState('');
    const [authPassword, setAuthPassword] = useState('');
    const [error, setError] = useState('');
    const [roomError, setRoomError] = useState('');

    useEffect(() => {
        document.body.className = theme;
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    };

    useEffect(() => {
        let isMounted = true;
        const handleSocketConnect = () => console.info('Socket connected', socket.id);

        const token = localStorage.getItem('token');
        if (token) {
            fetch(`${API_URL}/auth/me`, {
                headers: { Authorization: `Bearer ${token}` }
            })
                .then((r) => {
                    if (r.ok) return r.json();
                    throw new Error('Invalid token');
                })
                .then((data) => {
                    if (isMounted) {
                        setUser({ username: data.username, token });
                    }
                })
                .catch(() => {
                    localStorage.removeItem('token');
                    if (isMounted) {
                        setUser(null);
                    }
                });
        }

        socket.on('connect', handleSocketConnect);

        return () => {
            isMounted = false;
            socket.off('connect', handleSocketConnect);
        };
    }, []);

    async function handleAuth(e) {
        e.preventDefault();
        setError('');
        const endpoint = isLogin ? '/auth/login' : '/auth/register';

        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: authUsername, password: authPassword })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error);

            localStorage.setItem('token', data.token);
            setUser({ username: data.username, token: data.token });
        } catch (err) {
            setError(err.message);
        }
    }

    function handleLogout() {
        localStorage.removeItem('token');
        setUser(null);
        setJoined(false);
        setRoom('');
        setRoomPassword('');
        setRoomError('');
    }

    useEffect(() => {
        if (user && !joined) {
            fetchHistory();
        }
    }, [user, joined]);

    async function fetchHistory() {
        try {
            const res = await fetch(`${API_URL}/rooms/history`, {
                headers: { Authorization: `Bearer ${user.token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setHistory(data);
            }
        } catch (err) {
            console.error('Failed to fetch history');
        }
    }

    async function handleDeleteRoom(roomName) {
        if (!window.confirm(`Are you sure you want to delete the room "${roomName}"?`)) return;
        try {
            const res = await fetch(`${API_URL}/rooms/${roomName}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${user.token}` }
            });
            if (res.ok) {
                fetchHistory();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to delete room');
            }
        } catch (err) {
            console.error('Failed to delete room');
        }
    }

    async function handleRoomSubmit(e, overrideRoom, overridePassword = '') {
        if (e && e.key && e.key !== 'Enter') return;
        
        const trimmedRoom = (overrideRoom || room).trim();
        const pwd = overrideRoom ? overridePassword : roomPassword;

        if (!trimmedRoom) {
            setRoomError('Enter a room name to continue.');
            return;
        }

        setRoomError('');
        const endpoint = joinMode === 'create' ? '/rooms/create' : '/rooms/join';
        
        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${user.token}`
                },
                body: JSON.stringify({ name: trimmedRoom, password: pwd })
            });

            const data = await res.json();
            if (!res.ok) {
                // If it's a direct join from history and missing password
                if (data.error && data.error.toLowerCase().includes('password') && overrideRoom) {
                    setRoomError('Password required. Select the room, enter password, and join.');
                    setRoom(trimmedRoom);
                } else {
                    throw new Error(data.error || 'Failed to process room');
                }
                return;
            }
            
            setRoom(trimmedRoom);
            setJoined(true);
            setRoomPassword('');
        } catch (err) {
            setRoomError(err.message);
        }
    }

    if (!user) {
        return (
            <div className="app-container">
                <div className="card join-card">
                    <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
                    {error && <p style={{ color: 'red', fontSize: '0.9rem' }}>{error}</p>}

                    <form onSubmit={handleAuth}>
                        <div className="input-group">
                            <label className="label">Username</label>
                            <input className="input-field" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} required />
                        </div>
                        <div className="input-group">
                            <label className="label">Password</label>
                            <input className="input-field" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required />
                        </div>
                        <button className="btn-primary" type="submit">{isLogin ? 'Login' : 'Sign Up'}</button>
                    </form>

                    <p style={{ marginTop: 20, fontSize: '0.9rem', color: '#94a3b8' }}>
                        {isLogin ? "Don't have an account? " : "Already have an account? "}
                        <button
                            onClick={() => {
                                setIsLogin(!isLogin);
                                setError('');
                            }}
                            style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            {isLogin ? 'Sign Up' : 'Login'}
                        </button>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="app-container">
            {!joined ? (
                <div className="card join-card" style={{ animation: 'fadeIn 0.6s ease-out', maxWidth: '600px', width: '90%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h3 style={{ color: 'var(--text-primary)' }}>Hi, {user.username}</h3>
                        <div>
                            <button
                                onClick={toggleTheme}
                                style={{
                                    background: 'var(--glass-bg)',
                                    backdropFilter: 'blur(10px)',
                                    border: '1px solid var(--glass-border)',
                                    color: 'var(--text-secondary)',
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    marginRight: 10,
                                    transition: 'all 0.2s',
                                    fontSize: '1.2rem'
                                }}
                                onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                                onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                            >
                                {theme === 'light' ? '\uD83C\uDF19' : '\u2600\uFE0F'}
                            </button>
                            <button
                                onClick={handleLogout}
                                style={{
                                    background: 'var(--glass-bg)',
                                    backdropFilter: 'blur(10px)',
                                    border: '1px solid var(--glass-border)',
                                    color: 'var(--text-secondary)',
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                                onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                            >
                                Logout
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', marginBottom: 20 }}>
                        <button 
                            onClick={() => { setJoinMode('join'); setRoomError(''); }}
                            style={{ flex: 1, padding: '10px', background: joinMode === 'join' ? 'var(--primary-color)' : 'transparent', color: joinMode === 'join' ? '#fff' : 'var(--text-primary)', border: '1px solid var(--primary-color)', borderRadius: '8px 0 0 8px', cursor: 'pointer', transition: 'all 0.2s' }}
                        >Join Room</button>
                        <button 
                            onClick={() => { setJoinMode('create'); setRoomError(''); }}
                            style={{ flex: 1, padding: '10px', background: joinMode === 'create' ? 'var(--primary-color)' : 'transparent', color: joinMode === 'create' ? '#fff' : 'var(--text-primary)', border: '1px solid var(--primary-color)', borderRadius: '0 8px 8px 0', cursor: 'pointer', transition: 'all 0.2s' }}
                        >Create Room</button>
                    </div>

                    <h2 style={{ color: 'var(--text-primary)', marginBottom: 20 }}>{joinMode === 'create' ? 'Create a New Room' : 'Join an Existing Room'}</h2>
                    
                    <div className="input-group">
                        <label className="label">Room Name</label>
                        <input
                            className="input-field"
                            value={room}
                            onChange={(e) => {
                                setRoom(e.target.value);
                                setRoomError('');
                            }}
                            onKeyDown={handleRoomSubmit}
                            placeholder="e.g. General"
                            style={{
                                background: 'var(--glass-bg)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-primary)'
                            }}
                        />
                    </div>
                    <div className="input-group">
                        <label className="label">Password (Optional)</label>
                        <input
                            className="input-field"
                            type="password"
                            value={roomPassword}
                            onChange={(e) => setRoomPassword(e.target.value)}
                            onKeyDown={handleRoomSubmit}
                            placeholder={joinMode === 'create' ? "Set a password to make it private" : "Enter password if room is private"}
                            style={{
                                background: 'var(--glass-bg)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-primary)'
                            }}
                        />
                    </div>

                    {roomError && <p style={{ color: '#f87171', fontSize: '0.9rem', marginTop: -10, marginBottom: 20 }}>{roomError}</p>}
                    <button
                        className="btn-primary"
                        onClick={(e) => handleRoomSubmit(e)}
                        style={{
                            background: 'var(--primary-color)',
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)'
                        }}
                        onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
                        onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
                    >
                        {joinMode === 'create' ? 'Create Room' : 'Enter Room'}
                    </button>

                    <div style={{ marginTop: 30, textAlign: 'left' }}>
                        <h3 style={{ color: 'var(--text-primary)', marginBottom: 15, fontSize: '1.2rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: 10 }}>Room History</h3>
                        
                        <div style={{ display: 'flex', gap: '20px', flexDirection: 'row' }}>
                            <div style={{ flex: 1 }}>
                                <h4 style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: '0.95rem' }}>Created Rooms</h4>
                                {history.createdRooms.length === 0 ? <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No instances.</p> : null}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {history.createdRooms.map(r => (
                                        <div key={r} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--glass-bg)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                                            <span 
                                                style={{ color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 'bold' }} 
                                                onClick={() => { setRoom(r); setJoinMode('join'); }}
                                            >
                                                {r}
                                            </span>
                                            <button 
                                                onClick={() => handleDeleteRoom(r)}
                                                style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 10px', fontSize: '0.75rem', cursor: 'pointer', transition: 'background 0.2s' }}
                                                onMouseEnter={(e) => e.target.style.background = '#dc2626'}
                                                onMouseLeave={(e) => e.target.style.background = '#ef4444'}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            <div style={{ flex: 1 }}>
                                <h4 style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: '0.95rem' }}>Joined Rooms</h4>
                                {history.joinedRooms.length === 0 ? <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No instances.</p> : null}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {history.joinedRooms.map(r => (
                                        <div key={r} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--glass-bg)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                                            <span 
                                                style={{ color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 'bold' }} 
                                                onClick={() => { setRoom(r); setJoinMode('join'); }}
                                            >
                                                {r}
                                            </span>
                                            <button 
                                                onClick={(e) => { setJoinMode('join'); handleRoomSubmit(null, r, ''); }}
                                                style={{ background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 10px', fontSize: '0.75rem', cursor: 'pointer', transition: 'background 0.2s' }}
                                                onMouseEnter={(e) => e.target.style.background = '#4f46e5'}
                                                onMouseLeave={(e) => e.target.style.background = 'var(--primary-color)'}
                                            >
                                                Join
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.6s ease-out' }}>
                    <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={() => setJoined(false)}
                            style={{
                                background: 'var(--glass-bg)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-primary)',
                                padding: '8px 16px',
                                borderRadius: 8,
                                cursor: 'pointer',
                                marginRight: 10,
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                            onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                        >
                            Leave Room
                        </button>
                    </div>
                    <Chat username={user.username} room={room} socket={socket} />
                </div>
            )}
        </div>
    );
}
