const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    password: { type: String, default: '' },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isPrivate: { type: Boolean, default: false }
});

module.exports = mongoose.model('Room', RoomSchema);
