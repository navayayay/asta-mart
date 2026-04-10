// ===================== APP STATE & API CONFIG =====================
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.') || window.location.protocol === 'file:')
  ? `http://${window.location.hostname}:5000/api`
  : 'https://api.asta-mart.in/api';

// ===================== LOGGING UTILITIES =====================
const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const log = (...a) => isDev && console.log(...a);
const warn = (...a) => isDev && console.warn(...a);
const logErr = (...a) => console.error(...a); // Always log real errors

if (isDev) {
  log('🔌 API_BASE_URL:', API_BASE_URL, '| Hostname:', window.location.hostname);
}

// ===================== CSRF TOKEN MANAGEMENT =====================
let CSRF_TOKEN = null;

async function fetchCSRFToken() {
  try {
    const res = await fetch(`${API_BASE_URL}/csrf-token`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error('Failed to fetch CSRF token');
    
    const data = await res.json();
    CSRF_TOKEN = data.csrfToken;
    sessionStorage.setItem('csrf_token', CSRF_TOKEN);
    
    if (isDev) log('✅ CSRF token obtained');
  } catch (err) {
    logErr('CSRF token fetch failed:', err);
  }
}

// ===================== FORM VALIDATION HELPERS =====================
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePassword(pwd) {
  return pwd.length >= 6;  // Minimum 6 characters
}

function validatePrice(price) {
  const p = parseFloat(price);
  return !isNaN(p) && p > 0 && p <= 10000000;
}

function validateTitle(title) {
  return title && title.trim().length > 0 && title.length <= 200;
}

function validateListingForm(data) {
  const errors = [];
  if (!validateTitle(data.title)) {
    errors.push('Title is required and must be 200 characters or less');
  }
  if (!validatePrice(data.price)) {
    errors.push('Price must be between ₹1 and ₹10,000,000');
  }
  if (!['AP', 'NA', 'EU', 'KR', 'LATAM', 'BR'].includes(data.region)) {
    errors.push('Valid region is required');
  }
  return errors;
}

// ===================== WEB VITALS MONITORING =====================
// Track Core Web Vitals for performance monitoring
if ('web-vital' in window || 'onload' in window) {
  try {
    // Check if Web Vitals library is available
    if (typeof window.webVitals !== 'undefined') {
      // Largest Contentful Paint (LCP)
      window.webVitals.getLCP(metric => {
        if (metric.value > 2.5) console.warn('⚠️ LCP:', metric.value.toFixed(1), 'ms');
      });
      // First Input Delay (FID) / Interaction to Next Paint (INP)
      window.webVitals.getFID(metric => {
        if (metric.value > 100) console.warn('⚠️ FID:', metric.value.toFixed(1), 'ms');
      });
      // Cumulative Layout Shift (CLS)
      window.webVitals.getCLS(metric => {
        if (metric.value > 0.1) console.warn('⚠️ CLS:', metric.value.toFixed(3));
      });
    }
  } catch (err) {
    // Web Vitals not available, continue without it
  }
}

// ===================== WEB VITALS MONITORING =====================
// L4: Track Core Web Vitals for performance monitoring
(function() {
  try {
    // Manual measurement of key metrics (Web Vitals library optional)
    let lcpValue = 0, fidValue = 0, clsValue = 0;
    
    // Monitor Largest Contentful Paint (LCP)
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'largest-contentful-paint') {
          lcpValue = entry.renderTime || entry.loadTime;
          if (lcpValue > 2500 && isDev) console.warn('⚠️ LCP (High):', lcpValue.toFixed(0), 'ms');
        }
      }
    });
    if (PerformanceObserver && 'largest-contentful-paint' in PerformanceObserver.supportedEntryTypes) {
      observer.observe({entryTypes: ['largest-contentful-paint']});
    }
  } catch (e) {
    // Web Vitals monitoring not available
  }
})();

// ===================== TOAST NOTIFICATIONS =====================
function showToast(msg, type = 'info', duration = 4000) {
  const existing = document.querySelector('.am-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'am-toast';
  t.textContent = msg;
  const bgColor = type === 'error' ? '#E24B4A' : type === 'success' ? '#3B6D11' : '#480415';
  t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
    padding:12px 20px;border-radius:8px;font-family:sans-serif;font-size:14px;
    background:${bgColor};color:#fff;box-shadow:0 4px 16px rgba(0,0,0,0.3);
    max-width:340px;word-wrap:break-word;`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

let compareList = JSON.parse(sessionStorage.getItem('am_compare') || '[]');
let GLOBAL_LISTINGS = [];

// ===================== XSS SANITIZATION =====================
function sanitize(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// H9: Validate icon URLs against allowlist to prevent SSRF and tracking pixels
function isSafeIconUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    // Only allow trusted Valorant API domains
    return ['media.valorant-api.com', 'valorant-api.com'].includes(u.hostname);
  } catch {
    return false;
  }
}

function isSafeImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    // Allow HTTPS URLs (backend already validates)
    if (url.startsWith('https://') && url.length < 500) return true;
    // Allow base64 data URLs (compressed montages)
    if (url.startsWith('data:image/') && url.includes(';base64,')) return true;
    return false;
  } catch {
    return false;
  }
} 

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // M2: Only fetch listings if page actually needs them
    const needsListings = document.getElementById('listingsGrid') ||
      document.getElementById('homeCarousel') ||
      document.getElementById('listingDetail') ||
      document.getElementById('savedGrid') ||
      document.getElementById('compareTable') ||
      document.getElementById('myListingsGrid');

    if (needsListings) {
      try {
        await fetchAllListingsFromDB();
      } catch (err) {
        logErr('Failed to load listings, continuing with empty state:', err);
        GLOBAL_LISTINGS = [];  // Continue with empty state
      }
    }
    
    try {
      initAuth();
    } catch (err) {
      logErr('Auth init failed:', err);
    }
    
    try {
      // Fetch CSRF token for state-changing requests
      await fetchCSRFToken();
    } catch (err) {
      logErr('CSRF token fetch failed:', err);
    }
    
    try {
      updateCartBadge(); 
    } catch (err) {
      logErr('Cart badge update failed:', err);
    }
    
    try {
      renderCompareTray();
    } catch (err) {
      logErr('Compare tray render failed:', err);
    }
    
    // Initialize video effect only on index page (where #heroSection exists)
    const heroSection = document.getElementById('heroSection');
    if (heroSection) {
      try {
        // Wait for window load to ensure images and styles are ready
        if (document.readyState === 'complete') {
          log('🎬 Page ready, initializing GSAP scroll effect...');
          if (typeof initVideoScrollEffects === 'function') {
            initVideoScrollEffects();
          }
        } else {
          window.addEventListener('load', () => {
            log('🎬 Window loaded, initializing GSAP scroll effect...');
            if (typeof initVideoScrollEffects === 'function') {
              initVideoScrollEffects();
            }
          }, { once: true });
        }
      } catch (err) {
        logErr('Video scroll effect failed:', err);
      }
    }

    // Render main grid (if on browse/dashboard)
    try {
      if (document.getElementById('listingsGrid')) {
        renderListingsGrid('listingsGrid', (getAllListings() || []).slice(0, 6));
        updateStatCount();
      }
    } catch (err) {
      logErr('Failed to render listings grid:', err);
    }

    // Render Home Page Carousel
    try {
      const carousel = document.getElementById('homeCarousel');
      if (carousel) {
        const newestListings = (getAllListings() || []).slice(0, 5);
        if (newestListings && newestListings.length > 0) {
          carousel.innerHTML = newestListings.map(renderListingCard).join('');
        } else {
          carousel.innerHTML = '<div class="status-message">No new listings at the moment.</div>';
        }
      }
    } catch (err) {
      logErr('Failed to render carousel:', err);
    }
  } catch (err) {
    logErr('Critical initialization error:', err);
    // Show fallback UI
    const fallback = document.createElement('div');
    fallback.style.cssText = 'padding:40px; text-align:center; color:#fff; background:#140f17;';
    fallback.innerHTML = '<h2>⚠️ Server Connection Error</h2><p>Please refresh the page.</p>';
    document.body.innerHTML = '';
    document.body.appendChild(fallback);
  }
});

// ===================== GLOBAL ERROR HANDLERS =====================
window.addEventListener('error', (event) => {
  logErr('Uncaught error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  logErr('Unhandled promise rejection:', event.reason);
  showToast('An unexpected error occurred. Please refresh.', 'error');
});

// ===================== DATABASE FETCHING =====================
async function fetchAllListingsFromDB() {
  try {
    const response = await fetch(`${API_BASE_URL}/listings`);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    // Backend returns {listings: [...], total, page, pages}
    GLOBAL_LISTINGS = Array.isArray(data) ? data : (data.listings || []);
  } catch (error) {
    logErr('Failed to fetch listings from backend:', error);
    // M1: Show empty state instead of fake sample data
    GLOBAL_LISTINGS = [];
  }
}

async function fetchUserListings(userEmail) {
  try {
    const res = await authFetch(`${API_BASE_URL}/user/listings`);
    if (!res.ok) throw new Error('Failed to fetch user listings');
    
    const userListings = await res.json();
    window.USER_LISTINGS = Array.isArray(userListings) ? userListings : [];
  } catch (err) {
    console.warn('Could not load user listings:', err);
    window.USER_LISTINGS = [];
  }
}

function getAllListings() {
  return GLOBAL_LISTINGS.filter(l => l.status === 'active');
}

function getListing(id) {
  return (getAllListings() || []).find(l => l?._id === id || l?.id === parseInt(id));
}

function updateStatCount() {
  const el = document.getElementById('stat-listings');
  if (el) el.textContent = (getAllListings() || []).length;
}

// ===================== FLAWLESS GSAP SCROLL SYNC =====================
// L5: GSAP Frame-Based Animation (From Video Frames)
// Cycles through 39 extracted frames based on scroll progress for smooth animation
// Advantages: Faster loading, better compatibility, more control
function initVideoScrollEffects() {
  const img = document.getElementById('scrubImage');
  if (!img) {
    warn('❌ Image element #scrubImage not found');
    return;
  }
  if (typeof gsap === 'undefined') {
    warn('❌ GSAP not defined');
    return;
  }
  if (typeof ScrollTrigger === 'undefined') {
    warn('❌ ScrollTrigger not defined');
    return;
  }
  if (typeof Lenis === 'undefined') {
    warn('❌ Lenis not defined');
    return;
  }
  
  log('✅ All dependencies loaded: GSAP, ScrollTrigger, Lenis');
  
  const totalFrames = 39; // Total extracted frames
  const framePath = 'frames/frame_';
  
  // Initialize Lenis smooth scroll
  const lenis = new Lenis({ 
    duration: 1.2, 
    smooth: true,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    gestureOrientation: 'vertical'
  });
  
  // Register GSAP plugin and connect Lenis
  gsap.registerPlugin(ScrollTrigger);
  
  // Synchronize Lenis scroll with ScrollTrigger
  lenis.on('scroll', ScrollTrigger.update);
  
  // Update Lenis using GSAP ticker (proper absolute time tracking)
  let previousTime = 0;
  gsap.ticker.add((time) => {
    // time parameter is in seconds from GSAP ticker
    // Convert to milliseconds for Lenis
    lenis.raf(time * 1000);
  });
  
  gsap.ticker.lagSmoothing(0);
  
  // Preload frames immediately (before scroll animation starts)
  const preloadFrames = async (total, path) => {
    const promises = [];
    for (let i = 1; i <= total; i++) {
      const promise = new Promise((resolve) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;  // Continue even if image fails to load
        img.src = `${path}${String(i).padStart(4, '0')}.jpg`;
      });
      promises.push(promise);
    }
    await Promise.all(promises);
    log(`✅ All ${total} frames preloaded into memory`);
  };
  
  // Start timeline - ASYNC IIFE
  (async () => {
    try {
      log('📹 Starting GSAP frame timeline...');
      
      // Preload frames BEFORE starting animation
      await preloadFrames(totalFrames, framePath);
      
      let tl = gsap.timeline({ 
        scrollTrigger: { 
          trigger: ".premium-hero", 
          start: "top top", 
          end: "+=3500",
          scrub: 1, 
          pin: true,
          markers: false,  // Set to true for debugging
          onUpdate: (self) => { 
            // Calculate which frame to show based on scroll progress
            const frameNum = Math.ceil(self.progress * totalFrames);
            const frameIndex = Math.max(1, Math.min(frameNum, totalFrames));
            img.src = `${framePath}${String(frameIndex).padStart(4, '0')}.jpg`;
          }
        } 
      });
      
      const animDuration = 1.0; // Animation duration for other elements
      
      // 1. Fade Text early
      tl.to(".gs-reveal-text", { opacity: 0, y: -100, scale: 1.05, duration: animDuration * 0.2 }, 0);
      
      // 2. Pop the cards up
      tl.fromTo(".glass-card", 
        { opacity: 0, y: 150, filter: "blur(10px)" }, 
        { opacity: 1, y: 0, filter: "blur(0px)", stagger: 0.05, duration: animDuration * 0.1, ease: "power2.out" }, 
        animDuration * 0.01 
      );
      
      log('✅ GSAP frame timeline created successfully', { totalFrames });
      
      // Refresh ScrollTrigger after timeline created
      ScrollTrigger.refresh();
    } catch (err) {
      logErr('❌ Error initializing GSAP timeline:', err);
    }
  })();
}

// ===================== API-DRIVEN AUTHENTICATION =====================
function initAuth() {
  const user = JSON.parse(localStorage.getItem('am_user') || 'null');
  const guestEl = document.getElementById('guestActions');
  const userEl = document.getElementById('userActions');
  const cartEl = document.querySelector('.nav-cart-icon');
  const vaultEl = document.getElementById('vaultNavBtn');
  const avatarEl = document.getElementById('avatarInitial');
  if (user) {
    guestEl?.classList.add('hidden');
    userEl?.classList.remove('hidden');
    if (cartEl) cartEl.style.display = 'flex'; // Show cart when logged in
    if (vaultEl) vaultEl.style.display = 'block'; // Show vault when logged in
    if (avatarEl) avatarEl.textContent = user?.name?.[0]?.toUpperCase?.() || 'U';
  } else {
    guestEl?.classList.remove('hidden');
    userEl?.classList.add('hidden');
    if (cartEl) cartEl.style.display = 'none'; // Hide cart when logged out
    if (vaultEl) vaultEl.style.display = 'none'; // Hide vault when logged out
  }
}

function openAuth(tab) {
  document.getElementById('authModal')?.classList.remove('hidden');
  if (tab) switchTab(tab);
}

function closeAuth() {
  document.getElementById('authModal')?.classList.add('hidden');
}

function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
  document.querySelectorAll('.auth-tab').forEach(t => {
    if (t.textContent.toLowerCase().includes(tab)) t.classList.add('active');
  });
  document.getElementById(tab + 'Form')?.classList.remove('hidden');
}

async function sendOTP(type) {
  const emailEl = document.getElementById(type + 'Email');
  const email = emailEl?.value.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!email || !emailRegex.test(email)) { showToast('Please enter a valid email address.', 'error'); return; }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, type })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById(type + 'OTPSection')?.classList.remove('hidden');
    showToast('Verification code sent! Please check your email inbox (including spam folder).', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function verifyOTP(type) {
  const otp = document.getElementById(type + 'OTP')?.value.trim();
  const email = document.getElementById(type + 'Email')?.value.trim().toLowerCase();
  const name = document.getElementById('signupName')?.value.trim() || 'New User';

  try {
    const res = await authFetch(`${API_BASE_URL}/auth/verify-otp`, {
      method: 'POST',
      body: JSON.stringify({ email, otp, name, type })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Store user info (token is in httpOnly cookie, sent automatically)
    localStorage.setItem('am_user', JSON.stringify(data.user));
    
    closeAuth();
    initAuth();
    updateCartBadge();
    if (window.location.pathname.includes('create-listing') || window.location.pathname.includes('profile')) {
      location.reload();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Fetch and cache CSRF token for state-changing requests
async function fetchCSRFToken() {
  try {
    const res = await fetch(`${API_BASE_URL}/csrf-token`, {
      method: 'GET',
      credentials: 'include'
    });
    if (res.ok) {
      const data = await res.json();
      if (data.csrfToken) {
        sessionStorage.setItem('csrf_token', data.csrfToken);
        return data.csrfToken;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch CSRF token:', err);
  }
  return null;
}

// Get authenticated headers (token is in httpOnly cookie, sent automatically by browser)
function getAuthHeaders() {
  return { 'Content-Type': 'application/json' };
  // No need to manually add Authorization header — httpOnly cookie is sent automatically
}

// Global fetch wrapper that handles 401 (expired token) responses
async function authFetch(url, options = {}) {
  // Fetch CSRF token for state-changing requests (POST, PUT, PATCH, DELETE)
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase())) {
    const csrfToken = sessionStorage.getItem('csrf_token') || await fetchCSRFToken();
    if (csrfToken) {
      options.headers = {
        ...(options.headers || {}),
        'CSRF-Token': csrfToken
      };
    }
  }
  
  const res = await fetch(url, {
    ...options,
    headers: { ...getAuthHeaders(), ...options.headers },
    credentials: 'include'
  });
  
  // Check if token has expired
  if (res.status === 401) {
    warn('⚠️ Session expired (401 Unauthorized)');
    localStorage.removeItem('am_user');
    openAuth('login');
    throw new Error('Session expired. Please log in again.');
  }
  
  return res;
}

function logout() {
  localStorage.removeItem('am_user');
  // Clear httpOnly cookie via logout endpoint
  fetch(`${API_BASE_URL}/auth/logout`, { 
    method: 'POST',
    credentials: 'include'
  })
    .catch(err => logErr('Logout error:', err))
    .finally(() => location.href = 'index.html');
}
// httpOnly cookie is cleared by server on logout
function toggleUserMenu() {
  document.getElementById('userMenu')?.classList.toggle('hidden');
}

// ===================== RANK HELPERS =====================
const RANK_ORDER = ['Iron','Bronze','Silver','Gold','Platinum','Diamond','Ascendant','Immortal','Radiant'];
function getRankLevel(rank) {
  if (!rank) return 0;
  const base = RANK_ORDER.findIndex(r => rank.includes(r));
  const num = parseInt(rank.split(' ')[1] || '1');
  return base * 3 + (num || 1);
}

function getRankColor(rank) {
  if (!rank) return 'iron';
  if (rank.includes('Radiant')) return 'radiant';
  if (rank.includes('Immortal')) return 'immortal';
  if (rank.includes('Ascendant')) return 'ascendant';
  if (rank.includes('Diamond')) return 'diamond';
  if (rank.includes('Platinum')) return 'platinum';
  if (rank.includes('Gold')) return 'gold';
  if (rank.includes('Silver')) return 'silver';
  if (rank.includes('Bronze')) return 'bronze';
  return 'iron';
}

function getRankIcon(rank) {
  const baseUrl = 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04';
  const imgStyle = 'width: 24px; height: 24px; object-fit: contain; vertical-align: middle; margin-right: 8px; position: relative; top: -1px;';
  if (!rank || rank === 'Unranked') return '';
  if (rank.includes('Radiant')) return `<img src="${baseUrl}/27/largeicon.png" style="${imgStyle}" alt="Radiant">`;
  const rankParts = rank.split(' ');
  const rankName = rankParts[0];
  const rankNum = parseInt(rankParts[1] || '1');
  let baseIdx = 0;
  if (rankName === 'Iron') baseIdx = 3;
  else if (rankName === 'Bronze') baseIdx = 6;
  else if (rankName === 'Silver') baseIdx = 9;
  else if (rankName === 'Gold') baseIdx = 12;
  else if (rankName === 'Platinum') baseIdx = 15;
  else if (rankName === 'Diamond') baseIdx = 18;
  else if (rankName === 'Ascendant') baseIdx = 21;
  else if (rankName === 'Immortal') baseIdx = 24;
  if (baseIdx > 0) {
    const exactIdx = baseIdx + (rankNum - 1);
    return `<img src="${baseUrl}/${exactIdx}/largeicon.png" style="${imgStyle}" alt="${rank}">`;
  }
  return '';
}

function timeAgo(dateStr) {
  if (!dateStr) return 'Just now';
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d < 7) return d + 'd ago';
  return Math.floor(d / 7) + 'w ago';
}

// ===================== INVENTORY UI GENERATORS =====================
window.switchInvTab = function(tabId, el) {
  document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.inv-content').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tab-' + tabId)?.classList.add('active');
};

function generateSkinsGrid(skinTags) {
  if(!skinTags || skinTags.length === 0) return '<p style="color:var(--white-dim); grid-column: 1/-1; text-align:center; padding: 40px;">No skins detailed by seller.</p>';
  
  return skinTags.map(skin => {
      try {
          const skinObj = typeof skin === 'string' ? JSON.parse(skin) : skin;
          
          // It blindly trusts the backend's 'displayTier'. If missing, falls back to premium.
          const tierClass = skinObj.displayTier || 'tier-premium'; 
          
          // C2: Sanitize fields + H9: Validate icon URL against allowlist
          const safeIcon = isSafeIconUrl(skinObj.icon) ? sanitize(skinObj.icon) : '';
          const skin_id = `skin-${sanitize(skinObj.name).replace(/[^a-z0-9]/gi, '')}`;
          return `<div class="skin-card ${sanitize(tierClass)}">
                    <div class="skin-img-container" id="${skin_id}">
                      ${safeIcon ? `<img src="${safeIcon}" alt="${sanitize(skinObj.name)}" loading="lazy">` : '<div class="skin-icon-placeholder">🔫</div>'}
                    </div>
                    <div class="skin-name">${sanitize(skinObj.name)}</div>
                  </div>`;
      } catch(e) {
          // Graceful fallback if data is corrupted
          return `<div class="skin-card tier-premium">
                    <div class="skin-icon-placeholder">🔫</div>
                    <div class="skin-name">Unknown Skin</div>
                  </div>`;
      }
  }).join('');
}

function generateAgentsGrid(agents) {
  if(!agents || agents.length === 0) return '<p style="color:var(--white-dim); grid-column: 1/-1; text-align:center; padding: 40px;">No specific agents detailed by seller.</p>';
  return agents.map(tagStr => {
       try {
          const agent = typeof tagStr === 'string' ? JSON.parse(tagStr) : tagStr;
          // C2: Sanitize fields + H9: Validate icon URL against allowlist
          const safeIcon = isSafeIconUrl(agent.icon) ? sanitize(agent.icon) : '';
          return `<div class="skin-card tier-battlepass">${safeIcon ? `<img src="${safeIcon}" alt="${sanitize(agent.name)}" style="height: 50px; margin-bottom: 10px;">` : '<div class="skin-icon-placeholder" style="font-size: 40px; margin-bottom: 10px;">🕵️</div>'}<div class="skin-name">${sanitize(agent.name)}</div></div>`;
       } catch(e) {
           return `<div class="skin-card tier-battlepass"><div class="skin-icon-placeholder" style="font-size: 40px; margin-bottom: 10px;">🕵️</div><div class="skin-name">${sanitize(typeof tagStr === 'string' ? tagStr.substring(0, 50) : 'Unknown')}</div></div>`;
       }
  }).join('');
}

// ===================== DYNAMIC TAGS GENERATOR =====================
function getCleanTags(l) {
  const displayTags = [
    `#${l.skinCount || 0}PremiumSkins`,
    `#${(l.rank || 'Unranked').replace(' ', '')}`,
    `#${l.region || 'AP'}Server`,
    l.banHistory ? '#PreviouslyRestricted' : '#NoBanHistory',
    l.emailAccess ? '#OriginalEmail' : '#FullAccess'
  ];
  if (l.skinCount > 0 && l.price > 0) {
    displayTags.push(`#₹${Math.round(l.price / l.skinCount)}PerPremiumSkin`);
  }
  return displayTags;
}

// ===================== LISTING CARD =====================
function renderListingCard(l) {
  if (!l) return '';
  const idToUse = l._id || l.id; 
  const title = sanitize(l.title || 'Untitled Account');
  const rank = sanitize(l.rank || 'Unranked');
  const price = l.price || 0;
  const region = sanitize(l.region || 'AP');
  const skinCount = l.skinCount || 0;
  const agentsCount = l.agentsCount || (l.agents ? l.agents.length : 0);
  const isSold = l.status === 'sold';
  const saved = isWishlisted(idToUse);
  const inCompare = compareList.includes(idToUse);
  const imgHtml = (l?.images?.[0] && isSafeImageUrl(l.images[0])) ? `<img src="${l.images[0]}" alt="${sanitize(l?.title)}" loading="lazy">` : `<div class="card-img-placeholder">🎮</div>`;
  const badges = [];
  if (isSold) badges.push('<span class="badge badge-sold" style="background: rgba(200,0,0,0.3); color: #ff6b6b; border: 1px solid rgba(200,0,0,0.5);">SOLD</span>');
  if (l.contactReveals > 10) badges.push('<span class="badge badge-hot">Hot</span>');
  if (l?.images && l.images.length >= 3) badges.push('<span class="badge badge-verified">Verified</span>');
  const cleanTags = (getCleanTags(l) || []).map(t => `<span class="pill" onclick="event.stopPropagation(); window.location='browse.html?tag=${t.replace('#','')}'">${ t}</span>`).join('');

  const cardClickHandler = isSold ? '' : `onclick="window.location='listing.html?id=${idToUse}'"`;
  const cardKeyHandler = isSold ? '' : `onkeypress="if(event.key==='Enter'){window.location='listing.html?id=${idToUse}';}"`;
  const cardCursor = isSold ? 'style="cursor: default;"' : '';

  const actionButton = isSold 
    ? `<button class="btn-primary full" style="background: #ff4444; padding: 10px; font-size: 13px;" onclick="event.stopPropagation();toggleWishlist('${idToUse}', this)">Remove from Saved</button>`
    : `<button class="bookmarkBtn ${saved ? 'saved' : ''}" onclick="event.stopPropagation();toggleWishlist('${idToUse}', this)" title="Save">
        <span class="IconContainer">
          <svg viewBox="0 0 384 512" height="0.9em" class="icon">
            <path d="M0 48V487.7C0 501.1 10.9 512 24.3 512c5 0 9.9-1.5 14-4.4L192 400 345.7 507.6c4.1 2.9 9 4.4 14 4.4c13.4 0 24.3-10.9 24.3-24.3V48c0-26.5-21.5-48-48-48H48C21.5 0 0 21.5 0 48z"></path>
          </svg>
        </span>
        <p class="text">${saved ? 'Saved' : 'Save'}</p>
      </button>`;

  return `
    <div class="listing-card" ${cardClickHandler}
      role="link" tabindex="0" aria-label="${title}"
      ${cardKeyHandler} ${cardCursor}>
      <div class="card-img-wrap">
        ${imgHtml}
        <div class="card-badges">${badges.join('')}</div>
        <div class="compare-check ${inCompare ? 'selected' : ''}" onclick="event.stopPropagation();toggleCompare('${idToUse}', '${title.replace(/'/g,"\\'")}', this)" title="Add to compare">⚖</div>
      </div>
      <div class="card-body">
        <div class="card-rank">
          <span class="rank-badge ${getRankColor(rank)}" style="display:inline-flex; align-items:center;">${getRankIcon(rank)} ${rank}</span>
          <span class="region-badge">${region}</span>
        </div>
        <div class="card-title">${title}</div>
        <div class="card-summary">${sanitize(l.aiSummary || '')}</div>
        <div class="card-stats">
          <span class="card-stat"><span>${skinCount}</span> prem. skins</span>
          <span class="card-stat"><span>${agentsCount}</span> agents</span>
          <span class="card-stat"><span>${l.emailAccess ? 'Original Email' : 'New Mail Transfer'}</span></span>
          ${l.vpBalance > 0 ? `<span class="card-stat"><span>${l.vpBalance}</span> VP</span>` : ''}
        </div>
        <div class="card-tags">${cleanTags}</div>
        <div class="card-footer">
          <div class="card-price">₹${price.toLocaleString('en-IN')}</div>
          <div class="card-actions">
            ${actionButton}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderListingsGrid(containerId, listings) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!listings || listings.length === 0) {
    el.innerHTML = '<p style="color:var(--white-dim);padding:20px;font-family:var(--font-ui)">No listings found.</p>';
    return;
  }
  el.innerHTML = listings.map(renderListingCard).join('');
}

// ===================== LISTING DETAIL PAGE =====================
async function renderListingDetail(id) {
  const l = getListing(id);
  if (!l) { 
    document.getElementById('listingDetail').innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 100px;"><h2 class="section-title" style="margin-bottom: 20px;">Account Not Found</h2><p style="color: var(--white-dim); margin-bottom: 20px;">This listing may have been deleted or removed.</p><a href="browse.html" class="btn-primary">Browse Accounts</a></div>`;
    return; 
  }

  if (l._id) fetch(`${API_BASE_URL}/listings/${l._id}/view`, { method: 'POST' }).catch(logErr);

  document.title = (l.title || 'Account') + ' — Asta Mart';
  
  // Update meta tags for social sharing
  const description = l.aiSummary || l.title || 'Verified Valorant account on Asta Mart';
  document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', (l.title || 'Account') + ' — Asta Mart');
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
  document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', (l.title || 'Account') + ' — Asta Mart');
  document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', description);
  const idToUse = l._id || l.id;
  const cleanTags = getCleanTags(l).map(t => `<span class="pill" onclick="window.location='browse.html?tag=${t.replace('#','')}'">${t}</span>`).join('');
  const badges = [];
  if (l.banHistory) badges.push('<span class="badge badge-ban" style="padding:5px 12px;font-size:13px">Prev. Restricted</span>');
  const agentsCount = l?.agentsCount ?? l?.agents?.length ?? 0;
  const totalSkinCount = l?.skinTags?.length ?? 0;
  const saved = isWishlisted(idToUse);

  // Image gallery section (if images exist)
  const imageGalleryHtml = (l?.images && l.images.length > 0 && isSafeImageUrl(l.images[0]))
    ? `<div style="grid-column: 1/-1; margin-bottom: 30px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
        <div style="width: 100%; max-height: 500px; background: #000; display: flex; align-items: center; justify-content: center;">
          <img src="${sanitize(l.images[0])}" alt="Listing montage" style="max-width: 100%; max-height: 500px; object-fit: contain;">
        </div>
      </div>`
    : '';

  const inCompare = compareList.includes(idToUse);

  const html = `
    ${imageGalleryHtml}
    <div class="detail-left">
      <h1 class="detail-title" style="font-size: 42px; margin-bottom: 8px; font-family: var(--font-display); font-weight: 900; text-transform: uppercase;">${sanitize(l.title || 'Untitled Account')}</h1>
      <div class="detail-tags" style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 24px;">${cleanTags}${badges.join('')}</div>

      <div class="detail-stats-grid">
        <div class="detail-stat"><div class="detail-stat-val">${l.skinCount || 0}</div><div class="detail-stat-label">Prem. Skins</div></div>
        <div class="detail-stat"><div class="detail-stat-val">${agentsCount}</div><div class="detail-stat-label">Agents</div></div>
        <div class="detail-stat"><div class="detail-stat-val">${l.level || 1}</div><div class="detail-stat-label">Level</div></div>
        <div class="detail-stat"><div class="detail-stat-val">${l.bpCompleted || 0}</div><div class="detail-stat-label">Battle Passes</div></div>
        <div class="detail-stat"><div class="detail-stat-val">${l.vpBalance || 0}</div><div class="detail-stat-label">VP Balance</div></div>
        <div class="detail-stat"><div class="detail-stat-val" style="font-size: 26px;">₹${l.skinCount > 0 ? Math.round((l.price||0)/l.skinCount).toLocaleString('en-IN') : '—'}</div><div class="detail-stat-label">Per Prem. Skin</div></div>
      </div>

      <div class="detail-section" style="margin-bottom: 28px;">
        <h4 style="font-family: var(--font-display); font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: var(--accent-cyan); margin-bottom: 12px;">Account Info</h4>
        <div class="detail-info-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div style="background: rgba(20, 15, 23, 0.6); padding: 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
              <span style="display: block; font-family: var(--font-mono); font-size: 10px; color: var(--white-dim); text-transform: uppercase; letter-spacing: 1px;">Region</span>
              <span style="font-family: var(--font-ui); font-size: 16px; font-weight: bold; color: #fff; margin-top: 4px; display: block;">${sanitize(l.region || 'AP')}</span>
          </div>
          <div style="background: rgba(20, 15, 23, 0.6); padding: 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
              <span style="display: block; font-family: var(--font-mono); font-size: 10px; color: var(--white-dim); text-transform: uppercase; letter-spacing: 1px;">Email Status</span>
              <span style="font-family: var(--font-ui); font-size: 14px; font-weight: bold; color: var(--accent-green); display: flex; align-items: center; gap: 6px; margin-top: 4px;">✅ ${l.emailAccess ? 'Original Email Included' : 'Transfer to New Mail (Full Access)'}</span>
          </div>
          <div style="background: rgba(20, 15, 23, 0.6); padding: 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
              <span style="display: block; font-family: var(--font-mono); font-size: 10px; color: var(--white-dim); text-transform: uppercase; letter-spacing: 1px;">Ban History</span>
              <span style="font-family: var(--font-ui); font-size: 14px; font-weight: bold; display: flex; align-items: center; gap: 6px; margin-top: 4px; color: ${l.banHistory?'#ff6b6b':'var(--accent-green)'}">${l.banHistory ? '⚠️ Yes' : '✅ Clean'}</span>
          </div>
          <div style="background: rgba(20, 15, 23, 0.6); padding: 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
              <span style="display: block; font-family: var(--font-mono); font-size: 10px; color: var(--white-dim); text-transform: uppercase; letter-spacing: 1px;">Limited Skins</span>
              <span style="font-family: var(--font-ui); font-size: 14px; font-weight: bold; color: ${l.limited ? 'var(--accent-gold)' : '#fff'}; margin-top: 4px; display: block; line-height: 1.4;">${l.limited && l.limitedDetail ? `✨ ${sanitize(l.limitedDetail)}` : 'None'}</span>
          </div>
        </div>
      </div>

      <div class="inventory-section">
        <div class="inventory-tabs">
          <button class="inv-tab active" onclick="switchInvTab('skins', this)">Premium Skins (${totalSkinCount})</button>
          <button class="inv-tab" onclick="switchInvTab('battlepass', this)">Battlepass (${l?.battlepassTags?.length ?? 0})</button>
          <button class="inv-tab" onclick="switchInvTab('agents', this)">Agents (${agentsCount})</button>
        </div>
        
        <div id="tab-skins" class="inv-content active">
           <div class="skin-grid">${generateSkinsGrid(l.skinTags || [])}</div>
        </div>
        <div id="tab-battlepass" class="inv-content">
           <div class="skin-grid">${generateSkinsGrid(l.battlepassTags || [])}</div>
        </div>
        <div id="tab-agents" class="inv-content">
           <div class="skin-grid">${generateAgentsGrid(l.agents || [])}</div>
        </div>
      </div>

      <p style="font-size:12px;color:var(--white-dim);margin-top:20px;font-family:var(--font-mono);">Posted ${timeAgo(l.createdAt)} • ${l.views || 0} views</p>
    </div>

    <div class="detail-right">
      <div class="contact-card" style="background: rgba(20, 15, 23, 0.6); border: 1px solid rgba(255,255,255,0.05); padding: 24px; border-radius: 12px; position: sticky; top: 100px;">
        <div class="detail-price" style="font-size: 48px; color: var(--red); font-family: var(--font-display); font-weight: 900; margin-bottom: 4px; line-height: 1;">₹${(l.price||0).toLocaleString('en-IN')}</div>
        <div class="detail-price-sub" style="font-family: var(--font-mono); font-size: 11px; color: var(--white-dim); margin-bottom: 24px;">Negotiable • Secure Transaction</div>

        <div class="detail-ranks" style="display: flex; gap: 10px; margin-bottom: 24px;">
          <div class="detail-rank" style="flex: 1; background: rgba(20, 15, 23, 0.3); padding: 12px; border-radius: 6px; text-align: center;">
            <div class="detail-rank-label" style="font-size: 9px; font-family: var(--font-mono); color: var(--white-dim); text-transform: uppercase; margin-bottom: 6px;">Current Rank</div>
            <div class="detail-rank-val ${getRankColor(l.rank)}" style="display:flex; align-items:center; justify-content:center; font-family: var(--font-display); font-weight: 900; font-size: 18px;">${getRankIcon(l.rank)} ${l.rank || 'Unranked'}</div>
          </div>
          <div class="detail-rank" style="flex: 1; background: rgba(20, 15, 23, 0.3); padding: 12px; border-radius: 6px; text-align: center;">
            <div class="detail-rank-label" style="font-size: 9px; font-family: var(--font-mono); color: var(--white-dim); text-transform: uppercase; margin-bottom: 6px;">Peak Rank</div>
            <div class="detail-rank-val ${getRankColor(l.peakRank)}" style="display:flex; align-items:center; justify-content:center; font-family: var(--font-display); font-weight: 900; font-size: 18px;">${getRankIcon(l.peakRank)} ${l.peakRank || 'Unranked'}</div>
          </div>
        </div>

        <div class="seller-mini" style="display: flex; align-items: center; gap: 12px; padding: 16px; background: rgba(20, 15, 23, 0.3); border-radius: 6px; margin-bottom: 24px;">
          <div class="seller-avatar" style="width: 40px; height: 40px; border-radius: 50%; background: var(--red); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; color: #fff;">${l.sellerName ? sanitize(l.sellerName)[0].toUpperCase() : 'S'}</div>
          <div class="seller-info">
            <div class="seller-name" style="font-family: var(--font-ui); font-weight: 700; font-size: 15px;">${sanitize(l.sellerName || 'Seller')}</div>
            <div class="seller-rep" style="color: var(--accent-gold); font-size: 12px; font-family: var(--font-mono); margin-top: 2px;">Verified Member</div>
          </div>
        </div>

        <div class="detail-action-btns" style="display: flex; gap: 10px; margin-bottom: 16px;">
          <button class="btn-ghost compare-add-btn" style="flex: 1; padding: 12px;" onclick="toggleCompare('${idToUse}','${(l.title||'').replace(/'/g,"\\'")}',this)">⚖ ${inCompare ? 'Comparing' : 'Compare'}</button>
          <button class="bookmarkBtn ${saved ? 'saved' : ''}" style="flex: 1; padding: 12px; justify-content: center;" onclick="toggleWishlist('${idToUse}',this)">
              <span class="IconContainer">
                <svg viewBox="0 0 384 512" height="0.9em" class="icon">
                  <path d="M0 48V487.7C0 501.1 10.9 512 24.3 512c5 0 9.9-1.5 14-4.4L192 400 345.7 507.6c4.1 2.9 9 4.4 14 4.4c13.4 0 24.3-10.9 24.3-24.3V48c0-26.5-21.5-48-48-48H48C21.5 0 0 21.5 0 48z"></path>
                </svg>
              </span>
              <p class="text">${saved ? 'Saved' : 'Save'}</p>
          </button>
        </div>

        <div class="reveal-btn-section">
          <button class="btn-primary reveal-btn full" style="padding: 16px; font-size: 16px; font-weight: bold;" onclick="revealContact('${idToUse}')">REVEAL SELLER CONTACT</button>
        </div>

        <div class="contact-revealed" id="contactRevealed" style="display:none; margin-top: 16px;">
          ${l.sellerId ? `<div class="contact-method" style="padding: 12px; background: rgba(20, 15, 23, 0.3); margin-bottom: 8px; border-radius: 6px; font-family: var(--font-mono); font-size: 12px; display: flex; align-items: center; gap: 8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #ff4655; flex-shrink: 0;"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg> <a href="mailto:${sanitize(l.sellerId)}" style="color: #730c1e; text-decoration: none;">${sanitize(l.sellerId)}</a></div>` : ''}
          <div id="extraContactMethods"></div>
          ${l.sellerPhone ? `<button class="btn-primary full" style="margin-top: 10px; background: #25D366; color: #fff; padding: 16px; font-size: 16px;" onclick="openWhatsApp('${idToUse}')">💬 Message on WhatsApp</button>` : ''}
        </div>
      </div>
    </div>
  `;

  document.getElementById('listingDetail').innerHTML = html;

  const similar = (getAllListings() || [])
    .filter(x => x && x._id && l._id && x._id !== l._id && x?.region === l?.region)
    .slice(0, 4) ?? [];
  renderListingsGrid('similarGrid', similar);
}

