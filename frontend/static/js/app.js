/**
 * CivicPulse - Modern, Vibrant & Classy Client Application
 * Linear/Stripe-level aesthetic with seamless API integration, geolocation,
 * live negotiation engine, drag & drop previews, and PulseBot AI.
 */

// Application State
const state = {
  activeTab: 'civic',
  location: '📍 Sector 62, Noida',
  coords: { lat: 28.6289, lng: 77.3670 },
  civicPosts: [],
  serviceJobs: [],
  chatHistory: [],
  activeFilter: 'ALL',
};

// Lifecycle initialization
document.addEventListener('DOMContentLoaded', () => {
  initGeolocation();
  initDragAndDrop();
  initModals();
  switchTab('civic');
  loadCivicFeed();
  loadServicesFeed();
});

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
  if (!navigator.geolocation) {
    if (locBadge) locBadge.textContent = state.location;
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
      syncLocationInputs();
    },
    () => {
      state.location = '📍 Sector 62, Noida';
      if (locBadge) locBadge.textContent = state.location;
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
    civicView.classList.remove('hidden');
    servicesView.classList.add('hidden');

    btnCivic.className =
      'flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-white text-indigo-900 shadow-sm border border-slate-200/90 transition-all';
    btnServices.className =
      'flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 transition-all';
  } else {
    civicView.classList.add('hidden');
    servicesView.classList.remove('hidden');

    btnServices.className =
      'flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-white text-indigo-900 shadow-sm border border-slate-200/90 transition-all';
    btnCivic.className =
      'flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 transition-all';
  }
  if (window.lucide) lucide.createIcons();
}

