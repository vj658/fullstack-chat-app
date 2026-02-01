require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const Message = require('./models/Message');

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'chat-server' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

// CREATE EXPRESS APP
const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

// MIDDLEWARE
app.use(express.json());
app.use(cors({ origin: CLIENT_ORIGIN }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/auth/', limiter);

// HEALTH CHECK
app.get('/health', (req, res) => res.json({ ok: true }));

// --- AUTH ROUTES ---

// REGISTER
app.post('/auth/register', [
  body('username').isLength({ min: 3, max: 20 }).withMessage('Username must be 3-20 characters'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  try {
    const { username, password } = req.body;

    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username taken' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
    logger.info(`User registered: ${username}`);
    res.json({ token, username });
  } catch (err) {
    logger.error('Registration error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// LOGIN
app.post('/auth/login', [
  body('username').isLength({ min: 3, max: 20 }).withMessage('Username must be 3-20 characters'),
  body('password').exists().withMessage('Password is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
    logger.info(`User logged in: ${username}`);
    res.json({ token, username });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET ME (VERIFY TOKEN)
app.get('/auth/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ username: decoded.username, id: decoded.id });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// GET MESSAGES
app.get('/messages', async (req, res) => {
  try {
    const { room } = req.query;
    if (!room) return res.json([]);

    const messages = await Message.find({ room }).sort({ createdAt: 1 }).limit(100);
    return res.json(messages);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// SOCKET.IO SETUP
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('join_room', ({ room, username }) => {
    socket.join(room);
    console.log(`User ${username} (${socket.id}) joined room: ${room}`);

    // Store user info in socket data
    socket.data.user = { room, username };

    // Get all users in this room
    const usersInRoom = [];
    const rooms = io.sockets.adapter.rooms.get(room);
    if (rooms) {
      rooms.forEach(socketId => {
        const clientSocket = io.sockets.sockets.get(socketId);
        if (clientSocket && clientSocket.data.user) {
          usersInRoom.push(clientSocket.data.user.username);
        }
      });
    }

    // Broadcast updated user list
    io.to(room).emit('room_users', usersInRoom);
  });

  socket.on('typing', ({ room, isTyping }) => {
    const username = socket.data.user?.username;
    if (username) {
      socket.to(room).emit('typing_status', { username, isTyping });
    }
  });

  socket.on('send_message', async (payload) => {
    try {
      const { username, text, room, imageUrl } = payload;
      if (!room) return;

      const msg = new Message({ username, text, room, imageUrl });
      await msg.save();

      io.to(room).emit('receive_message', msg);
    } catch (err) {
      console.error('Error saving message', err);
    }
  });

  socket.on('toggle_reaction', async ({ messageId, emoji, username, room }) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return;

      const existingReactionParams = msg.reactions.find(r => r.emoji === emoji);

      if (existingReactionParams) {
        if (existingReactionParams.users.includes(username)) {
          // Remove user
          existingReactionParams.users = existingReactionParams.users.filter(u => u !== username);
          // If empty, remove reaction group
          if (existingReactionParams.users.length === 0) {
            msg.reactions = msg.reactions.filter(r => r.emoji !== emoji);
          }
        } else {
          // Add user
          existingReactionParams.users.push(username);
        }
      } else {
        // Create new reaction
        msg.reactions.push({ emoji, users: [username] });
      }

      await msg.save();
      io.to(room).emit('message_updated', msg);
    } catch (err) {
      console.error('Error toggling reaction', err);
    }
  });

  socket.on('add_reaction', async ({ messageId, emoji, username, room }) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return;

      const existingReactionParams = msg.reactions.find(r => r.emoji === emoji);

      if (existingReactionParams) {
        if (!existingReactionParams.users.includes(username)) {
          existingReactionParams.users.push(username);
        }
      } else {
        msg.reactions.push({ emoji, users: [username] });
      }

      await msg.save();
      io.to(room).emit('message_updated', msg);
    } catch (err) {
      console.error('Error adding reaction', err);
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
    const user = socket.data.user;
    if (user) {
      const room = user.room;
      // Broadcast new list (minus this user)
      const usersInRoom = [];
      const rooms = io.sockets.adapter.rooms.get(room);
      if (rooms) {
        rooms.forEach(socketId => {
          const clientSocket = io.sockets.sockets.get(socketId);
          if (clientSocket && clientSocket.data.user) {
            usersInRoom.push(clientSocket.data.user.username);
          }
        });
      }
      io.to(room).emit('room_users', usersInRoom);
    }
  });
});

// CONNECT MONGO + START SERVER
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });
