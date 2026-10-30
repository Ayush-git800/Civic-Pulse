/**
 * CivicPulse - Modern, Vibrant & Classy Client Application
 * Linear/Stripe-level aesthetic with seamless API integration, geolocation,
 * live negotiation engine, drag & drop previews, and PulseBot AI.
 */

// Helper functions for persistent session storage (RBAC)
const SESSION_STORAGE_KEY = 'civicpulse_session';

function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function setStoredSession(session) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    state.auth = session;
  } catch (e) {
    console.error('Failed to persist session:', e);
  }
}

function clearStoredSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    state.auth = null;
  } catch (e) {
    console.error('Failed to clear session:', e);
  }
}

// Application State
const state = {
  currentPersona: 'citizen', // 'citizen', 'admin', 'technician'
  activeTab: 'civic',
  location: '📍 Sector 62, Noida',
  coords: { lat: 28.6289, lng: 77.3670 },
  civicPosts: [],
  serviceJobs: [],
  chatHistory: [],
  civicCategory: 'ALL',
  civicSearch: '',
  civicFeedMode: 'all', // 'all' (community feed) or 'mine' (reported issues)
  serviceCategory: 'ALL',
  serviceSearch: '',
  // Pillar 3: Multi-Sided Persona & Operations State
  adminDeptFilter: 'ALL',
  adminData: null,
  technicianPhone: '+91 98450 12345',
  technicianData: null,
  techActiveTab: 'leads',
  currentView: 'landing', // 'landing', 'auth', or 'workspace'
  auth: getStoredSession(),
  authMode: 'signin', // 'signin' or 'signup'
  authRole: 'citizen', // 'citizen', 'municipal', 'technician'
};

// Lifecycle initialization
document.addEventListener('DOMContentLoaded', () => {
  initGeolocation();
  initDragAndDrop();
  initModals();
  initLandingLetterShowcase();
  
  // Set initial technician phone from session if available
  if (state.auth?.user?.phone) {
    state.technicianPhone = state.auth.user.phone;
  }

  // Handle Hash Routing
  handleHashRouting();
  window.addEventListener('hashchange', handleHashRouting);

  loadCivicFeed();
  loadServicesFeed();

  // Attach brand logo return-to-landing listeners
  document.querySelectorAll('.brand-logo-img').forEach(img => {
    const link = img.closest('a');
    if (link) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.hash = '#/';
      });
    }
  });
});

// --- High-Quality SVG Graphic Fallbacks for Offline & Missing Media ---
function getFallbackSvg(category) {
  const cat = (category || '').toLowerCase();
  let bg = '#1e1b4b'; // deep indigo
  let accent = '#6366f1';
  let title = 'Infrastructure Hazard Evidence';
  let icon = '⚠️';

  if (cat.includes('road') || cat.includes('pothole') || cat.includes('tarmac') || cat.includes('highway')) {
    bg = '#0f172a';
    accent = '#f59e0b';
    title = 'Road & Pothole Defect';
    icon = '🚧';
  } else if (cat.includes('waste') || cat.includes('sanitation') || cat.includes('garbage')) {
    bg = '#14532d';
    accent = '#22c55e';
    title = 'Solid Waste & Sanitation Incident';
    icon = '🗑️';
  } else if (cat.includes('water') || cat.includes('sewage') || cat.includes('drain') || cat.includes('plumb')) {
    bg = '#083344';
    accent = '#06b6d4';
    title = 'Water Supply & Drainage';
    icon = '💧';
  } else if (cat.includes('electr') || cat.includes('wire') || cat.includes('light')) {
    bg = '#3b0764';
    accent = '#a855f7';
    title = 'Electrical & Public Lighting';
    icon = '⚡';
  } else if (cat.includes('carpent')) {
    bg = '#431407';
    accent = '#f97316';
    title = 'Carpentry & Woodwork Repair';
    icon = '🪚';
  } else if (cat.includes('appliance')) {
    bg = '#1e1b4b';
    accent = '#818cf8';
    title = 'Appliance Diagnostics';
    icon = '❄️';
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bg}" />
        <stop offset="100%" stop-color="#020617" />
      </linearGradient>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)" />
    <rect width="100%" height="100%" fill="url(#grid)" />
    <circle cx="400" cy="160" r="64" fill="${accent}" fill-opacity="0.22" />
    <text x="400" y="180" font-family="system-ui, -apple-system, sans-serif" font-size="52" text-anchor="middle">${icon}</text>
    <text x="400" y="260" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="#f8fafc" text-anchor="middle">${title}</text>
    <text x="400" y="295" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="500" fill="#94a3b8" text-anchor="middle">CivicPulse Photographic Evidence Archive</text>
  </svg>`;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function handleImgError(imgEl, category) {
  if (!imgEl) return;
  imgEl.onerror = null; // Prevent loop
  imgEl.src = getFallbackSvg(category);
}

// Fullscreen Image Lightbox Inspector
function openImageModal(imgUrl, title, category) {
  const modal = document.getElementById('modal-image-lightbox');
  const img = document.getElementById('lightbox-img');
  const titleEl = document.getElementById('lightbox-title');
  const subEl = document.getElementById('lightbox-subtitle');
  if (!modal || !img) return;

  img.src = imgUrl;
  img.onerror = () => {
    img.src = getFallbackSvg(category);
  };
  if (titleEl) titleEl.textContent = title || 'Forensic Evidence Inspection';
  if (subEl) subEl.textContent = category ? `Department: ${category}` : 'High-Resolution Photographic Evidence';
  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeImageModal() {
  const modal = document.getElementById('modal-image-lightbox');
  if (modal) modal.classList.add('hidden');
}

function copyTicket(postId) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(postId);
  }
  showToast(`Ticket #${postId.substring(0, 8)} ID copied!`);
}

