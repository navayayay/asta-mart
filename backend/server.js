const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const riotAuth = require('./riotAuth');
const valorantSync = require('./jobs/valorantSync'); // Start Valorant daily sync on server boot

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// --- MONGODB CONNECTION ---
mongoose.connect('mongodb://127.0.0.1:27017/astamart')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const listingSchema = new mongoose.Schema({
  sellerId: String, sellerName: String, sellerPhone: String, sellerDiscord: String,
  title: String, price: Number, emailAccess: Boolean, banHistory: Boolean,
  status: { type: String, default: 'pending' }, 
  region: String, rank: String, peakRank: String, level: Number, skinCount: Number, 
  skinTags: [String], battlepassTags: [String], agents: [String], agentsCount: Number, 
  vpBalance: Number, bpCompleted: Number, limited: Boolean, limitedDetail: String, 
  images: [String], tags: [String], aiSummary: String, createdAt: { type: Date, default: Date.now }
});
const Listing = mongoose.model('Listing', listingSchema);

const vaultSchema = new mongoose.Schema({
  ownerEmail: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  accountData: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, expires: '7d', default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
});
const Vault = mongoose.model('Vault', vaultSchema);

const orderSchema = new mongoose.Schema({
    sellerName: String, sellerPhone: String, sellerDiscord: String, title: String,
    skins: [String], price: Number, transactionId: String, 
    status: { type: String, default: 'pending' }, 
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// --- BROWSER DISGUISE HEADERS FOR CLOUDFLARE ---
const valApiHeaders = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    }
};

// 🟢 THE SMART CACHE: Downloads the 30MB file ONCE and remembers it forever.
let masterSkinCatalog = null;
async function getCachedCatalog() {
    if (masterSkinCatalog) return masterSkinCatalog; 
    
    console.log(">> [SERVER] Downloading Master Skin Catalog (This only happens once)...");
    try {
        const response = await fetch('https://valorant-api.com/v1/weapons/skins', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36' }
        });
        
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        
        const data = await response.json();
        masterSkinCatalog = data.data; 
        console.log(`>> [SERVER] ✅ Catalog Cached Successfully! (${masterSkinCatalog.length} items)`);
        return masterSkinCatalog;
    } catch (e) {
        console.error("❌ [SERVER] Valorant-API blocked the request:", e.message);
        throw new Error("Valorant-API is currently rate-limiting us. Please wait 60 seconds and try again.");
    }
}

// --- AUTH / OTP ROUTES ---
const otpStore = new Map(); // Temporarily stores OTPs in server memory

app.post('/api/auth/send-otp', async (req, res) => {
    try {
        const { email, type } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        // Generate a 6-digit random OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save it to memory tied to this email
        otpStore.set(email, otp);

        // 🟢 LOG THE OTP TO THE TERMINAL SO YOU CAN SEE IT DURING DEV
        console.log(`\n🔑 [AUTH] OTP for ${email} is: ${otp}\n`);

        res.json({ success: true, message: 'OTP sent successfully' });
    } catch (err) {
        console.error("❌ Auth Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        const { email, otp, name } = req.body;
        
        // Check if OTP matches what we saved (or allow a universal bypass '123456' for easy testing)
        if (otpStore.get(email) !== otp && otp !== '123456') {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        // OTP is correct, remove it from memory for security
        otpStore.delete(email);

        // Find the user in the database, or create a new one if they are signing up
        let user = await User.findOne({ email });
        if (!user) {
            user = new User({ email, name: name || 'Asta User' });
            await user.save();
        }

        res.json({ success: true, user: { email: user.email, name: user.name } });
    } catch (err) {
        console.error("❌ Verify Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});


// --- RIOT SYNC ROUTE ---
app.post('/api/riot/sync-url', async (req, res) => {
    try {
        const { redirectUrl } = req.body;
        const accessToken = (redirectUrl.match(/access_token=([^&|#\s]+)/) || [])[1];
        const idToken = (redirectUrl.match(/id_token=([^&|#\s]+)/) || [])[1];
        if (!accessToken) return res.status(400).json({ error: 'Access Token missing.' });

        const catalog = await getCachedCatalog(); 
        const accountData = await riotAuth.syncFromToken(accessToken, idToken || "", catalog);
        
        res.json(accountData);
    } catch (err) { 
        console.error("❌ Route Error:", err.message);
        res.status(500).json({ error: err.message }); 
    }
});

// --- VAULT ROUTES ---
app.post('/api/vault/sync', async (req, res) => {
    try {
        const { redirectUrl, ownerEmail } = req.body;
        const currentCount = await Vault.countDocuments({ ownerEmail });
        if (currentCount >= 10) return res.status(400).json({ error: 'Vault slot limit reached (10/10).' });

        const accessToken = (redirectUrl.match(/access_token=([^&|#\s]+)/) || [])[1];
        const idToken = (redirectUrl.match(/id_token=([^&|#\s]+)/) || [])[1];
        if (!accessToken) return res.status(400).json({ error: 'Access Token missing.' });

        const catalog = await getCachedCatalog(); 
        const accountData = await riotAuth.syncFromToken(accessToken, idToken || "", catalog);
        
        const slug = crypto.randomBytes(4).toString('hex');
        const newVault = new Vault({ ownerEmail, slug, accountData });
        await newVault.save();
        
        res.status(201).json(newVault);
    } catch (err) { 
        console.error("❌ Vault Sync Error:", err.message);
        res.status(500).json({ error: err.message }); 
    }
});

app.get('/api/vault/user/:email', async (req, res) => {
    try { res.json(await Vault.find({ ownerEmail: req.params.email }).sort({ createdAt: -1 })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/vault/public/:slug', async (req, res) => {
    try {
        const vaultItem = await Vault.findOne({ slug: req.params.slug });
        if (!vaultItem) return res.status(404).json({ error: 'Not found.' });
        res.json(vaultItem);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/vault/:id', async (req, res) => {
    try { await Vault.findByIdAndDelete(req.params.id); res.json({ success: true }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

// --- LISTINGS API ---
app.get('/api/listings', async (req, res) => {
  try {
    // Fetch all active listings with lean() for performance
    const listings = await Listing.find({ status: 'active' }).lean().sort({ createdAt: -1 });

    // The frontend receives data that is perfectly formatted and ready to render
    res.json(listings);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching listings' });
  }
});

app.post('/api/listings', async (req, res) => {
  try { 
      req.body.status = 'pending'; 
      const nl = new Listing(req.body); 
      await nl.save(); 
      res.status(201).json(nl); 
  } 
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/listings/:id', async (req, res) => {
    try { await Listing.findByIdAndDelete(req.params.id); res.json({ message: "Deleted" }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/listings/:id', async (req, res) => {
    try { res.json(await Listing.findByIdAndUpdate(req.params.id, { status: 'sold' }, { new: true })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ORDERS API ---
app.post('/api/orders/inventory-edit', async (req, res) => {
    try {
        const newOrder = new Order(req.body);
        await newOrder.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ADMIN ROUTES ---
app.get('/api/admin/orders', async (req, res) => {
    try { res.json(await Order.find().sort({ createdAt: -1 })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/orders/:id/complete', async (req, res) => {
    try { 
        await Order.findByIdAndUpdate(req.params.id, { status: 'completed' });
        res.json({ success: true }); 
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/listings/:id/approve', async (req, res) => {
    try { 
        await Listing.findByIdAndUpdate(req.params.id, { status: 'active' });
        res.json({ success: true }); 
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Asta Mart Backend running on http://localhost:${PORT}`));