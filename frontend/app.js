// ===================== APP STATE & API CONFIG =====================
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.'))
  ? 'http://localhost:5000/api'
  : 'https://api.asta-mart.in/api';
// Only log API endpoint in development/local environments
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.')) {
  console.log('🔌 API_BASE_URL:', API_BASE_URL, '| Hostname:', window.location.hostname);
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

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', async () => {
  // M2: Only fetch listings if page actually needs them
  const needsListings = document.getElementById('listingsGrid') ||
    document.getElementById('homeCarousel') ||
    document.getElementById('listingDetail') ||
    document.getElementById('savedGrid') ||
    document.getElementById('compareTable') ||
    document.getElementById('myListingsGrid');

  if (needsListings) await fetchAllListingsFromDB();
  
  initAuth();
  updateCartBadge(); 
  renderCompareTray();
  
  // Initialize video effect only on index page (where #heroSection exists)
  const heroSection = document.getElementById('heroSection');
  if (heroSection) {
    // If page is already loaded, call immediately; otherwise wait for load event
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      console.log('🎬 Page already loaded, initializing video effect...');
      setTimeout(() => {
        if (typeof initVideoScrollEffects === 'function') {
          initVideoScrollEffects();
        } else {
          console.error('❌ initVideoScrollEffects function not found');
        }
      }, 100);
    } else {
      window.addEventListener('load', () => {
        console.log('🎬 Window load event fired, initializing video effect...');
        setTimeout(() => {
          if (typeof initVideoScrollEffects === 'function') {
            initVideoScrollEffects();
          } else {
            console.error('❌ initVideoScrollEffects function not found');
          }
        }, 300);
      }, { once: true });
    }
  }

  // Render main grid (if on browse/dashboard)
  if (document.getElementById('listingsGrid')) {
    renderListingsGrid('listingsGrid', getAllListings().slice(0, 6));
    updateStatCount();
  }

  // Render Home Page Carousel
  const carousel = document.getElementById('homeCarousel');
  if (carousel) {
    const newestListings = getAllListings().slice(0, 5);
    if (newestListings.length > 0) {
      carousel.innerHTML = newestListings.map(renderListingCard).join('');
    } else {
      carousel.innerHTML = '<div class="status-message">No new listings at the moment.</div>';
    }
  }
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
    console.error('Failed to fetch listings from backend:', error);
    // M1: Show empty state instead of fake sample data
    GLOBAL_LISTINGS = [];
  }
}

function getAllListings() {
  return GLOBAL_LISTINGS.filter(l => l.status === 'active');
}

function getListing(id) {
  return getAllListings().find(l => l._id === id || l.id === parseInt(id));
}

function updateStatCount() {
  const el = document.getElementById('stat-listings');
  if (el) el.textContent = getAllListings().length;
}

