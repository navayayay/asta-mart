const mongoose = require('mongoose');

const SkinSchema = new mongoose.Schema({
  uuid: { type: String, required: true, unique: true },
  name: String,
  icon: String,
  displayTier: String,
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Skin', SkinSchema);
