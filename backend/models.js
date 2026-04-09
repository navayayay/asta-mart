const mongoose = require('mongoose');

// User Schema
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  discord: String,
  whatsapp: String,
  upi: String,
  instagram: String,
  tokenVersion: { type: Number, default: 0 }, // H7: JWT revocation via version increment
  joinedAt: { type: Date, default: Date.now }
});

// Listing Schema (shared by all parts of the app)
const ListingSchema = new mongoose.Schema({
  sellerId: { type: String, required: true }, // Links to User email
  sellerName: String,
  sellerPhone: String,
  sellerDiscord: String,
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
  battlepassTags: [String],
  images: [String], 
  aiSummary: String,
  tags: [String],
  status: { type: String, default: 'pending', enum: ['pending', 'active', 'sold', 'deleted'] },
  views: { type: Number, default: 0 },
  contactReveals: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Vault Schema (OAuth token storage)
const VaultSchema = new mongoose.Schema({
  ownerEmail: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  accountData: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, expires: '7d', default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
});

// Order Schema (Purchase history)
const OrderSchema = new mongoose.Schema({
  sellerName: String,
  sellerPhone: String,
  sellerDiscord: String,
  title: String,
  skins: [String],
  price: Number,
  transactionId: String,
  status: { type: String, default: 'pending', enum: ['pending', 'completed', 'disputed'] },
  createdAt: { type: Date, default: Date.now }
});

// OTP Schema (One-time passwords with TTL)
const OTPSchema = new mongoose.Schema({
  email: { type: String, required: true },
  code: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 300 } // Auto-delete after 5 minutes
});

// Transaction/Purchase History Schema (Optional - for future use)
const TransactionSchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
  buyerEmail: { type: String, required: true },
  sellerEmail: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: 'escrow', enum: ['escrow', 'completed', 'disputed'] },
  purchasedAt: { type: Date, default: Date.now }
});

// VP Order Schema
const VPOrderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    buyerEmail: { type: String, required: true },
    region: { type: String, required: true, enum: ['PH', 'ID', 'TH', 'SG', 'KH', 'MY'] },
    packageId: { type: String, required: true },
    packageName: String,
    vpAmount: Number,
    priceINR: { type: Number, required: true },
    paymentStatus: { type: String, default: 'pending', enum: ['pending', 'paid', 'failed'] },
    fulfillmentStatus: { type: String, default: 'pending', enum: ['pending', 'processing', 'completed', 'failed'] },
    moogoldOrderId: String,
    deliveryData: mongoose.Schema.Types.Mixed,
    riotUID: { type: String, required: true, maxlength: 30 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// VP Package Schema
const VPPackageSchema = new mongoose.Schema({
    region: { type: String, required: true },
    regionName: String,
    vpAmount: Number,
    packageName: String,
    moogoldProductId: String,
    priceINR: Number,
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
});

module.exports = {
  User: mongoose.model('User', UserSchema),
  Listing: mongoose.model('Listing', ListingSchema),
  Vault: mongoose.model('Vault', VaultSchema),
  Order: mongoose.model('Order', OrderSchema),
  OTP: mongoose.model('OTP', OTPSchema),
  Transaction: mongoose.model('Transaction', TransactionSchema),
  VPOrder: mongoose.model('VPOrder', VPOrderSchema),
  VPPackage: mongoose.model('VPPackage', VPPackageSchema)
};