async function revealContact(id) {
  const user = JSON.parse(localStorage.getItem('am_user') || 'null');
  if (!user) { openAuth('login'); return; }
  
  try {
    const response = await authFetch(`${API_BASE_URL}/listings/${id}/reveal`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to reveal contact');
    }
    
    const contactData = await response.json();
    const l = getListing(id);
    let extraHtml = '';
    if (contactData.sellerId) extraHtml += `<div class="contact-method" style="padding: 12px; background: rgba(20, 15, 23, 0.3); margin-bottom: 8px; border-radius: 6px; font-family: var(--font-mono); font-size: 12px; display: flex; align-items: center; gap: 8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #ff4655; flex-shrink: 0;"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg> <a href="mailto:${sanitize(contactData.sellerId)}" style="color: #730c1e; text-decoration: none;">${sanitize(contactData.sellerId)}</a></div>`;
    if (contactData.sellerDiscord) extraHtml += `<div class="contact-method" style="padding: 12px; background: rgba(0,0,0,0.3); margin-bottom: 8px; border-radius: 6px; font-family: var(--font-mono); font-size: 12px; display: flex; align-items: center; gap: 8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="color: #7289DA;"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.211.375-.444.864-.607 1.25a18.27 18.27 0 00-5.487 0c-.163-.386-.395-.875-.607-1.25a.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 00-.042-.106 13.107 13.107 0 01-1.872-.892.077.077 0 00-.008-.128 10.66 10.66 0 00.372-.294.075.075 0 00.076-.01c3.928 1.793 8.18 1.793 12.062 0a.075.075 0 00.076.009c.12.098.246.198.373.294a.077.077 0 00-.006.127 12.299 12.299 0 01-1.873.892.076.076 0 00-.041.107c.36.699.77 1.364 1.225 1.994a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.056c.5-4.506.823-8.95.399-13.487a.061.061 0 00-.031-.027zM8.02 15.33c-1.183 0-2.157-.965-2.157-2.156 0-1.193.964-2.157 2.157-2.157 1.193 0 2.157.964 2.157 2.157 0 1.191-.964 2.156-2.157 2.156zm7.975 0c-1.183 0-2.157-.965-2.157-2.156 0-1.193.964-2.157 2.157-2.157 1.193 0 2.157.964 2.157 2.157 0 1.191-.964 2.156-2.157 2.156z"/></svg> <strong>${sanitize(contactData.sellerDiscord)}</strong></div>`;
    if (contactData.sellerPhone) extraHtml += `<div class="contact-method" style="padding: 12px; background: rgba(0,0,0,0.3); margin-bottom: 8px; border-radius: 6px; font-family: var(--font-mono); font-size: 12px; display: flex; align-items: center; gap: 8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #25D366; flex-shrink: 0;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg> <strong>${sanitize(contactData.sellerPhone)}</strong></div>`;
    if (contactData.sellerPhone) extraHtml += `<button class="btn-primary full" style="margin-top: 10px; background: #25D366; color: #fff; padding: 16px; font-size: 16px;" onclick="openWhatsAppWithPhone('${id}', '${contactData.sellerPhone.replace(/[^0-9]/g, '')}', '${(l ? l.sellerName : 'there').replace(/'/g, "\\'")}')">\ud83d\udcac Message on WhatsApp</button>`;
    
    const extraEl = document.getElementById('extraContactMethods');
    if (extraEl) extraEl.innerHTML = extraHtml;

    document.querySelector('.reveal-btn-section').style.display = 'none';
    document.getElementById('contactRevealed').style.display = 'block';
  } catch (err) {
    showToast('Error revealing contact: ' + err.message, 'error');
  }
}

