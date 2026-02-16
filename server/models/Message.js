const mongoose = require('mongoose');


const MessageSchema = new mongoose.Schema({
  username: { type: String, required: true },
  text: { type: String, default: '' },
  room: { type: String, required: true },
  imageUrl: { type: String },
  reactions: [{ emoji: String, users: [String] }],
  createdAt: { type: Date, default: Date.now }
});

MessageSchema.index({ room: 1, createdAt: 1 });

module.exports = mongoose.model('Message', MessageSchema);