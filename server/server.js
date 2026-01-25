require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const Message = require('./models/Message');

// CREATE EXPRESS APP
const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// MIDDLEWARE
app.use(express.json());
app.use(cors({ origin: CLIENT_ORIGIN }));

// HEALTH CHECK
app.get('/health', (req, res) => res.json({ ok: true }));

// GET MESSAGES (FILTER BY ROOM)
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
  console.log('Socket connected:', socket.id);

  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`User ${socket.id} joined room: ${room}`);
  });

  socket.on('send_message', async (payload) => {
    try {
      const { username, text, room } = payload;
      if (!room) return;

      const msg = new Message({ username, text, room });
      await msg.save();

      // Emit only to that room
      io.to(room).emit('receive_message', msg);
    } catch (err) {
      console.error('Error saving message', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
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
