const mongoose = require('mongoose');


const MessageSchema = new mongoose.Schema({
  username: { type: String, required: true },
  text: { type: String, required: true },
  room: { type: String, required: true },
  imageUrl: { type: String },
  reactions: [{ emoji: String, users: [String] }],
  createdAt: { type: Date, default: Date.now }
});


module.exports = mongoose.model('Message', MessageSchema);