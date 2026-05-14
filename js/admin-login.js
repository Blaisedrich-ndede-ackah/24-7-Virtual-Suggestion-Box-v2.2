/* ═══════════════════════════════════════════
   ADMIN-LOGIN.JS — Admin Login via Supabase Auth
   ═══════════════════════════════════════════ */

'use strict';

(function () {
  // If already logged in, redirect to dashboard
  (async function () {
    var session = await getSession();
    if (session) {
      window.location.href = '/admin/dashboard.html';
    }
  })();

  var loginForm = document.getElementById('login-form');
  var loginBtn = document.getElementById('login-btn');
  var errorEl = document.getElementById('login-error');

  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      var email = document.getElementById('login-email').value.trim();
      var password = document.getElementById('login-password').value;

      if (!email || !password) {
        showLoginError('Please enter your credentials.');
        return;
      }

      // Rate limit
      if (!clientRateLimit('admin_login', 5, 300000)) {
        showLoginError('Too many attempts. Please wait a few minutes.');
        return;
      }

      loginBtn.classList.add('loading');
      loginBtn.disabled = true;
      hideLoginError();

      try {
        var result = await supabase.auth.signInWithPassword({
          email: email,
          password: password
        });

        if (result.error) {
          throw result.error;
        }

        window.location.href = '/admin/dashboard.html';

      } catch (err) {
        console.error('[VSB] Login error:', err);
        showLoginError('Invalid credentials. Please try again.');
      } finally {
        loginBtn.classList.remove('loading');
        loginBtn.disabled = false;
      }
    });
  }

  function showLoginError(msg) {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.classList.add('visible');
    }
  }

  function hideLoginError() {
    if (errorEl) {
      errorEl.classList.remove('visible');
    }
  }
})();
