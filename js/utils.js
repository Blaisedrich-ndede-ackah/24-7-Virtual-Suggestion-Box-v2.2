/* ═══════════════════════════════════════════
   UTILS.JS — Shared Utilities
   ═══════════════════════════════════════════ */

'use strict';

/**
 * SHA-256 hash using Web Crypto API
 * @param {string} message - String to hash
 * @returns {Promise<string>} Hex string
 */
async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(function (b) {
    return b.toString(16).padStart(2, '0');
  }).join('');
}

/**
 * Generate a display token like "VSB-A3F92K"
 * @returns {string}
 */
function generateDisplayToken() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var token = 'VSB-';
  for (var i = 0; i < 6; i++) {
    var idx = Math.floor(Math.random() * chars.length);
    token += chars[idx];
  }
  return token;
}

/**
 * Hash display token with salt to create reference token
 * @param {string} displayToken
 * @returns {Promise<string>}
 */
async function hashToken(displayToken) {
  var salt = window._env && window._env.TOKEN_SECRET_SALT ? window._env.TOKEN_SECRET_SALT : 'vsb-default-salt-change-me';
  return await sha256(displayToken + salt);
}

/**
 * Sanitize user input — strip HTML tags to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function sanitizeInput(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.trim();
}

/**
 * Show a toast notification
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration - ms (default 4000)
 */
function showToast(message, type, duration) {
  type = type || 'info';
  duration = duration || 4000;

  var container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  var icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  var colorMap = {
    success: '#16a34a',
    error: '#dc2626',
    warning: '#d97706',
    info: '#2563eb'
  };

  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML =
    '<span class="toast-icon" style="color:' + colorMap[type] + '">' + icons[type] + '</span>' +
    '<span>' + message + '</span>' +
    '<span class="toast-close">&times;</span>';

  container.appendChild(toast);

  // Trigger show
  requestAnimationFrame(function () {
    toast.classList.add('show');
  });

  // Close handlers
  var closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', function () {
    removeToast(toast);
  });

  setTimeout(function () {
    removeToast(toast);
  }, duration);
}

function removeToast(toast) {
  toast.classList.remove('show');
  setTimeout(function () {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 400);
}

/**
 * Format a date/time string to readable format
 * @param {string} isoStr
 * @returns {string}
 */
function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  var d = new Date(isoStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  }) + ' ' + d.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Format relative time (e.g., "2 hours ago")
 * @param {string} isoStr
 * @returns {string}
 */
function timeAgo(isoStr) {
  if (!isoStr) return '';
  var now = Date.now();
  var then = new Date(isoStr).getTime();
  var diff = now - then;

  var seconds = Math.floor(diff / 1000);
  var minutes = Math.floor(seconds / 60);
  var hours = Math.floor(minutes / 60);
  var days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return minutes + 'm ago';
  if (hours < 24) return hours + 'h ago';
  if (days < 7) return days + 'd ago';
  return formatDateTime(isoStr);
}

/**
 * Calculate and format countdown to deadline
 * @param {string} deadlineStr - ISO date string
 * @returns {{ text: string, isUrgent: boolean, isExpired: boolean }}
 */
function getCountdown(deadlineStr) {
  if (!deadlineStr) return { text: '—', isUrgent: false, isExpired: true };

  var now = Date.now();
  var deadline = new Date(deadlineStr).getTime();
  var diff = deadline - now;

  if (diff <= 0) {
    return { text: 'Overdue', isUrgent: true, isExpired: true };
  }

  var hours = Math.floor(diff / (1000 * 60 * 60));
  var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  var seconds = Math.floor((diff % (1000 * 60)) / 1000);

  var text = hours.toString().padStart(2, '0') + ':' +
    minutes.toString().padStart(2, '0') + ':' +
    seconds.toString().padStart(2, '0') + ' remaining';

  return {
    text: text,
    isUrgent: hours < 12,
    isExpired: false
  };
}

/**
 * Copy text to clipboard
 * @param {string} text
 */
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      showToast('Copied to clipboard!', 'info');
    }).catch(function () {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast('Copied to clipboard!', 'info');
  } catch (e) {
    showToast('Failed to copy', 'error');
  }
  document.body.removeChild(ta);
}

/**
 * Download text as a .txt file
 * @param {string} filename
 * @param {string} content
 */
function downloadAsFile(filename, content) {
  var blob = new Blob([content], { type: 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Get status badge HTML
 * @param {string} status
 * @returns {string}
 */
function getStatusBadge(status) {
  var map = {
    pending: 'badge-pending',
    in_progress: 'badge-in-progress',
    resolved: 'badge-resolved',
    escalated: 'badge-escalated'
  };
  var label = status.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  return '<span class="badge ' + (map[status] || 'badge-pending') + '">' + label + '</span>';
}

/**
 * Simple client-side rate limit check (supplementary to server-side)
 * @param {string} key
 * @param {number} maxAttempts
 * @param {number} windowMs
 * @returns {boolean}
 */
function clientRateLimit(key, maxAttempts, windowMs) {
  var now = Date.now();
  var storageKey = 'rl_' + key;
  var data;

  try {
    data = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
  } catch (e) {
    data = [];
  }

  // Remove expired entries
  data = data.filter(function (t) { return now - t < windowMs; });

  if (data.length >= maxAttempts) {
    return false; // rate limited
  }

  data.push(now);
  sessionStorage.setItem(storageKey, JSON.stringify(data));
  return true;
}

/**
 * Escape HTML for display (NOT for input sanitization)
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