// --- 3. Civic Feed Management ---
async function loadCivicFeed() {
  const grid = document.getElementById('civic-posts-grid');
  try {
    const res = await fetch('/api/civic/posts');
    state.civicPosts = await res.json();
    renderCivicCards(state.civicPosts);
  } catch (err) {
    grid.innerHTML = `
      <div class="col-span-full p-8 text-center bg-white rounded-2xl border border-slate-200/80 shadow-xs">
        <p class="text-sm font-medium text-slate-500">Unable to load infrastructure feed. Ensure the CivicPulse server is active.</p>
      </div>
    `;
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

function renderCivicCards(posts) {
  const grid = document.getElementById('civic-posts-grid');
  if (!posts || posts.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-16 text-center bg-white/80 rounded-2xl border border-slate-200/80 shadow-xs">
        <div class="w-12 h-12 mx-auto rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-3">
          <i data-lucide="check-circle" class="w-6 h-6"></i>
        </div>
        <h3 class="text-sm font-bold text-slate-800">All clear in this jurisdiction</h3>
        <p class="text-xs text-slate-500 mt-1">No pending civic grievances reported yet.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  grid.innerHTML = posts
    .map((post) => {
      const isCentral = post.is_local === 0 || post.is_local === false;
      const portals = Array.isArray(post.external_portals) ? post.external_portals : [];
      const comments = post.comments || [];

      // Escalation Card for Non-Municipal Jurisdiction
      let escalationHtml = '';
      if (isCentral) {
        const portalPills = portals
          .map((p) => {
            const name = typeof p === 'object' ? p.name : p;
            const url = typeof p === 'object' ? p.url : 'https://pgportal.gov.in';
            const reason = typeof p === 'object' && p.reason ? p.reason : 'Specialized statutory authority jurisdiction.';
            return `
              <a href="${url}" target="_blank" rel="noopener noreferrer" class="group flex items-start gap-2.5 p-2.5 rounded-xl bg-white/90 hover:bg-white border border-rose-200/70 shadow-xs hover:shadow-md transition-all">
                <div class="p-1 rounded-lg bg-rose-50 text-rose-600 group-hover:scale-105 transition-transform">
                  <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </div>
                <div>
                  <div class="text-[11px] font-bold text-slate-900 group-hover:text-rose-700 flex items-center gap-1">
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
        <article class="group bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_12px_32px_-6px_rgba(79,70,229,0.12)] hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between overflow-hidden">
          <div>
            <!-- Image with Zoom Effect -->
            ${
              post.image_url
                ? `
              <div class="relative h-48 overflow-hidden bg-slate-100">
                <img src="${post.image_url}" alt="${escapeHtml(post.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent"></div>
                <div class="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-[11px] font-semibold">
                  <span class="flex items-center gap-1 drop-shadow-sm"><i data-lucide="map-pin" class="w-3.5 h-3.5 text-rose-400"></i> ${escapeHtml(post.location_city)}</span>
                  <span class="px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md border border-white/20">${escapeHtml(post.status || 'Reported')}</span>
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

              <!-- Central Escalation Alert (if non-local) -->
              ${escalationHtml}
            </div>
          </div>

          <!-- Card Engagement Footer -->
          <div class="px-5 pb-5 pt-3 border-t border-slate-100/90 bg-slate-50/40">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <button onclick="handleUpvote('${post.id}')" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 text-slate-700 hover:text-indigo-600 hover:border-indigo-300 text-xs font-bold transition-all shadow-xs">
                  <i data-lucide="heart" class="w-3.5 h-3.5 text-rose-500"></i>
                  <span>Upvote</span>
                  <span id="upvotes-count-${post.id}" class="text-slate-900 font-extrabold ml-0.5">${post.upvotes || 0}</span>
                </button>
                <button onclick="handleFlagUrgent('${post.id}')" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 border border-slate-200 text-slate-700 hover:text-rose-600 hover:border-rose-300 text-xs font-bold transition-all shadow-xs" title="Flag as critical civic emergency">
                  <i data-lucide="flame" class="w-3.5 h-3.5 text-amber-500"></i>
                  <span id="urgent-count-${post.id}">${post.urgent_flags || 0}</span>
                </button>
              </div>

              <button onclick="toggleCommentsSection('${post.id}')" class="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 transition-colors">
                <i data-lucide="message-square" class="w-3.5 h-3.5 text-indigo-500"></i>
                <span>${comments.length}</span>
              </button>
            </div>

            <!-- Expandable Comments Drawer -->
            <div id="comments-box-${post.id}" class="hidden mt-3 pt-3 border-t border-slate-200/70 space-y-2">
              <div class="max-h-36 overflow-y-auto space-y-1.5 pr-1 custom-scroll">
                ${commentsHtml || '<p class="text-[11px] text-slate-400 italic">No citizen comments yet. Leave the first update!</p>'}
              </div>
              <form onsubmit="handleCommentPost(event, '${post.id}')" class="flex gap-2 pt-1.5">
                <input id="comm-author-${post.id}" type="text" placeholder="Your name" class="w-1/3 text-xs border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none" required>
                <input id="comm-text-${post.id}" type="text" placeholder="Update or ticket #..." class="flex-1 text-xs border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none" required>
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

async function handleUpvote(postId) {
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

async function handleFlagUrgent(postId) {
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
    renderServiceCards(state.serviceJobs);
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
        <h3 class="text-sm font-bold text-slate-800">No active household requests</h3>
        <p class="text-xs text-slate-500 mt-1">Post a repair defect to receive competitive local bids.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  grid.innerHTML = jobs
    .map((job) => {
      const bids = job.bids || [];
      const isConfirmed = job.status === 'Confirmed' || job.status === 'Assigned';

      const bidsHtml = bids
        .map((b) => {
          const isAccepted = b.status === 'Accepted';
          const isCountered = b.status === 'Countered';

          return `
            <div class="p-3.5 rounded-xl border ${
              isAccepted
                ? 'bg-emerald-50/90 border-emerald-300 ring-1 ring-emerald-400'
                : 'bg-white border-slate-200/90'
            } text-xs space-y-2 shadow-xs">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1.5">
                  <span class="font-bold text-slate-900">${escapeHtml(b.worker_name)}</span>
                  <span class="text-slate-400 text-[11px] font-mono flex items-center gap-0.5">
                    <i data-lucide="phone" class="w-2.5 h-2.5"></i> ${escapeHtml(b.worker_phone)}
                  </span>
                </div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  isAccepted ? 'bg-emerald-100 text-emerald-800' :
                  isCountered ? 'bg-amber-100 text-amber-800' :
                  'bg-slate-100 text-slate-700'
                }">${escapeHtml(b.status)}</span>
              </div>

              <div class="flex items-center gap-3">
                <span class="font-extrabold text-sm text-slate-900">Bid: ₹${b.bid_amount}</span>
                ${b.counter_amount ? `<span class="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">Resident Counter: ₹${b.counter_amount}</span>` : ''}
              </div>

              ${
                !isConfirmed
                  ? `
                <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  <div class="flex items-center gap-1 flex-1 min-w-[160px]">
                    <input id="counter-val-${b.id}" type="number" placeholder="₹ Counter" class="w-24 border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-white">
                    <button onclick="handleCounterSubmit('${b.id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors">
                      Counter
                    </button>
                  </div>
                  <button onclick="handleAcceptDeal('${job.id}', '${b.id}', '₹${b.counter_amount || b.bid_amount}')" class="px-3 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all">
                    Accept Deal
                  </button>
                </div>
              `
                  : `
                <div class="text-[11px] font-bold text-emerald-800 flex items-center gap-1 pt-1">
                  <i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-600"></i>
                  <span>Rate Agreed & Contract Finalized</span>
                </div>
              `
              }
            </div>
          `;
        })
        .join('');

      return `
        <article class="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_12px_32px_-6px_rgba(79,70,229,0.12)] transition-all p-6 flex flex-col justify-between">
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
              <div class="mt-4 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 max-h-44">
                <img src="${job.media_url}" alt="${escapeHtml(job.title)}" class="w-full h-44 object-cover">
              </div>
            `
                : ''
            }

            <h3 class="font-bold text-slate-900 text-base mt-3 leading-snug">${escapeHtml(job.title)}</h3>
            <p class="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <i data-lucide="map-pin" class="w-3 h-3 text-slate-400"></i> ${escapeHtml(job.location_city)}
            </p>

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
    const res = await fetch(`/api/services/${jobId}/bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

async function handleCounterSubmit(bidId) {
  const inp = document.getElementById(`counter-val-${bidId}`);
  const amt = parseInt(inp.value);
  if (isNaN(amt) || amt <= 0) {
    alert('Please enter a valid counter amount in INR');
    return;
  }

  try {
    const res = await fetch(`/api/services/bids/${bidId}/counter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counter_amount: amt }),
    });
    if (res.ok) {
      showToast(`Counter offer of ₹${amt} sent to contractor.`);
      loadServicesFeed();
    }
  } catch (err) {
    showToast('Failed to submit counter offer.', 'error');
  }
}

async function handleAcceptDeal(jobId, bidId, price) {
  if (!confirm(`Finalize contract and lock rate at ${price}?`)) return;

  try {
    const res = await fetch(`/api/services/bids/${bidId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, final_price: price }),
    });
    if (res.ok) {
      showToast(`Deal confirmed at ${price}! Contract locked.`);
      loadServicesFeed();
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

  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></span> Gemma 4 Auditing Hazard...`;

  try {
    const res = await fetch('/api/civic/report', {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
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

  if (!fileInput.files[0]) {
    alert('Please attach defect media for AI diagnosis.');
    return;
  }

  const formData = new FormData();
  formData.append('media', fileInput.files[0]);
  formData.append('description', desc);
  formData.append('location_city', loc || 'Sector 62, Noida');

  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></span> Gemma AI Diagnosing Fault...`;

  try {
    const res = await fetch('/api/services/create', {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
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