// --- Toast Notification System ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const isSuccess = type === 'success';
  const isError = type === 'error';
  const isInfo = type === 'info';

  const bgColor = isSuccess
    ? 'bg-slate-900 text-white border-emerald-500/40'
    : isError
    ? 'bg-rose-950 text-rose-100 border-rose-500/40'
    : 'bg-indigo-950 text-indigo-100 border-indigo-500/40';

  const iconSvg = isSuccess
    ? `<svg class="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>`
    : isError
    ? `<svg class="w-4 h-4 text-rose-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>`
    : `<svg class="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;

  toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-xs font-medium backdrop-blur-md transform transition-all duration-300 translate-y-2 opacity-0 ${bgColor}`;
  toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
  });

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-x-4');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- 1. Dynamic Geolocation Detection ---
function initGeolocation() {
  const locBadge = document.getElementById('location-pill-text');
  const landingBadge = document.getElementById('landingLocationPill');
  
  if (!navigator.geolocation) {
    if (locBadge) locBadge.textContent = state.location;
    if (landingBadge) landingBadge.textContent = state.location;
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      state.coords.lat = position.coords.latitude;
      state.coords.lng = position.coords.longitude;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${state.coords.lat}&lon=${state.coords.lng}&format=json`,
          { headers: { 'User-Agent': 'CivicPulse-App' } }
        );
        if (res.ok) {
          const data = await res.json();
          const city =
            data.address.suburb ||
            data.address.city ||
            data.address.town ||
            data.address.county ||
            'NCR Sector';
          state.location = `📍 ${city}`;
        } else {
          state.location = `📍 ${state.coords.lat.toFixed(2)}°N, ${state.coords.lng.toFixed(2)}°E`;
        }
      } catch (e) {
        state.location = '📍 Sector 62, Noida';
      }
      if (locBadge) locBadge.textContent = state.location;
      if (landingBadge) landingBadge.textContent = state.location;
      syncLocationInputs();
    },
    () => {
      state.location = '📍 Sector 62, Noida';
      if (locBadge) locBadge.textContent = state.location;
      if (landingBadge) landingBadge.textContent = state.location;
      syncLocationInputs();
    },
    { timeout: 7000 }
  );
}

function syncLocationInputs() {
  const clean = state.location.replace('📍 ', '');
  const cInp = document.getElementById('civic-location-input');
  const jInp = document.getElementById('job-location-input');
  if (cInp && !cInp.value) cInp.value = clean;
  if (jInp && !jInp.value) jInp.value = clean;
}

// --- 2. Segmented Navigation Tabs ---
function switchTab(tab) {
  state.activeTab = tab;
  const civicView = document.getElementById('view-civic');
  const servicesView = document.getElementById('view-services');
  const btnCivic = document.getElementById('tab-btn-civic');
  const btnServices = document.getElementById('tab-btn-services');

  if (tab === 'civic') {
    if (civicView) civicView.classList.remove('hidden');
    if (servicesView) servicesView.classList.add('hidden');

    if (btnCivic) btnCivic.className =
      'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white text-indigo-900 shadow-sm border border-slate-200/90 transition-all';
    if (btnServices) btnServices.className =
      'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 transition-all';
  } else {
    if (civicView) civicView.classList.add('hidden');
    if (servicesView) servicesView.classList.remove('hidden');

    if (btnServices) btnServices.className =
      'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white text-indigo-900 shadow-sm border border-slate-200/90 transition-all';
    if (btnCivic) btnCivic.className =
      'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 transition-all';
  }
  if (window.lucide) lucide.createIcons();
}

// --- Search & Category Filtering ---
function setCivicCategory(cat, btnEl) {
  state.civicCategory = cat;
  document.querySelectorAll('.civic-filter-pill').forEach((b) => {
    b.className = 'civic-filter-pill px-3 py-1.5 rounded-xl font-semibold bg-slate-100 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-all whitespace-nowrap';
  });
  if (btnEl) {
    btnEl.className = 'civic-filter-pill active px-3 py-1.5 rounded-xl font-bold bg-indigo-600 text-white shadow-xs transition-all whitespace-nowrap';
  }
  applyCivicFilters();
}

function handleCivicFilter() {
  const inp = document.getElementById('civic-search-input');
  state.civicSearch = (inp ? inp.value : '').toLowerCase().trim();
  applyCivicFilters();
}

function applyCivicFilters() {
  let filtered = [...state.civicPosts];
  if (state.civicCategory && state.civicCategory !== 'ALL') {
    if (state.civicCategory === 'CENTRAL') {
      filtered = filtered.filter((p) => p.is_local === 0 || p.is_local === false);
    } else {
      const q = state.civicCategory.toLowerCase();
      filtered = filtered.filter((p) => (p.department || '').toLowerCase().includes(q));
    }
  }
  if (state.civicSearch) {
    filtered = filtered.filter(
      (p) =>
        (p.title || '').toLowerCase().includes(state.civicSearch) ||
        (p.description || '').toLowerCase().includes(state.civicSearch) ||
        (p.location_city || '').toLowerCase().includes(state.civicSearch) ||
        (p.department || '').toLowerCase().includes(state.civicSearch)
    );
  }
  renderCivicCards(filtered);
}

function setServiceCategory(cat, btnEl) {
  state.serviceCategory = cat;
  document.querySelectorAll('.service-filter-pill').forEach((b) => {
    b.className = 'service-filter-pill px-3 py-1.5 rounded-xl font-semibold bg-slate-100 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition-all whitespace-nowrap';
  });
  if (btnEl) {
    btnEl.className = 'service-filter-pill active px-3 py-1.5 rounded-xl font-bold bg-emerald-600 text-white shadow-xs transition-all whitespace-nowrap';
  }
  applyServiceFilters();
}

function handleServiceFilter() {
  const inp = document.getElementById('service-search-input');
  state.serviceSearch = (inp ? inp.value : '').toLowerCase().trim();
  applyServiceFilters();
}

function applyServiceFilters() {
  let filtered = [...state.serviceJobs];
  if (state.serviceCategory && state.serviceCategory !== 'ALL') {
    const q = state.serviceCategory.toLowerCase();
    filtered = filtered.filter((j) => (j.category || '').toLowerCase().includes(q));
  }
  if (state.serviceSearch) {
    filtered = filtered.filter(
      (j) =>
        (j.title || '').toLowerCase().includes(state.serviceSearch) ||
        (j.description || '').toLowerCase().includes(state.serviceSearch) ||
        (j.location_city || '').toLowerCase().includes(state.serviceSearch) ||
        (j.category || '').toLowerCase().includes(state.serviceSearch)
    );
  }
  renderServiceCards(filtered);
}

// --- 3. Civic Feed Management ---
function openNewHazardModal() {
  openModal('modal-civic');
}

function switchCivicFeed(mode) {
  state.civicFeedMode = mode;
  const tabCommunity = document.getElementById('tabFeedCommunity');
  const tabMine = document.getElementById('tabFeedMine');

  if (tabCommunity && tabMine) {
    if (mode === 'all') {
      tabCommunity.className = 'px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 text-white shadow-xs transition-all flex items-center gap-2';
      tabMine.className = 'px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all flex items-center gap-2';
    } else {
      tabMine.className = 'px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 text-white shadow-xs transition-all flex items-center gap-2';
      tabCommunity.className = 'px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all flex items-center gap-2';
    }
  }
  loadCivicFeed();
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return 'Recently';
  const now = new Date();
  const past = new Date(dateStr.replace(' ', 'T'));
  const diffSecs = Math.floor((now - past) / 1000);
  if (isNaN(diffSecs) || diffSecs < 60) return 'Just now';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return past.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

async function updateGrievanceSummaryBar() {
  const totalEl = document.getElementById('summary-total-reported');
  const inProgEl = document.getElementById('summary-in-progress');
  const resolvedEl = document.getElementById('summary-resolved');
  if (!totalEl || !inProgEl || !resolvedEl) return;

  try {
    const res = await fetch('/api/civic/my-reports');
    if (res.ok) {
      const data = await res.json();
      totalEl.textContent = data.total_reported ?? 0;
      inProgEl.textContent = data.in_progress_count ?? 0;
      resolvedEl.textContent = data.resolved_count ?? 0;
    }
  } catch (err) {
    console.warn('Failed to update grievance summary bar:', err);
  }
}

async function loadCivicFeed() {
  const grid = document.getElementById('civic-posts-grid');
  const badgeCountEl = document.getElementById('myReportsBadgeCount');
  const userCid = state.auth?.user?.id || 1;

  try {
    const feedUrl = `/api/civic/feed?filter=${state.civicFeedMode}&citizen_id=${userCid}`;
    const res = await fetch(feedUrl);
    state.civicPosts = await res.json();
    applyCivicFilters();
    updateGrievanceSummaryBar();

    // Refresh "My Reported Issues" badge count
    const mineRes = await fetch(`/api/civic/feed?filter=mine&citizen_id=${userCid}`);
    if (mineRes.ok) {
      const minePosts = await mineRes.json();
      if (badgeCountEl) {
        badgeCountEl.textContent = Array.isArray(minePosts) ? minePosts.length : 0;
      }
    }
  } catch (err) {
    if (grid) {
      grid.innerHTML = `
        <div class="col-span-full p-8 text-center bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <p class="text-sm font-medium text-slate-500">Unable to load infrastructure feed. Ensure the CivicPulse server is active.</p>
        </div>
      `;
    }
  }
}

function getDepartmentPill(dept) {
  const d = (dept || '').toLowerCase();
  let color = 'bg-indigo-50 text-indigo-700 border-indigo-200/80';
  let icon = 'tag';

  if (d.includes('water') || d.includes('sewage')) {
    color = 'bg-cyan-50 text-cyan-800 border-cyan-200/80';
    icon = 'droplet';
  } else if (d.includes('waste') || d.includes('sanitation')) {
    color = 'bg-amber-50 text-amber-800 border-amber-200/80';
    icon = 'trash-2';
  } else if (d.includes('electric') || d.includes('streetlight')) {
    color = 'bg-violet-50 text-violet-800 border-violet-200/80';
    icon = 'zap';
  } else if (d.includes('health') || d.includes('encroach')) {
    color = 'bg-rose-50 text-rose-800 border-rose-200/80';
    icon = 'shield-alert';
  } else {
    color = 'bg-blue-50 text-blue-800 border-blue-200/80';
    icon = 'navigation';
  }

  return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${color}">
    <i data-lucide="${icon}" class="w-3 h-3"></i>
    <span>${escapeHtml(dept)}</span>
  </span>`;
}

function getSeverityBadge(severity) {
  const s = (severity || '').toLowerCase();
  if (s === 'critical') {
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
      <span class="w-2 h-2 rounded-full bg-rose-600 animate-ping"></span>
      <span>Critical Hazard</span>
    </span>`;
  }
  if (s === 'high') {
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
      <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
      <span>High Priority</span>
    </span>`;
  }
  if (s === 'moderate') {
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
      <span class="w-2 h-2 rounded-full bg-sky-500"></span>
      <span>Moderate</span>
    </span>`;
  }
  return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
    <span class="w-2 h-2 rounded-full bg-slate-400"></span>
    <span>Low</span>
  </span>`;
}

function renderCivicLifecycleStepper(status, officerNote, assignedOfficer) {
  const normStatus = (status || 'REPORTED').toUpperCase().replace(/\s+/g, '_');
  const stages = [
    { key: 'REPORTED', label: 'Reported' },
    { key: 'ACKNOWLEDGED', label: 'Acknowledged' },
    { key: 'IN_PROGRESS', label: 'In Progress' },
    { key: 'RESOLVED', label: 'Resolved' }
  ];

  let currentIdx = 0;
  if (normStatus === 'ACKNOWLEDGED' || normStatus === 'ASSIGNED') currentIdx = 1;
  else if (normStatus === 'IN_PROGRESS') currentIdx = 2;
  else if (normStatus === 'RESOLVED') currentIdx = 3;

  const stepsHtml = stages.map((st, idx) => {
    const isCompleted = idx < currentIdx;
    const isCurrent = idx === currentIdx;

    let circleBg = 'bg-slate-100 text-slate-400 border-slate-300';
    let labelColor = 'text-slate-400 font-medium';
    let iconHtml = `<span class="text-[10px] font-bold">${idx + 1}</span>`;

    if (isCompleted) {
      circleBg = 'bg-emerald-600 text-white border-emerald-600 shadow-xs';
      labelColor = 'text-emerald-700 font-bold';
      iconHtml = `<i data-lucide="check" class="w-3 h-3 stroke-[3]"></i>`;
    } else if (isCurrent) {
      if (st.key === 'RESOLVED') {
        circleBg = 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-300 shadow-xs';
        labelColor = 'text-emerald-700 font-extrabold';
        iconHtml = `<i data-lucide="check-circle" class="w-3.5 h-3.5"></i>`;
      } else if (st.key === 'IN_PROGRESS') {
        circleBg = 'bg-amber-500 text-white border-amber-500 ring-2 ring-amber-300 shadow-xs animate-pulse';
        labelColor = 'text-amber-800 font-extrabold';
        iconHtml = `<i data-lucide="activity" class="w-3.5 h-3.5"></i>`;
      } else if (st.key === 'ACKNOWLEDGED') {
        circleBg = 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-300 shadow-xs';
        labelColor = 'text-indigo-800 font-extrabold';
        iconHtml = `<i data-lucide="shield" class="w-3 h-3"></i>`;
      } else {
        circleBg = 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-300 shadow-xs';
        labelColor = 'text-indigo-800 font-bold';
        iconHtml = `<i data-lucide="file-check" class="w-3 h-3"></i>`;
      }
    }

    return `
      <div class="flex-1 flex flex-col items-center relative text-center">
        <div class="w-6 h-6 rounded-full border flex items-center justify-center text-[10px] z-10 transition-all ${circleBg}">
          ${iconHtml}
        </div>
        <span class="text-[10px] mt-1 leading-tight tracking-tight ${labelColor}">${st.label}</span>
      </div>
    `;
  }).join('');

  const progressPercent = currentIdx === 0 ? 10 : currentIdx === 1 ? 38 : currentIdx === 2 ? 68 : 100;

  const officerNoteHtml = (officerNote || assignedOfficer) ? `
    <div class="mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-700 flex items-start gap-2 shadow-xs">
      <span class="p-1 rounded-lg bg-indigo-50 text-indigo-600 flex-shrink-0 mt-0.5"><i data-lucide="message-square" class="w-3.5 h-3.5"></i></span>
      <div class="min-w-0">
        <div class="font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
          <span>Officer Remark</span>
          ${assignedOfficer ? `<span class="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200/60">• ${escapeHtml(assignedOfficer)}</span>` : ''}
        </div>
        <p class="text-slate-600 italic mt-0.5 leading-snug break-words">${escapeHtml(officerNote || 'Acknowledged and assigned for municipal inspection.')}</p>
      </div>
    </div>
  ` : '';

  return `
    <div class="mt-3.5 pt-3 border-t border-slate-100">
      <div class="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-2">
        <span class="flex items-center gap-1.5 text-slate-900">
          <i data-lucide="git-commit" class="w-3.5 h-3.5 text-indigo-600"></i>
          Lifecycle Pipeline
        </span>
        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${
          normStatus === 'RESOLVED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
          normStatus === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
          normStatus === 'ACKNOWLEDGED' || normStatus === 'ASSIGNED' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
          'bg-slate-100 text-slate-700 border border-slate-200'
        }">
          ${stages[currentIdx].label}
        </span>
      </div>
      <div class="relative py-1">
        <div class="absolute top-4 left-6 right-6 h-0.5 bg-slate-200 -translate-y-1/2 z-0"></div>
        <div class="absolute top-4 left-6 h-0.5 bg-emerald-500 -translate-y-1/2 z-0 transition-all duration-500" style="width: calc(${progressPercent}% - 3rem);"></div>
        <div class="flex justify-between relative z-10">
          ${stepsHtml}
        </div>
      </div>
      ${officerNoteHtml}
    </div>
  `;
}

function renderCivicCards(posts) {
  const grid = document.getElementById('civic-posts-grid');
  if (!grid) return;

  const isMineTab = state.civicFeedMode === 'mine';

  if (!posts || posts.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-16 text-center bg-white/80 rounded-2xl border border-slate-200/80 shadow-xs">
        <div class="w-12 h-12 mx-auto rounded-full ${isMineTab ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'} flex items-center justify-center mb-3">
          <i data-lucide="${isMineTab ? 'clipboard-list' : 'check-circle'}" class="w-6 h-6"></i>
        </div>
        <h3 class="text-sm font-bold text-slate-800">${isMineTab ? 'No grievances reported yet by your account' : 'No matching community hazards'}</h3>
        <p class="text-xs text-slate-500 mt-1">${isMineTab ? 'Report your first road hazard or water defect to track its municipal lifecycle.' : 'Try clearing filters or search query.'}</p>
        <div class="mt-4 flex items-center justify-center gap-2">
          ${
            isMineTab
              ? `<button onclick="openNewHazardModal()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5">
                   <i data-lucide="plus-circle" class="w-4 h-4"></i>
                   <span>Report New Hazard</span>
                 </button>`
              : `<button onclick="setCivicCategory('ALL'); if(document.getElementById('civic-search-input')) document.getElementById('civic-search-input').value=''; handleCivicFilter();" class="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition-all">
                   Clear All Filters
                 </button>`
          }
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  grid.innerHTML = posts
    .map((post, index) => {
      const isCentral = post.is_local === 0 || post.is_local === false;
      const portals = Array.isArray(post.external_portals) ? post.external_portals : [];
      const comments = post.comments || [];
      const authorName = post.citizen_name || 'Resident';
      const authorInitials = authorName.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase() || 'CP';
      const postWard = post.ward || post.location_city || 'Sector 62, Noida';
      const timeAgoStr = formatTimeAgo(post.created_at);
      const isMyPost = (state.auth?.user?.id && post.citizen_id === state.auth.user.id) || (post.citizen_id === 1 && !state.auth);

      // Escalation Card for Non-Municipal Jurisdiction
      let escalationHtml = '';
      if (isCentral) {
        const portalPills = portals
          .map((p) => {
            const name = typeof p === 'object' ? p.name : p;
            const url = typeof p === 'object' ? p.url : 'https://pgportal.gov.in';
            const reason = typeof p === 'object' && p.reason ? p.reason : 'Specialized statutory authority jurisdiction.';
            return `
              <a href="${url}" target="_blank" rel="noopener noreferrer" class="group/portal flex items-start gap-2.5 p-2.5 rounded-xl bg-white/95 hover:bg-white border border-rose-200/70 shadow-xs hover:shadow-md transition-all">
                <div class="p-1.5 rounded-lg bg-rose-50 text-rose-600 group-hover/portal:scale-105 transition-transform flex-shrink-0">
                  <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </div>
                <div>
                  <div class="text-[11px] font-bold text-slate-900 group-hover/portal:text-rose-700 flex items-center gap-1">
                    <span>${escapeHtml(name)}</span>
                    <span class="text-slate-400 font-normal">↗</span>
                  </div>
                  <p class="text-[10px] text-slate-500 mt-0.5 leading-snug">${escapeHtml(reason)}</p>
                </div>
              </a>
            `;
          })
          .join('');

        escalationHtml = `
          <div class="mt-4 p-3.5 rounded-2xl bg-gradient-to-br from-amber-50/90 via-rose-50/50 to-orange-50/60 border border-amber-300/80 shadow-xs">
            <div class="flex items-center gap-2 text-rose-900 font-bold text-xs mb-2">
              <span class="p-1 rounded-md bg-rose-100 text-rose-700"><i data-lucide="shield-alert" class="w-3.5 h-3.5"></i></span>
              <span>Central Jurisdiction Detected: File on Authorized Portals</span>
            </div>
            <div class="space-y-1.5">${portalPills}</div>
          </div>
        `;
      }

      // Comments Thread
      const commentsHtml = comments
        .map(
          (c) => `
          <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
            <div class="flex items-center justify-between text-slate-800 font-semibold">
              <span class="flex items-center gap-1">
                <i data-lucide="user" class="w-3 h-3 text-slate-400"></i>
                <span>${escapeHtml(c.author)}</span>
              </span>
              <span class="text-[10px] text-slate-400 font-normal">${c.created_at ? c.created_at.substring(0, 16) : ''}</span>
            </div>
            <p class="text-slate-600 text-[11px] leading-relaxed">${escapeHtml(c.comment)}</p>
          </div>
        `
        )
        .join('');

      return `
        <article class="animate-fade-up card-hover-lift group bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_12px_32px_-6px_rgba(79,70,229,0.12)] flex flex-col justify-between overflow-hidden" style="animation-delay: ${index * 60}ms;">
          <div>
            <!-- Social Community Author & Location Header -->
            <div class="p-4 pb-3 border-b border-slate-100 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs shrink-0">
                  ${authorInitials}
                </div>
                <div class="min-w-0">
                  <div class="font-bold text-slate-900 text-xs flex items-center gap-1.5 truncate">
                    <span>${escapeHtml(authorName)}</span>
                    ${isMyPost ? `<span class="px-1.5 py-0.2 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-[9px] font-black uppercase">You</span>` : ''}
                  </div>
                  <div class="text-[10px] text-slate-500 flex items-center gap-1.5 truncate">
                    <span class="text-indigo-600 font-semibold">📍 ${escapeHtml(postWard)}</span>
                    <span>•</span>
                    <span class="text-slate-400">${timeAgoStr}</span>
                  </div>
                </div>
              </div>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                (post.status || '').toUpperCase() === 'RESOLVED'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : (post.status || '').toUpperCase() === 'IN_PROGRESS'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : (post.status || '').toUpperCase() === 'ACKNOWLEDGED'
                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }">
                ${escapeHtml(post.status || 'Reported')}
              </span>
            </div>

            <!-- Image with Zoom & Evidence Lightbox Trigger -->
            ${
              post.image_url
                ? `
              <div class="relative h-48 overflow-hidden bg-slate-100 cursor-pointer group/img" onclick="openImageModal('${post.image_url}', '${escapeHtml(post.title)}', '${escapeHtml(post.department)}')">
                <img src="${post.image_url}" alt="${escapeHtml(post.title)}" onerror="handleImgError(this, '${escapeHtml(post.department)}')" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-transparent to-transparent"></div>
                <div class="absolute top-2.5 right-2.5 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-md text-white text-[10px] font-semibold opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center gap-1 shadow-sm">
                  <i data-lucide="maximize-2" class="w-3 h-3"></i>
                  <span>Inspect</span>
                </div>
                <div class="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-[11px] font-semibold">
                  <span class="flex items-center gap-1 drop-shadow-sm"><i data-lucide="map-pin" class="w-3.5 h-3.5 text-rose-400"></i> ${escapeHtml(post.location_city)}</span>
                  <span class="px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-[10px]">Evidence</span>
                </div>
              </div>
            `
                : ''
            }

            <div class="p-5">
              <!-- Department & Severity Row -->
              <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                ${getDepartmentPill(post.department)}
                ${getSeverityBadge(post.severity)}
              </div>

              <!-- Title & AI Summary -->
              <h3 class="font-bold text-slate-900 text-base leading-snug group-hover:text-indigo-600 transition-colors">
                ${escapeHtml(post.title)}
              </h3>
              <p class="text-xs text-slate-600 mt-2 leading-relaxed line-clamp-3">
                ${escapeHtml(post.description)}
              </p>

              <!-- Multi-Stage Grievance Lifecycle Stepper (prominent in 'My Reports' view) -->
              ${renderCivicLifecycleStepper(post.status, post.officer_note, post.assigned_officer)}

              <!-- Central Escalation Alert (if non-local) -->
              ${escalationHtml}
            </div>
          </div>

          <!-- Card Engagement Footer -->
          <div class="px-5 pb-5 pt-3 border-t border-slate-100/90 bg-slate-50/40">
            <div class="flex items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <button onclick="handleUpvote('${post.id}', this)" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 text-slate-700 hover:text-indigo-600 hover:border-indigo-300 text-xs font-bold transition-all shadow-xs">
                  <i data-lucide="thumbs-up" class="w-3.5 h-3.5 text-indigo-600"></i>
                  <span>Upvote</span>
                  <span id="upvotes-count-${post.id}" class="text-slate-900 font-extrabold ml-0.5">${post.upvotes_count || post.upvotes || 0}</span>
                </button>
                <button onclick="handleFlagUrgent('${post.id}', this)" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 border border-slate-200 text-slate-700 hover:text-rose-600 hover:border-rose-300 text-xs font-bold transition-all shadow-xs" title="Flag as critical civic emergency">
                  <i data-lucide="flame" class="w-3.5 h-3.5 text-amber-500"></i>
                  <span id="urgent-count-${post.id}">${post.urgent_flags || 0}</span>
                </button>
                <button onclick="openLetterModal('${post.id}')" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 text-slate-700 hover:text-indigo-600 hover:border-indigo-300 text-xs font-bold transition-all shadow-xs" title="Generate formal Municipal Notice or RTI Application">
                  <i data-lucide="file-text" class="w-3.5 h-3.5 text-indigo-600"></i>
                  <span class="hidden sm:inline">${isMineTab ? 'Download Formal RTI' : 'Draft Letter'}</span>
                  <span class="sm:hidden">Letter</span>
                </button>
              </div>

              <div class="flex items-center gap-2">
                <button onclick="copyTicket('${post.id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Copy incident ticket ID">
                  <i data-lucide="share-2" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="toggleCommentsSection('${post.id}')" class="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 transition-colors">
                  <i data-lucide="message-square" class="w-3.5 h-3.5 text-indigo-500"></i>
                  <span>${comments.length}</span>
                </button>
              </div>
            </div>

            <!-- Expandable Comments Drawer -->
            <div id="comments-box-${post.id}" class="hidden mt-3 pt-3 border-t border-slate-200/70 space-y-2">
              <div class="max-h-36 overflow-y-auto space-y-1.5 pr-1 custom-scroll">
                ${commentsHtml || '<p class="text-[11px] text-slate-400 italic">No citizen comments yet. Leave the first update!</p>'}
              </div>
              <form onsubmit="handleCommentPost(event, '${post.id}')" class="flex gap-2 pt-1.5">
                <input id="comm-author-${post.id}" type="text" placeholder="Your name" value="${state.auth?.user?.name || ''}" class="w-1/3 text-xs border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none" required>
                <input id="comm-text-${post.id}" type="text" placeholder="Community update..." class="flex-1 text-xs border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none" required>
                <button type="submit" class="px-3 py-1.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-xs transition-colors">Post</button>
              </form>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  if (window.lucide) lucide.createIcons();
}

function toggleCommentsSection(postId) {
  const box = document.getElementById(`comments-box-${postId}`);
  if (box) {
    box.classList.toggle('hidden');
    if (window.lucide) lucide.createIcons();
  }
}

async function handleUpvote(postId, btnEl) {
  if (btnEl) {
    btnEl.classList.remove('btn-scale-pop');
    void btnEl.offsetWidth; // trigger reflow
    btnEl.classList.add('btn-scale-pop');
    setTimeout(() => btnEl.classList.remove('btn-scale-pop'), 400);
  }
  try {
    const res = await fetch(`/api/civic/${postId}/upvote`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      const countEl = document.getElementById(`upvotes-count-${postId}`);
      if (countEl) countEl.textContent = data.upvotes;
      showToast('Civic upvote recorded! Escalation ranking boosted.');
    }
  } catch (err) {
    console.error(err);
  }
}

async function handleFlagUrgent(postId, btnEl) {
  if (btnEl) {
    btnEl.classList.remove('btn-scale-pop');
    void btnEl.offsetWidth; // trigger reflow
    btnEl.classList.add('btn-scale-pop');
    setTimeout(() => btnEl.classList.remove('btn-scale-pop'), 400);
  }
  try {
    const res = await fetch(`/api/civic/${postId}/urgent`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      const countEl = document.getElementById(`urgent-count-${postId}`);
      if (countEl) countEl.textContent = data.urgent_flags;
      showToast('Urgent alert flagged for municipal engineers.', 'error');
    }
  } catch (err) {
    console.error(err);
  }
}

async function handleCommentPost(e, postId) {
  e.preventDefault();
  const authorInp = document.getElementById(`comm-author-${postId}`);
  const textInp = document.getElementById(`comm-text-${postId}`);
  const author = authorInp.value.trim();
  const comment = textInp.value.trim();
  if (!author || !comment) return;

  try {
    const res = await fetch(`/api/civic/${postId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, comment }),
    });
    if (res.ok) {
      textInp.value = '';
      showToast('Comment submitted to public thread.');
      loadCivicFeed();
    }
  } catch (err) {
    showToast('Failed to post comment.', 'error');
  }
}

// --- 4. Home Utility Repairs Management ---
async function loadServicesFeed() {
  const grid = document.getElementById('services-grid');
  try {
    const res = await fetch('/api/services/jobs');
    state.serviceJobs = await res.json();
    applyServiceFilters();
  } catch (err) {
    grid.innerHTML = `
      <div class="col-span-full p-8 text-center bg-white rounded-2xl border border-slate-200/80 shadow-xs">
        <p class="text-sm font-medium text-slate-500">Unable to load repair jobs.</p>
      </div>
    `;
  }
}

function getTradeTag(category) {
  const c = (category || '').toLowerCase();
  if (c.includes('plumb')) return `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-50 text-cyan-800 border border-cyan-200">🔧 Plumber</span>`;
  if (c.includes('electr')) return `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">⚡ Electrician</span>`;
  if (c.includes('carpent')) return `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-800 border border-orange-200">🪚 Carpenter</span>`;
  return `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-800 border border-violet-200">❄️ Appliance Repair</span>`;
}

function renderServiceCards(jobs) {
  const grid = document.getElementById('services-grid');
  if (!jobs || jobs.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-16 text-center bg-white/80 rounded-2xl border border-slate-200/80 shadow-xs">
        <div class="w-12 h-12 mx-auto rounded-full bg-violet-50 flex items-center justify-center text-violet-600 mb-3">
          <i data-lucide="wrench" class="w-6 h-6"></i>
        </div>
        <h3 class="text-sm font-bold text-slate-800">No matching household repair requests</h3>
        <p class="text-xs text-slate-500 mt-1">Try clearing filters or search query.</p>
        <button onclick="setServiceCategory('ALL'); if(document.getElementById('service-search-input')) document.getElementById('service-search-input').value=''; handleServiceFilter();" class="mt-3 px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl transition-all">
          Clear All Filters
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  grid.innerHTML = jobs
    .map((job, index) => {
      const bids = job.bids || [];
      const isConfirmed = job.status === 'Confirmed' || job.status === 'Assigned';

      const bidsHtml = bids
        .map((b) => {
          const isAccepted = (b.status || '').toUpperCase() === 'ACCEPTED';
          const isRejected = (b.status || '').toUpperCase() === 'REJECTED';
          const isCountered = (b.status || '').toUpperCase() === 'COUNTERED';
          const lastActionBy = (b.last_action_by || '').toUpperCase();
          const currentAmt = b.current_amount || b.counter_amount || b.bid_amount || 0;
          const techRating = b.rating ? Number(b.rating).toFixed(1) : '5.0';
          const techReviews = b.review_count !== undefined ? b.review_count : 0;
          const techWorks = b.works_completed !== undefined ? b.works_completed : 0;
          const techName = b.technician_name || b.worker_name || 'Verified Technician';

          let bidActionHtml = '';

          if (isAccepted) {
            bidActionHtml = `
              <div class="flex items-center justify-between pt-2 border-t border-emerald-200 flex-wrap gap-2">
                <div class="text-[11px] font-extrabold text-emerald-800 flex items-center gap-1.5">
                  <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i>
                  <span>🎉 Deal Confirmed for ₹${currentAmt}! Contract Finalized</span>
                </div>
                <button onclick="openReviewModal('${job.id}', ${b.technician_id || 1}, '${escapeHtml(techName)}')" class="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-xs">
                  <i data-lucide="star" class="w-3 h-3 fill-amber-400 text-amber-500"></i>
                  <span>Rate & Review</span>
                </button>
              </div>
            `;
          } else if (isRejected) {
            bidActionHtml = `
              <div class="pt-2 border-t border-slate-100 text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                <i data-lucide="x-circle" class="w-3.5 h-3.5 text-slate-400"></i>
                <span>Outbid / Archived</span>
              </div>
            `;
          } else if (isCountered && lastActionBy === 'CITIZEN') {
            bidActionHtml = `
              <div class="pt-2 border-t border-amber-100 text-[11px] font-semibold text-amber-800 bg-amber-50/80 p-2.5 rounded-xl flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-1.5">
                  <i data-lucide="clock" class="w-3.5 h-3.5 text-amber-600 animate-spin"></i>
                  <span>⏳ Waiting for technician response (Your Counter: <strong>₹${currentAmt}</strong>)</span>
                </div>
                <span class="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Awaiting Confirmation</span>
              </div>
            `;
          } else {
            // lastActionBy == 'TECHNICIAN'
            bidActionHtml = `
              <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <div class="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <span>Technician Offer:</span>
                  <span class="text-emerald-700 font-black text-sm">₹${currentAmt}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <button onclick="toggleCounterBox('${b.id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1">
                    <i data-lucide="message-square" class="w-3 h-3"></i>
                    <span>Counter Offer</span>
                  </button>
                  <button onclick="handleAcceptDeal('${job.id}', '${b.id}', '₹${currentAmt}')" class="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1">
                    <i data-lucide="check" class="w-3 h-3"></i>
                    <span>Accept Deal</span>
                  </button>
                </div>
              </div>
              <div id="counter-box-${b.id}" class="hidden mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div class="text-[11px] font-bold text-slate-600 mb-1.5">Enter your counter offer (₹):</div>
                <div class="flex items-center gap-2">
                  <div class="relative flex-1">
                    <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                    <input id="counter-val-${b.id}" type="number" placeholder="Enter amount" value="${Math.max(100, currentAmt - 100)}" class="w-full pl-6 pr-2 py-1.5 text-xs font-bold rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white">
                  </div>
                  <button onclick="handleCounterSubmit('${b.id}')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors">
                    Send Counter
                  </button>
                </div>
              </div>
            `;
          }

          return `
            <div class="p-4 rounded-2xl border ${
              isAccepted
                ? 'bg-emerald-50/90 border-emerald-300 ring-1 ring-emerald-400'
                : isCountered
                ? 'bg-amber-50/50 border-amber-200'
                : 'bg-white border-slate-200/90'
            } text-xs space-y-2.5 shadow-xs">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-extrabold text-slate-900">${escapeHtml(techName)}</span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1 shadow-xs">
                    <i data-lucide="star" class="w-3 h-3 fill-amber-400 text-amber-500"></i>
                    <span>${techRating} (${techReviews} reviews) • ${techWorks} jobs</span>
                  </span>
                  <span class="text-slate-400 text-[11px] font-mono flex items-center gap-0.5">
                    <i data-lucide="phone" class="w-2.5 h-2.5"></i> ${escapeHtml(b.worker_phone)}
                  </span>
                </div>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                  isAccepted ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                  isRejected ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                  isCountered ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                  'bg-indigo-50 text-indigo-700 border border-indigo-200'
                }">${escapeHtml(b.status)}</span>
              </div>

              ${b.notes ? `<p class="text-[11px] text-slate-600 italic">"${escapeHtml(b.notes)}"</p>` : ''}

              ${bidActionHtml}
            </div>
          `;
        })
        .join('');

      return `
        <article id="job-card-${job.id}" class="animate-fade-up card-hover-lift bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_12px_32px_-6px_rgba(79,70,229,0.12)] p-6 flex flex-col justify-between" style="animation-delay: ${index * 80}ms;">
          <div>
            <!-- Top Tags -->
            <div class="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              ${getTradeTag(job.category)}
              <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${
                isConfirmed ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              }">${escapeHtml(job.status || 'Open')}</span>
            </div>

            <!-- Media Preview if available -->
            ${
              job.media_url
                ? `
              <div class="mt-4 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 h-44 relative cursor-pointer group/img" onclick="openImageModal('${job.media_url}', '${escapeHtml(job.title)}', '${escapeHtml(job.category)}')">
                <img src="${job.media_url}" alt="${escapeHtml(job.title)}" onerror="handleImgError(this, '${escapeHtml(job.category)}')" class="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-500">
                <div class="absolute top-2.5 right-2.5 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-md text-white text-[10px] font-semibold opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center gap-1 shadow-sm">
                  <i data-lucide="maximize-2" class="w-3 h-3"></i>
                  <span>Inspect</span>
                </div>
              </div>
            `
                : ''
            }

            <h3 class="font-bold text-slate-900 text-base mt-3 leading-snug">${escapeHtml(job.title)}</h3>
            <p class="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <i data-lucide="map-pin" class="w-3 h-3 text-slate-400"></i> ${escapeHtml(job.location_city)}
            </p>

            <!-- Requester Details Badge -->
            <div class="mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs flex flex-wrap items-center justify-between gap-2 shadow-xs">
              <div class="flex items-center gap-1.5 text-slate-700">
                <span class="font-bold text-slate-900">👤 ${escapeHtml(job.citizen_name || 'Resident')}</span>
                <span class="text-slate-400">•</span>
                <span class="text-slate-600">📍 ${escapeHtml(job.citizen_locality || job.citizen_address || job.location_city || 'Sector 62, Noida')}</span>
              </div>
              <div class="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200/60 flex items-center gap-1">
                <i data-lucide="clock" class="w-3 h-3 text-indigo-500"></i>
                <span>${escapeHtml(job.preferred_slot || 'Flexible / Today')}</span>
              </div>
            </div>

            <!-- Gemma Diagnostic & Price Recommendation Card -->
            <div class="mt-4 p-4 rounded-xl bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-slate-50 border border-indigo-100 text-xs space-y-1.5 shadow-xs">
              <div class="flex items-center justify-between font-bold text-indigo-950">
                <span class="flex items-center gap-1.5">
                  <i data-lucide="sparkles" class="w-3.5 h-3.5 text-indigo-600"></i>
                  <span>Fair Price Range:</span>
                  <span class="text-emerald-700 font-extrabold text-sm ml-1">${escapeHtml(job.estimated_price || 'Calculating...')}</span>
                </span>
                ${job.final_price ? `<span class="px-2 py-0.5 rounded bg-emerald-600 text-white font-extrabold">Final: ${escapeHtml(job.final_price)}</span>` : ''}
              </div>
              <p class="text-slate-600 text-xs leading-relaxed whitespace-pre-line">${escapeHtml(job.description)}</p>
            </div>

            <!-- Live Two-Way Negotiation Panel -->
            <div class="mt-5 pt-3 border-t border-slate-100">
              <div class="flex items-center justify-between mb-2.5">
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <i data-lucide="users" class="w-3.5 h-3.5 text-indigo-600"></i>
                  <span>Technician Bids (${bids.length})</span>
                </h4>
              </div>

              <div class="space-y-2">
                ${bidsHtml || '<p class="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">No bids submitted yet.</p>'}
              </div>

              <!-- Quick Simulate Worker Bid Tool for Judges -->
              ${
                !isConfirmed
                  ? `
                <div class="mt-4 p-3.5 rounded-xl bg-slate-100/90 border border-slate-200">
                  <div class="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-2">
                    <span class="flex items-center gap-1 text-indigo-700"><i data-lucide="zap" class="w-3 h-3"></i> Quick Test: Simulate Technician Bid</span>
                    <span class="text-[10px] text-slate-400 font-normal">Judge/Demo Tool</span>
                  </div>
                  <form onsubmit="handleQuickBid(event, '${job.id}')" class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input id="qbid-name-${job.id}" type="text" placeholder="Worker Name" value="Ramesh Plumber" class="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none" required>
                    <input id="qbid-phone-${job.id}" type="text" placeholder="Phone" value="+91 98765 43210" class="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none" required>
                    <div class="flex gap-1.5">
                      <input id="qbid-amount-${job.id}" type="number" placeholder="₹ Bid" value="450" class="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none" required>
                      <button type="submit" class="px-3.5 py-1.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold transition-colors">Bid</button>
                    </div>
                  </form>
                </div>
              `
                  : ''
              }
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  if (window.lucide) lucide.createIcons();
}

async function handleQuickBid(e, jobId) {
  e.preventDefault();
  const name = document.getElementById(`qbid-name-${jobId}`).value.trim();
  const phone = document.getElementById(`qbid-phone-${jobId}`).value.trim();
  const amount = parseInt(document.getElementById(`qbid-amount-${jobId}`).value);

  if (!name || !phone || isNaN(amount)) return;

  try {
    const role = state.auth?.user?.role || 'technician';
    const res = await fetch(`/api/services/${jobId}/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': role,
      },
      body: JSON.stringify({ worker_name: name, worker_phone: phone, bid_amount: amount }),
    });
    if (res.ok) {
      showToast(`Technician quote of ₹${amount} submitted!`);
      loadServicesFeed();
    }
  } catch (err) {
    showToast('Failed to submit technician bid.', 'error');
  }
}

