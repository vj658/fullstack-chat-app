require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Message = require('./models/Message');
const User = require('./models/User');
const Room = require('./models/Room');

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

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

if (!process.env.MONGO_URI) {
  logger.error('MONGO_URI is not configured');
  process.exit(1);
}

if (JWT_SECRET === 'secret123') {
  logger.warn('Using the default JWT secret. Set JWT_SECRET in the environment.');
}

function normalizeRoom(room) {
  return typeof room === 'string' ? room.trim() : '';
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

app.use(express.json({ limit: '2mb' }));
app.use(cors({ origin: CLIENT_ORIGIN }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/auth/', limiter);

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/auth/register', [
  body('username').trim().isLength({ min: 3, max: 20 }).withMessage('Username must be 3-20 characters'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  try {
    const username = normalizeText(req.body.username);
    const { password } = req.body;

    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username taken' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
    logger.info('User registered', { username });
    res.json({ token, username });
  } catch (err) {
    logger.error('Registration error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/auth/login', [
  body('username').trim().isLength({ min: 3, max: 20 }).withMessage('Username must be 3-20 characters'),
  body('password').exists().withMessage('Password is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  try {
    const username = normalizeText(req.body.username);
    const { password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
    logger.info('User logged in', { username });
    res.json({ token, username });
  } catch (err) {
    logger.error('Login error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

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

const requireAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.post('/rooms/create', requireAuth, async (req, res) => {
  try {
    const name = normalizeRoom(req.body.name);
    const password = req.body.password || '';
    if (!name) return res.status(400).json({ error: 'Room name required' });
    
    const existing = await Room.findOne({ name });
    if (existing) return res.status(400).json({ error: 'Room already exists. Please choose a different name.' });

    const isPrivate = Boolean(password);
    const hashedPassword = isPrivate ? await bcrypt.hash(password, 10) : '';

    const room = new Room({
      name,
      password: hashedPassword,
      creator: req.user.id,
      isPrivate
    });
    await room.save();

    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { createdRooms: name, joinedRooms: name }
    });

    res.json({ success: true, name, isPrivate });
  } catch (err) {
    logger.error('Room create error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/rooms/join', requireAuth, async (req, res) => {
  try {
    const name = normalizeRoom(req.body.name);
    const password = req.body.password || '';
    if (!name) return res.status(400).json({ error: 'Room name required' });

    let room = await Room.findOne({ name });
    if (!room) {
      return res.status(404).json({ error: 'Room does not exist. Please create it first.' });
    }
    
    if (room.isPrivate) {
      const user = await User.findById(req.user.id);
      const alreadyJoined = user.joinedRooms.includes(name);
      if (!alreadyJoined) {
        if (!password) return res.status(401).json({ error: 'Password required for this private room' });
        const isMatch = await bcrypt.compare(password, room.password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid password' });
      }
    }

    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { joinedRooms: name }
    });

    res.json({ success: true, name });
  } catch (err) {
    logger.error('Room join error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/rooms/history', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ createdRooms: user.createdRooms || [], joinedRooms: user.joinedRooms || [] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/rooms/:roomName', requireAuth, async (req, res) => {
  try {
    const name = normalizeRoom(req.params.roomName);
    const room = await Room.findOne({ name });
    if (!room) {
        await User.findByIdAndUpdate(req.user.id, { $pull: { createdRooms: name, joinedRooms: name } });
        return res.json({ success: true });
    }
    
    if (String(room.creator) !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this room' });
    }

    await Room.deleteOne({ _id: room._id });
    await Message.deleteMany({ room: name });
    await User.updateMany({}, { $pull: { joinedRooms: name, createdRooms: name } });

    res.json({ success: true });
  } catch (err) {
    logger.error('Room delete error', { err });
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/messages', async (req, res) => {
  try {
    const room = normalizeRoom(req.query.room);
    if (!room) return res.json([]);

    const messages = await Message.find({ room }).sort({ createdAt: 1 }).limit(100).lean();
    return res.json(messages);
  } catch (err) {
    logger.error('Fetch messages error', { err });
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST']
  }
});

function getUsersInRoom(socketServer, room) {
  const usersInRoom = [];
  const rooms = socketServer.sockets.adapter.rooms.get(room);
  if (rooms) {
    rooms.forEach((socketId) => {
      const clientSocket = socketServer.sockets.sockets.get(socketId);
      if (clientSocket?.data.user?.username) {
        usersInRoom.push(clientSocket.data.user.username);
      }
    });
  }
  return [...new Set(usersInRoom)];
}

function broadcastRoomUsers(room) {
  if (!room) {
    return;
  }
  io.to(room).emit('room_users', getUsersInRoom(io, room));
}

io.on('connection', (socket) => {
  logger.info('Socket connected', { socketId: socket.id });

  socket.on('join_room', async ({ room, username }) => {
    const normalizedRoom = normalizeRoom(room);
    const normalizedUsername = normalizeText(username);

    if (!normalizedRoom || !normalizedUsername) {
      return;
    }

    let isCreator = false;

    try {
      const roomDoc = await Room.findOne({ name: normalizedRoom });
      if (!roomDoc) {
        return; // Room does not exist, reject socket join
      }

      const user = await User.findOne({ username: normalizedUsername });
      if (roomDoc.isPrivate) {
        if (!user || (!user.joinedRooms.includes(normalizedRoom) && String(roomDoc.creator) !== String(user._id))) {
          // not authorized
          return;
        }
      }
        if (user && String(roomDoc.creator) === String(user._id)) {
          isCreator = true;
        }
    } catch(err) {
      logger.error('Room check error on socket join', { err });
    }

    const previousRoom = normalizeRoom(socket.data.user?.room);
    if (previousRoom && previousRoom !== normalizedRoom) {
      socket.leave(previousRoom);
      broadcastRoomUsers(previousRoom);
    }

    if (previousRoom !== normalizedRoom) {
      socket.join(normalizedRoom);
    }

    socket.data.user = { room: normalizedRoom, username: normalizedUsername };
    logger.info('User joined room', { username: normalizedUsername, room: normalizedRoom, socketId: socket.id });
    
    socket.emit('room_info', { isCreator });
    broadcastRoomUsers(normalizedRoom);
  });

  socket.on('leave_room', ({ room }) => {
    const activeRoom = normalizeRoom(socket.data.user?.room);
    const targetRoom = normalizeRoom(room) || activeRoom;

    if (!activeRoom || activeRoom !== targetRoom) {
      return;
    }

    socket.leave(targetRoom);
    socket.data.user = undefined;
    broadcastRoomUsers(targetRoom);
    logger.info('User left room', { room: targetRoom, socketId: socket.id });
  });

  socket.on('kick_user', async ({ targetUsername }) => {
    try {
      const activeRoom = normalizeRoom(socket.data.user?.room);
      const activeUsername = normalizeText(socket.data.user?.username);

      if (!activeRoom || !activeUsername || !targetUsername) return;

      const roomDoc = await Room.findOne({ name: activeRoom });
      if (!roomDoc) return;
      const requester = await User.findOne({ username: activeUsername });
      if (!requester || String(roomDoc.creator) !== String(requester._id)) return; // unauthorized

      const rooms = io.sockets.adapter.rooms.get(activeRoom);
      if (rooms) {
        for (const socketId of rooms) {
          const clientSocket = io.sockets.sockets.get(socketId);
          if (clientSocket?.data.user?.username === targetUsername) {
            clientSocket.leave(activeRoom);
            clientSocket.data.user = undefined;
            clientSocket.emit('kicked');
          }
        }
      }
      broadcastRoomUsers(activeRoom);
    } catch(err) {
      logger.error('Error kicking user', { err });
    }
  });

  socket.on('typing', ({ isTyping }) => {
    const activeRoom = normalizeRoom(socket.data.user?.room);
    const activeUsername = normalizeText(socket.data.user?.username);

    if (activeRoom && activeUsername) {
      socket.to(activeRoom).emit('typing_status', { username: activeUsername, isTyping: Boolean(isTyping) });
    }
  });

  socket.on('send_message', async ({ text, imageUrl }) => {
    try {
      const activeRoom = normalizeRoom(socket.data.user?.room);
      const activeUsername = normalizeText(socket.data.user?.username);
      const normalizedText = normalizeText(text);
      const normalizedImageUrl = typeof imageUrl === 'string' ? imageUrl.trim() : '';

      if (!activeRoom || !activeUsername || (!normalizedText && !normalizedImageUrl)) {
        return;
      }

      const msg = new Message({
        username: activeUsername,
        text: normalizedText,
        room: activeRoom,
        imageUrl: normalizedImageUrl || undefined,
      });
      await msg.save();

      io.to(activeRoom).emit('receive_message', msg);
    } catch (err) {
      logger.error('Error saving message', { err, socketId: socket.id });
    }
  });

  socket.on('toggle_reaction', async ({ messageId, emoji }) => {
    try {
      const activeRoom = normalizeRoom(socket.data.user?.room);
      const activeUsername = normalizeText(socket.data.user?.username);

      if (!activeRoom || !activeUsername || !messageId || !emoji) {
        return;
      }

      const msg = await Message.findById(messageId);
      if (!msg || msg.room !== activeRoom) {
        return;
      }

      const existingReaction = msg.reactions.find((reaction) => reaction.emoji === emoji);

      if (existingReaction) {
        if (existingReaction.users.includes(activeUsername)) {
          existingReaction.users = existingReaction.users.filter((user) => user !== activeUsername);
          if (existingReaction.users.length === 0) {
            msg.reactions = msg.reactions.filter((reaction) => reaction.emoji !== emoji);
          }
        } else {
          existingReaction.users.push(activeUsername);
        }
      } else {
        msg.reactions.push({ emoji, users: [activeUsername] });
      }

      await msg.save();
      io.to(activeRoom).emit('message_updated', msg);
    } catch (err) {
      logger.error('Error toggling reaction', { err, socketId: socket.id });
    }
  });

  socket.on('disconnect', () => {
    const room = normalizeRoom(socket.data.user?.room);
    logger.info('Socket disconnected', { socketId: socket.id, room });
    broadcastRoomUsers(room);
  });
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    logger.info('Connected to MongoDB');
    server.listen(PORT, () => logger.info('Server started', { port: PORT }));
  })
  .catch((err) => {
    logger.error('Failed to connect to MongoDB', { err });
    process.exit(1);
  });