function openWhatsApp(id) {
  const l = getListing(id);
  if (!l || !l.sellerPhone) return;
  const msg = encodeURIComponent(`Hi ${l.sellerName || 'there'}, I'm interested in your Valorant account listed on Asta Mart — "${l.title}". Can we discuss?`);
  const phone = l.sellerPhone.replace(/[^0-9]/g, '');
  window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
}

function openWhatsAppWithPhone(id, phone, sellerName) {
  const l = getListing(id);
  const msg = encodeURIComponent(`Hi ${sellerName || 'there'}, I'm interested in your Valorant account listed on Asta Mart — "${(l ? l.title : 'your account')}". Can we discuss?`);
  window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
}

// ===================== WISHLIST & CART BADGE =====================
function isWishlisted(id) {
  const user = JSON.parse(localStorage.getItem('am_user') || 'null');
  if (!user) return false;
  const list = JSON.parse(localStorage.getItem('am_wishlist_' + user?.email) || '[]');
  return list.includes(id.toString());
}

function toggleWishlist(id, btn) {
  const user = JSON.parse(localStorage.getItem('am_user') || 'null');
  if (!user) { openAuth('login'); return; }
  const key = 'am_wishlist_' + user?.email;
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  const strId = id.toString();
  const idx = list.indexOf(strId);
  
  if (idx > -1) {
    list.splice(idx, 1);
    if(btn) { 
      btn.classList.remove('saved'); 
      const txt = btn.querySelector('.text');
      if (txt) txt.textContent = 'Save';
    }
  } else {
    list.push(strId);
    if(btn) { 
      btn.classList.add('saved'); 
      const txt = btn.querySelector('.text');
      if (txt) txt.textContent = 'Saved';
    }
  }
  localStorage.setItem(key, JSON.stringify(list));
  updateCartBadge();
}