function toggleCounterBox(bidId) {
  const el = document.getElementById(`counter-box-${bidId}`);
  if (el) el.classList.toggle('hidden');
}

async function handleCounterSubmit(bidId) {
  const inp = document.getElementById(`counter-val-${bidId}`);
  if (!inp) return;
  const amt = parseInt(inp.value);
  if (isNaN(amt) || amt <= 0) {
    alert('Please enter a valid counter amount in INR');
    return;
  }

  try {
    const res = await fetch(`/api/services/bids/${bidId}/counter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counter_amount: amt, actor_role: 'CITIZEN' }),
    });
    if (res.ok) {
      showToast(`Counter offer of ₹${amt} sent to contractor.`);
      loadServicesFeed();
    } else {
      showToast('Failed to submit counter offer.', 'error');
    }
  } catch (err) {
    showToast('Failed to submit counter offer.', 'error');
  }
}

async function handleAcceptDeal(jobId, bidId, price) {
  if (!confirm(`Finalize contract and lock rate at ${price}?`)) return;

  const card = document.getElementById(`job-card-${jobId}`);
  if (card) {
    card.classList.remove('deal-confirmed-glow');
    void card.offsetWidth; // Trigger DOM reflow
    card.classList.add('deal-confirmed-glow');
  }

  try {
    const res = await fetch(`/api/services/bids/${bidId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, final_price: price }),
    });
    if (res.ok) {
      showToast(`Deal confirmed at ${price}! Contract locked.`);
      setTimeout(() => loadServicesFeed(), 650);
    }
  } catch (err) {
    showToast('Failed to confirm deal.', 'error');
  }
}

// --- 5. Drag & Drop Previews & Modals ---
function initModals() {
  window.openModal = function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
    syncLocationInputs();
  };
  window.closeModal = function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  };
}

function initDragAndDrop() {
  setupUploadZone('civic-dropzone', 'civic-file-input', 'civic-preview-img', 'civic-preview-box');
  setupUploadZone('job-dropzone', 'job-file-input', 'job-preview-img', 'job-preview-box');
}

function setupUploadZone(zoneId, inputId, previewImgId, previewBoxId) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewImgId);
  const box = document.getElementById(previewBoxId);

  if (!zone || !input) return;

  ['dragenter', 'dragover'].forEach((eventName) => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add('border-indigo-500', 'bg-indigo-50/50');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('border-indigo-500', 'bg-indigo-50/50');
    });
  });

  zone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length) {
      input.files = files;
      showPreview(files[0], preview, box);
    }
  });

  input.addEventListener('change', () => {
    if (input.files.length) {
      showPreview(input.files[0], preview, box);
    }
  });
}