// ===================== FLAWLESS GSAP SCROLL SYNC =====================
// L5: GSAP Frame-Based Animation (From Video Frames)
// Cycles through 39 extracted frames based on scroll progress for smooth animation
// Advantages: Faster loading, better compatibility, more control
function initVideoScrollEffects() {
  const img = document.getElementById('scrubImage');
  if (!img) {
    console.warn('❌ Image element not found');
    return;
  }
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    console.warn('❌ GSAP or ScrollTrigger not loaded');
    return;
  }
  if (typeof Lenis === 'undefined') {
    console.warn('❌ Lenis not loaded');
    return;
  }
  
  console.log('🎬 Initializing frame-based scroll effect...');
  
  const totalFrames = 39; // Total extracted frames
  const framePath = 'frames/frame_';
  
  // Initialize Lenis smooth scroll with proper lifecycle management
  const lenis = new Lenis({ 
    duration: 1.2, 
    smooth: true,
    viewport: window.innerHeight
  });
  
  // Connect Lenis to RAF
  let lenisAnimationId = null;
  function raf(time) { 
    lenis.raf(time); 
    lenisAnimationId = requestAnimationFrame(raf); 
  }
  lenisAnimationId = requestAnimationFrame(raf);
  
  // Register GSAP plugin and connect Lenis
  gsap.registerPlugin(ScrollTrigger);
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  
  const startGSAPTimeline = () => {
    try {
      console.log('📹 Starting GSAP frame timeline...');
      
      let tl = gsap.timeline({ 
        scrollTrigger: { 
          trigger: ".premium-hero", 
          start: "top top", 
          end: "+=3500",
          scrub: 1, 
          pin: true,
          markers: false,
          onUpdate: (self) => { 
            // Calculate which frame to show based on scroll progress
            const frameNum = Math.ceil(self.progress * totalFrames);
            const frameIndex = Math.max(1, Math.min(frameNum, totalFrames));
            img.src = `${framePath}${String(frameIndex).padStart(4, '0')}.jpg`;
            
            if (ScrollTrigger.getAll().length > 0) {
              ScrollTrigger.getAll()[0].refresh(); 
            }
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
      
      console.log('✅ GSAP frame timeline created successfully', { totalFrames });
    } catch (err) {
      console.error('❌ Error initializing GSAP timeline:', err);
    }
  };
  
  // Start timeline with small delay to ensure DOM is ready
  console.log('📌 Starting frame animation...');
  setTimeout(startGSAPTimeline, 100);
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
    if (avatarEl) avatarEl.textContent = user.name ? user.name[0].toUpperCase() : 'U';
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
  
  if (!email || !emailRegex.test(email)) { alert('Please enter a valid email address.'); return; }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, type })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById(type + 'OTPSection')?.classList.remove('hidden');
    alert('Verification code sent! Please check your email inbox (including spam folder).');
  } catch (err) {
    alert(err.message);
  }
}

async function verifyOTP(type) {
  const otp = document.getElementById(type + 'OTP')?.value.trim();
  const email = document.getElementById(type + 'Email')?.value.trim().toLowerCase();
  const name = document.getElementById('signupName')?.value.trim() || 'New User';

  try {
    const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
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
    alert(err.message);
  }
}

// Get authenticated headers (token is in httpOnly cookie, sent automatically by browser)
function getAuthHeaders() {
  return { 'Content-Type': 'application/json' };
  // No need to manually add Authorization header — httpOnly cookie is sent automatically
}

