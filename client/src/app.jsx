import React, { useEffect, useState } from 'react';
import Chat from './components/Chat';
import { socket } from './socket';
import { API_URL } from './config';
import { Moon, Sun, LogOut, MessageSquarePlus, MessageSquare, Plus, Hash, Trash2, LogIn, UserPlus } from 'lucide-react';

export default function App() {
    const [user, setUser] = useState(null); // { username, token }
    const [room, setRoom] = useState('');
    const [joined, setJoined] = useState(false);
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

    // Room Features State
    const [roomPassword, setRoomPassword] = useState('');
    const [joinMode, setJoinMode] = useState('join');
    const [dmUsername, setDmUsername] = useState('');
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

    async function handleDMSubmit(e) {
        if (e && e.key && e.key !== 'Enter') return;

        const trimmedTarget = dmUsername.trim();
        if (!trimmedTarget) {
            setRoomError('Enter a username to continue.');
            return;
        }

        setRoomError('');
        try {
            const res = await fetch(`${API_URL}/rooms/dm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${user.token}`
                },
                body: JSON.stringify({ targetUsername: trimmedTarget })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to process direct message');
            }

            setRoom(data.name);
            setJoined(true);
            setDmUsername('');
        } catch (err) {
            setRoomError(err.message);
        }
    }

    if (!user) {
        return (
            <div className="app-wrapper">
                <div className="bg-mesh"></div>
                <div className="glass-panel auth-container">
                    <div className="auth-header-row">
                        <h2>{isLogin ? 'Welcome Back' : 'Get Started'}</h2>
                        <button className="btn-icon" onClick={toggleTheme}>
                            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                        </button>
                    </div>
                    {error && <p className="text-danger text-sm">{error}</p>}

                    <form onSubmit={handleAuth} className="flex-col gap-4">
                        <div>
                            <label className="input-label">Username</label>
                            <input className="modern-input" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} required placeholder="Enter your username" />
                        </div>
                        <div>
                            <label className="input-label">Password</label>
                            <input className="modern-input" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required placeholder="Enter your password" />
                        </div>
                        <button className="btn btn-primary w-full mt-4" type="submit">
                            {isLogin ? <LogIn size={18} /> : <UserPlus size={18} />}
                            {isLogin ? 'Sign In' : 'Create Account'}
                        </button>
                    </form>

                    <p className="text-sm text-muted" style={{ textAlign: 'center', margin: 0 }}>
                        {isLogin ? "Don't have an account? " : "Already have an account? "}
                        <button
                            onClick={() => {
                                setIsLogin(!isLogin);
                                setError('');
                            }}
                            className="btn-ghost"
                            style={{ fontWeight: 600, padding: 0 }}
                        >
                            {isLogin ? 'Sign Up' : 'Sign In'}
                        </button>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="app-wrapper">
            <div className="bg-mesh"></div>
            {!joined ? (
                <div className="glass-panel" style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', padding: '2.5rem' }}>
                    <div className="flex-row justify-between mb-4 pb-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                        <div>
                            <h2 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Dashboard</h2>
                            <p className="text-muted" style={{ marginTop: 4 }}>Logged in as <span className="text-primary-color" style={{ fontWeight: 'bold' }}>{user.username}</span></p>
                        </div>
                        <div className="flex-row gap-2">
                            <button className="btn-icon" onClick={toggleTheme} title="Toggle Theme" style={{ border: '1px solid var(--glass-border)' }}>
                                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                            </button>
                            <button className="btn btn-glass" onClick={handleLogout} title="Logout">
                                <LogOut size={16} /> Logout
                            </button>
                        </div>
                    </div>

                    <div className="tabs mb-4">
                        <button
                            className={`tab ${joinMode === 'join' ? 'active' : ''}`}
                            onClick={() => { setJoinMode('join'); setRoomError(''); }}
                        >
                            <Hash size={18} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} /> Join Room
                        </button>
                        <button
                            className={`tab ${joinMode === 'create' ? 'active' : ''}`}
                            onClick={() => { setJoinMode('create'); setRoomError(''); }}
                        >
                            <Plus size={18} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} /> Create Room
                        </button>
                        <button
                            className={`tab ${joinMode === 'dm' ? 'active' : ''}`}
                            onClick={() => { setJoinMode('dm'); setRoomError(''); }}
                        >
                            <MessageSquarePlus size={18} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} /> Direct Message
                        </button>
                    </div>

                    {joinMode !== 'dm' ? (
                        <div className="flex-col gap-3 mb-4 p-4" style={{ background: 'var(--glass-bg)', borderRadius: 16 }}>
                            <div>
                                <label className="input-label">Room Name</label>
                                <input
                                    className="modern-input"
                                    value={room}
                                    onChange={(e) => {
                                        setRoom(e.target.value);
                                        setRoomError('');
                                    }}
                                    onKeyDown={handleRoomSubmit}
                                    placeholder="e.g. general"
                                />
                            </div>
                            <div>
                                <label className="input-label">Password (Optional)</label>
                                <input
                                    className="modern-input"
                                    type="password"
                                    value={roomPassword}
                                    onChange={(e) => setRoomPassword(e.target.value)}
                                    onKeyDown={handleRoomSubmit}
                                    placeholder={joinMode === 'create' ? "Set a password to make it private" : "Enter password if room is private"}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="flex-col gap-3 mb-4 p-4" style={{ background: 'var(--glass-bg)', borderRadius: 16 }}>
                            <div>
                                <label className="input-label">Target Username</label>
                                <input
                                    className="modern-input"
                                    value={dmUsername}
                                    onChange={(e) => {
                                        setDmUsername(e.target.value);
                                        setRoomError('');
                                    }}
                                    onKeyDown={handleDMSubmit}
                                    placeholder="Enter their username EXACTLY"
                                />
                            </div>
                        </div>
                    )}

                    {roomError && <p className="text-danger text-sm mb-4">{roomError}</p>}
                    <button
                        className="btn btn-primary w-full mb-4"
                        onClick={(e) => joinMode === 'dm' ? handleDMSubmit(e) : handleRoomSubmit(e)}
                    >
                        {joinMode === 'create' ? 'Create Room' : joinMode === 'dm' ? 'Start Chat' : 'Enter Room'}
                    </button>

                    <div className="flex-row gap-4 mt-4" style={{ flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 300px' }}>
                            <h4 className="text-sm text-muted mb-2" style={{ fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Created Rooms</h4>
                            {history.createdRooms.length === 0 ? <p className="text-xs text-muted">No instances.</p> : null}
                            <div className="flex-col gap-1">
                                {history.createdRooms.map(r => (
                                    <div key={r} className="list-item">
                                        <div className="flex-row gap-2" onClick={() => { setRoom(r); setJoinMode('join'); }} style={{ flex: 1 }}>
                                            <Hash size={16} className="text-primary-color" />
                                            <span className="list-item-title">{r}</span>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteRoom(r)}
                                            className="btn-icon text-danger"
                                            title="Delete room"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ flex: '1 1 300px' }}>
                            <h4 className="text-sm text-muted mb-2" style={{ fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Joined Rooms</h4>
                            {history.joinedRooms.length === 0 ? <p className="text-xs text-muted">No instances.</p> : null}
                            <div className="flex-col gap-1">
                                {history.joinedRooms.map(r => (
                                    <div key={r} className="list-item">
                                        <div className="flex-row gap-2" onClick={() => { setRoom(r); setJoinMode('join'); }} style={{ flex: 1 }}>
                                            <MessageSquare size={16} className="text-primary-color" />
                                            <span className="list-item-title">{r}</span>
                                        </div>
                                        <button
                                            onClick={(e) => { setJoinMode('join'); handleRoomSubmit(null, r, ''); }}
                                            className="btn-glass text-xs p-2"
                                            style={{ padding: '4px 10px' }}
                                        >
                                            Join
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ marginBottom: 15, display: 'flex', justifyContent: 'flex-end', width: '100%', maxWidth: 1200 }}>
                        <button className="btn btn-glass" onClick={() => setJoined(false)}>
                            <LogOut size={16} /> Leave Room
                        </button>
                    </div>
                    <Chat username={user.username} room={room} socket={socket} onLeave={() => setJoined(false)} />
                </div>
            )}
        </div>
    );
}