function showPreview(file, imgEl, boxEl) {
  if (!file || !imgEl || !boxEl) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    imgEl.src = e.target.result;
    boxEl.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

// Submit Civic Issue Form
async function submitCivicForm(e) {
  e.preventDefault();
  const fileInput = document.getElementById('civic-file-input');
  const desc = document.getElementById('civic-desc-input').value.trim();
  const loc = document.getElementById('civic-location-input').value.trim();
  const btn = document.getElementById('civic-submit-btn');
  const originalHtml = btn.innerHTML;

  const scannerOverlay = document.getElementById('civic-scanner-overlay');
  const statusStepper = document.getElementById('civic-status-stepper');
  const stepText = document.getElementById('civic-step-text');
  const progressBar = document.getElementById('civic-progress-bar');

  if (!fileInput.files[0]) {
    alert('Please attach an infrastructure photo for Gemma 4 inspection.');
    return;
  }

  const formData = new FormData();
  formData.append('image', fileInput.files[0]);
  formData.append('description', desc);
  formData.append('location_city', loc || 'Sector 62, Noida');
  formData.append('lat', state.coords.lat);
  formData.append('lng', state.coords.lng);
  formData.append('citizen_name', state.auth?.user?.name || 'Ayush Chauhan');
  formData.append('citizen_phone', state.auth?.user?.phone || '+91 98765 43210');

  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></span> Gemma 4 Auditing Hazard...`;

  // Reveal laser scanner and status stepper
  if (scannerOverlay) scannerOverlay.classList.remove('hidden');
  if (statusStepper) statusStepper.classList.remove('hidden');

  if (stepText && progressBar) {
    stepText.textContent = 'Step 1: Ingesting image bytes...';
    progressBar.style.width = '30%';
  }

  const t1 = setTimeout(() => {
    if (stepText && progressBar) {
      stepText.textContent = 'Step 2: Gemma 4 Multimodal evaluating infrastructure hazard...';
      progressBar.style.width = '65%';
    }
  }, 700);

  const t2 = setTimeout(() => {
    if (stepText && progressBar) {
      stepText.textContent = 'Step 3: Verifying municipal jurisdiction & severity...';
      progressBar.style.width = '90%';
    }
  }, 1600);

  try {
    const res = await fetch('/api/civic/report', {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
      if (progressBar) progressBar.style.width = '100%';
      closeModal('modal-civic');
      e.target.reset();
      document.getElementById('civic-preview-box').classList.add('hidden');
      showToast('Civic incident audited by Gemma 4 & published!');
      loadCivicFeed();
    } else {
      const err = await res.json();
      showToast(err.detail || 'Error submitting report', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to AI engine.', 'error');
  } finally {
    clearTimeout(t1);
    clearTimeout(t2);
    if (scannerOverlay) scannerOverlay.classList.add('hidden');
    if (statusStepper) statusStepper.classList.add('hidden');
    if (progressBar) progressBar.style.width = '30%';
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// Submit Service Job Form
async function submitServiceForm(e) {
  e.preventDefault();
  const fileInput = document.getElementById('job-file-input');
  const desc = document.getElementById('job-desc-input').value.trim();
  const loc = document.getElementById('job-location-input').value.trim();
  const btn = document.getElementById('job-submit-btn');
  const originalHtml = btn.innerHTML;

  const scannerOverlay = document.getElementById('job-scanner-overlay');
  const statusStepper = document.getElementById('job-status-stepper');
  const stepText = document.getElementById('job-step-text');
  const progressBar = document.getElementById('job-progress-bar');

  if (!fileInput.files[0]) {
    alert('Please attach defect media for AI diagnosis.');
    return;
  }

  const citizenName = document.getElementById('job-citizen-name')?.value.trim() || state.auth?.user?.name || 'Ayush Chauhan';
  const citizenPhone = document.getElementById('job-citizen-phone')?.value.trim() || state.auth?.user?.phone || '+91 98765 43210';
  const citizenAddress = document.getElementById('job-citizen-address')?.value.trim() || loc || 'Sector 62, Noida';
  const preferredSlot = document.getElementById('job-preferred-slot')?.value.trim() || 'Today, 4:00 PM - 6:00 PM';

  const formData = new FormData();
  formData.append('media', fileInput.files[0]);
  formData.append('description', desc);
  formData.append('location_city', loc || 'Sector 62, Noida');
  formData.append('citizen_name', citizenName);
  formData.append('citizen_phone', citizenPhone);
  formData.append('citizen_address', citizenAddress);
  formData.append('preferred_slot', preferredSlot);

  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></span> Gemma AI Diagnosing Fault...`;

  // Reveal laser scanner and status stepper
  if (scannerOverlay) scannerOverlay.classList.remove('hidden');
  if (statusStepper) statusStepper.classList.remove('hidden');

  if (stepText && progressBar) {
    stepText.textContent = 'Step 1: Ingesting defect media...';
    progressBar.style.width = '30%';
  }

  const t1 = setTimeout(() => {
    if (stepText && progressBar) {
      stepText.textContent = 'Step 2: Gemma AI diagnosing household defect...';
      progressBar.style.width = '65%';
    }
  }, 700);

  const t2 = setTimeout(() => {
    if (stepText && progressBar) {
      stepText.textContent = 'Step 3: Calculating fair market repair brackets...';
      progressBar.style.width = '90%';
    }
  }, 1600);

  try {
    const res = await fetch('/api/services/create', {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
      if (progressBar) progressBar.style.width = '100%';
      closeModal('modal-service');
      e.target.reset();
      document.getElementById('job-preview-box').classList.add('hidden');
      showToast('Fault diagnosed by Gemma & posted for bids!');
      loadServicesFeed();
    } else {
      const err = await res.json();
      showToast(err.detail || 'Error requesting repair', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to AI engine.', 'error');
  } finally {
    clearTimeout(t1);
    clearTimeout(t2);
    if (scannerOverlay) scannerOverlay.classList.add('hidden');
    if (statusStepper) statusStepper.classList.add('hidden');
    if (progressBar) progressBar.style.width = '30%';
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// --- 6. Floating PulseBot Copilot Drawer ---
function togglePulseBot() {
  const drawer = document.getElementById('pulsebot-drawer');
  if (drawer) {
    drawer.classList.toggle('hidden');
    if (!drawer.classList.contains('hidden')) {
      const input = document.getElementById('pulsebot-input');
      if (input) input.focus();
    }
  }
  if (window.lucide) lucide.createIcons();
}

function sendChip(promptText) {
  const input = document.getElementById('pulsebot-input');
  if (input) {
    input.value = promptText;
    handlePulseBotChat(new Event('submit'));
  }
}

async function handlePulseBotChat(e) {
  e.preventDefault();
  const input = document.getElementById('pulsebot-input');
  const text = input.value.trim();
  if (!text) return;

  const chatArea = document.getElementById('pulsebot-history');

  // Render User Message Bubble
  chatArea.innerHTML += `
    <div class="flex justify-end">
      <div class="bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs px-3.5 py-2.5 rounded-2xl rounded-tr-sm max-w-[85%] leading-relaxed shadow-sm">
        ${escapeHtml(text)}
      </div>
    </div>
  `;
  input.value = '';
  chatArea.scrollTop = chatArea.scrollHeight;

  // Render Thinking Bubble
  const loadId = 'bot-load-' + Date.now();
  chatArea.innerHTML += `
    <div id="${loadId}" class="flex justify-start">
      <div class="bg-white text-slate-500 text-xs px-3.5 py-2.5 rounded-2xl rounded-tl-sm border border-slate-200/80 shadow-xs flex items-center gap-2">
        <span class="inline-block animate-spin rounded-full h-3 w-3 border-2 border-indigo-600 border-t-transparent"></span>
        <span>PulseBot analyzing...</span>
      </div>
    </div>
  `;
  chatArea.scrollTop = chatArea.scrollHeight;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: state.chatHistory }),
    });
    const data = await res.json();
    const reply = data.reply || 'PulseBot is reviewing the query.';

    state.chatHistory.push({ role: 'user', content: text });
    state.chatHistory.push({ role: 'model', content: reply });

    const loader = document.getElementById(loadId);
    if (loader) loader.remove();

    chatArea.innerHTML += `
      <div class="flex justify-start">
        <div class="bg-white text-slate-800 text-xs px-3.5 py-2.5 rounded-2xl rounded-tl-sm border border-slate-200/80 shadow-xs max-w-[85%] leading-relaxed">
          ${escapeHtml(reply)}
        </div>
      </div>
    `;
  } catch (err) {
    const loader = document.getElementById(loadId);
    if (loader) loader.remove();
    chatArea.innerHTML += `
      <div class="flex justify-start">
        <div class="bg-rose-50 text-rose-700 text-xs px-3 py-2 rounded-xl border border-rose-200">
          PulseBot service temporarily unavailable.
        </div>
      </div>
    `;
  }
  chatArea.scrollTop = chatArea.scrollHeight;
}

// Utility: HTML Escaping
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==============================================================================
// PILLAR 2: FORMAL MUNICIPAL GRIEVANCE & RTI LETTER GENERATOR
// ==============================================================================
let currentLetterPostId = null;
let currentLetterType = 'municipal';
const letterCache = {};

async function openLetterModal(postId) {
  currentLetterPostId = postId;
  currentLetterType = 'municipal';

  const modal = document.getElementById('modal-letter');
  const subtitleEl = document.getElementById('letter-modal-subtitle');

  // Find post safely in state.civicPosts
  const posts = (typeof state !== 'undefined' && state.civicPosts) ? state.civicPosts : [];
  const post = posts.find((p) => String(p.id) === String(postId));
  if (post && subtitleEl) {
    subtitleEl.textContent = `Hazard: "${post.title}" • Jurisdiction: ${post.department} (${post.location_city})`;
  } else if (subtitleEl) {
    subtitleEl.textContent = `Incident #${postId} • Powered by Gemma 4 Multimodal Audit`;
  }

  // Update tab buttons appearance
  updateLetterTabsUI('municipal');

  if (modal) {
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  if (window.lucide) lucide.createIcons();
  await fetchAndDisplayLetter(postId, 'municipal');
}

function closeLetterModal() {
  const modal = document.getElementById('modal-letter');
  if (modal) {
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
}

function closeLetterModalOnBackdrop(e) {
  if (e && e.target && e.target.id === 'modal-letter') {
    closeLetterModal();
  }
}

function updateLetterTabsUI(activeType) {
  const tabMunicipal = document.getElementById('letter-tab-municipal');
  const tabRti = document.getElementById('letter-tab-rti');

  if (activeType === 'municipal') {
    if (tabMunicipal) {
      tabMunicipal.className =
        'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 bg-white text-indigo-600 shadow-sm border border-slate-200/70';
    }
    if (tabRti) {
      tabRti.className =
        'flex-1 py-2 px-3 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center gap-2';
    }
  } else {
    if (tabMunicipal) {
      tabMunicipal.className =
        'flex-1 py-2 px-3 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center gap-2';
    }
    if (tabRti) {
      tabRti.className =
        'flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 bg-white text-indigo-600 shadow-sm border border-slate-200/70';
    }
  }
}

async function switchLetterType(newType) {
  if (newType === currentLetterType) return;
  currentLetterType = newType;
  updateLetterTabsUI(newType);
  if (currentLetterPostId) {
    await fetchAndDisplayLetter(currentLetterPostId, newType);
  }
}

async function fetchAndDisplayLetter(postId, letterType) {
  const cacheKey = `${postId}_${letterType}`;
  const paper = document.getElementById('letter-modal-paper');
  const loader = document.getElementById('letter-loading-state');
  const container = document.getElementById('letter-content-container');

  if (letterCache[cacheKey]) {
    if (loader) loader.classList.add('hidden');
    if (container) container.classList.remove('hidden');
    if (paper) paper.textContent = letterCache[cacheKey];
    return;
  }

  // Show loading spinner
  if (loader) loader.classList.remove('hidden');
  if (container) container.classList.add('hidden');

  try {
    const res = await fetch(`/api/civic/${postId}/letter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ letter_type: letterType }),
    });

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }

    const data = await res.json();
    const content = data.letter || 'Unable to generate official document draft.';
    letterCache[cacheKey] = content;

    if (paper) paper.textContent = content;
    if (loader) loader.classList.add('hidden');
    if (container) container.classList.remove('hidden');
  } catch (err) {
    console.error('Error generating official letter:', err);
    if (loader) loader.classList.add('hidden');
    if (container) container.classList.remove('hidden');
    if (paper) {
      paper.textContent = `NOTICE GENERATION ERROR\n\nUnable to retrieve statutory letter for incident #${postId}. Please verify that the backend server is operational and try again.`;
    }
    showToast('Failed to generate letter. Please try again.');
  }
}

async function copyLetterText() {
  const paper = document.getElementById('letter-modal-paper');
  const btnText = document.getElementById('btn-copy-letter-text');
  if (!paper || !paper.textContent) return;

  try {
    await navigator.clipboard.writeText(paper.textContent);
    if (btnText) btnText.textContent = '✓ Copied!';
    showToast('Official letter copied to clipboard!');
    setTimeout(() => {
      if (btnText) btnText.textContent = 'Copy Text';
    }, 2500);
  } catch (e) {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = paper.textContent;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (btnText) btnText.textContent = '✓ Copied!';
    showToast('Official letter copied to clipboard!');
    setTimeout(() => {
      if (btnText) btnText.textContent = 'Copy Text';
    }, 2500);
  }
}

function printLetterDoc() {
  window.print();
}

// =========================================================================
// PILLAR 3: 3-WAY PERSONA ECOSYSTEM LOGIC (Citizen, Officer, Technician)
// =========================================================================

function switchPersona(persona) {
  state.currentPersona = persona;

  const viewCitizen = document.getElementById('persona-view-citizen');
  const viewAdmin = document.getElementById('persona-view-admin');
  const viewTech = document.getElementById('persona-view-technician');

  const btnCitizen = document.getElementById('persona-btn-citizen');
  const btnAdmin = document.getElementById('persona-btn-admin');
  const btnTech = document.getElementById('persona-btn-technician');

  const mBtnCitizen = document.getElementById('mobile-persona-btn-citizen');
  const mBtnAdmin = document.getElementById('mobile-persona-btn-admin');
  const mBtnTech = document.getElementById('mobile-persona-btn-technician');

  // Reset desktop button styles
  const defaultDeskClass =
    'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 transition-all';
  if (btnCitizen) btnCitizen.className = defaultDeskClass;
  if (btnAdmin) btnAdmin.className = defaultDeskClass;
  if (btnTech) btnTech.className = defaultDeskClass;

  // Reset mobile button styles
  const defaultMobClass =
    'flex-1 py-1.5 px-2 text-center text-xs font-semibold rounded-xl bg-white text-slate-600 border border-slate-200 whitespace-nowrap';
  if (mBtnCitizen) mBtnCitizen.className = defaultMobClass;
  if (mBtnAdmin) mBtnAdmin.className = defaultMobClass;
  if (mBtnTech) mBtnTech.className = defaultMobClass;

  // Hide all views first
  if (viewCitizen) viewCitizen.classList.add('hidden');
  if (viewAdmin) viewAdmin.classList.add('hidden');
  if (viewTech) viewTech.classList.add('hidden');

  if (persona === 'citizen') {
    if (viewCitizen) viewCitizen.classList.remove('hidden');
    if (btnCitizen)
      btnCitizen.className =
        'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white text-indigo-900 shadow-sm border border-slate-200/90 transition-all';
    if (mBtnCitizen)
      mBtnCitizen.className =
        'flex-1 py-1.5 px-2 text-center text-xs font-bold rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap';
  } else if (persona === 'admin' || persona === 'municipal') {
    if (viewAdmin) viewAdmin.classList.remove('hidden');
    if (btnAdmin)
      btnAdmin.className =
        'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white text-rose-900 shadow-sm border border-rose-200/90 transition-all';
    if (mBtnAdmin)
      mBtnAdmin.className =
        'flex-1 py-1.5 px-2 text-center text-xs font-bold rounded-xl bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap';
    loadAdminDashboard();
  } else if (persona === 'technician') {
    if (viewTech) viewTech.classList.remove('hidden');
    if (btnTech)
      btnTech.className =
        'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white text-emerald-900 shadow-sm border border-emerald-200/90 transition-all';
    if (mBtnTech)
      mBtnTech.className =
        'flex-1 py-1.5 px-2 text-center text-xs font-bold rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap';
    loadTechnicianWorkspace();
  }

  // Update persistent role display badge
  const roleBadge = document.getElementById('workspaceRoleBadge');
  const roleIcon = document.getElementById('workspaceRoleIcon');
  const roleTitle = document.getElementById('workspaceRoleTitle');
  if (roleBadge && roleIcon && roleTitle) {
    if (persona === 'citizen') {
      roleIcon.textContent = '👤';
      roleTitle.textContent = 'Citizen Portal';
      roleBadge.className = 'hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold shadow-xs';
    } else if (persona === 'admin' || persona === 'municipal') {
      roleIcon.textContent = '🛡️';
      roleTitle.textContent = 'Municipal Command Center';
      roleBadge.className = 'hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold shadow-xs';
    } else if (persona === 'technician') {
      roleIcon.textContent = '🔧';
      roleTitle.textContent = 'Technician Workspace';
      roleBadge.className = 'hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold shadow-xs';
    }
  }

  if (window.lucide) lucide.createIcons();
}

// --- Municipal Officer Command Center ---

function formatSlaBadge(createdAt, slaHours = 48) {
  const createdTime = new Date(createdAt).getTime();
  const now = Date.now();
  const elapsedHours = (now - createdTime) / (1000 * 60 * 60);
  const remainingHours = slaHours - elapsedHours;

  if (remainingHours <= 0) {
    const overdue = Math.abs(remainingHours);
    const h = Math.floor(overdue);
    const m = Math.floor((overdue - h) * 60);
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-black bg-rose-600 text-white sla-badge-critical">
      <span>🚨 BREACHED by ${h}h ${m}m</span>
    </span>`;
  } else if (remainingHours < 12) {
    const h = Math.floor(remainingHours);
    const m = Math.floor((remainingHours - h) * 60);
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
      <span>⚠️ ${h}h ${m}m left</span>
    </span>`;
  } else {
    const h = Math.floor(remainingHours);
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
      <span>⏳ ${h}h remaining</span>
    </span>`;
  }
}

async function loadAdminDashboard() {
  const criticalEl = document.getElementById('admin-stat-critical');
  const riskEl = document.getElementById('admin-stat-risk');
  const unassignedEl = document.getElementById('admin-stat-unassigned');
  const rateEl = document.getElementById('admin-stat-rate');
  const tbody = document.getElementById('admin-triage-tbody');

  try {
    const res = await fetch('/api/admin/overview');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.adminData = data;

    if (criticalEl) criticalEl.textContent = data.critical_count ?? data.critical_high_count ?? 0;
    if (riskEl) riskEl.textContent = data.sla_at_risk_count ?? 0;
    if (unassignedEl) unassignedEl.textContent = data.unassigned_count ?? 0;
    if (rateEl) rateEl.textContent = `${data.resolution_rate ?? 0}%`;

    renderAdminTriageTable();
  } catch (err) {
    console.error('Error loading admin overview:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-rose-500 font-semibold">Failed to load officer dashboard data.</td></tr>`;
    }
  }
}

function setAdminDepartment(dept, btnEl) {
  state.adminDeptFilter = dept;
  document.querySelectorAll('.admin-dept-pill').forEach((b) => {
    b.className =
      'admin-dept-pill px-3.5 py-1.5 rounded-xl font-semibold bg-slate-100 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-all whitespace-nowrap';
  });
  if (btnEl) {
    btnEl.className =
      'admin-dept-pill active px-3.5 py-1.5 rounded-xl font-bold bg-indigo-600 text-white shadow-xs transition-all whitespace-nowrap';
  }
  renderAdminTriageTable();
}

function renderAdminTriageTable() {
  const tbody = document.getElementById('admin-triage-tbody');
  const countEl = document.getElementById('admin-table-count');
  if (!tbody || !state.adminData) return;

  let posts = state.adminData.prioritized_posts || [];
  if (state.adminDeptFilter && state.adminDeptFilter !== 'ALL') {
    const q = state.adminDeptFilter.toLowerCase();
    posts = posts.filter((p) => (p.department || '').toLowerCase().includes(q));
  }

  if (countEl) {
    countEl.textContent = `Showing ${posts.length} of ${state.adminData.prioritized_posts.length} incidents`;
  }

  if (posts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-12 text-center text-slate-400">No active incidents matching this department filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = posts
    .map((post) => {
      const sev = (post.severity || 'Moderate').toLowerCase();
      let sevBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">Moderate</span>`;
      if (sev === 'critical') {
        sevBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1 max-w-fit"><span class="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping"></span>Critical</span>`;
      } else if (sev === 'high') {
        sevBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">High</span>`;
      } else if (sev === 'low') {
        sevBadge = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">Low</span>`;
      }

      const slaBadge = formatSlaBadge(post.created_at, post.sla_hours || 48);

      const isLocal = post.is_local === 1 || post.is_local === true;
      const jurBadge = isLocal
        ? `<span class="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200"><i data-lucide="building" class="w-3 h-3 text-indigo-500"></i>Local Ward</span>`
        : `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200"><i data-lucide="external-link" class="w-3 h-3 text-amber-600"></i>CPGRAMS/NHAI</span>`;

      const imgUrl = post.image_url || getFallbackSvg(post.department);
      const assignedOfficer = post.assigned_officer || 'Unassigned';
      const postStatus = post.status || 'Reported';

      return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <!-- Incident & Evidence -->
        <td class="py-3.5 px-4">
          <div class="flex items-center gap-3">
            <img src="${escapeHtml(imgUrl)}" onerror="handleImgError(this, '${escapeHtml(post.department)}')" onclick="openImageModal('${escapeHtml(imgUrl)}', '${escapeHtml(post.title)}', '${escapeHtml(post.department)}')" class="w-12 h-12 rounded-xl object-cover border border-slate-200 cursor-pointer hover:scale-105 transition-transform shrink-0" alt="Evidence">
            <div class="max-w-xs">
              <div class="font-bold text-slate-900 leading-snug line-clamp-1" title="${escapeHtml(post.title)}">${escapeHtml(post.title)}</div>
              <div class="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                <span>📍 ${escapeHtml(post.location_city || 'Sector 62, Noida')}</span>
                <span>•</span>
                <span>#${post.id}</span>
              </div>
            </div>
          </div>
        </td>

        <!-- Dept & Jurisdiction -->
        <td class="py-3.5 px-3">
          <div class="font-bold text-slate-800 text-[11px]">${escapeHtml(post.department || 'Civic')}</div>
          <div class="mt-1">${jurBadge}</div>
        </td>

        <!-- Severity -->
        <td class="py-3.5 px-3">
          ${sevBadge}
        </td>

        <!-- Statutory SLA -->
        <td class="py-3.5 px-3">
          ${slaBadge}
        </td>

        <!-- Assigned Field Inspector -->
        <td class="py-3.5 px-3">
          <select id="admin-officer-select-${post.id}" class="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none w-44">
            <option value="Unassigned" ${assignedOfficer === 'Unassigned' ? 'selected' : ''}>Unassigned</option>
            <option value="Inspector V. Sharma - Zone 4" ${assignedOfficer === 'Inspector V. Sharma - Zone 4' ? 'selected' : ''}>Inspector V. Sharma - Zone 4</option>
            <option value="Rapid Response Squad A" ${assignedOfficer === 'Rapid Response Squad A' ? 'selected' : ''}>Rapid Response Squad A</option>
            <option value="Er. R. Mathur - Public Works" ${assignedOfficer === 'Er. R. Mathur - Public Works' ? 'selected' : ''}>Er. R. Mathur - Public Works</option>
            <option value="Sanjeev Gupta - Electrical Grid" ${assignedOfficer === 'Sanjeev Gupta - Electrical Grid' ? 'selected' : ''}>Sanjeev Gupta - Electrical Grid</option>
            <option value="Anita Rao - Sanitation Lead" ${assignedOfficer === 'Anita Rao - Sanitation Lead' ? 'selected' : ''}>Anita Rao - Sanitation Lead</option>
          </select>
        </td>

        <!-- Lifecycle Stage & Remarks -->
        <td class="py-3.5 px-3 min-w-[210px]">
          <select id="admin-status-select-${post.id}" class="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none mb-1.5 shadow-xs">
            <option value="REPORTED" ${postStatus.toUpperCase() === 'REPORTED' ? 'selected' : ''}>📋 REPORTED</option>
            <option value="ACKNOWLEDGED" ${postStatus.toUpperCase() === 'ACKNOWLEDGED' || postStatus.toUpperCase() === 'ASSIGNED' ? 'selected' : ''}>🛡️ ACKNOWLEDGED</option>
            <option value="IN_PROGRESS" ${postStatus.toUpperCase() === 'IN_PROGRESS' || postStatus.toUpperCase() === 'IN PROGRESS' ? 'selected' : ''}>⏳ IN PROGRESS</option>
            <option value="RESOLVED" ${postStatus.toUpperCase() === 'RESOLVED' ? 'selected' : ''}>✅ RESOLVED</option>
          </select>
          <input id="admin-note-${post.id}" type="text" placeholder="Officer dispatch note..." value="${escapeHtml(post.officer_note || '')}" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-[11px] text-slate-700 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-colors">
        </td>

        <!-- Status Action -->
        <td class="py-3.5 px-4 text-right">
          <button id="admin-dispatch-btn-${post.id}" onclick="patchPostOfficerStatus('${post.id}')" class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 ml-auto whitespace-nowrap">
            <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i>
            <span>Update Status</span>
          </button>
        </td>
      </tr>
    `;
    })
    .join('');

  if (window.lucide) lucide.createIcons();
}

async function patchPostOfficerStatus(postId) {
  const officerSelect = document.getElementById(`admin-officer-select-${postId}`);
  const statusSelect = document.getElementById(`admin-status-select-${postId}`);
  const noteInput = document.getElementById(`admin-note-${postId}`);
  const dispatchBtn = document.getElementById(`admin-dispatch-btn-${postId}`);

  if (!statusSelect) return;

  const assigned_officer = officerSelect ? officerSelect.value : 'Unassigned';
  const status = statusSelect.value;
  const officer_note = noteInput ? noteInput.value.trim() : '';

  if (dispatchBtn) {
    dispatchBtn.disabled = true;
    dispatchBtn.innerHTML = `<span class="inline-block animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></span>`;
  }

  try {
    const role = state.auth?.user?.role || 'municipal';
    const effectiveRole = role === 'admin' ? 'municipal' : role;
    
    // Call PATCH /api/civic/{postId}/status
    const res = await fetch(`/api/civic/${postId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': effectiveRole,
      },
      body: JSON.stringify({ status, officer_note, assigned_officer }),
    });

    if (!res.ok) {
      // Fallback to POST if needed
      const fallbackRes = await fetch(`/api/civic/${postId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': effectiveRole,
        },
        body: JSON.stringify({ status, officer_note, assigned_officer }),
      });
      if (!fallbackRes.ok) throw new Error(`HTTP ${fallbackRes.status}`);
      var updated = await fallbackRes.json();
    } else {
      var updated = await res.json();
    }

    // Update in-memory admin state
    if (state.adminData && state.adminData.prioritized_posts) {
      const idx = state.adminData.prioritized_posts.findIndex((p) => String(p.id) === String(postId));
      if (idx !== -1) {
        state.adminData.prioritized_posts[idx] = updated;
      }
    }

    showToast(`✓ Incident #${postId} updated to "${status}"!`, 'success');
    loadAdminDashboard(); // Refresh operational metrics
    loadCivicFeed(); // Live sync citizen feed and summary bar
  } catch (err) {
    console.error('Error updating officer status:', err);
    showToast('Failed to update incident status. Ensure municipal role.', 'error');
  } finally {
    if (dispatchBtn) {
      dispatchBtn.disabled = false;
      dispatchBtn.innerHTML = `<i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i><span>Update Status</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

const updatePostOfficerStatus = patchPostOfficerStatus;

// --- Technician & Worker Workspace ---

function handleTechnicianProfileChange(phone) {
  state.technicianPhone = phone;
  showToast(`Switched active technician profile to ${phone}`, 'info');
  loadTechnicianWorkspace();
}

function switchTechTab(tab) {
  state.techActiveTab = tab;
  const btnLeads = document.getElementById('tech-tab-leads');
  const btnQuotes = document.getElementById('tech-tab-quotes');
  const btnReviews = document.getElementById('tech-tab-reviews');
  const viewLeads = document.getElementById('tech-view-leads');
  const viewQuotes = document.getElementById('tech-view-quotes');
  const viewReviews = document.getElementById('tech-view-reviews');

  [btnLeads, btnQuotes, btnReviews].forEach(b => {
    if (b) b.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 transition-all';
  });
  if (viewLeads) viewLeads.classList.add('hidden');
  if (viewQuotes) viewQuotes.classList.add('hidden');
  if (viewReviews) viewReviews.classList.add('hidden');

  if (tab === 'leads') {
    if (btnLeads)
      btnLeads.className =
        'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white text-emerald-900 shadow-sm border border-slate-200/90 transition-all';
    if (viewLeads) viewLeads.classList.remove('hidden');
  } else if (tab === 'quotes') {
    if (btnQuotes)
      btnQuotes.className =
        'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white text-indigo-900 shadow-sm border border-slate-200/90 transition-all';
    if (viewQuotes) viewQuotes.classList.remove('hidden');
  } else if (tab === 'reviews') {
    if (btnReviews)
      btnReviews.className =
        'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white text-amber-900 shadow-sm border border-slate-200/90 transition-all';
    if (viewReviews) viewReviews.classList.remove('hidden');
  }
  if (window.lucide) lucide.createIcons();
}

async function loadTechnicianWorkspace() {
  const earningsEl = document.getElementById('tech-stat-earnings');
  const leadsCountEl = document.getElementById('tech-stat-leads');
  const confirmedCountEl = document.getElementById('tech-stat-confirmed');
  const ratingEl = document.getElementById('tech-stat-rating');
  const reviewsEl = document.getElementById('tech-stat-reviews');
  const badgeRatingPill = document.getElementById('tech-badge-rating-pill');
  const badgeAlert = document.getElementById('tech-badge-counter-alert');

  const repName = document.getElementById('tech-rep-name');
  const repTrade = document.getElementById('tech-rep-trade');
  const repBigRating = document.getElementById('tech-rep-big-rating');
  const repCompleted = document.getElementById('tech-rep-completed-count');
  const repReviewTotal = document.getElementById('tech-rep-review-total');
  const repAvatar = document.getElementById('tech-rep-avatar');

  try {
    const phone = encodeURIComponent(state.technicianPhone);
    const res = await fetch(`/api/technician/${phone}/jobs`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.technicianData = data;

    if (earningsEl) earningsEl.textContent = `₹${(data.total_earnings || 0).toLocaleString()}`;
    if (leadsCountEl) leadsCountEl.textContent = (data.available_leads || []).length;
    if (confirmedCountEl) confirmedCountEl.textContent = (data.confirmed_jobs || []).length;

    // Reputation & Rating Stats
    const ratingVal = data.rating ? Number(data.rating).toFixed(1) : '5.0';
    const revCount = data.review_count !== undefined ? data.review_count : ((data.reviews || []).length);
    const worksCount = data.works_completed !== undefined ? data.works_completed : ((data.confirmed_jobs || []).length);

    if (ratingEl) ratingEl.innerHTML = `${ratingVal} <span class="text-amber-500">★</span>`;
    if (reviewsEl) reviewsEl.textContent = `${revCount} reviews • ${worksCount} jobs`;
    if (badgeRatingPill) badgeRatingPill.textContent = `★ ${ratingVal}`;

    const prof = data.profile || {};
    if (repName) repName.textContent = prof.name || 'Verified Technician';
    if (repTrade) repTrade.textContent = `${prof.trade || 'Multi-Trade Specialist'} • ${prof.location || 'Local Guild'}`;
    if (repBigRating) repBigRating.innerHTML = `<span>${ratingVal}</span> <i data-lucide="star" class="w-5 h-5 fill-amber-500 text-amber-500"></i>`;
    if (repCompleted) repCompleted.textContent = worksCount;
    if (repReviewTotal) repReviewTotal.textContent = `${revCount} Verified Reviews`;

    if (repAvatar && prof.name) {
      const parts = prof.name.trim().split(' ');
      const initials = (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
      repAvatar.textContent = initials || 'TK';
    }

    // Check for pending counter-offers
    const hasCountered = (data.active_bids || []).some((b) => b.status === 'Countered');
    if (badgeAlert) {
      if (hasCountered) {
        badgeAlert.classList.remove('hidden');
      } else {
        badgeAlert.classList.add('hidden');
      }
    }

    renderTechLeads(data.available_leads || []);
    renderTechQuotesAndDeals(data.active_bids || [], data.confirmed_jobs || []);
    renderTechReviews(data.reviews || []);
  } catch (err) {
    console.error('Error loading technician workspace:', err);
    showToast('Failed to load technician workspace.', 'error');
  }
}

function renderTechReviews(reviews) {
  const container = document.getElementById('tech-reviews-container');
  if (!container) return;

  if (!reviews || reviews.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
        <p class="text-xs font-semibold">No citizen reviews logged yet for this profile.</p>
        <p class="text-[10px] text-slate-400 mt-0.5">Reviews appear automatically after homeowners accept quotes and rate repairs.</p>
      </div>`;
    return;
  }

  container.innerHTML = reviews.map(r => {
    const stars = Array.from({ length: 5 }, (_, i) => {
      const filled = i < (r.rating || 5);
      return `<i data-lucide="star" class="w-3.5 h-3.5 ${filled ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}"></i>`;
    }).join('');

    const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Verified Service';

    return `
      <div class="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between space-y-2">
        <div>
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-50 to-amber-100 border border-amber-200 flex items-center justify-center font-bold text-xs text-amber-800 shadow-xs">
                ${escapeHtml((r.citizen_name || 'R')[0])}
              </div>
              <div>
                <span class="font-bold text-slate-900 text-xs">${escapeHtml(r.citizen_name || 'Homeowner')}</span>
                <span class="text-[10px] text-slate-400 block">${dateStr}</span>
              </div>
            </div>
            <div class="flex items-center gap-0.5">
              ${stars}
            </div>
          </div>
          <p class="text-xs text-slate-700 leading-relaxed italic">"${escapeHtml(r.review_text || 'Job completed professionally and at the agreed fair rate.')}"</p>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <span class="flex items-center gap-1 text-emerald-600 font-semibold">
            <i data-lucide="shield-check" class="w-3 h-3"></i> Verified Resident Review
          </span>
          <span class="font-mono text-slate-400">Job #${r.service_id || 'DEMO'}</span>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function renderTechLeads(leads) {
  const container = document.getElementById('tech-leads-container');
  if (!container) return;

  if (leads.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-400 bg-white/60 rounded-3xl border border-slate-200">
        <p class="text-sm font-semibold">No open repair leads currently available in your sector.</p>
        <p class="text-xs text-slate-400 mt-1">Check back shortly as new household requests arrive.</p>
      </div>`;
    return;
  }

  container.innerHTML = leads
    .map((job) => {
      const imgUrl = job.media_url || getFallbackSvg(job.category || 'Repair');
      return `
      <div class="p-5 rounded-3xl bg-white/95 border border-slate-200/90 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
        <div>
          <!-- Lead Header -->
          <div class="flex items-start gap-3.5 mb-3.5">
            <img src="${escapeHtml(imgUrl)}" onerror="handleImgError(this, '${escapeHtml(job.category || 'Repair')}')" class="w-16 h-16 rounded-2xl object-cover border border-slate-200 shrink-0 cursor-pointer" onclick="openImageModal('${escapeHtml(imgUrl)}', '${escapeHtml(job.title || 'Lead')}', '${escapeHtml(job.category || 'Lead')}')" alt="Lead">
            <div class="flex-1">
              <div class="flex items-center justify-between gap-2">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">${escapeHtml(job.category || 'General Repair')}</span>
                <span class="text-[11px] font-semibold text-slate-400">#${job.id}</span>
              </div>
              <h4 class="font-extrabold text-slate-900 text-sm mt-1 leading-snug">${escapeHtml(job.title || 'Household Utility Issue')}</h4>
              <p class="text-xs text-slate-500 mt-0.5">📍 ${escapeHtml(job.location_city || 'Sector 62, Noida')}</p>
            </div>
          </div>

          <!-- Requester Details Section -->
          <div class="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100/90 mb-3.5 text-xs space-y-1.5 shadow-xs">
            <div class="flex items-center justify-between flex-wrap gap-1.5">
              <div class="flex items-center gap-1.5 font-bold text-slate-900">
                <i data-lucide="user" class="w-3.5 h-3.5 text-indigo-600"></i>
                <span>Requested by: ${escapeHtml(job.citizen_name || 'Ayush Chauhan')}</span>
                <span class="text-slate-400 font-normal">•</span>
                <span class="text-indigo-700 font-semibold">📍 ${escapeHtml(job.citizen_locality || job.citizen_address || job.location_city || 'Sector 62, Noida')}</span>
              </div>
              <a href="tel:${escapeHtml(job.citizen_phone || '+91 98765 43210')}" class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/90 hover:bg-emerald-200 px-2.5 py-1 rounded-lg border border-emerald-300 transition-colors shadow-xs">
                <i data-lucide="phone" class="w-3 h-3"></i>
                <span>${escapeHtml(job.citizen_phone || '+91 98765 43210')}</span>
              </a>
            </div>
            <div class="text-[11px] text-slate-600 flex items-center gap-1.5 pt-0.5">
              <i data-lucide="clock" class="w-3 h-3 text-indigo-500"></i>
              <span class="font-medium text-slate-700">Preferred Slot:</span>
              <span class="font-bold text-indigo-950">${escapeHtml(job.preferred_slot || 'Today, 4:00 PM - 6:00 PM')}</span>
            </div>
          </div>

          <!-- Gemma AI Diagnosis & Fair Price Benchmark -->
          <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 mb-4 text-xs space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">AI Failure Diagnosis:</span>
              <span class="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">Fair Price: ₹${job.fair_price_low || 300} - ₹${job.fair_price_high || 600}</span>
            </div>
            <p class="text-slate-700 text-[11px] leading-relaxed">${escapeHtml(job.ai_diagnosis || job.description || 'Diagnosis pending')}</p>
          </div>
        </div>

        <!-- Inline Bid Submission Form -->
        <div class="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div class="relative w-full sm:w-36">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
            <input id="tech-bid-amount-${job.id}" type="number" placeholder="Your Quote" value="${job.ai_price_estimate || ''}" class="w-full pl-6 pr-2.5 py-2 text-xs font-bold rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
          </div>
          <input id="tech-bid-notes-${job.id}" type="text" placeholder="Note (e.g. Can visit in 30 mins, parts extra)" class="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
          <button onclick="submitTechBid('${job.id}')" class="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-xs transition-all whitespace-nowrap flex items-center justify-center gap-1.5">
            <i data-lucide="send" class="w-3.5 h-3.5"></i>
            <span>Send Quote</span>
          </button>
        </div>
      </div>
    `;
    })
    .join('');

  if (window.lucide) lucide.createIcons();
}

async function submitTechBid(jobId) {
  const amountInput = document.getElementById(`tech-bid-amount-${jobId}`);
  const notesInput = document.getElementById(`tech-bid-notes-${jobId}`);
  const profileSelect = document.getElementById('tech-profile-select');

  if (!amountInput || !amountInput.value) {
    showToast('Please specify a valid quotation amount (₹).', 'error');
    return;
  }

  const amount = parseFloat(amountInput.value);
  const notes = notesInput ? notesInput.value : '';
  const selectedText = profileSelect ? profileSelect.options[profileSelect.selectedIndex].text : 'Technician';
  const worker_name = selectedText.split('(')[0].trim() || 'Verified Technician';
  const worker_phone = state.technicianPhone;

  try {
    const role = state.auth?.user?.role || 'technician';
    const res = await fetch(`/api/services/${jobId}/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': role,
      },
      body: JSON.stringify({
        worker_name,
        worker_phone,
        bid_amount: amount,
        counter_amount: null,
        notes,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast(`✓ Quotation of ₹${amount} submitted for lead #${jobId}!`, 'success');
    loadTechnicianWorkspace();
    switchTechTab('quotes');
  } catch (err) {
    console.error('Error submitting bid:', err);
    showToast('Failed to submit quote.', 'error');
  }
}

function renderTechQuotesAndDeals(activeBids, confirmedJobs) {
  const negSection = document.getElementById('tech-negotiations-section');
  const confSection = document.getElementById('tech-confirmed-container');
  const confCount = document.getElementById('tech-confirmed-count');

  if (confCount) {
    confCount.textContent = `${confirmedJobs.length} Confirmed Contracts`;
  }

  // Counter-offers & Active Quotes
  if (negSection) {
    const activeList = activeBids.filter((b) => {
      const s = (b.status || b.bid_status || '').toUpperCase();
      return s !== 'REJECTED';
    });

    if (activeList.length === 0) {
      negSection.innerHTML = `
        <div class="p-6 rounded-3xl bg-white/70 border border-slate-200 text-center text-slate-400 text-xs">
          No pending quotes under review. Check "Available Household Leads" to submit bids.
        </div>`;
    } else {
      let html = '';

      const counteredByCitizen = activeList.filter((b) => {
        const s = (b.status || b.bid_status || '').toUpperCase();
        const actor = (b.last_action_by || '').toUpperCase();
        return s === 'COUNTERED' && (actor === 'CITIZEN' || !actor);
      });

      const acceptedBids = activeList.filter((b) => {
        const s = (b.status || b.bid_status || '').toUpperCase();
        return s === 'ACCEPTED';
      });

      const pendingOrCounteredByTech = activeList.filter((b) => {
        const s = (b.status || b.bid_status || '').toUpperCase();
        const actor = (b.last_action_by || '').toUpperCase();
        return s === 'PENDING' || (s === 'COUNTERED' && actor === 'TECHNICIAN');
      });

      // 1. Prominent Customer Counter-Offer Alerts
      if (counteredByCitizen.length > 0) {
        html += counteredByCitizen
          .map((b) => {
            const bidId = b.id || b.bid_id;
            const counterAmt = b.current_amount || b.counter_amount || 0;
            const initialAmt = b.initial_bid || b.bid_amount || counterAmt;
            const recounterDefault = Math.round((initialAmt + counterAmt) / 2);
            return `
          <div class="p-5 rounded-3xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-2 border-amber-400 shadow-md flex flex-col gap-3">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <i data-lucide="handshake" class="w-5 h-5"></i>
                </div>
                <div>
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white uppercase tracking-wider mb-1">
                    <span>🔥 Customer Countered with ₹${counterAmt}</span>
                  </span>
                  <h4 class="font-extrabold text-slate-900 text-sm">Citizen offered ₹${counterAmt} (Your initial bid: ₹${initialAmt})</h4>
                  <p class="text-xs text-slate-600 mt-0.5">Job: ${escapeHtml(b.job_title || ('#' + b.job_id))} • Requester: <strong>${escapeHtml(b.citizen_name || 'Homeowner')}</strong> (${escapeHtml(b.citizen_locality || b.location_city || 'Sector 62')})</p>
                </div>
              </div>
              <div class="flex items-center gap-2 self-end md:self-auto flex-wrap">
                <button onclick="toggleTechReCounterBox('${bidId}')" class="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all flex items-center gap-1.5 border border-slate-200">
                  <i data-lucide="repeat" class="w-4 h-4"></i>
                  <span>🔄 Re-Counter</span>
                </button>
                <button onclick="acceptCounterAsTechnician('${b.job_id}', '${bidId}', ${counterAmt})" class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/25 transition-all flex items-center gap-1.5">
                  <i data-lucide="check-circle" class="w-4 h-4"></i>
                  <span>✅ Accept ₹${counterAmt} & Lock Payout</span>
                </button>
              </div>
            </div>

            <!-- Inline Re-Counter Form -->
            <div id="tech-recounter-box-${bidId}" class="hidden p-3 rounded-2xl bg-white border border-amber-200 shadow-xs">
              <div class="text-[11px] font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                <i data-lucide="arrow-right-left" class="w-3.5 h-3.5 text-amber-600"></i>
                <span>Propose a revised counter-offer to the resident:</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="relative flex-1 max-w-xs">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                  <input id="tech-recounter-val-${bidId}" type="number" placeholder="Enter amount" value="${recounterDefault}" class="w-full pl-7 pr-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none bg-slate-50">
                </div>
                <button onclick="handleTechReCounter('${bidId}')" class="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors">
                  Send Re-Counter
                </button>
              </div>
            </div>
          </div>
        `;
          })
          .join('');
      }

      // 2. Confirmed & Accepted Bids
      if (acceptedBids.length > 0) {
        html += acceptedBids
          .map((b) => {
            const finalAmt = b.current_amount || b.counter_amount || b.bid_amount || 0;
            const phone = b.citizen_phone || b.user_phone || '+91 98765 43210';
            return `
          <div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-xs flex items-center justify-between flex-wrap gap-3 mt-3">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <i data-lucide="party-popper" class="w-4 h-4"></i>
              </div>
              <div>
                <span class="font-extrabold text-emerald-900 text-xs">🎉 Deal Confirmed for ₹${finalAmt}! Contact citizen at ${escapeHtml(phone)}</span>
                <p class="text-[11px] text-emerald-700 mt-0.5">Job: ${escapeHtml(b.job_title || ('#' + b.job_id))} • Requester: <strong>${escapeHtml(b.citizen_name || 'Homeowner')}</strong></p>
              </div>
            </div>
            <a href="tel:${escapeHtml(phone)}" class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1">
              <i data-lucide="phone" class="w-3.5 h-3.5"></i>
              <span>Call Client</span>
            </a>
          </div>
        `;
          })
          .join('');
      }

      // 3. Pending Quotes awaiting response
      if (pendingOrCounteredByTech.length > 0) {
        html += `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            ${pendingOrCounteredByTech
              .map((b) => {
                const actor = (b.last_action_by || '').toUpperCase();
                const isTechCounter = actor === 'TECHNICIAN' && (b.status || '').toUpperCase() === 'COUNTERED';
                const amt = b.current_amount || b.bid_amount || 0;
                return `
              <div class="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-between">
                <div>
                  <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    ${isTechCounter ? 'Your Counter Submitted' : 'Under Homeowner Review'}
                  </div>
                  <div class="font-bold text-slate-800 text-xs mt-0.5">
                    ${escapeHtml(b.job_title || ('Job #' + b.job_id))} • ${isTechCounter ? `Countered: ₹${amt}` : `Submitted: ₹${amt}`}
                  </div>
                </div>
                <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${
                  isTechCounter
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                }">
                  ${isTechCounter ? '⏳ Awaiting Resident' : '⏳ Awaiting Review'}
                </span>
              </div>
            `;
              })
              .join('')}
          </div>
        `;
      }

      negSection.innerHTML = html;
    }
  }

  // Confirmed Contracts
  if (confSection) {
    if (confirmedJobs.length === 0) {
      confSection.innerHTML = `
        <div class="col-span-full py-8 text-center text-slate-400 text-xs">
          No confirmed contracts yet for this technician account. Accept homeowner quotes to unlock work orders.
        </div>`;
      return;
    }

    confSection.innerHTML = confirmedJobs
      .map((job) => {
        const price = job.final_price || job.agreed_price || 'Agreed Rate';
        const phone = job.citizen_phone || job.user_phone || '+91 98100 23456';
        return `
        <div class="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200 shadow-xs flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between pb-3 border-b border-emerald-100 mb-3">
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                <i data-lucide="shield-check" class="w-3 h-3"></i>
                <span>Confirmed & Locked in Escrow</span>
              </span>
              <span class="text-sm font-black text-emerald-800">${price.startsWith('₹') ? price : '₹' + price}</span>
            </div>

            <h4 class="font-bold text-slate-900 text-sm leading-snug">${escapeHtml(job.title || 'Household Utility Repair')}</h4>
            <div class="text-xs text-slate-600 mt-2 space-y-1">
              <p>👤 <strong>Citizen:</strong> ${escapeHtml(job.citizen_name || 'Resident')}</p>
              <p>📍 <strong>Address:</strong> ${escapeHtml(job.citizen_locality || job.location_city || 'Sector 62, Noida')}</p>
              <p>🔧 <strong>Defect:</strong> ${escapeHtml(job.description || 'Ball valve replacement and water line repair')}</p>
              <p>🤖 <strong>AI Diagnosis:</strong> ${escapeHtml(job.ai_diagnosis || 'Fault diagnosed by Gemma 4')}</p>
            </div>
          </div>

          <div class="pt-4 border-t border-emerald-100 mt-4 flex items-center justify-between">
            <span class="text-[11px] text-emerald-700 font-semibold">Client Phone: <strong>${escapeHtml(phone)}</strong></span>
            <a href="tel:${escapeHtml(phone)}" class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5">
              <i data-lucide="phone" class="w-3.5 h-3.5"></i>
              <span>Call Client</span>
            </a>
          </div>
        </div>
      `;
      })
      .join('');
  }

  if (window.lucide) lucide.createIcons();
}

function toggleTechReCounterBox(bidId) {
  const el = document.getElementById(`tech-recounter-box-${bidId}`);
  if (el) el.classList.toggle('hidden');
}

async function handleTechReCounter(bidId) {
  const inp = document.getElementById(`tech-recounter-val-${bidId}`);
  if (!inp) return;
  const amt = parseInt(inp.value);
  if (isNaN(amt) || amt <= 0) {
    alert('Please enter a valid counter amount in INR');
    return;
  }

  try {
    const res = await fetch(`/api/services/bids/${bidId}/counter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counter_amount: amt, actor_role: 'TECHNICIAN' }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast(`Re-counter of ₹${amt} sent to homeowner.`);
    loadTechnicianWorkspace();
  } catch (err) {
    console.error('Error submitting technician re-counter:', err);
    showToast('Failed to submit re-counter.', 'error');
  }
}

async function acceptCounterAsTechnician(jobId, bidId, counterAmount) {
  try {
    const res = await fetch(`/api/services/bids/${bidId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, final_price: `₹${counterAmount}` }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast(`🎉 Deal confirmed at ₹${counterAmount}! Payout locked in escrow.`, 'success');
    loadTechnicianWorkspace();
  } catch (err) {
    console.error('Error accepting counter offer:', err);
    showToast('Failed to accept counter-offer.', 'error');
  }
}

// =========================================================================
// CIVICTALK: MULTILINGUAL VOICE-TO-TRIAGE (Gemma 4 Multimodal Audio)
// =========================================================================

let civicTalkMediaRecorder = null;
let civicTalkAudioChunks = [];
let civicTalkTimerInterval = null;
let civicTalkStartTime = 0;
let isCivicTalkRecording = false;
let civicTalkSpeechRecognizer = null;
let civicTalkLiveTranscript = '';

function startCivicTalkFromBanner() {
  openModal('modal-civic');
  setTimeout(() => {
    startCivicTalkRecording();
  }, 400);
}

function toggleCivicTalkRecording() {
  if (isCivicTalkRecording) {
    stopCivicTalkRecording();
  } else {
    startCivicTalkRecording();
  }
}

async function startCivicTalkRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Voice recording is not supported in this browser.', 'error');
    return;
  }

  const idleBox = document.getElementById('civictalk-idle-box');
  const recBox = document.getElementById('civictalk-recording-box');
  const procBox = document.getElementById('civictalk-processing-box');
  const resBox = document.getElementById('civictalk-result-box');
  const timerEl = document.getElementById('civictalk-timer');
  const liveSpeechEl = document.getElementById('civictalk-live-speech');

  civicTalkLiveTranscript = '';
  if (liveSpeechEl) liveSpeechEl.textContent = 'Listening to your voice... Speak now';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    civicTalkAudioChunks = [];

    // Determine supported mime type
    let mimeType = 'audio/webm';
    if (window.MediaRecorder && !MediaRecorder.isTypeSupported('audio/webm')) {
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      }
    }

    civicTalkMediaRecorder = new MediaRecorder(stream, { mimeType });

    civicTalkMediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        civicTalkAudioChunks.push(e.data);
      }
    };

    civicTalkMediaRecorder.onstop = async () => {
      // Stop all tracks to release mic
      stream.getTracks().forEach((track) => track.stop());

      if (civicTalkAudioChunks.length === 0 && !civicTalkLiveTranscript) {
        showToast('No audio recorded. Please try again.', 'info');
        resetCivicTalk();
        return;
      }

      const audioBlob = new Blob(civicTalkAudioChunks, { type: mimeType });
      await sendAudioToCivicTalk(audioBlob);
    };

    // Live speech recognition in browser
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        civicTalkSpeechRecognizer = new SpeechRecognition();
        civicTalkSpeechRecognizer.continuous = true;
        civicTalkSpeechRecognizer.interimResults = true;
        civicTalkSpeechRecognizer.lang = 'hi-IN';

        civicTalkSpeechRecognizer.onresult = (event) => {
          let finalStr = '';
          let interimStr = '';
          for (let i = 0; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalStr += event.results[i][0].transcript + ' ';
            } else {
              interimStr += event.results[i][0].transcript;
            }
          }
          const combined = (finalStr + interimStr).trim();
          if (combined) {
            civicTalkLiveTranscript = combined;
            if (liveSpeechEl) {
              liveSpeechEl.textContent = `"${combined}"`;
            }
          }
        };

        civicTalkSpeechRecognizer.onerror = (e) => {
          console.warn('Speech recognition warning:', e.error);
        };

        civicTalkSpeechRecognizer.start();
      } catch (err) {
        console.warn('Browser SpeechRecognition init:', err);
      }
    }

    civicTalkMediaRecorder.start(250); // Slice data every 250ms
    isCivicTalkRecording = true;

    // UI state
    if (idleBox) idleBox.classList.add('hidden');
    if (recBox) recBox.classList.remove('hidden');
    if (procBox) procBox.classList.add('hidden');
    if (resBox) resBox.classList.add('hidden');

    // Start timer
    civicTalkStartTime = Date.now();
    if (timerEl) timerEl.textContent = '00:00';
    clearInterval(civicTalkTimerInterval);
    civicTalkTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - civicTalkStartTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 500);

    showToast('🎙️ CivicTalk listening... Speak in Hindi, Hinglish, or English.', 'info');
  } catch (err) {
    console.error('Error starting audio recording:', err);
    showToast('Microphone access denied or unavailable.', 'error');
    resetCivicTalk();
  }
}