// Global fetch wrapper that handles 401 (expired token) responses
async function authFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...getAuthHeaders(), ...options.headers },
    credentials: 'include'
  });
  
  // Check if token has expired
  if (res.status === 401) {
    console.warn('⚠️ Session expired (401 Unauthorized)');
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
    .catch(err => console.error('Logout error:', err))
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
window.switchInvTab = function(tabId) {
  document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.inv-content').forEach(c => c.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');
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
          return `<div class="skin-card ${sanitize(tierClass)}">
                    <img src="${safeIcon}" alt="${sanitize(skinObj.name)}" onerror="this.src='fallback-image-url.png'">
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
          return `<div class="skin-card tier-battlepass"><img src="${safeIcon}" alt="${sanitize(agent.name)}" style="height: 50px; margin-bottom: 10px;"><div class="skin-name">${sanitize(agent.name)}</div></div>`;
       } catch(e) {
           return `<div class="skin-card tier-battlepass"><div class="skin-icon-placeholder">🕵️</div><div class="skin-name">${sanitize(tagStr)}</div></div>`;
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
  const saved = isWishlisted(idToUse);
  const inCompare = compareList.includes(idToUse);
  const imgHtml = l.images && l.images[0] ? `<img src="${l.images[0]}" alt="${sanitize(l.title)}" loading="lazy">` : `<div class="card-img-placeholder">🎮</div>`;
  const badges = [];
  if (l.contactReveals > 10) badges.push('<span class="badge badge-hot">Hot</span>');
  if (l.images && l.images.length >= 3) badges.push('<span class="badge badge-verified">Verified</span>');
  const cleanTags = getCleanTags(l).map(t => `<span class="pill" onclick="event.stopPropagation(); window.location='browse.html?tag=${t.replace('#','')}'">${t}</span>`).join('');

  return `
    <div class="listing-card" onclick="window.location='listing.html?id=${idToUse}'">
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
            <button class="bookmarkBtn ${saved ? 'saved' : ''}" onclick="event.stopPropagation();toggleWishlist('${idToUse}', this)" title="Save">
              <span class="IconContainer">
                <svg viewBox="0 0 384 512" height="0.9em" class="icon">
                  <path d="M0 48V487.7C0 501.1 10.9 512 24.3 512c5 0 9.9-1.5 14-4.4L192 400 345.7 507.6c4.1 2.9 9 4.4 14 4.4c13.4 0 24.3-10.9 24.3-24.3V48c0-26.5-21.5-48-48-48H48C21.5 0 0 21.5 0 48z"></path>
                </svg>
              </span>
              <p class="text">${saved ? 'Saved' : 'Save'}</p>
            </button>
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

  if (l._id) fetch(`${API_BASE_URL}/listings/${l._id}/view`, { method: 'POST' }).catch(console.error);

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
  const agentsLength = l.agentsCount || (l.agents ? l.agents.length : 0);
  const totalSkinCount = (l.skinTags || []).length;
  const saved = isWishlisted(idToUse);

  const html = `
    <div class="detail-left">
      <h1 class="detail-title" style="font-size: 42px; margin-bottom: 8px; font-family: var(--font-display); font-weight: 900; text-transform: uppercase;">${sanitize(l.title || 'Untitled Account')}</h1>
      <div class="detail-tags" style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 24px;">${cleanTags}${badges.join('')}</div>

      <div class="detail-stats-grid">
        <div class="detail-stat"><div class="detail-stat-val">${l.skinCount || 0}</div><div class="detail-stat-label">Prem. Skins</div></div>
        <div class="detail-stat"><div class="detail-stat-val">${agentsLength}</div><div class="detail-stat-label">Agents</div></div>
        <div class="detail-stat"><div class="detail-stat-val">${l.level || 1}</div><div class="detail-stat-label">Level</div></div>
        <div class="detail-stat"><div class="detail-stat-val">${l.bpCompleted || 0}</div><div class="detail-stat-label">Battle Passes</div></div>
        <div class="detail-stat"><div class="detail-stat-val">${l.vpBalance || 0}</div><div class="detail-stat-label">VP Balance</div></div>
        <div class="detail-stat"><div class="detail-stat-val" style="font-size: 26px;">₹${l.skinCount > 0 ? Math.round((l.price||0)/l.skinCount).toLocaleString('en-IN') : '—'}</div><div class="detail-stat-label">Per Prem. Skin</div></div>
      </div>

      <div class="detail-section" style="margin-bottom: 28px;">
        <h4 style="font-family: var(--font-display); font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: var(--accent-cyan); margin-bottom: 12px;">Account Info</h4>
        <div class="detail-info-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div style="background: rgba(15, 10, 30, 0.6); padding: 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
              <span style="display: block; font-family: var(--font-mono); font-size: 10px; color: var(--white-dim); text-transform: uppercase; letter-spacing: 1px;">Region</span>
              <span style="font-family: var(--font-ui); font-size: 16px; font-weight: bold; color: #fff; margin-top: 4px; display: block;">${sanitize(l.region || 'AP')}</span>
          </div>
          <div style="background: rgba(15, 10, 30, 0.6); padding: 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
              <span style="display: block; font-family: var(--font-mono); font-size: 10px; color: var(--white-dim); text-transform: uppercase; letter-spacing: 1px;">Email Status</span>
              <span style="font-family: var(--font-ui); font-size: 14px; font-weight: bold; color: var(--accent-green); display: flex; align-items: center; gap: 6px; margin-top: 4px;">✅ ${l.emailAccess ? 'Original Email Included' : 'Transfer to New Mail (Full Access)'}</span>
          </div>
          <div style="background: rgba(15, 10, 30, 0.6); padding: 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
              <span style="display: block; font-family: var(--font-mono); font-size: 10px; color: var(--white-dim); text-transform: uppercase; letter-spacing: 1px;">Ban History</span>
              <span style="font-family: var(--font-ui); font-size: 14px; font-weight: bold; display: flex; align-items: center; gap: 6px; margin-top: 4px; color: ${l.banHistory?'#ff6b6b':'var(--accent-green)'}">${l.banHistory ? '⚠️ Yes' : '✅ Clean'}</span>
          </div>
          <div style="background: rgba(15, 10, 30, 0.6); padding: 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
              <span style="display: block; font-family: var(--font-mono); font-size: 10px; color: var(--white-dim); text-transform: uppercase; letter-spacing: 1px;">Limited Skins</span>
              <span style="font-family: var(--font-ui); font-size: 14px; font-weight: bold; color: ${l.limited ? 'var(--accent-gold)' : '#fff'}; margin-top: 4px; display: block; line-height: 1.4;">${l.limited && l.limitedDetail ? `✨ ${sanitize(l.limitedDetail)}` : 'None'}</span>
          </div>
        </div>
      </div>

      <div class="inventory-section">
        <div class="inventory-tabs">
          <button class="inv-tab active" onclick="switchInvTab('skins')">Premium Skins (${totalSkinCount})</button>
          <button class="inv-tab" onclick="switchInvTab('battlepass')">Battlepass (${(l.battlepassTags || []).length})</button>
          <button class="inv-tab" onclick="switchInvTab('agents')">Agents (${agentsLength})</button>
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
      <div class="contact-card" style="background: rgba(15, 10, 30, 0.6); border: 1px solid rgba(255,255,255,0.05); padding: 24px; border-radius: 12px; position: sticky; top: 100px;">
        <div class="detail-price" style="font-size: 48px; color: var(--red); font-family: var(--font-display); font-weight: 900; margin-bottom: 4px; line-height: 1;">₹${(l.price||0).toLocaleString('en-IN')}</div>
        <div class="detail-price-sub" style="font-family: var(--font-mono); font-size: 11px; color: var(--white-dim); margin-bottom: 24px;">Negotiable • Secure Transaction</div>

        <div class="detail-ranks" style="display: flex; gap: 10px; margin-bottom: 24px;">
          <div class="detail-rank" style="flex: 1; background: rgba(0,0,0,0.3); padding: 12px; border-radius: 6px; text-align: center;">
            <div class="detail-rank-label" style="font-size: 9px; font-family: var(--font-mono); color: var(--white-dim); text-transform: uppercase; margin-bottom: 6px;">Current Rank</div>
            <div class="detail-rank-val ${getRankColor(l.rank)}" style="display:flex; align-items:center; justify-content:center; font-family: var(--font-display); font-weight: 900; font-size: 18px;">${getRankIcon(l.rank)} ${l.rank || 'Unranked'}</div>
          </div>
          <div class="detail-rank" style="flex: 1; background: rgba(0,0,0,0.3); padding: 12px; border-radius: 6px; text-align: center;">
            <div class="detail-rank-label" style="font-size: 9px; font-family: var(--font-mono); color: var(--white-dim); text-transform: uppercase; margin-bottom: 6px;">Peak Rank</div>
            <div class="detail-rank-val ${getRankColor(l.peakRank)}" style="display:flex; align-items:center; justify-content:center; font-family: var(--font-display); font-weight: 900; font-size: 18px;">${getRankIcon(l.peakRank)} ${l.peakRank || 'Unranked'}</div>
          </div>
        </div>

        <div class="seller-mini" style="display: flex; align-items: center; gap: 12px; padding: 16px; background: rgba(0,0,0,0.3); border-radius: 6px; margin-bottom: 24px;">
          <div class="seller-avatar" style="width: 40px; height: 40px; border-radius: 50%; background: var(--red); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; color: #fff;">${l.sellerName ? sanitize(l.sellerName)[0].toUpperCase() : 'S'}</div>
          <div class="seller-info">
            <div class="seller-name" style="font-family: var(--font-ui); font-weight: 700; font-size: 15px;">${sanitize(l.sellerName || 'Seller')}</div>
            <div class="seller-rep" style="color: var(--accent-gold); font-size: 12px; font-family: var(--font-mono); margin-top: 2px;">Verified Member</div>
          </div>
        </div>

        <div class="detail-action-btns" style="display: flex; gap: 10px; margin-bottom: 16px;">
          <button class="btn-ghost compare-add-btn" style="flex: 1; padding: 12px;" onclick="toggleCompare('${idToUse}','${(l.title||'').replace(/'/g,"\\'")}',this)">⚖ Compare</button>
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
          ${l.sellerId ? `<div class="contact-method" style="padding: 12px; background: rgba(0,0,0,0.3); margin-bottom: 8px; border-radius: 6px; font-family: var(--font-mono); font-size: 12px; display: flex; align-items: center; gap: 8px;"><span style="font-size: 16px;">✉️</span> <a href="mailto:${sanitize(l.sellerId)}" style="color: var(--accent-cyan); text-decoration: none;">${sanitize(l.sellerId)}</a></div>` : ''}
          <div id="extraContactMethods"></div>
          ${l.sellerPhone ? `<button class="btn-primary full" style="margin-top: 10px; background: #25D366; color: #fff; padding: 16px; font-size: 16px;" onclick="openWhatsApp('${idToUse}')">💬 Message on WhatsApp</button>` : ''}
        </div>
      </div>
    </div>
  `;

  document.getElementById('listingDetail').innerHTML = html;

  const similar = getAllListings().filter(x => x._id !== l._id && x.region === l.region).slice(0, 4);
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
    if (contactData.sellerId) extraHtml += `<div class="contact-method" style="padding: 12px; background: rgba(0,0,0,0.3); margin-bottom: 8px; border-radius: 6px; font-family: var(--font-mono); font-size: 12px; display: flex; align-items: center; gap: 8px;"><span style="font-size: 16px;">✉️</span> <a href="mailto:${sanitize(contactData.sellerId)}" style="color: var(--accent-cyan); text-decoration: none;">${sanitize(contactData.sellerId)}</a></div>`;
    if (contactData.sellerDiscord) extraHtml += `<div class="contact-method" style="padding: 12px; background: rgba(0,0,0,0.3); margin-bottom: 8px; border-radius: 6px; font-family: var(--font-mono); font-size: 12px; display: flex; align-items: center; gap: 8px;"><span style="font-size: 16px;">🎮</span> <strong>${sanitize(contactData.sellerDiscord)}</strong></div>`;
    if (contactData.sellerPhone) extraHtml += `<div class="contact-method" style="padding: 12px; background: rgba(0,0,0,0.3); margin-bottom: 8px; border-radius: 6px; font-family: var(--font-mono); font-size: 12px; display: flex; align-items: center; gap: 8px;"><span style="font-size: 16px;">📱</span> <strong>${sanitize(contactData.sellerPhone)}</strong></div>`;
    if (contactData.sellerPhone) extraHtml += `<button class="btn-primary full" style="margin-top: 10px; background: #25D366; color: #fff; padding: 16px; font-size: 16px;" onclick="openWhatsAppWithPhone('${id}', '${contactData.sellerPhone.replace(/[^0-9]/g, '')}', '${(l ? l.sellerName : 'there').replace(/'/g, "\\'")}')">\ud83d\udcac Message on WhatsApp</button>`;
    
    const extraEl = document.getElementById('extraContactMethods');
    if (extraEl) extraEl.innerHTML = extraHtml;

    document.querySelector('.reveal-btn-section').style.display = 'none';
    document.getElementById('contactRevealed').style.display = 'block';
  } catch (err) {
    alert('Error revealing contact: ' + err.message);
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
  const list = JSON.parse(localStorage.getItem('am_wishlist_' + user.email) || '[]');
  return list.includes(id.toString());
}

function toggleWishlist(id, btn) {
  const user = JSON.parse(localStorage.getItem('am_user') || 'null');
  if (!user) { openAuth('login'); return; }
  const key = 'am_wishlist_' + user.email;
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
  const list = JSON.parse(localStorage.getItem('am_wishlist_' + user.email) || '[]');
  const badge = document.getElementById('navCartBadge');
  if (badge) {
    badge.textContent = list.length;
    badge.style.display = list.length > 0 ? 'flex' : 'none';
  }
}

// ===================== COMPARE =====================
function toggleCompare(id, title, btn) {
  const strId = id.toString();
  const idx = compareList.indexOf(strId);
  if (idx > -1) {
    compareList.splice(idx, 1);
    btn?.classList.remove('selected');
  } else {
    if (compareList.length >= 3) { alert('You can compare up to 3 accounts at once.'); return; }
    compareList.push(strId);
    btn?.classList.add('selected');
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
  if (compareList.length < 2) { alert('Select at least 2 accounts to compare.'); return; }
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
    
    alert("Listing deleted successfully.");
  } catch (err) {
    console.error("Delete error:", err);
    alert(err.message);
  }
}