function updateCartBadge() {
  const user = JSON.parse(localStorage.getItem('am_user') || 'null');
  if (!user) return;
  const key = 'am_wishlist_' + user.email;
  let list = JSON.parse(localStorage.getItem(key) || '[]');
  const badge = document.getElementById('navCartBadge');
  
  // If no saved items, hide badge immediately
  if (list.length === 0) {
    if (badge) {
      badge.style.display = 'none';
    }
    return;
  }
  
  // Don't show count until we've verified which items are actually available
  if (badge) {
    badge.style.display = 'flex';
    badge.textContent = '...'; // Show loading state
  }
  
  // Fetch listings to check which are sold, then filter
  fetch(`${API_BASE_URL}/listings`)
    .then(r => r.json())
    .then(data => {
      const allListings = Array.isArray(data) ? data : (data.listings || []);
      // Filter out sold items AND items that no longer exist
      const availableList = list.filter(savedId => {
        const listing = allListings.find(l => (l._id || l.id).toString() === savedId.toString());
        return listing && listing.status !== 'sold';  // Keep only items that exist AND are not sold
      });
      // Update localStorage with filtered list
      localStorage.setItem(key, JSON.stringify(availableList));
      // Update badge with actual count
      if (badge) {
        badge.textContent = availableList.length;
        badge.style.display = availableList.length > 0 ? 'flex' : 'none';
      }
    })
    .catch(() => {
      // Fallback: if fetch fails, hide badge (conservative approach - don't show potentially stale count)
      if (badge) {
        badge.style.display = 'none';
      }
    });
}