function stopCivicTalkRecording() {
  clearInterval(civicTalkTimerInterval);

  if (civicTalkSpeechRecognizer) {
    try {
      civicTalkSpeechRecognizer.stop();
    } catch (e) {}
  }

  const recBox = document.getElementById('civictalk-recording-box');
  const procBox = document.getElementById('civictalk-processing-box');

  if (recBox) recBox.classList.add('hidden');
  if (procBox) procBox.classList.remove('hidden');

  if (civicTalkMediaRecorder && civicTalkMediaRecorder.state !== 'inactive') {
    civicTalkMediaRecorder.stop();
  }
  isCivicTalkRecording = false;
}

async function sendAudioToCivicTalk(audioBlob) {
  const procBox = document.getElementById('civictalk-processing-box');
  const resBox = document.getElementById('civictalk-result-box');
  const idleBox = document.getElementById('civictalk-idle-box');

  const origEl = document.getElementById('civictalk-orig-transcript');
  const landmarkEl = document.getElementById('civictalk-landmark');
  const deptChip = document.getElementById('civictalk-dept-chip');
  const sevChip = document.getElementById('civictalk-sev-chip');
  const descInput = document.getElementById('civic-desc-input');
  const locInput = document.getElementById('civic-location-input');

  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    if (civicTalkLiveTranscript && civicTalkLiveTranscript.trim()) {
      formData.append('transcript', civicTalkLiveTranscript.trim());
    }

    const res = await fetch('/api/civic/talk', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    // Populate auto-filled form values
    if (descInput && data.english_summary) {
      descInput.value = data.english_summary;
    }

    if (locInput && data.extracted_landmark && data.extracted_landmark !== 'Not specified') {
      locInput.value = data.extracted_landmark;
    }

    // Populate preview card
    if (origEl) origEl.textContent = `"${data.original_transcript || civicTalkLiveTranscript || 'Voice analyzed.'}"`;
    if (landmarkEl) landmarkEl.textContent = data.extracted_landmark || 'Locality detected';
    if (deptChip) deptChip.textContent = `🏛️ ${data.department || 'Roads & Transport'}`;
    if (sevChip) sevChip.textContent = `⚠️ ${data.severity || 'Moderate'} Severity`;

    if (procBox) procBox.classList.add('hidden');
    if (resBox) resBox.classList.remove('hidden');

    showToast(`✓ Voice report triaged by Gemma into ${data.department}!`, 'success');
  } catch (err) {
    console.error('Error in sendAudioToCivicTalk:', err);
    showToast('Voice processing error. You can still type details manually.', 'error');
    if (procBox) procBox.classList.add('hidden');
    if (idleBox) idleBox.classList.remove('hidden');
  }

  if (window.lucide) lucide.createIcons();
}

