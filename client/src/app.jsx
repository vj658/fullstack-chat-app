import React, { useEffect, useState } from 'react'
import Chat from './components/Chat'
import { socket } from './socket'


export default function App() {
    const [user, setUser] = useState(null); // { username, token }
    const [room, setRoom] = useState('');
    const [joined, setJoined] = useState(false);
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

    // Auth Form State
    const [isLogin, setIsLogin] = useState(true);
    const [authUsername, setAuthUsername] = useState('');
    const [authPassword, setAuthPassword] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        document.body.className = theme;
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    };

    useEffect(() => {
        // Check for token
        const token = localStorage.getItem('token');
        if (token) {
            fetch('http://localhost:4000/auth/me', {
                headers: { Authorization: `Bearer ${token}` }
            })
                .then(r => {
                    if (r.ok) return r.json();
                    throw new Error('Invalid token');
                })
                .then(data => {
                    setUser({ username: data.username, token });
                })
                .catch(() => localStorage.removeItem('token'));
        }

        socket.on('connect', () => console.log('connected', socket.id));
        return () => socket.off('connect');
    }, [])

    async function handleAuth(e) {
        e.preventDefault();
        setError('');
        const endpoint = isLogin ? '/auth/login' : '/auth/register';

        try {
            const res = await fetch(`http://localhost:4000${endpoint}`, {
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
    }

    function handleJoin(e) {
        if (e && e.key && e.key !== 'Enter') return;
        if (!room.trim()) return alert('Enter a room');
        setJoined(true);
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
                            <input className="input-field" value={authUsername} onChange={e => setAuthUsername(e.target.value)} required />
                        </div>
                        <div className="input-group">
                            <label className="label">Password</label>
                            <input className="input-field" type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required />
                        </div>
                        <button className="btn-primary" type="submit">{isLogin ? 'Login' : 'Sign Up'}</button>
                    </form>

                    <p style={{ marginTop: 20, fontSize: '0.9rem', color: '#94a3b8' }}>
                        {isLogin ? "Don't have an account? " : "Already have an account? "}
                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontWeight: 'bold' }}>
                            {isLogin ? 'Sign Up' : 'Login'}
                        </button>
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="app-container">
            {!joined ? (
                <div className="card join-card" style={{ animation: 'fadeIn 0.6s ease-out' }}>
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
                                {theme === 'light' ? '🌙' : '☀️'}
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

                    <h2 style={{ color: 'var(--text-primary)', marginBottom: 30 }}>Join Room</h2>
                    <div className="input-group">
                        <label className="label">Room Name</label>
                        <input
                            className="input-field"
                            value={room}
                            onChange={e => setRoom(e.target.value)}
                            onKeyDown={handleJoin}
                            placeholder="e.g. General"
                            style={{
                                background: 'var(--glass-bg)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-primary)'
                            }}
                        />
                    </div>
                    <button
                        className="btn-primary"
                        onClick={() => handleJoin()}
                        style={{
                            background: 'var(--primary-color)',
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)'
                        }}
                        onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
                        onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
                    >
                        Enter Room
                    </button>
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
    )
}