// ===================== COMPARE =====================
function toggleCompare(id, title, btn) {
  const strId = id.toString();
  const idx = compareList.indexOf(strId);
  if (idx > -1) {
    compareList.splice(idx, 1);
    btn?.classList.remove('selected');
  } else {
    if (compareList.length >= 3) { showToast('You can compare up to 3 accounts at once.', 'info'); return; }
    compareList.push(strId);
    btn?.classList.add('selected');
  }
  // Update button text on detail page
  if (btn && btn.classList.contains('compare-add-btn')) {
    btn.textContent = compareList.includes(strId) ? '⚖ Comparing' : '⚖ Compare';
  }
  sessionStorage.setItem('am_compare', JSON.stringify(compareList));
  renderCompareTray();
}

function renderCompareTray() {
  const tray = document.getElementById('compareTray');
  if (!tray) return;
  if (compareList.length === 0) { tray.classList.add('hidden'); return; }
  tray.classList.remove('hidden');
  const items = document.getElementById('compareItems');
  if (items) {
    items.innerHTML = compareList.map(id => {
      const l = getListing(id);
      return l ? `<div class="compare-item-chip">₹${(l.price||0).toLocaleString('en-IN')} <span onclick="toggleCompare('${id}','',null)" style="cursor:pointer;color:var(--white-dim); margin-left: 6px;">✕</span></div>` : '';
    }).join('');
  }
}