function resetCivicTalk() {
  clearInterval(civicTalkTimerInterval);
  isCivicTalkRecording = false;

  if (civicTalkSpeechRecognizer) {
    try {
      civicTalkSpeechRecognizer.stop();
    } catch (e) {}
  }
  civicTalkLiveTranscript = '';

  const idleBox = document.getElementById('civictalk-idle-box');
  const recBox = document.getElementById('civictalk-recording-box');
  const procBox = document.getElementById('civictalk-processing-box');
  const resBox = document.getElementById('civictalk-result-box');
  const liveSpeechEl = document.getElementById('civictalk-live-speech');

  if (liveSpeechEl) liveSpeechEl.textContent = 'Listening to your voice... Speak now';
  if (idleBox) idleBox.classList.remove('hidden');
  if (recBox) recBox.classList.add('hidden');
  if (procBox) procBox.classList.add('hidden');
  if (resBox) resBox.classList.add('hidden');
}

// --- Multi-View Architecture & Strict Role-Based Access Control (RBAC) ---

function showLandingView() {
  state.currentView = 'landing';
  const landing = document.getElementById('landingView');
  const auth = document.getElementById('authView');
  const workspace = document.getElementById('appWorkspaceView');
  
  if (workspace) {
    workspace.classList.add('view-hidden');
    workspace.classList.remove('view-active');
  }
  if (auth) {
    auth.classList.add('view-hidden');
    auth.classList.remove('view-active');
  }
  if (landing) {
    landing.classList.remove('view-hidden');
    landing.classList.add('view-active');
  }

  updateLandingAuthUI();
  updateLandingMetrics();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (window.lucide) lucide.createIcons();
}

