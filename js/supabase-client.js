/* ═══════════════════════════════════════════
   SUPABASE-CLIENT.JS — Supabase Initialization
   ═══════════════════════════════════════════ */

'use strict';

/**
 * Supabase Configuration
 * Replace these with your actual Supabase project values.
 * 
 * Option A: Set window._env before this script loads (e.g., via a config.js)
 * Option B: Replace the placeholder strings directly for static deploys
 * 
 * The anon key is safe to expose in the frontend — 
 * RLS policies control all data access.
 */

var SUPABASE_URL = (window._env && window._env.SUPABASE_URL)
  ? window._env.SUPABASE_URL
  : 'https://hwpauasodtddqqjvwpfc.supabase.co/rest/v1/';

var SUPABASE_ANON_KEY = (window._env && window._env.SUPABASE_ANON_KEY)
  ? window._env.SUPABASE_ANON_KEY
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cGF1YXNvZHRkZHFxanZ3cGZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MzgzMTcsImV4cCI6MjA5NDMxNDMxN30._IW4UC0Drc1gJnF6irPCaNq6D2zP43AesPiqeYM47QQ';

// Initialize Supabase client (loaded via CDN UMD bundle)
var supabase;

if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.error('[VSB] Supabase JS library not loaded. Ensure the CDN script is included before this file.');
}

/**
 * Get the current authenticated session (admin only)
 * @returns {Promise<object|null>}
 */
async function getSession() {
  if (!supabase) return null;
  try {
    var result = await supabase.auth.getSession();
    return result.data.session;
  } catch (e) {
    console.error('[VSB] Session check failed:', e);
    return null;
  }
}

/**
 * Require admin authentication — redirect to login if not authenticated
 */
async function requireAuth() {
  var session = await getSession();
  if (!session) {
    window.location.href = '/admin/login.html';
    return null;
  }
  return session;
}