function clearCompare() {
  compareList = [];
  sessionStorage.setItem('am_compare', JSON.stringify([]));
  renderCompareTray();
  document.querySelectorAll('.compare-check').forEach(c => c.classList.remove('selected'));
}

function goCompare() {
  if (compareList.length < 2) { showToast('Select at least 2 accounts to compare.', 'info'); return; }
  window.location = 'compare.html';
}

function renderComparePage() {
  const ids = JSON.parse(sessionStorage.getItem('am_compare') || '[]');
  if (ids.length < 2) {
    document.getElementById('compareTable').innerHTML = '<div class="no-results" style="text-align:center; padding: 100px;"><h3>No accounts selected</h3><br><a href="browse.html" class="btn-primary">Browse Accounts</a></div>';
    return;
  }
  const listings = ids.map(id => getListing(id)).filter(Boolean);
  const rows = [
    { label: 'Price', key: l => `<div><div class="compare-price">₹${(l.price||0).toLocaleString('en-IN')}</div></div>`, best: (vals, listings) => listings.reduce((a,b) => (b.price < a.price ? b : a))._id },
    { label: 'Current Rank', key: l => `<div style="display:flex; align-items:center;">${getRankIcon(l.rank)} ${sanitize(l.rank)}</div>`, best: (vals, listings) => listings.reduce((a,b) => getRankLevel(b.rank) > getRankLevel(a.rank) ? b : a)._id },
    { label: 'Region', key: l => sanitize(l.region) },
    { label: 'Premium Skins', key: l => l.skinCount, best: (vals, listings) => listings.reduce((a,b) => b.skinCount > a.skinCount ? b : a)._id },
    { label: 'Agents', key: l => l.agentsCount, best: (vals, listings) => listings.reduce((a,b) => b.agentsCount > a.agentsCount ? b : a)._id },
    { label: 'Email Status', key: l => l.emailAccess ? '✅ Original Email' : '✅ Transfer to New Mail' },
    { label: 'Ban History', key: l => l.banHistory ? '⚠️ Yes' : '✅ Clean' },
    { label: 'VP Balance', key: l => l.vpBalance || 0, best: (vals, listings) => listings.reduce((a,b) => (b.vpBalance||0) > (a.vpBalance||0) ? b : a)._id },
  ];
  const headerCols = listings.map(l => `<div class="compare-acc-col"><span class="compare-acc-header" style="font-size: 14px;">${sanitize(l.title)}</span><a href="listing.html?id=${l._id || l.id}" class="btn-ghost sm" style="margin-top:8px">View Listing</a></div>`).join('');
  const rowsHtml = rows.map(row => {
    const bestId = row.best ? row.best(null, listings) : null;
    const cols = listings.map(l => {
      const val = row.key(l);
      const isBest = bestId === (l._id || l.id);
      return `<div class="compare-acc-col ${isBest ? 'compare-best' : ''}" style="${isBest ? 'color: var(--accent-green); font-weight: bold;' : ''}">${val}</div>`;
    }).join('');
    return `<div class="compare-row"><div class="compare-label-col">${row.label}</div>${cols}</div>`;
  }).join('');
  document.getElementById('compareTable').innerHTML = `<div class="compare-header"><div class="compare-label-col"></div>${headerCols}</div>${rowsHtml}`;
}
async function deleteListing(id, btnElement) {
  if (!confirm("Are you sure you want to delete this listing? This action cannot be undone.")) return;

  try {
    const res = await authFetch(`${API_BASE_URL}/listings/${id}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to delete listing");
    }

    // Success: Animate the card out of existence
    const card = btnElement.closest('.listing-card') || btnElement.closest('.dashboard-row');
    if (card) {
      card.style.transform = "scale(0.8)";
      card.style.opacity = "0";
      setTimeout(() => card.remove(), 300);
    }
    
    showToast("Listing deleted successfully.", 'success');
  } catch (err) {
    logErr("Delete error:", err);
    showToast(err.message, 'error');
  }
}