function showAuthView() {
  state.currentView = 'auth';
  const landing = document.getElementById('landingView');
  const auth = document.getElementById('authView');
  const workspace = document.getElementById('appWorkspaceView');
  
  if (workspace) {
    workspace.classList.add('view-hidden');
    workspace.classList.remove('view-active');
  }
  if (landing) {
    landing.classList.add('view-hidden');
    landing.classList.remove('view-active');
  }
  if (auth) {
    auth.classList.remove('view-hidden');
    auth.classList.add('view-active');
  }

  setAuthRole(state.authRole || 'citizen');
  setAuthMode(state.authMode || 'signin');

  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (window.lucide) lucide.createIcons();
}

function showDashboardView(role = 'citizen') {
  state.currentView = 'workspace';
  const landing = document.getElementById('landingView');
  const auth = document.getElementById('authView');
  const workspace = document.getElementById('appWorkspaceView');
  
  if (landing) {
    landing.classList.add('view-hidden');
    landing.classList.remove('view-active');
  }
  if (auth) {
    auth.classList.add('view-hidden');
    auth.classList.remove('view-active');
  }
  if (workspace) {
    workspace.classList.remove('view-hidden');
    workspace.classList.add('view-active');
  }

  const persona = role === 'municipal' ? 'admin' : role;
  switchPersona(persona);
  updateDashboardUserHeader();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (window.lucide) lucide.createIcons();
}

function showWorkspaceView(role = 'citizen') {
  showDashboardView(role);
}

function updateDashboardUserHeader() {
  const session = getStoredSession();
  const avatarEl = document.getElementById('navUserAvatar');
  const nameEl = document.getElementById('navUserName');
  const roleEl = document.getElementById('navUserRole');
  
  if (!session || !session.user) return;
  
  const user = session.user;
  const name = user.name || 'User';
  const role = user.role === 'admin' ? 'municipal' : (user.role || 'citizen');
  
  if (avatarEl) {
    avatarEl.textContent = name.charAt(0).toUpperCase();
  }
  if (nameEl) {
    nameEl.textContent = name;
  }
  if (roleEl) {
    if (role === 'municipal') {
      roleEl.textContent = 'Municipal Officer';
      roleEl.className = 'text-[10px] font-semibold text-rose-600 capitalize leading-none';
    } else if (role === 'technician') {
      roleEl.textContent = 'Verified Technician';
      roleEl.className = 'text-[10px] font-semibold text-emerald-600 capitalize leading-none';
    } else {
      roleEl.textContent = 'Citizen (Public)';
      roleEl.className = 'text-[10px] font-semibold text-indigo-600 capitalize leading-none';
    }
  }
}

function updateLandingAuthUI() {
  const container = document.getElementById('landingAuthContainer');
  if (!container) return;
  const session = getStoredSession();
  
  if (session && session.user && session.user.role) {
    const role = session.user.role === 'admin' ? 'municipal' : session.user.role;
    const name = session.user.name || 'User';
    container.innerHTML = `
      <a href="#/${role}" class="btn-tactile px-3.5 py-2 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold shadow-xs transition-all flex items-center gap-1.5">
        <span class="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">${name.charAt(0).toUpperCase()}</span>
        <span class="hidden sm:inline">${name}</span>
      </a>
      <button onclick="handleLaunchPortal()" class="btn-tactile px-4 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold shadow-md shadow-indigo-500/25 transition-all flex items-center gap-1.5 cursor-pointer">
        <span>🚀 Dashboard</span>
        <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
      </button>
      <button onclick="signOut()" title="Sign Out" class="btn-tactile p-2 rounded-2xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-xs font-bold transition-all cursor-pointer">
        <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
      </button>
    `;
  } else {
    container.innerHTML = `
      <a href="#/auth" class="btn-tactile px-3.5 py-2 rounded-2xl bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition-all flex items-center gap-1.5">
        <span>🔐 Sign In</span>
      </a>
      <button onclick="handleLaunchPortal()" class="btn-tactile px-4 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold shadow-md shadow-indigo-500/25 transition-all flex items-center gap-1.5 cursor-pointer">
        <span>🚀 Launch Portal</span>
        <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
      </button>
    `;
  }
  if (window.lucide) lucide.createIcons();
}

function setAuthMode(mode) {
  state.authMode = mode;
  const btnIn = document.getElementById('auth-mode-signin');
  const btnUp = document.getElementById('auth-mode-signup');
  const heading = document.getElementById('authCardHeading');
  const subHeading = document.getElementById('authCardSubheading');
  const submitText = document.getElementById('authSubmitText');

  const cNameGroup = document.getElementById('authCitizenNameGroup');
  const cWardGroup = document.getElementById('authCitizenWardGroup');
  const mNameGroup = document.getElementById('authMunNameGroup');
  const tNameGroup = document.getElementById('authTechNameGroup');
  const tRateGroup = document.getElementById('authTechRateGroup');

  if (mode === 'signup') {
    if (btnUp) btnUp.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white text-indigo-900 shadow-sm border border-slate-200/80 transition-all cursor-pointer';
    if (btnIn) btnIn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 transition-all cursor-pointer';
    if (heading) heading.textContent = 'Create CivicPulse Account';
    if (subHeading) subHeading.textContent = 'Register your details to establish a verified identity';
    if (submitText) submitText.textContent = 'Create Account & Access Portal';

    if (cNameGroup) cNameGroup.classList.remove('hidden');
    if (cWardGroup) cWardGroup.classList.remove('hidden');
    if (mNameGroup) mNameGroup.classList.remove('hidden');
    if (tNameGroup) tNameGroup.classList.remove('hidden');
    if (tRateGroup) tRateGroup.classList.remove('hidden');
  } else {
    if (btnIn) btnIn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white text-indigo-900 shadow-sm border border-slate-200/80 transition-all cursor-pointer';
    if (btnUp) btnUp.className = 'px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 transition-all cursor-pointer';
    if (heading) heading.textContent = 'Sign In to CivicPulse';
    if (subHeading) subHeading.textContent = 'Select your role to access your authorized workspace';
    
    const roleLabels = { citizen: 'Citizen Portal', municipal: 'Municipal Command Center', technician: 'Technician Workspace' };
    if (submitText) submitText.textContent = `Continue to ${roleLabels[state.authRole || 'citizen']}`;

    if (cNameGroup) cNameGroup.classList.add('hidden');
    if (cWardGroup) cWardGroup.classList.add('hidden');
    if (mNameGroup) mNameGroup.classList.add('hidden');
    if (tNameGroup) tNameGroup.classList.add('hidden');
    if (tRateGroup) tRateGroup.classList.add('hidden');
  }
}

function setAuthRole(role) {
  state.authRole = role;
  const btnCitizen = document.getElementById('auth-role-btn-citizen');
  const btnMunicipal = document.getElementById('auth-role-btn-municipal');
  const btnTech = document.getElementById('auth-role-btn-technician');

  const fieldsCitizen = document.getElementById('authFieldsCitizen');
  const fieldsMunicipal = document.getElementById('authFieldsMunicipal');
  const fieldsTech = document.getElementById('authFieldsTechnician');
  const submitText = document.getElementById('authSubmitText');

  const inactiveClass = 'p-3 rounded-2xl border-2 border-slate-200 hover:border-slate-300 bg-white text-slate-700 text-left transition-all flex flex-col gap-1 cursor-pointer';
  if (btnCitizen) btnCitizen.className = inactiveClass;
  if (btnMunicipal) btnMunicipal.className = inactiveClass;
  if (btnTech) btnTech.className = inactiveClass;

  if (fieldsCitizen) fieldsCitizen.classList.add('hidden');
  if (fieldsMunicipal) fieldsMunicipal.classList.add('hidden');
  if (fieldsTech) fieldsTech.classList.add('hidden');

  if (role === 'citizen') {
    if (btnCitizen) btnCitizen.className = 'p-3 rounded-2xl border-2 border-indigo-600 bg-indigo-50/70 text-indigo-900 text-left transition-all flex flex-col gap-1 cursor-pointer';
    if (fieldsCitizen) fieldsCitizen.classList.remove('hidden');
    if (submitText) submitText.textContent = state.authMode === 'signup' ? 'Create Citizen Account' : 'Continue to Citizen Portal';
  } else if (role === 'municipal') {
    if (btnMunicipal) btnMunicipal.className = 'p-3 rounded-2xl border-2 border-rose-600 bg-rose-50/70 text-rose-900 text-left transition-all flex flex-col gap-1 cursor-pointer';
    if (fieldsMunicipal) fieldsMunicipal.classList.remove('hidden');
    if (submitText) submitText.textContent = state.authMode === 'signup' ? 'Register Officer ID' : 'Continue to Municipal Command';
  } else if (role === 'technician') {
    if (btnTech) btnTech.className = 'p-3 rounded-2xl border-2 border-emerald-600 bg-emerald-50/70 text-emerald-900 text-left transition-all flex flex-col gap-1 cursor-pointer';
    if (fieldsTech) fieldsTech.classList.remove('hidden');
    if (submitText) submitText.textContent = state.authMode === 'signup' ? 'Register Verified Technician' : 'Continue to Technician Desk';
  }
}

function handleAuthSubmit(e) {
  if (e) e.preventDefault();
  const role = state.authRole || 'citizen';
  let session = null;

  if (role === 'citizen') {
    const name = document.getElementById('authCitizenName')?.value.trim() || 'Ayush Chauhan';
    const contact = document.getElementById('authCitizenContact')?.value.trim() || '9876543210';
    const ward = document.getElementById('authCitizenWard')?.value.trim() || 'Ward 150 - Bellandur';
    session = {
      token: 'civic_token_' + Math.random().toString(36).substring(2, 10),
      user: {
        id: 1,
        name: name,
        role: 'citizen',
        contact: contact,
        locality: ward,
      }
    };
    setStoredSession(session);
    showToast(`✓ Welcome, ${name}! Signed in as Citizen.`, 'success');
    window.location.hash = '#/citizen';
  } else if (role === 'municipal') {
    const name = document.getElementById('authMunName')?.value.trim() || 'Officer Rajesh Rao';
    const officerId = document.getElementById('authMunOfficialId')?.value.trim() || 'BBMP-ENG-4091';
    const dept = document.getElementById('authMunDept')?.value || 'Roads & Infrastructure';
    session = {
      token: 'mun_token_' + Math.random().toString(36).substring(2, 10),
      user: {
        id: 2,
        name: name,
        role: 'municipal',
        officerId: officerId,
        department: dept,
      }
    };
    setStoredSession(session);
    showToast(`✓ Welcome, ${name}! Authenticated as Municipal Commander.`, 'success');
    window.location.hash = '#/municipal';
  } else if (role === 'technician') {
    const name = document.getElementById('authTechName')?.value.trim() || 'Ramesh Kumar';
    const phone = document.getElementById('authTechPhone')?.value.trim() || '+91 98450 12345';
    const trade = document.getElementById('authTechTrade')?.value || 'Electrical & Wiring';
    const rate = parseInt(document.getElementById('authTechRate')?.value) || 450;
    session = {
      token: 'tech_token_' + Math.random().toString(36).substring(2, 10),
      user: {
        id: 3,
        name: name,
        role: 'technician',
        phone: phone,
        trade: trade,
        rating: 4.9,
        works_completed: 47,
        standard_rate: rate,
      }
    };
    state.technicianPhone = phone;
    setStoredSession(session);
    showToast(`✓ Welcome, ${name}! Authenticated as Verified Technician.`, 'success');
    window.location.hash = '#/technician';
  }
}

