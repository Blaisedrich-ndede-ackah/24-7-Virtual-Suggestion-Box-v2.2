/* ═══════════════════════════════════════════
   TRACK.JS — Fetch Submission by Token,
   Display Reply, Allow User Response
   ═══════════════════════════════════════════ */

'use strict';

(function () {
  var trackForm = document.getElementById('track-form');
  var tokenInput = document.getElementById('token-input');
  var trackBtn = document.getElementById('track-btn');
  var detailSection = document.getElementById('submission-detail');
  var errorSection = document.getElementById('track-error');
  var currentSubmission = null;
  var countdownInterval = null;

  // Check for token in URL params
  var urlParams = new URLSearchParams(window.location.search);
  var urlToken = urlParams.get('token');
  if (urlToken && tokenInput) {
    tokenInput.value = urlToken;
    // Auto-search after short delay
    setTimeout(function () {
      doTrack(urlToken);
    }, 500);
  }

  if (trackForm) {
    trackForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var token = tokenInput.value.trim().toUpperCase();
      if (!token) {
        showToast('Please enter your reference token.', 'warning');
        return;
      }
      doTrack(token);
    });
  }

  async function doTrack(displayToken) {
    // Client rate limit
    if (!clientRateLimit('track', 10, 60000)) {
      showToast('Too many attempts. Please wait a moment.', 'warning');
      return;
    }

    trackBtn.classList.add('loading');
    trackBtn.disabled = true;
    detailSection.classList.remove('visible');
    errorSection.classList.remove('visible');

    try {
      var refToken = await hashToken(displayToken);

      var result = await supabase.rpc('get_submission_by_token', {
        token_hash: refToken
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      var data = result.data;

      if (!data || (Array.isArray(data) && data.length === 0)) {
        showError();
        return;
      }

      // data might be an array with one object or a single object
      var submission = Array.isArray(data) ? data[0] : data;
      if (!submission || !submission.id) {
        showError();
        return;
      }

      currentSubmission = submission;

      // Fetch messages
      var msgResult = await supabase
        .from('messages')
        .select('*')
        .eq('submission_id', submission.id)
        .order('sent_at', { ascending: true });

      var messages = (msgResult.data || []);

      renderSubmission(submission, messages, displayToken);

    } catch (err) {
      console.error('[VSB] Track error:', err);
      showError();
    } finally {
      trackBtn.classList.remove('loading');
      trackBtn.disabled = false;
    }
  }

  function showError() {
    errorSection.classList.add('visible');
    detailSection.classList.remove('visible');
  }

  function renderSubmission(sub, messages, displayToken) {
    errorSection.classList.remove('visible');
    detailSection.classList.add('visible');

    // Status badge
    var statusEl = document.getElementById('detail-status');
    if (statusEl) statusEl.innerHTML = getStatusBadge(sub.status);

    // Token
    var tokenEl = document.getElementById('detail-token');
    if (tokenEl) tokenEl.textContent = displayToken;

    // Category
    var catEl = document.getElementById('detail-category');
    if (catEl) catEl.textContent = sub.category ? sub.category.charAt(0).toUpperCase() + sub.category.slice(1) : '—';

    // Subject
    var subjEl = document.getElementById('detail-subject');
    if (subjEl) subjEl.textContent = sub.subject || '—';

    // Submitted date
    var dateEl = document.getElementById('detail-date');
    if (dateEl) dateEl.textContent = formatDateTime(sub.submitted_at);

    // Countdown
    updateDeadline(sub);
    if (countdownInterval) clearInterval(countdownInterval);
    if (sub.status === 'pending' || sub.status === 'escalated') {
      countdownInterval = setInterval(function () {
        updateDeadline(sub);
      }, 1000);
    }

    // Resolved banner
    var resolvedBanner = document.getElementById('resolved-banner');
    if (resolvedBanner) {
      if (sub.status === 'resolved') {
        resolvedBanner.classList.add('visible');
        var rt = document.getElementById('resolved-time');
        if (rt) rt.textContent = 'Resolved on ' + formatDateTime(sub.resolved_at);
      } else {
        resolvedBanner.classList.remove('visible');
      }
    }

    // Messages
    renderMessages(messages);

    // Reply box visibility
    var replyBox = document.getElementById('reply-box');
    if (replyBox) {
      replyBox.style.display = (sub.status === 'resolved') ? 'none' : 'block';
    }

    // Setup reply handler
    setupReplyHandler(sub.id, displayToken);
  }

  function updateDeadline(sub) {
    var section = document.getElementById('deadline-section');
    var textEl = document.getElementById('deadline-text');
    if (!section || !textEl) return;

    if (sub.status === 'resolved') {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'flex';
    var cd = getCountdown(sub.response_deadline);
    textEl.textContent = cd.text;

    if (cd.isUrgent) {
      section.classList.add('urgent');
    } else {
      section.classList.remove('urgent');
    }
  }

  function renderMessages(messages) {
    var container = document.getElementById('thread-messages');
    if (!container) return;

    if (messages.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No messages yet.</p></div>';
      return;
    }

    var html = '';
    messages.forEach(function (msg) {
      var isUser = msg.sender_role === 'user';
      var bubbleClass = isUser ? 'msg-bubble-user' : 'msg-bubble-admin';
      var senderLabel = isUser ? 'You' : 'Admin';

      html += '<div class="msg-bubble ' + bubbleClass + '">' +
        '<div class="msg-sender">' + senderLabel + '</div>' +
        '<div class="msg-content">' + escapeHtml(msg.message_body) + '</div>' +
        '<div class="msg-time">' + timeAgo(msg.sent_at) + '</div>' +
        '</div>';
    });

    container.innerHTML = html;

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  function setupReplyHandler(submissionId, displayToken) {
    var replyForm = document.getElementById('reply-form');
    var replyBtn = document.getElementById('reply-btn');
    var replyInput = document.getElementById('reply-input');

    if (!replyForm) return;

    // Remove previous listener by cloning
    var newForm = replyForm.cloneNode(true);
    replyForm.parentNode.replaceChild(newForm, replyForm);

    var newBtn = newForm.querySelector('#reply-btn');
    var newInput = newForm.querySelector('#reply-input');

    newForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      var body = sanitizeInput(newInput.value.trim());
      if (!body || body.length < 2) {
        showToast('Please enter a message.', 'warning');
        return;
      }
      if (body.length > 1000) {
        showToast('Message is too long (max 1000 characters).', 'warning');
        return;
      }

      newBtn.classList.add('loading');
      newBtn.disabled = true;

      try {
        var result = await supabase
          .from('messages')
          .insert([{
            submission_id: submissionId,
            sender_role: 'user',
            message_body: body,
            is_read: false
          }]);

        if (result.error) throw new Error(result.error.message);

        // Insert notification for admin
        await supabase
          .from('admin_notifications')
          .insert([{
            submission_id: submissionId,
            notification_type: 'user_reply',
            is_read: false
          }]);

        newInput.value = '';
        showToast('Reply sent successfully!', 'success');

        // Refresh messages
        doTrack(displayToken);

      } catch (err) {
        console.error('[VSB] Reply error:', err);
        showToast('Failed to send reply. Please try again.', 'error');
      } finally {
        newBtn.classList.remove('loading');
        newBtn.disabled = false;
      }
    });
  }
})();
