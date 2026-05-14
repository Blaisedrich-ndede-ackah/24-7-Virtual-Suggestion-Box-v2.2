/* ═══════════════════════════════════════════
   SUBMIT.JS — Form Validation & Submission
   ═══════════════════════════════════════════ */

'use strict';

(function () {
  // ─── CAPTCHA ───
  var captchaA, captchaB, captchaAnswer;

  function generateCaptcha() {
    captchaA = Math.floor(Math.random() * 15) + 1;
    captchaB = Math.floor(Math.random() * 15) + 1;
    captchaAnswer = captchaA + captchaB;
    var el = document.getElementById('captcha-question');
    if (el) el.textContent = 'What is ' + captchaA + ' + ' + captchaB + '?';
    var input = document.getElementById('captcha-answer');
    if (input) input.value = '';
  }

  generateCaptcha();

  // ─── Anonymous Toggle ───
  var anonToggle = document.getElementById('anon-toggle');
  var nameWrapper = document.getElementById('name-field-wrapper');

  if (anonToggle) {
    anonToggle.addEventListener('change', function () {
      if (this.checked) {
        nameWrapper.classList.remove('visible');
      } else {
        nameWrapper.classList.add('visible');
      }
    });
  }

  // ─── Character Counters ───
  function setupCounter(inputId, counterId, max) {
    var input = document.getElementById(inputId);
    var counter = document.getElementById(counterId);
    if (!input || !counter) return;

    input.addEventListener('input', function () {
      var len = this.value.length;
      counter.textContent = len + '/' + max;
      counter.className = 'char-counter';
      if (len > max * 0.9) counter.classList.add('danger');
      else if (len > max * 0.7) counter.classList.add('warn');

      // Validation visual
      if (inputId === 'subject') {
        this.className = 'form-input' + (len > 0 && len <= max ? ' valid' : (len > max ? ' invalid' : ''));
      }
      if (inputId === 'message') {
        var minLen = 20;
        this.className = 'form-textarea' + (len >= minLen && len <= max ? ' valid' : (len > 0 && (len < minLen || len > max) ? ' invalid' : ''));
      }
    });
  }

  setupCounter('subject', 'subject-counter', 100);
  setupCounter('message', 'message-counter', 1000);

  // ─── Form Submission ───
  var form = document.getElementById('submit-form');
  var submitBtn = document.getElementById('submit-btn');

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      // Validate CAPTCHA
      var captchaInput = document.getElementById('captcha-answer');
      if (parseInt(captchaInput.value, 10) !== captchaAnswer) {
        showToast('Incorrect CAPTCHA answer. Please try again.', 'error');
        generateCaptcha();
        captchaInput.classList.add('invalid');
        return;
      }
      captchaInput.classList.remove('invalid');

      // Get form values
      var isAnonymous = anonToggle.checked;
      var name = isAnonymous ? null : sanitizeInput(document.getElementById('submitter-name').value.trim());
      var category = document.getElementById('category').value;
      var subject = sanitizeInput(document.getElementById('subject').value.trim());
      var message = sanitizeInput(document.getElementById('message').value.trim());

      // Validate
      if (!category) {
        showToast('Please select a category.', 'warning');
        return;
      }
      if (!subject || subject.length > 100) {
        showToast('Subject is required (max 100 characters).', 'warning');
        return;
      }
      if (!message || message.length < 20 || message.length > 1000) {
        showToast('Message must be between 20 and 1000 characters.', 'warning');
        return;
      }

      // Client-side rate limit check
      if (!clientRateLimit('submit', 5, 3600000)) {
        showToast('Too many submissions. Please try again later.', 'error');
        return;
      }

      // Loading state
      submitBtn.classList.add('loading');
      submitBtn.disabled = true;

      try {
        // Generate tokens
        var displayToken = generateDisplayToken();
        var referenceToken = await hashToken(displayToken);

        // Prepare data
        var payload = {
          reference_token: referenceToken,
          display_token: displayToken,
          is_anonymous: isAnonymous,
          submitter_name: name || null,
          category: category,
          subject: subject,
          message: message,
          status: 'pending',
          is_escalated: false
        };

        // Submit to Supabase
        var result = await supabase
          .from('submissions')
          .insert([payload])
          .select('id')
          .single();

        if (result.error) {
          throw new Error(result.error.message || 'Submission failed');
        }

        // Also insert the initial message
        await supabase
          .from('messages')
          .insert([{
            submission_id: result.data.id,
            sender_role: 'user',
            message_body: message,
            is_read: false
          }]);

        // Insert notification for admin
        await supabase
          .from('admin_notifications')
          .insert([{
            submission_id: result.data.id,
            notification_type: 'new_submission',
            is_read: false
          }]);

        // Show success modal
        showSuccessModal(displayToken);
        form.reset();
        anonToggle.checked = true;
        nameWrapper.classList.remove('visible');
        generateCaptcha();
        resetCounters();

      } catch (err) {
        console.error('[VSB] Submission error:', err);
        showToast('Something went wrong. Please try again.', 'error');
      } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
      }
    });
  }

  function resetCounters() {
    var sc = document.getElementById('subject-counter');
    var mc = document.getElementById('message-counter');
    if (sc) sc.textContent = '0/100';
    if (mc) mc.textContent = '0/1000';
    var subj = document.getElementById('subject');
    var msg = document.getElementById('message');
    if (subj) subj.className = 'form-input';
    if (msg) msg.className = 'form-textarea';
  }

  // ─── Success Modal ───
  function showSuccessModal(token) {
    var backdrop = document.getElementById('success-modal');
    var tokenEl = document.getElementById('modal-token');
    if (tokenEl) tokenEl.textContent = token;
    if (backdrop) backdrop.classList.add('active');

    // Copy button
    var copyBtn = document.getElementById('copy-token-btn');
    if (copyBtn) {
      copyBtn.onclick = function () {
        copyToClipboard(token);
      };
    }

    // Download button
    var dlBtn = document.getElementById('download-token-btn');
    if (dlBtn) {
      dlBtn.onclick = function () {
        var content = '24/7 Virtual Suggestion Box\n' +
          'Your Reference Token: ' + token + '\n\n' +
          'IMPORTANT: Save this token. It is the ONLY way to track your submission.\n' +
          'Visit the tracking page and enter this token to view updates.\n' +
          'Date: ' + new Date().toLocaleString();
        downloadAsFile('VSB-Token-' + token + '.txt', content);
      };
    }

    // Track button
    var trackBtn = document.getElementById('track-this-btn');
    if (trackBtn) {
      trackBtn.onclick = function () {
        window.location.href = '/track.html?token=' + encodeURIComponent(token);
      };
    }

    // Submit another
    var anotherBtn = document.getElementById('submit-another-btn');
    if (anotherBtn) {
      anotherBtn.onclick = function () {
        backdrop.classList.remove('active');
      };
    }

    // Close modal
    var closeBtn = document.getElementById('modal-close-btn');
    if (closeBtn) {
      closeBtn.onclick = function () {
        backdrop.classList.remove('active');
      };
    }
  }
})();