function fastPassLogin(role) {
  if (role === 'citizen') {
    const session = {
      token: 'demo_token_citizen_2026',
      user: {
        id: 1,
        name: 'Ayush Chauhan',
        role: 'citizen',
        locality: 'Ward 150 - Bellandur, Bengaluru',
        contact: '9876543210',
      }
    };
    setStoredSession(session);
    showToast('⚡ Fast-Pass: Signed in as Citizen (Ayush Chauhan)', 'success');
    window.location.hash = '#/citizen';
  } else if (role === 'municipal') {
    const session = {
      token: 'demo_token_municipal_2026',
      user: {
        id: 2,
        name: 'Officer Rajesh Rao',
        role: 'municipal',
        officerId: 'BBMP-ENG-4091',
        department: 'Roads & Stormwater Drains',
      }
    };
    setStoredSession(session);
    showToast('⚡ Fast-Pass: Signed in as Municipal Commander (Officer Rajesh Rao)', 'success');
    window.location.hash = '#/municipal';
  } else if (role === 'technician') {
    const session = {
      token: 'demo_token_tech_2026',
      user: {
        id: 3,
        name: 'Ramesh Kumar (Master Electrician)',
        role: 'technician',
        phone: '+91 98450 12345',
        trade: 'Electrical & Wiring',
        rating: 4.9,
        works_completed: 47,
      }
    };
    state.technicianPhone = '+91 98450 12345';
    setStoredSession(session);
    showToast('⚡ Fast-Pass: Signed in as Technician (Ramesh Kumar - 4.9★)', 'success');
    window.location.hash = '#/technician';
  }
}

function signOut() {
  clearStoredSession();
  showToast('Signed out of CivicPulse. Session cleared.', 'info');
  window.location.hash = '#/';
}

function handleHashRouting() {
  const hash = window.location.hash || '#/';
  const cleanRoute = hash.split('?')[0].toLowerCase();
  const session = getStoredSession();

  if (cleanRoute === '#/' || cleanRoute === '#' || cleanRoute === '') {
    showLandingView();
    return;
  }

  if (cleanRoute === '#/auth') {
    if (session && session.user && session.user.role) {
      const activeRole = session.user.role === 'admin' ? 'municipal' : session.user.role;
      window.location.hash = '#/' + activeRole;
      return;
    }
    showAuthView();
    return;
  }

  // Protected Dashboard Views with RBAC Route Guards
  if (cleanRoute === '#/citizen' || cleanRoute === '#/municipal' || cleanRoute === '#/technician') {
    if (!session || !session.user || !session.user.role) {
      showToast('Authentication required. Please sign in to access this portal.', 'warning');
      window.location.hash = '#/auth';
      return;
    }

    const currentRole = session.user.role === 'admin' ? 'municipal' : session.user.role;

    if (cleanRoute === '#/citizen') {
      if (currentRole !== 'citizen') {
        showToast(`Access Restricted: You are signed in as a ${currentRole}. Redirecting to your authorized dashboard.`, 'warning');
        window.location.hash = '#/' + currentRole;
        return;
      }
      showDashboardView('citizen');
      return;
    }

    if (cleanRoute === '#/municipal') {
      if (currentRole !== 'municipal') {
        showToast('Access Restricted: Authorized Personnel Only.', 'error');
        window.location.hash = '#/' + currentRole;
        return;
      }
      showDashboardView('municipal');
      return;
    }

    if (cleanRoute === '#/technician') {
      if (currentRole !== 'technician') {
        showToast('Access Restricted: Authorized Personnel Only.', 'error');
        window.location.hash = '#/' + currentRole;
        return;
      }
      showDashboardView('technician');
      return;
    }
  }

  // Legacy fallback
  if (cleanRoute === '#workspace' || cleanRoute === '#app') {
    if (session && session.user && session.user.role) {
      const activeRole = session.user.role === 'admin' ? 'municipal' : session.user.role;
      window.location.hash = '#/' + activeRole;
    } else {
      window.location.hash = '#/auth';
    }
    return;
  }

  // Default fallback
  showLandingView();
}

function handleLaunchPortal() {
  const session = getStoredSession();
  if (session && session.user && session.user.role) {
    const role = session.user.role === 'admin' ? 'municipal' : session.user.role;
    window.location.hash = '#/' + role;
  } else {
    window.location.hash = '#/auth';
  }
}

function navigateToRole(targetRole) {
  const session = getStoredSession();
  if (!session || !session.user) {
    setAuthRole(targetRole);
    window.location.hash = '#/auth';
    return;
  }
  const currentRole = session.user.role === 'admin' ? 'municipal' : session.user.role;
  if (currentRole === targetRole) {
    window.location.hash = '#/' + targetRole;
  } else {
    showToast(`Access Restricted: You are signed in as a ${currentRole}. Authorized Personnel Only.`, 'warning');
    window.location.hash = '#/' + currentRole;
  }
}

function navigateToReportHazard() {
  const session = getStoredSession();
  if (!session || !session.user) {
    setAuthRole('citizen');
    window.location.hash = '#/auth';
    showToast('Please sign in as a citizen to submit a hazard report.', 'info');
    return;
  }
  if (session.user.role !== 'citizen') {
    showToast('Access Restricted: Only citizens can submit public hazard reports.', 'warning');
    return;
  }
  window.location.hash = '#/citizen';
  setTimeout(() => openModal('modal-civic'), 300);
}

function navigateToAuth() {
  window.location.hash = '#/auth';
}

// --- Dynamic Landing Metrics Updater ---
function updateLandingMetrics() {
  const totalCountEl = document.getElementById('landing-stat-total');
  const resolvedCountEl = document.getElementById('landing-stat-resolved');
  if (totalCountEl && state.civicPosts) {
    totalCountEl.textContent = state.civicPosts.length;
  }
  if (resolvedCountEl && state.civicPosts) {
    const resolved = state.civicPosts.filter(p => p.status === 'Resolved').length;
    resolvedCountEl.textContent = resolved;
  }
}

// --- City / Neighborhood Selector ---
function openCityModal() {
  const m = document.getElementById('modal-city');
  if (m) m.classList.remove('hidden');
}

function closeCityModal() {
  const m = document.getElementById('modal-city');
  if (m) m.classList.add('hidden');
}

function closeCityModalOnBackdrop(e) {
  if (e.target.id === 'modal-city') closeCityModal();
}

function selectCity(city) {
  state.location = city;
  const pill = document.getElementById('location-pill-text');
  const landingPill = document.getElementById('landingLocationPill');
  if (pill) pill.textContent = city;
  if (landingPill) landingPill.textContent = city;
  
  const clean = city.replace('📍 ', '');
  const cInp = document.getElementById('civic-location-input');
  const jInp = document.getElementById('job-location-input');
  if (cInp) cInp.value = clean;
  if (jInp) jInp.value = clean;

  closeCityModal();
  showToast(`📍 Location updated to ${clean}`, 'info');
}

function applyCustomCity() {
  const inp = document.getElementById('custom-city-input');
  if (inp && inp.value.trim()) {
    const custom = inp.value.trim();
    selectCity(`📍 ${custom}`);
    inp.value = '';
  }
}

// --- Landing Page Interactive RTI Showcase ---
const sampleLetters = {
  municipal: `FORMAL STATUTORY NOTICE OF PUBLIC NUISANCE & IMMINENT HAZARD
Under Statutory Provisions of the State Municipal Corporation Act & CrPC / Bharatiya Nagarik Suraksha Sanhita

Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
Incident Reference: CIVIC-ND-2026-88192
GPS Coordinates: 28.6289° N, 77.3670° E (Geo-tagged via CivicPulse Audit)
Severity Assessment: CRITICAL (Statutory SLA: 24 Hours)

TO:
The Municipal Commissioner / Executive Officer,
Municipal Corporation / Authority Office.

SUBJECT: URGENT STATUTORY NOTICE: Critical Safety Hazard Regarding Open High-Voltage Cable Sparking & Road Subsidence

Sir / Madam,

1. STATUTORY NOTICE OF HAZARD:
This formal notice is served upon your office pursuant to the mandatory statutory obligations mandated under the Municipal Corporation Act to maintain public highways, electrical conduits, and civil infrastructure free from physical hazards endangering human life.

2. FORENSIC EVIDENCE & INCIDENT LOCATION:
On ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}, physical inspection confirmed exposed energized conduit wiring sparking adjacent to a 4-foot deep waterlogged tarmac depression directly obstructing vehicular transit at GPS Coordinates: 28.6289° N, 77.3670° E.

3. MANDATORY TIME-BOUND REMEDIATION DEMAND:
The subject hazard poses an immediate risk of electrocution and structural road collapse. Under the citizen service charter, this defect has been categorized as CRITICAL requiring an initial safety cordoning within 4 hours and definitive engineering remediation within 24 hours of notice delivery.

4. ESCALATION WARNING:
Failure to initiate corrective measures within the statutory SLA will result in direct escalation to the Public Grievance Portal (CPGRAMS) and the initiation of legal proceedings under public nuisance provisions.

Yours faithfully,
Concerned Residents & Neighborhood Welfare Association
(Digitally logged and archived via CivicPulse Citizen Governance Portal)`,

  rti: `APPLICATION FOR INFORMATION UNDER SECTION 6(1) OF THE RIGHT TO INFORMATION ACT, 2005

Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
Public Authority: Office of the Municipal Commissioner / Executive Engineer
Location Jurisdiction: Sector 62, Noida (GPS: 28.6289° N, 77.3670° E)

TO:
The Public Information Officer (PIO),
Municipal Corporation / Development Authority.

1. FULL NAME OF APPLICANT: Concerned Citizen / CivicPulse Community Auditor
2. PARTICULARS OF INFORMATION REQUIRED:
   Concerning the public infrastructure defect identified at GPS Coordinates: 28.6289° N, 77.3670° E (Reference Ticket: CIVIC-ND-2026-88192):

   (a) Certified copies of the road repair and electrical maintenance contracts awarded for this ward/stretch for the financial years 2024–2026.
   (b) The name, designation, and official contact details of the Junior Engineer (JE) and Executive Engineer (EE) responsible for periodic safety inspections of this sector.
   (c) The exact budgeted expenditure and funds disbursed to contractors for maintenance of this designated roadway.
   (d) Certified copy of the defect liability period (DLP) clause governing the contractor responsible for this infrastructure.
   (e) Daily progress report and action taken log on grievances filed concerning this hazard.

3. STATUTORY TIMELINE:
As per Section 7(1) of the RTI Act, 2005, you are requested to provide this information within 30 days. If the hazard concerns life and liberty, the statutory period is 48 hours.

Application Fee: Paid under statutory provisions.

Applicant Signature: CivicPulse Certified Resident Auditor`
};

let currentLandingLetterType = 'municipal';

function initLandingLetterShowcase() {
  const paper = document.getElementById('landing-letter-paper');
  if (paper) {
    paper.textContent = sampleLetters[currentLandingLetterType];
  }
}

function switchLandingLetterType(type) {
  currentLandingLetterType = type;
  const btnMun = document.getElementById('landing-letter-tab-municipal');
  const btnRti = document.getElementById('landing-letter-tab-rti');
  const paper = document.getElementById('landing-letter-paper');

  if (type === 'municipal') {
    if (btnMun) btnMun.className = 'btn-tactile px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white text-indigo-900 shadow-sm border border-slate-200/90 transition-all';
    if (btnRti) btnRti.className = 'btn-tactile px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 transition-all';
  } else {
    if (btnRti) btnRti.className = 'btn-tactile px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white text-indigo-900 shadow-sm border border-slate-200/90 transition-all';
    if (btnMun) btnMun.className = 'btn-tactile px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 transition-all';
  }

  if (paper) {
    paper.textContent = sampleLetters[type];
  }
}

function copyLandingLetter() {
  const text = sampleLetters[currentLandingLetterType];
  navigator.clipboard.writeText(text).then(() => {
    const lbl = document.getElementById('btn-copy-landing-text');
    if (lbl) {
      lbl.textContent = 'Copied!';
      setTimeout(() => { lbl.textContent = 'Copy Notice'; }, 2000);
    }
    showToast('Formal notice copied to clipboard!');
  });
}

function printLandingLetter() {
  const paper = document.getElementById('landing-letter-paper');
  if (!paper) return;
  const printWin = window.open('', '', 'width=800,height=700');
  printWin.document.write(`
    <html>
      <head>
        <title>CivicPulse Statutory Legal Notice</title>
        <style>
          body { font-family: Georgia, serif; line-height: 1.6; padding: 40px; font-size: 13pt; color: #111; }
          pre { white-space: pre-wrap; font-family: inherit; font-size: inherit; }
        </style>
      </head>
      <body>
        <pre>${paper.textContent}</pre>
        <script>window.print(); window.close();</script>
      </body>
    </html>
  `);
  printWin.document.close();
}

// --- Technician Reputation & Review Modal Handlers ---
let currentReviewRating = 5;

function openReviewModal(serviceId, techId, techName) {
  const m = document.getElementById('modal-review-technician');
  const nameEl = document.getElementById('review-modal-tech-name');
  const sInp = document.getElementById('review-service-id');
  const tInp = document.getElementById('review-tech-id');

  if (nameEl) nameEl.textContent = techName || 'Verified Technician';
  if (sInp) sInp.value = serviceId || 'job-demo-001';
  if (tInp) tInp.value = techId || 1;

  setReviewRating(5);
  if (m) m.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeReviewModal() {
  const m = document.getElementById('modal-review-technician');
  if (m) m.classList.add('hidden');
}

function closeReviewModalOnBackdrop(e) {
  if (e.target.id === 'modal-review-technician') closeReviewModal();
}

function setReviewRating(stars) {
  currentReviewRating = stars;
  const ratingInput = document.getElementById('review-rating-val');
  const ratingLabel = document.getElementById('review-rating-label');
  if (ratingInput) ratingInput.value = stars;

  const labels = {
    1: '1 Star - Poor Service / Overcharged',
    2: '2 Stars - Below Average Work',
    3: '3 Stars - Acceptable Quality',
    4: '4 Stars - Good Work & Punctual',
    5: '5 Stars - Exceptional Work & Honest Pricing'
  };
  if (ratingLabel) ratingLabel.textContent = labels[stars] || `${stars} Stars`;

  document.querySelectorAll('.star-rating-btn').forEach(btn => {
    const starNum = parseInt(btn.getAttribute('data-star') || '0', 10);
    const icon = btn.querySelector('svg, i');
    if (starNum <= stars) {
      btn.className = 'star-rating-btn p-1 text-amber-400 transition-colors';
      if (icon) {
        icon.classList.add('fill-amber-400');
        icon.classList.remove('text-slate-300');
      }
    } else {
      btn.className = 'star-rating-btn p-1 text-slate-300 hover:text-amber-400 transition-colors';
      if (icon) {
        icon.classList.remove('fill-amber-400');
        icon.classList.add('text-slate-300');
      }
    }
  });
}

async function submitReviewForm(e) {
  e.preventDefault();
  const serviceId = document.getElementById('review-service-id')?.value || 'job-demo-001';
  const techId = parseInt(document.getElementById('review-tech-id')?.value || '1', 10);
  const citizenName = document.getElementById('review-citizen-name')?.value.trim();
  const reviewText = document.getElementById('review-text-input')?.value.trim();
  const rating = currentReviewRating;

  if (!citizenName) {
    showToast('Please enter your name.', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/technicians/${techId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: serviceId,
        technician_id: techId,
        citizen_name: citizenName,
        rating: rating,
        review_text: reviewText
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    closeReviewModal();
    showToast(`⭐ Review submitted! Technician rating updated to ${data.new_rating} ★`, 'success');

    // Refresh service jobs and technician workspace
    loadServicesFeed();
    loadTechnicianWorkspace();
  } catch (err) {
    console.error('Error submitting review:', err);
    showToast('Failed to submit review.', 'error');
  }
}

// Global window exposure for inline HTML event handlers
window.openLetterModal = openLetterModal;
window.closeLetterModal = closeLetterModal;
window.closeLetterModalOnBackdrop = closeLetterModalOnBackdrop;
window.switchLetterType = switchLetterType;
window.copyLetterText = copyLetterText;
window.printLetterDoc = printLetterDoc;

// Pillar 3 window exposures
window.switchPersona = switchPersona;
window.loadAdminDashboard = loadAdminDashboard;
window.setAdminDepartment = setAdminDepartment;
window.updatePostOfficerStatus = updatePostOfficerStatus;
window.handleTechnicianProfileChange = handleTechnicianProfileChange;
window.switchTechTab = switchTechTab;
window.loadTechnicianWorkspace = loadTechnicianWorkspace;
window.submitTechBid = submitTechBid;
window.acceptCounterAsTechnician = acceptCounterAsTechnician;

// Review Modal window exposures
window.openReviewModal = openReviewModal;
window.closeReviewModal = closeReviewModal;
window.closeReviewModalOnBackdrop = closeReviewModalOnBackdrop;
window.setReviewRating = setReviewRating;
window.submitReviewForm = submitReviewForm;

// CivicTalk window exposures
window.startCivicTalkFromBanner = startCivicTalkFromBanner;
window.toggleCivicTalkRecording = toggleCivicTalkRecording;
window.startCivicTalkRecording = startCivicTalkRecording;
window.stopCivicTalkRecording = stopCivicTalkRecording;
window.resetCivicTalk = resetCivicTalk;

// Dual-View Switcher window exposures
window.showLandingView = showLandingView;
window.showWorkspaceView = showWorkspaceView;
window.switchLandingLetterType = switchLandingLetterType;
window.copyLandingLetter = copyLandingLetter;
window.printLandingLetter = printLandingLetter;

// City Selector window exposures
window.openCityModal = openCityModal;
window.closeCityModal = closeCityModal;
window.closeCityModalOnBackdrop = closeCityModalOnBackdrop;
window.selectCity = selectCity;
window.applyCustomCity = applyCustomCity;




