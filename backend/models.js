const mongoose = require('mongoose');

// User Schema
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  discord: String,
  instagram: String,
  joinedAt: { type: Date, default: Date.now }
});

// Listing Schema
const ListingSchema = new mongoose.Schema({
  sellerId: { type: String, required: true }, // Links to User email
  sellerName: String,
  sellerPhone: String,   // ADDED: For WhatsApp Redirect
  sellerDiscord: String, // ADDED: For Discord display
  title: { type: String, required: true },
  price: { type: Number, required: true },
  region: String,
  rank: String,
  peakRank: String,
  level: Number,
  skinCount: Number,
  agentsCount: Number,
  emailAccess: Boolean,
  banHistory: Boolean,
  banDetail: String,
  limited: Boolean,
  limitedDetail: String,
  vpBalance: Number,
  bpCompleted: Number,
  collections: [String],
  agents: [String],
  skinTags: [String],
  images: [String], 
  aiSummary: String,
  tags: [String],
  isGem: Boolean,
  status: { type: String, default: 'active', enum: ['active', 'sold', 'deleted'] },
  views: { type: Number, default: 0 },
  contactReveals: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Transaction/Purchase History Schema
const TransactionSchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
  buyerEmail: { type: String, required: true },
  sellerEmail: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: 'escrow', enum: ['escrow', 'completed', 'disputed'] },
  purchasedAt: { type: Date, default: Date.now }
});

module.exports = {
  User: mongoose.model('User', UserSchema),
  Listing: mongoose.model('Listing', ListingSchema),
  Transaction: mongoose.model('Transaction', TransactionSchema)
};