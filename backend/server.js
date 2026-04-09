require('dotenv').config();

// --- ENVIRONMENT VARIABLE VALIDATION ---
const REQUIRED_ENV_VARS = ['MONGODB_URI', 'JWT_SECRET', 'ADMIN_SECRET'];
const OPTIONAL_ENV_VARS = ['EMAIL_USER', 'EMAIL_PASS']; // Optional for development
REQUIRED_ENV_VARS.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

const express = require('express');
const fs = require('fs');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const riotAuth = require('./riotAuth');
const { User, Listing, Vault, Order, OTP, Transaction } = require('./models'); // Import all schemas
const valorantSync = require('./jobs/valorantSync'); // Start Valorant daily sync on server boot

const app = express();
app.use(express.json({ limit: '1mb' })); // DoS protection: safe default limit for JSON payloads
app.use(cookieParser()); // Parse incoming cookies

// --- SECURITY HEADERS ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://media.valorant-api.com", "https://valorant-api.com"],
      connectSrc: [
        "'self'",
        "https://api.asta-mart.in",
        ...(process.env.NODE_ENV !== 'production'
          ? ["http://localhost:5000"]
          : [])
      ],
    }
  },
  frameguard: {
    action: 'deny'  // Prevent embedding in ANY iframe
  },
  noSniff: true,    // Prevent MIME sniffing
  xssFilter: true,  // Legacy XSS filter
  hsts: {
    maxAge: 31536000,  // 1 year
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// --- HTTPS ENFORCEMENT (Production Only) ---
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(301, `https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}

// --- CORS CONFIGURATION ---
const corsOrigins = [
  'https://asta-mart.in',
  'https://www.asta-mart.in',
  ...(process.env.NODE_ENV !== 'production'
    ? ['http://localhost:5500', 'http://127.0.0.1:5500',
       'http://localhost:5501', 'http://127.0.0.1:5501',
       'http://localhost:8080', 'http://127.0.0.1:8080']
    : [])
].filter(Boolean);
app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token', 'CSRF-Token'],
  credentials: true
}));

// M5: Only log CORS info in development
if (process.env.NODE_ENV !== 'production') {
  console.log('✅ CORS Origins:', corsOrigins);
}

// --- RATE LIMITING ---
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many OTP requests. Please wait 15 minutes.' },
  standardHeaders: false,
  legacyHeaders: false
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many verification attempts. Please wait 15 minutes.' },
  standardHeaders: false,
  legacyHeaders: false
});

const syncLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 3, // maximum 3 sync requests per IP per minute
  message: { error: 'Too many sync requests. Please wait to try again.' },
  standardHeaders: false,
  legacyHeaders: false
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // maximum 5 login attempts per IP per 15 minutes
  message: { error: 'Too many admin login attempts. Please wait 15 minutes.' },
  standardHeaders: false,
  legacyHeaders: false
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 admin requests per IP per 15 minutes
  message: { error: 'Too many admin requests. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

const viewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1, // maximum 1 view per hour per IP per listing
  keyGenerator: (req) => req.ip + ':' + req.params.id,
  message: { error: 'You have already viewed this listing recently.' },
  standardHeaders: false,
  legacyHeaders: false
});

// H6: Global API rate limiter (protects all /api/* routes from abuse)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per IP per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});

// --- CSRF PROTECTION ---
const csrfProtection = csrf({ cookie: false });  // Use session-based tokens

// --- STANDARDIZED API RESPONSE HANDLER ---
function sendSuccess(res, data = null, message = 'Success', statusCode = 200) {
  res.status(statusCode).json({
    success: true,
    message,
    data
  });
}

function sendError(res, error, statusCode = 400) {
  const isValidationError = Array.isArray(error);
  res.status(statusCode).json({
    success: false,
    error: isValidationError ? 'Validation failed' : (error.message || error),
    ...(isValidationError && { details: error })
  });
}

// --- EMAIL CONFIGURATION (Optional for development) ---
let transporter = null;
const emailConfigured = process.env.EMAIL_USER && process.env.EMAIL_PASS && 
                        process.env.EMAIL_USER !== 'your-email@gmail.com' &&
                        process.env.EMAIL_PASS !== 'your-app-password';

if (emailConfigured) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  console.log('✅ [EMAIL] Email service configured and ready');
} else {
  console.log('⚠️  [EMAIL] Email service not configured. OTPs will be logged to console only.');
}

// --- ADMIN AUTHENTICATION MIDDLEWARE ---
const ADMIN_SECRET = process.env.ADMIN_SECRET;
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  // H1: Use timing-safe comparison to prevent side-channel attacks
  if (!token || token.length !== ADMIN_SECRET.length) {
    return res.status(401).json({ error: 'Unauthorized: Invalid admin token' });
  }
  try {
    const safe = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(ADMIN_SECRET));
    if (!safe) return res.status(401).json({ error: 'Unauthorized: Invalid admin token' });
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid admin token' });
  }
}

// --- ADMIN JWT AUTHENTICATION MIDDLEWARE (Cookie-based, Secure) ---
function adminAuthJWT(req, res, next) {
  const token = req.cookies.am_admin;
  
  if (!token) {
    return res.status(401).json({ error: 'Admin session expired. Please log in again.' });
  }
  
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired admin session' });
  }
}

// --- USER AUTHENTICATION MIDDLEWARE (JWT-based) ---
const JWT_SECRET = process.env.JWT_SECRET;

async function requireAuth(req, res, next) {
  // Check for token in httpOnly cookie (preferred) or Authorization header (fallback)
  const token = req.cookies.am_token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Please log in' });
  }
  
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    // H7: Verify tokenVersion hasn't been incremented (logout invalidates all sessions)
    const dbUser = await User.findOne({ email: req.user.email }).select('tokenVersion');
    if (!dbUser || dbUser.tokenVersion !== req.user.tv) {
      return res.status(401).json({ error: 'Session invalidated. Please log in again.' });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// H6: Apply global rate limiter to all /api/* routes
app.use('/api/', globalLimiter);

// --- SCHEMAS (Imported from models.js) ---
// All Mongoose schemas are now centralized in models.js
// Models: User, Listing, Vault, Order, OTP, Transaction

// --- BROWSER DISGUISE HEADERS FOR CLOUDFLARE ---
const valApiHeaders = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    }
};

// 🟢 THE SMART CACHE: Downloads the 30MB file ONCE and remembers it forever (persists to disk)
// M4: Cache file in /tmp or env-configured directory (not project root)
const CACHE_FILE = process.env.CACHE_DIR
  ? `${process.env.CACHE_DIR}/skin_catalog_cache.json`
  : '/tmp/skin_catalog_cache.json';
let masterSkinCatalog = null;

async function getCachedCatalog() {
    // Check in-memory cache first (fastest)
    if (masterSkinCatalog) return masterSkinCatalog;
    
    // Try loading from disk cache
    if (fs.existsSync(CACHE_FILE)) {
        try {
            const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            // Check if cache is less than 24 hours old
            if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
                masterSkinCatalog = cached.data;
                console.log(`>> [SERVER] ✅ Loaded Catalog from Disk Cache (${masterSkinCatalog.length} items)`);
                return masterSkinCatalog;
            }
        } catch (parseErr) {
            console.warn(`⚠️  [SERVER] Disk cache corrupted, will refresh:`, parseErr.message);
        }
    }
    
    // Download fresh catalog from Valorant API
    console.log(">> [SERVER] Downloading Master Skin Catalog (This happens once per day or after cache expiry)...");
    try {
        const response = await fetch('https://valorant-api.com/v1/weapons/skins', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36' }
        });
        
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        
        const data = await response.json();
        masterSkinCatalog = data.data;
        
        // Persist to disk for recovery after restart
        try {
            fs.writeFileSync(CACHE_FILE, JSON.stringify({
                data: masterSkinCatalog,
                timestamp: Date.now()
            }, null, 2));
            console.log(`>> [SERVER] ✅ Catalog Downloaded & Saved to Disk (${masterSkinCatalog.length} items)`);
        } catch (writeErr) {
            console.error(`⚠️  [SERVER] Failed to save cache to disk:`, writeErr.message);
            // Still return the data even if disk write failed
            console.log(`>> [SERVER] ✅ Catalog Downloaded (in-memory only, disk write failed)`);
        }
        
        return masterSkinCatalog;
    } catch (e) {
        console.error("❌ [SERVER] Valorant-API blocked the request:", e.message);
        throw new Error("Valorant-API is currently rate-limiting us. Please wait 60 seconds and try again.");
    }
}

// --- CSRF TOKEN ENDPOINT ---
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// --- AUTH / OTP ROUTES ---
app.post('/api/auth/send-otp', otpLimiter, async (req, res) => {
    try {
        const { email, type } = req.body;
        // H4: Validate email format to prevent injection attacks
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email) || email.length > 254) {
            return res.status(400).json({ error: 'Invalid email address' });
        }
        
        // Validate OTP type parameter
        if (type && !['login', 'signup'].includes(type)) {
            return res.status(400).json({ error: 'Invalid request type' });
        }

        // Delete any old OTP for this email
        await OTP.deleteMany({ email });

        // Generate a 6-digit random OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // C3: Hash OTP before storage (prevent plaintext DB exposure on breach)
        const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
        
        // Save to MongoDB with TTL (auto-expires in 5 minutes)
        const otpDoc = new OTP({ email, code: hashedOtp });
        await otpDoc.save();

        // Send OTP via email if configured
        if (emailConfigured && transporter) {
            try {
                await transporter.sendMail({
                    from: '"Asta Mart" <no-reply@astamart.com>',
                    to: email,
                    subject: 'Your Asta Mart Verification Code',
                    html: `
                        <h2>Asta Mart Verification Code</h2>
                        <p>Your verification code is:</p>
                        <h1 style="color: #FF4655; font-family: monospace; letter-spacing: 3px;">${otp}</h1>
                        <p>This code expires in <strong>5 minutes</strong>.</p>
                        <p>If you didn't request this code, please ignore this email.</p>
                        <hr>
                        <p style="font-size: 12px; color: #666;">Asta Mart Valorant Marketplace</p>
                    `
                });
                console.log(`✅ [EMAIL] OTP sent to ${email}`);
            } catch (emailErr) {
                console.error(`❌ [EMAIL] Failed to send OTP to ${email}:`, emailErr.message);
                return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
            }
        } else {
            // Development mode: log masked email only, NEVER log the actual OTP code
            const maskedEmail = email.replace(/(.{2}).*(@)/, '$1***$2');
            console.log(`[AUTH-DEV] OTP sent to ${maskedEmail} (code not displayed for security)`);
        }

        res.json({ success: true, message: 'OTP sent to your email' });
    } catch (err) {
        console.error('❌ Auth Error:', err);
        res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
    }
});

app.post('/api/auth/verify-otp', verifyLimiter, async (req, res) => {
    try {
        const { email, otp, name } = req.body;
        if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

        // C3: Hash input OTP and compare with stored hash (prevents plaintext comparison)
        const hashedInput = crypto.createHash('sha256').update(otp).digest('hex');
        
        // Query MongoDB for the OTP (TTL will automatically delete expired ones)
        const otpDoc = await OTP.findOne({ email, code: hashedInput });
        if (!otpDoc) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        // OTP is valid, delete it immediately for security
        await OTP.deleteOne({ _id: otpDoc._id });

        // Find the user in the database, or create a new one if they are signing up
        let user = await User.findOne({ email });
        if (!user) {
            // H8: Validate and sanitize user name before storage
            const cleanName = (name || 'Asta User').trim().slice(0, 60).replace(/[^\w\s\-'.]/g, '') || 'Asta User';
            user = new User({ email, name: cleanName });
            await user.save();
        }

        // H7: Issue JWT token with tokenVersion for revocation support
        const token = jwt.sign(
          { email: user.email, name: user.name, tv: user.tokenVersion },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

        // Send token as httpOnly cookie (XSS-safe)
        res.cookie('am_token', token, {
          httpOnly: true,
          secure: true,  // ALWAYS true in production
          sameSite: 'Lax',
          maxAge: 7 * 24 * 60 * 60 * 1000
        });
        
        // Return user info (not token)
        res.json({ success: true, user: { email: user.email, name: user.name } });
    } catch (err) {
        console.error('❌ Verify Error:', err);
        res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
});

// --- LOGOUT ROUTE ---
app.post('/api/auth/logout', requireAuth, csrfProtection, (req, res) => {
  // H7: Increment tokenVersion to invalidate all active sessions for this user
  User.findOneAndUpdate(
    { email: req.user.email },
    { $inc: { tokenVersion: 1 } }
  ).then(() => {
    res.clearCookie('am_token', {
      httpOnly: true,
      secure: true,  // ALWAYS true in production
      sameSite: 'Lax'
    });
    res.json({ success: true });
  }).catch(() => {
    res.status(500).json({ error: 'Logout failed' });
  });
});

// --- ADMIN LOGIN ROUTE (Secure JWT Cookie) ---
app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  const { secret } = req.body;
  
  if (!secret) {
    return res.status(400).json({ error: 'Admin secret is required' });
  }
  
  try {
    // H1: Use timing-safe comparison to prevent side-channel attacks
    const valid = crypto.timingSafeEqual(
      Buffer.from(secret),
      Buffer.from(process.env.ADMIN_SECRET)
    );
    
    if (!valid) {
      return res.status(401).json({ error: 'Invalid admin secret' });
    }
    
    // Generate JWT token with 4-hour expiration
    const token = jwt.sign(
      { role: 'admin', loginTime: new Date().toISOString() },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );
    
    // Set secure httpOnly cookie (not accessible from JavaScript)
    res.cookie('am_admin', token, {
      httpOnly: true,
      secure: true,  // ALWAYS true in production
      sameSite: 'Lax',
      maxAge: 4 * 60 * 60 * 1000 // 4 hours
    });
    
    res.json({ success: true, message: 'Admin logged in successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// --- ADMIN LOGOUT ROUTE ---
app.post('/api/admin/logout', adminLimiter, adminAuthJWT, (req, res) => {
  res.clearCookie('am_admin', {
    httpOnly: true,
    secure: true,  // ALWAYS true in production
    sameSite: 'Lax'
  });
  res.json({ success: true, message: 'Admin logged out successfully' });
});

// --- USER PROFILE ROUTE ---
app.patch('/api/users/profile', requireAuth, csrfProtection, [
  body('discord')
    .optional()
    .trim()
    .isString()
    .isLength({ min: 2, max: 32 })
    .withMessage('Discord handle must be 2-32 characters')
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('Discord handle can only contain letters, numbers, dots, underscores, and hyphens'),
  body('whatsapp')
    .optional()
    .trim()
    .isString()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('WhatsApp must be a valid phone number (10-15 digits, optionally with + prefix)'),
  body('upi')
    .optional()
    .trim()
    .isString()
    .isLength({ max: 60 })
    .withMessage('UPI ID must be 60 characters or less')
    .matches(/^[a-zA-Z0-9._-]+@[a-zA-Z]+$/)
    .withMessage('UPI must be in format: username@bankname'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Extract validated fields
    const { discord, whatsapp, upi } = req.body;
    const updateData = {};
    
    if (discord !== undefined) updateData.discord = discord;
    if (whatsapp !== undefined) updateData.whatsapp = whatsapp;
    if (upi !== undefined) updateData.upi = upi;

    // Update user in MongoDB
    const user = await User.findOneAndUpdate(
      { email: req.user.email },
      updateData,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ success: true, message: 'Profile updated successfully', user: { 
      email: user.email, 
      name: user.name,
      discord: user.discord,
      whatsapp: user.whatsapp,
      upi: user.upi
    }});
  } catch (err) {
    console.error('❌ Profile Update Error:', err);
    res.status(500).json({ error: 'Failed to update profile. Please try again.' });
  }
});

// M3: GET user profile from server (authoritative source)
app.get('/api/users/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email })
      .select('name email discord whatsapp upi joinedAt');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('❌ Profile Fetch Error:', err);
    res.status(500).json({ error: 'Failed to fetch profile. Please try again.' });
  }
});

// --- TOKEN VALIDATION HELPER ---
function validateAccessToken(token) {
    if (!token || typeof token !== 'string') return false;
    // Validate JWT format: three Base64url-encoded parts separated by dots
    const tokenRegex = /^[A-Za-z0-9\-._~+/]+=*\.[A-Za-z0-9\-._~+/]+=*\.[A-Za-z0-9\-._~+/]+=*$/;
    return tokenRegex.test(token) && token.length > 50 && token.length < 5000;
}


// --- RIOT SYNC ROUTE ---
app.post('/api/riot/sync-url', syncLimiter, async (req, res) => {
    try {
        const { redirectUrl } = req.body;
        if (!redirectUrl || typeof redirectUrl !== 'string') {
            return res.status(400).json({ error: 'Invalid request format.' });
        }

        const accessToken = (redirectUrl.match(/access_token=([^&|#\s]+)/) || [])[1];
        const idToken = (redirectUrl.match(/id_token=([^&|#\s]+)/) || [])[1];
        
        // Validate token format BEFORE using it
        if (!accessToken || !validateAccessToken(accessToken)) {
            return res.status(400).json({ error: 'Invalid or malformed access token.' });
        }

        const catalog = await getCachedCatalog(); 
        const accountData = await riotAuth.syncFromToken(accessToken, idToken || "", catalog);
        
        res.json(accountData);
    } catch (err) { 
        // Don't expose error details that might leak token information
        console.error("❌ Riot Sync Error: [token validation or API error]");
        res.status(500).json({ error: 'Failed to sync account. Please try again.' }); 
    }
});

// --- VAULT ROUTES ---
app.post('/api/vault/sync', requireAuth, syncLimiter, csrfProtection, async (req, res) => {
    try {
        const { redirectUrl } = req.body;
        const ownerEmail = req.user.email; // From verified JWT — not from body!
        
        if (!redirectUrl || typeof redirectUrl !== 'string') {
            return res.status(400).json({ error: 'Invalid request format.' });
        }

        const currentCount = await Vault.countDocuments({ ownerEmail });
        if (currentCount >= 10) return res.status(400).json({ error: 'Vault slot limit reached (10/10).' });

        const accessToken = (redirectUrl.match(/access_token=([^&|#\s]+)/) || [])[1];
        const idToken = (redirectUrl.match(/id_token=([^&|#\s]+)/) || [])[1];
        
        // Validate token format BEFORE using it
        if (!accessToken || !validateAccessToken(accessToken)) {
            return res.status(400).json({ error: 'Invalid or malformed access token.' });
        }

        const catalog = await getCachedCatalog(); 
        const accountData = await riotAuth.syncFromToken(accessToken, idToken || "", catalog);
        
        const slug = crypto.randomBytes(16).toString('hex'); // 128-bit entropy
        const newVault = new Vault({ ownerEmail, slug, accountData });
        await newVault.save();
        
        res.status(201).json(newVault);
    } catch (err) { 
        // Don't expose error details that might leak token information
        console.error("❌ Vault Sync Error: [token validation or API error]");
        res.status(500).json({ error: 'Failed to sync vault. Please try again.' }); 
    }
});

app.get('/api/vault/user/:email', requireAuth, async (req, res) => {
    try {
        // Verify ownership — users can only see their own vault
        if (req.params.email !== req.user.email) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        res.json(await Vault.find({ ownerEmail: req.params.email }).sort({ createdAt: -1 }));
    } 
    catch (err) { 
      console.error('❌ Vault User Fetch Error:', err);
      res.status(500).json({ error: 'An unexpected error occurred. Please try again.' }); 
    }
});

app.get('/api/vault/public/:slug', async (req, res) => {
    try {
        const vaultItem = await Vault.findOne({ slug: req.params.slug });
        if (!vaultItem) return res.status(404).json({ error: 'Not found.' });
        res.json(vaultItem);
    } catch (err) { 
      console.error('❌ Vault Public Fetch Error:', err);
      res.status(500).json({ error: 'An unexpected error occurred. Please try again.' }); 
    }
});

app.delete('/api/vault/:id', requireAuth, csrfProtection, async (req, res) => {
    try {
      const vault = await Vault.findById(req.params.id);
      if (!vault) return res.status(404).json({ error: 'Vault not found' });
      
      // Check ownership - only the vault owner can delete
      if (vault.ownerEmail !== req.user.email) {
        return res.status(403).json({ error: 'Forbidden: You can only delete your own vaults' });
      }
      
      await vault.deleteOne();
      res.json({ success: true });
    } 
    catch (err) { 
      console.error('❌ Vault Delete Error:', err);
      res.status(500).json({ error: 'An unexpected error occurred. Please try again.' }); 
    }
});

// --- LISTINGS API ---
// H5: GET /api/listings with pagination to prevent DoS and improve performance
app.get('/api/listings', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    
    const [listings, total] = await Promise.all([
      Listing.find({ status: 'active' })
        .lean()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-sellerPhone -sellerDiscord -sellerId'),
      Listing.countDocuments({ status: 'active' })
    ]);

    res.json({
      listings,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching listings' });
  }
});

// --- REVEAL CONTACT ENDPOINT (Authenticated) ---
app.post('/api/listings/:id/reveal', requireAuth, csrfProtection, async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id)
      .select('sellerPhone sellerDiscord sellerId sellerName');
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    
    // Increment contactReveals counter
    await Listing.findByIdAndUpdate(req.params.id, { $inc: { contactReveals: 1 } });
    
    res.json(listing);
  } catch (err) {
    console.error('❌ Reveal Contact Error:', err);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
});

// --- INCREMENT VIEW COUNT ENDPOINT ---
app.post('/api/listings/:id/view', viewLimiter, async (req, res) => {
  try {
    await Listing.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ View Count Error:', err);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
});

app.post('/api/listings', requireAuth, csrfProtection, [
  body('title').trim().notEmpty().isLength({ max: 200 }).withMessage('Title is required and must be 200 characters or less'),
  body('price').isInt({ min: 1, max: 10000000 }).withMessage('Price must be an integer between 1 and 10,000,000'),
  body('region').isIn(['AP', 'NA', 'EU', 'KR', 'LATAM', 'BR']).withMessage('Invalid region'),
  body('rank').optional().trim().isString().isLength({ max: 50 }).withMessage('Rank must be 50 characters or less'),
  body('level').optional().isInt({ min: 1, max: 999 }).withMessage('Level must be between 1 and 999'),
  body('skinCount').optional().isInt({ min: 0 }).withMessage('Skin count must be a non-negative integer'),
  body('images')
    .optional()
    .isArray({ max: 10 }).withMessage('Maximum 10 images allowed')
    .custom(arr => arr.every(url => typeof url === 'string' &&
      url.startsWith('https://') &&
      url.length < 500
    )).withMessage('All images must be valid HTTPS URLs under 500 characters'),
  body('skinTags').optional().isArray({ max: 100 }).custom(arr => {
    return arr.every(item => {
      try {
        const s = typeof item === 'string' ? JSON.parse(item) : item;
        return typeof s.name === 'string' && s.name.length < 100 && s.name.length > 0 &&
               typeof s.icon === 'string' && s.icon.startsWith('https://media.valorant-api.com/');
      } catch { return false; }
    });
  }).withMessage('Invalid skinTag format'),
  body('battlepassTags').optional().isArray({ max: 100 }).custom(arr => {
    return arr.every(item => {
      try {
        const s = typeof item === 'string' ? JSON.parse(item) : item;
        return typeof s.name === 'string' && s.name.length < 100 && s.name.length > 0 &&
               typeof s.icon === 'string' && s.icon.startsWith('https://media.valorant-api.com/');
      } catch { return false; }
    });
  }).withMessage('Invalid battlepassTag format'),
  body('agents').optional().isArray({ max: 100 }).custom(arr => {
    return arr.every(item => {
      try {
        const s = typeof item === 'string' ? JSON.parse(item) : item;
        return typeof s.name === 'string' && s.name.length < 100 && s.name.length > 0 &&
               typeof s.icon === 'string' && s.icon.startsWith('https://media.valorant-api.com/');
      } catch { return false; }
    });
  }).withMessage('Invalid agent format'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    // Only whitelist known safe fields - prevent mass assignment
    const { title, price, region, rank, peakRank, level, skinCount, agentsCount,
            emailAccess, banHistory, banDetail, limited, limitedDetail, vpBalance,
            bpCompleted, skinTags, battlepassTags, agents, tags, aiSummary, images } = req.body;
    
    const nl = new Listing({
      sellerId: req.user.email, // from auth middleware, not from body
      sellerName: req.user.name,
      title, price, region, rank, peakRank, level, skinCount, agentsCount,
      emailAccess, banHistory, banDetail, limited, limitedDetail, vpBalance,
      bpCompleted, skinTags, battlepassTags, agents, tags, aiSummary, images,
      status: 'pending'
    });
    await nl.save();
    res.status(201).json({ success: true, id: nl._id });
  }
  catch (err) { 
    console.error('❌ Create Listing Error:', err);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again.' }); 
  }
});

app.delete('/api/listings/:id', requireAuth, csrfProtection, async (req, res) => {
    try {
      const listing = await Listing.findById(req.params.id);
      if (!listing) return res.status(404).json({ error: 'Listing not found' });
      
      // Check ownership - only the seller can delete their listing
      if (listing.sellerId !== req.user.email) {
        return res.status(403).json({ error: 'Forbidden: You can only delete your own listings' });
      }
      
      await listing.deleteOne();
      res.json({ message: 'Deleted' });
    } 
    catch (err) { 
      console.error('❌ Delete Listing Error:', err);
      res.status(500).json({ error: 'An unexpected error occurred. Please try again.' }); 
    }
});

app.patch('/api/listings/:id/status', requireAuth, csrfProtection, [
  body('status').isIn(['active', 'sold', 'deleted']).withMessage('Invalid status value')
], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      
      const { status } = req.body;
      const listing = await Listing.findById(req.params.id);
      if (!listing) return res.status(404).json({ error: 'Listing not found' });
      
      // Check ownership - only the seller can update their listing
      if (listing.sellerId !== req.user.email) {
        return res.status(403).json({ error: 'Forbidden: You can only update your own listings' });
      }
      
      res.json(await Listing.findByIdAndUpdate(req.params.id, { status }, { new: true }));
    } 
    catch (err) { 
      console.error('❌ Update Listing Status Error:', err);
      res.status(500).json({ error: 'An unexpected error occurred. Please try again.' }); 
    }
});

// --- ORDERS API ---
app.post('/api/orders/inventory-edit', requireAuth, csrfProtection, [
  body('title').trim().notEmpty().isLength({ max: 200 }),
  body('price').isFloat({ min: 0, max: 10000000 }),
  body('transactionId').optional().trim().isLength({ max: 50 }),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        
        // H3: Seller info comes from JWT, never from body (prevent spoofing)
        const { title, price, transactionId } = req.body;
        const newOrder = new Order({
            sellerName: req.user.name,
            sellerId: req.user.email,
            title,
            price,
            transactionId: transactionId || '',
            status: 'pending'
        });
        await newOrder.save();
        res.json({ success: true });
    } catch (err) { 
      console.error('❌ Create Order Error:', err);
      res.status(500).json({ error: 'An unexpected error occurred. Please try again.' }); 
    }
});

// --- ADMIN ROUTES ---
app.get('/api/admin/listings', adminLimiter, adminAuthJWT, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const status = req.query.status || undefined; // filter by status if provided
    const query = status ? { status } : {};
    const [listings, total] = await Promise.all([
      Listing.find(query).lean().sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(limit),
      Listing.countDocuments(query)
    ]);
    res.json({ listings, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('❌ Admin Listings Fetch Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/orders', adminLimiter, adminAuthJWT, async (req, res) => {
    try { res.json(await Order.find().sort({ createdAt: -1 })); } 
    catch (err) { 
      console.error('❌ Admin Orders Fetch Error:', err);
      res.status(500).json({ error: 'An unexpected error occurred. Please try again.' }); 
    }
});

app.put('/api/admin/orders/:id/complete', adminLimiter, adminAuthJWT, async (req, res) => {
    try { 
        await Order.findByIdAndUpdate(req.params.id, { status: 'completed' });
        res.json({ success: true }); 
    } catch (err) { 
      console.error('❌ Admin Order Complete Error:', err);
      res.status(500).json({ error: 'An unexpected error occurred. Please try again.' }); 
    }
});

app.put('/api/admin/listings/:id/approve', adminLimiter, adminAuthJWT, async (req, res) => {
    try { 
        await Listing.findByIdAndUpdate(req.params.id, { status: 'active' });
        res.json({ success: true }); 
    } catch (err) { 
      console.error('❌ Admin Listing Approve Error:', err);
      res.status(500).json({ error: 'An unexpected error occurred. Please try again.' }); 
    }
});

app.delete('/api/admin/listings/:id', adminLimiter, adminAuthJWT, async (req, res) => {
    try {
        await Listing.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { 
      console.error('❌ Admin Listing Delete Error:', err);
      res.status(500).json({ error: 'An unexpected error occurred. Please try again.' }); 
    }
});

// --- CONFIG ENDPOINT (Public) ---
app.get('/api/config/payment-upi', (req, res) => {
  const upiId = process.env.PAYMENT_UPI_ID || 'seller@bank';
  res.json({
    upi: upiId,
    lastUpdated: new Date().toISOString()
  });
});

// --- DYNAMIC SITEMAP ---
app.get('/sitemap.xml', async (req, res) => {
  try {
    // Get the domain based on Node environment
    const domain = process.env.NODE_ENV === 'production'
      ? 'https://asta-mart.in'
      : 'http://localhost:3000'; // Change if frontend is on different port

    // Static pages
    const staticPages = [
      { path: '/', priority: '1.0', changefreq: 'weekly' },
      { path: '/browse.html', priority: '0.9', changefreq: 'daily' },
      { path: '/contact.html', priority: '0.7', changefreq: 'monthly' },
      { path: '/privacy.html', priority: '0.6', changefreq: 'yearly' },
      { path: '/terms.html', priority: '0.6', changefreq: 'yearly' },
      { path: '/faq.html', priority: '0.6', changefreq: 'monthly' },
      { path: '/compare.html', priority: '0.8', changefreq: 'daily' }
    ];

    // Get all active listings from database
    const listings = await Listing.find({ status: 'active' }).lean();
    const listingPages = listings.map(l => ({
      path: `/listing.html?id=${l._id}`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: l.updatedAt ? l.updatedAt.toISOString().split('T')[0] : null
    }));

    // Build XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Add static pages with current date
    const today = new Date().toISOString().split('T')[0];
    staticPages.forEach(page => {
      xml += '  <url>\n';
      xml += `    <loc>${domain}${page.path}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += '  </url>\n';
    });

    // Add listing pages
    listingPages.forEach(page => {
      xml += '  <url>\n';
      xml += `    <loc>${domain}${page.path}</loc>\n`;
      if (page.lastmod) {
        xml += `    <lastmod>${page.lastmod}</lastmod>\n`;
      }
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += '  </url>\n';
    });

    xml += '</urlset>';

    res.type('application/xml');
    res.send(xml);
  } catch (err) {
    console.error('❌ Sitemap Generation Error:', err);
    res.status(500).json({ error: 'Failed to generate sitemap' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Asta Mart Backend running on http://localhost:${PORT}`));