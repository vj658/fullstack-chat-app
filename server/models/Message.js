const mongoose = require('mongoose');


const MessageSchema = new mongoose.Schema({
  username: { type: String, required: true },
  text: { type: String, default: '' },
  room: { type: String, required: true },
  imageUrl: { type: String },
  reactions: [{ emoji: String, users: [String] }],
  createdAt: { type: Date, default: Date.now }
});

MessageSchema.pre('save', function (next) {
  const hasText = this.text && String(this.text).trim().length > 0;
  const hasImage = this.imageUrl && String(this.imageUrl).trim().length > 0;
  if (!hasText && !hasImage) {
    next(new Error('Message must have either text or image'));
  } else {
    next();
  }
});

MessageSchema.index({ room: 1, createdAt: 1 });

module.exports = mongoose.model('Message', MessageSchema);