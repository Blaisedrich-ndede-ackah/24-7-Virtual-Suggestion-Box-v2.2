/* ═══════════════════════════════════════════
   ADMIN-DASHBOARD.JS — Dashboard Logic
   ═══════════════════════════════════════════ */

'use strict';

(function () {
  var session = null;
  var allSubmissions = [];
  var allNotifications = [];
  var currentDetailId = null;
  var countdownIntervals = {};
  var realtimeChannel = null;

  // ─── INIT ───
  async function init() {
    session = await requireAuth();
    if (!session) return;

    setupNavigation();
    setupNotificationBell();
    setupLogout();
    setupFilters();
    await loadSubmissions();
    await loadNotifications();
    setupRealtime();
    renderAnalytics();
  }

  init();

  // ─── NAVIGATION ───
  function setupNavigation() {
    var navItems = document.querySelectorAll('.sidebar-nav-item');
    var panels = document.querySelectorAll('.tab-panel');

    navItems.forEach(function (item) {
      item.addEventListener('click', function () {
        var target = this.getAttribute('data-tab');
        navItems.forEach(function (n) { n.classList.remove('active'); });
        panels.forEach(function (p) { p.classList.remove('active'); });
        this.classList.add('active');
        var panel = document.getElementById('panel-' + target);
        if (panel) panel.classList.add('active');

        // Update topbar title
        var titleMap = {
          inbox: 'Inbox',
          analytics: 'Analytics',
          settings: 'Settings'
        };
        var topTitle = document.getElementById('topbar-title');
        if (topTitle) topTitle.textContent = titleMap[target] || 'Dashboard';

        if (target === 'analytics') renderAnalytics();
      });
    });

    // Mobile sidebar toggle
    var sidebarToggle = document.getElementById('sidebar-toggle');
    var sidebar = document.querySelector('.sidebar');
    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', function () {
        sidebar.classList.toggle('open');
      });
      // Close sidebar on panel click (mobile)
      navItems.forEach(function (item) {
        item.addEventListener('click', function () {
          if (window.innerWidth <= 900) sidebar.classList.remove('open');
        });
      });
    }
  }

  // ─── LOAD SUBMISSIONS ───
  async function loadSubmissions() {
    try {
      var result = await supabase
        .from('submissions')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (result.error) throw result.error;
      allSubmissions = result.data || [];
      renderSubmissionsTable(allSubmissions);
    } catch (err) {
      console.error('[VSB] Load submissions error:', err);
      showToast('Failed to load submissions.', 'error');
    }
  }

  // ─── RENDER TABLE ───
  function renderSubmissionsTable(submissions) {
    var tbody = document.getElementById('submissions-tbody');
    if (!tbody) return;

    if (submissions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--text-muted);">' +
        '<div class="empty-state">' +
        '<svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<path d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7"/>' +
        '<path d="M2 17l4-4h4l2 2h4l2-2h4l2 4v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1z"/>' +
        '</svg>' +
        '<h3>No submissions yet</h3>' +
        '<p>Submissions will appear here as they come in.</p>' +
        '</div></td></tr>';
      return;
    }

    var html = '';
    submissions.forEach(function (sub) {
      var cd = getCountdown(sub.response_deadline);
      var countdownClass = cd.isUrgent ? ' urgent' : '';

      html += '<tr data-id="' + sub.id + '" onclick="openDetail(\'' + sub.id + '\')">' +
        '<td><span class="table-token">' + escapeHtml(sub.display_token) + '</span></td>' +
        '<td class="table-category">' + escapeHtml(sub.category || '') + '</td>' +
        '<td class="table-subject">' + escapeHtml(sub.subject || '') + '</td>' +
        '<td>' + getStatusBadge(sub.status) + '</td>' +
        '<td>' + formatDateTime(sub.submitted_at) + '</td>' +
        '<td><span class="countdown' + countdownClass + '" id="cd-' + sub.id + '">' + cd.text + '</span></td>' +
        '<td><button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();openDetail(\'' + sub.id + '\')">View</button></td>' +
        '</tr>';
    });

    tbody.innerHTML = html;
    startTableCountdowns(submissions);
  }

  function startTableCountdowns(submissions) {
    // Clear old intervals
    Object.keys(countdownIntervals).forEach(function (k) {
      clearInterval(countdownIntervals[k]);
    });
    countdownIntervals = {};

    submissions.forEach(function (sub) {
      if (sub.status === 'resolved') return;
      countdownIntervals[sub.id] = setInterval(function () {
        var el = document.getElementById('cd-' + sub.id);
        if (!el) {
          clearInterval(countdownIntervals[sub.id]);
          return;
        }
        var cd = getCountdown(sub.response_deadline);
        el.textContent = cd.text;
        el.className = 'countdown' + (cd.isUrgent ? ' urgent' : '');
      }, 1000);
    });
  }

  // ─── FILTERS ───
  function setupFilters() {
    var statusFilter = document.getElementById('filter-status');
    var categoryFilter = document.getElementById('filter-category');
    var searchInput = document.getElementById('filter-search');

    function applyFilters() {
      var status = statusFilter ? statusFilter.value : '';
      var category = categoryFilter ? categoryFilter.value : '';
      var search = searchInput ? searchInput.value.trim().toLowerCase() : '';

      var filtered = allSubmissions.filter(function (sub) {
        if (status && sub.status !== status) return false;
        if (category && sub.category !== category) return false;
        if (search) {
          var matchToken = (sub.display_token || '').toLowerCase().includes(search);
          var matchSubject = (sub.subject || '').toLowerCase().includes(search);
          if (!matchToken && !matchSubject) return false;
        }
        return true;
      });

      renderSubmissionsTable(filtered);
    }

    if (statusFilter) statusFilter.addEventListener('change', applyFilters);
    if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);
    if (searchInput) searchInput.addEventListener('input', applyFilters);
  }

  // ─── DETAIL PANEL ───
  window.openDetail = async function (id) {
    currentDetailId = id;
    var sub = allSubmissions.find(function (s) { return s.id === id; });
    if (!sub) return;

    var panel = document.getElementById('detail-panel');
    var backdrop = document.getElementById('detail-panel-backdrop');
    if (!panel || !backdrop) return;

    // Fill detail info
    var tokenEl = document.getElementById('dp-token');
    if (tokenEl) tokenEl.textContent = sub.display_token;

    var statusSelect = document.getElementById('dp-status');
    if (statusSelect) statusSelect.value = sub.status;

    var catEl = document.getElementById('dp-category');
    if (catEl) catEl.textContent = sub.category || '—';

    var nameEl = document.getElementById('dp-name');
    if (nameEl) nameEl.textContent = sub.is_anonymous ? 'Anonymous' : (sub.submitter_name || 'Not provided');

    var dateEl = document.getElementById('dp-date');
    if (dateEl) dateEl.textContent = formatDateTime(sub.submitted_at);

    var deadlineEl = document.getElementById('dp-deadline');
    if (deadlineEl) {
      var cd = getCountdown(sub.response_deadline);
      deadlineEl.textContent = cd.text;
      deadlineEl.className = 'detail-info-value countdown' + (cd.isUrgent ? ' urgent' : '');
    }

    var origMsg = document.getElementById('dp-original-message');
    if (origMsg) origMsg.textContent = sub.message || sub.subject;

    // Load thread
    await loadThread(id);

    // Show panel
    backdrop.classList.add('active');
    panel.classList.add('open');

    // Setup status change
    if (statusSelect) {
      statusSelect.onchange = async function () {
        var newStatus = this.value;
        try {
          var update = { status: newStatus };
          if (newStatus === 'resolved') update.resolved_at = new Date().toISOString();
          var res = await supabase.from('submissions').update(update).eq('id', id);
          if (res.error) throw res.error;
          sub.status = newStatus;
          showToast('Status updated.', 'success');
          loadSubmissions();
        } catch (e) {
          showToast('Failed to update status.', 'error');
        }
      };
    }

    // Setup reply
    setupAdminReply(id);
  };

  window.closeDetail = function () {
    var panel = document.getElementById('detail-panel');
    var backdrop = document.getElementById('detail-panel-backdrop');
    if (panel) panel.classList.remove('open');
    setTimeout(function () {
      if (backdrop) backdrop.classList.remove('active');
    }, 350);
    currentDetailId = null;
  };

  async function loadThread(submissionId) {
    var container = document.getElementById('dp-thread');
    if (!container) return;

    try {
      var result = await supabase
        .from('messages')
        .select('*')
        .eq('submission_id', submissionId)
        .order('sent_at', { ascending: true });

      var messages = result.data || [];

      if (messages.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No messages in thread.</p></div>';
        return;
      }

      var html = '';
      messages.forEach(function (msg) {
        var isUser = msg.sender_role === 'user';
        var bubbleClass = isUser ? 'msg-bubble-user' : 'msg-bubble-admin';
        var senderLabel = isUser ? 'User' : 'Admin';

        html += '<div class="msg-bubble ' + bubbleClass + '">' +
          '<div class="msg-sender">' + senderLabel + '</div>' +
          '<div class="msg-content">' + escapeHtml(msg.message_body) + '</div>' +
          '<div class="msg-time">' + timeAgo(msg.sent_at) + '</div>' +
          '</div>';
      });

      container.innerHTML = html;
      container.scrollTop = container.scrollHeight;

      // Mark user messages as read
      var unreadIds = messages
        .filter(function (m) { return m.sender_role === 'user' && !m.is_read; })
        .map(function (m) { return m.id; });
      if (unreadIds.length > 0) {
        await supabase.from('messages').update({ is_read: true }).in('id', unreadIds);
      }

    } catch (e) {
      container.innerHTML = '<p style="color:var(--danger);">Error loading thread.</p>';
    }
  }

  function setupAdminReply(submissionId) {
    var form = document.getElementById('admin-reply-form');
    if (!form) return;

    var newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);

    newForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var textarea = newForm.querySelector('.form-textarea');
      var btn = newForm.querySelector('.btn');
      var body = sanitizeInput(textarea.value.trim());

      if (!body || body.length < 2) {
        showToast('Please enter a reply.', 'warning');
        return;
      }

      btn.disabled = true;

      try {
        var res = await supabase.from('messages').insert([{
          submission_id: submissionId,
          sender_role: 'admin',
          message_body: body,
          is_read: false
        }]);

        if (res.error) throw res.error;

        // Update status to in_progress if pending
        var sub = allSubmissions.find(function (s) { return s.id === submissionId; });
        if (sub && sub.status === 'pending') {
          await supabase.from('submissions').update({ status: 'in_progress' }).eq('id', submissionId);
        }

        textarea.value = '';
        showToast('Reply sent!', 'success');
        await loadThread(submissionId);
        await loadSubmissions();

      } catch (err) {
        showToast('Failed to send reply.', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ─── NOTIFICATIONS ───
  async function loadNotifications() {
    try {
      var result = await supabase
        .from('admin_notifications')
        .select('*, submissions(display_token, category)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (result.error) throw result.error;
      allNotifications = result.data || [];
      renderNotifications();
    } catch (e) {
      console.error('[VSB] Load notifications error:', e);
    }
  }

  function renderNotifications() {
    var list = document.getElementById('notif-list');
    var badge = document.getElementById('notif-badge');
    var inboxBadge = document.getElementById('inbox-badge');
    if (!list) return;

    var unreadCount = allNotifications.filter(function (n) { return !n.is_read; }).length;

    // Badge
    if (badge) {
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      if (unreadCount > 0) {
        badge.classList.add('visible');
      } else {
        badge.classList.remove('visible');
      }
    }

    if (inboxBadge) {
      if (unreadCount > 0) {
        inboxBadge.textContent = unreadCount;
        inboxBadge.style.display = 'inline-block';
      } else {
        inboxBadge.style.display = 'none';
      }
    }

    if (allNotifications.length === 0) {
      list.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
      return;
    }

    var html = '';
    allNotifications.forEach(function (n) {
      var typeLabels = {
        new_submission: 'New submission received',
        user_reply: 'User replied to ',
        escalation_flag: 'Case escalated — no response after 72h'
      };

      var text = typeLabels[n.notification_type] || 'Notification';
      if (n.notification_type === 'user_reply' && n.submissions) {
        text += n.submissions.display_token;
      }
      if (n.notification_type === 'new_submission' && n.submissions) {
        text += ' (' + (n.submissions.category || '') + ')';
      }
      if (n.notification_type === 'escalation_flag' && n.submissions) {
        text = 'Case ' + n.submissions.display_token + ' escalated — no response after 72h';
      }

      var subId = n.submission_id || '';

      html += '<div class="notif-item' + (n.is_read ? '' : ' unread') + '" onclick="openDetail(\'' + subId + '\')">' +
        '<span class="notif-dot"></span>' +
        '<div class="notif-content">' +
        '<div class="notif-text">' + escapeHtml(text) + '</div>' +
        '<div class="notif-time">' + timeAgo(n.created_at) + '</div>' +
        '</div></div>';
    });

    list.innerHTML = html;
  }

  function setupNotificationBell() {
    var bell = document.getElementById('notif-bell');
    var dropdown = document.getElementById('notif-dropdown');
    var markAllBtn = document.getElementById('mark-all-read');

    if (bell && dropdown) {
      bell.addEventListener('click', function (e) {
        e.stopPropagation();
        dropdown.classList.toggle('visible');
      });

      document.addEventListener('click', function (e) {
        if (!dropdown.contains(e.target) && e.target !== bell) {
          dropdown.classList.remove('visible');
        }
      });
    }

    if (markAllBtn) {
      markAllBtn.addEventListener('click', async function () {
        try {
          var unreadIds = allNotifications
            .filter(function (n) { return !n.is_read; })
            .map(function (n) { return n.id; });
          if (unreadIds.length === 0) return;

          await supabase.from('admin_notifications').update({ is_read: true }).in('id', unreadIds);
          allNotifications.forEach(function (n) { n.is_read = true; });
          renderNotifications();
          showToast('All notifications marked as read.', 'info');
        } catch (e) {
          showToast('Failed to update.', 'error');
        }
      });
    }
  }

  // ─── REALTIME ───
  function setupRealtime() {
    if (!supabase) return;

    realtimeChannel = supabase
      .channel('admin-notifs')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_notifications' },
        function (payload) {
          // New notification received
          loadNotifications();
          loadSubmissions();

          // Bell shake animation
          var bell = document.getElementById('notif-bell');
          if (bell) {
            bell.classList.add('shake');
            setTimeout(function () { bell.classList.remove('shake'); }, 600);
          }

          // Sound alert for user_reply
          if (payload.new && payload.new.notification_type === 'user_reply') {
            playNotifSound();
          }

          showToast('New notification received!', 'info');
        }
      )
      .subscribe();
  }

  function playNotifSound() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      // Audio not available
    }
  }

  // ─── LOGOUT ───
  function setupLogout() {
    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async function () {
        await supabase.auth.signOut();
        window.location.href = '/admin/login.html';
      });
    }
  }

  // ─── ANALYTICS ───
  async function renderAnalytics() {
    if (allSubmissions.length === 0) {
      await loadSubmissions();
    }

    var total = allSubmissions.length;

    // Status counts
    var statusCounts = { pending: 0, in_progress: 0, resolved: 0, escalated: 0 };
    allSubmissions.forEach(function (s) {
      if (statusCounts.hasOwnProperty(s.status)) statusCounts[s.status]++;
    });

    // Category counts
    var categoryCounts = {};
    allSubmissions.forEach(function (s) {
      var cat = s.category || 'other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    // Avg response time
    var resolvedSubs = allSubmissions.filter(function (s) { return s.status === 'resolved' && s.resolved_at; });
    var avgResponseHrs = 0;
    if (resolvedSubs.length > 0) {
      var totalHrs = resolvedSubs.reduce(function (sum, s) {
        var diff = new Date(s.resolved_at).getTime() - new Date(s.submitted_at).getTime();
        return sum + diff / (1000 * 60 * 60);
      }, 0);
      avgResponseHrs = (totalHrs / resolvedSubs.length).toFixed(1);
    }

    // Escalation rate
    var escalated = allSubmissions.filter(function (s) { return s.is_escalated; }).length;
    var escalationRate = total > 0 ? ((escalated / total) * 100).toFixed(1) : 0;

    // Update stat cards
    setStatValue('stat-total', total);
    setStatValue('stat-pending', statusCounts.pending);
    setStatValue('stat-resolved', statusCounts.resolved);
    setStatValue('stat-avg-response', avgResponseHrs + 'h');
    setStatValue('stat-escalation', escalationRate + '%');

    // Draw charts
    drawPieChart('chart-status', statusCounts);
    drawBarChart('chart-category', categoryCounts);
  }

  function setStatValue(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function drawPieChart(canvasId, data) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 280 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '280px';
    ctx.scale(dpr, dpr);

    var w = rect.width;
    var h = 280;
    var cx = w / 2;
    var cy = h / 2 - 10;
    var r = Math.min(cx, cy) - 40;

    var colors = {
      pending: '#f59e0b',
      in_progress: '#3b82f6',
      resolved: '#22c55e',
      escalated: '#ef4444'
    };

    var keys = Object.keys(data);
    var total = keys.reduce(function (s, k) { return s + data[k]; }, 0);

    if (total === 0) {
      ctx.fillStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data', cx, cy + 5);
      return;
    }

    var start = -Math.PI / 2;
    keys.forEach(function (key) {
      var slice = (data[key] / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + slice);
      ctx.closePath();
      ctx.fillStyle = colors[key] || '#94a3b8';
      ctx.fill();
      start += slice;
    });

    // Inner circle (donut)
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Center text
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 24px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total, cx, cy - 5);
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText('Total', cx, cy + 15);

    // Legend
    var legendY = h - 15;
    var legendX = 20;
    keys.forEach(function (key) {
      var label = key.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      ctx.fillStyle = colors[key] || '#94a3b8';
      ctx.fillRect(legendX, legendY - 8, 10, 10);
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label + ' (' + data[key] + ')', legendX + 14, legendY);
      legendX += ctx.measureText(label + ' (' + data[key] + ')').width + 30;
    });
  }

  function drawBarChart(canvasId, data) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 280 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '280px';
    ctx.scale(dpr, dpr);

    var w = rect.width;
    var h = 280;
    var keys = Object.keys(data);

    if (keys.length === 0) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data', w / 2, h / 2);
      return;
    }

    var maxVal = Math.max.apply(null, keys.map(function (k) { return data[k]; }));
    if (maxVal === 0) maxVal = 1;

    var barColors = ['#0f766e', '#14b8a6', '#e67e22', '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b'];
    var padding = { top: 20, right: 20, bottom: 60, left: 50 };
    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;
    var barWidth = Math.min(chartW / keys.length - 10, 50);
    var gap = (chartW - barWidth * keys.length) / (keys.length + 1);

    // Y axis
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = '#9ca3af';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), padding.left - 8, y + 4);
    }

    // Bars
    keys.forEach(function (key, idx) {
      var barH = (data[key] / maxVal) * chartH;
      var x = padding.left + gap + (barWidth + gap) * idx;
      var y = padding.top + chartH - barH;

      // Bar
      ctx.fillStyle = barColors[idx % barColors.length];
      ctx.beginPath();
      var radius = 4;
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + barWidth - radius, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      ctx.lineTo(x + barWidth, padding.top + chartH);
      ctx.lineTo(x, padding.top + chartH);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.fill();

      // Value on top
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(data[key], x + barWidth / 2, y - 6);

      // Label
      ctx.save();
      ctx.translate(x + barWidth / 2, padding.top + chartH + 12);
      ctx.rotate(-0.4);
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'left';
      var label = key.charAt(0).toUpperCase() + key.slice(1);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    });
  }

  // ─── SETTINGS ───
  (function () {
    var pwForm = document.getElementById('change-pw-form');
    if (pwForm) {
      pwForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var newPw = document.getElementById('new-password').value;
        var confirmPw = document.getElementById('confirm-password').value;

        if (newPw.length < 8) {
          showToast('Password must be at least 8 characters.', 'warning');
          return;
        }
        if (newPw !== confirmPw) {
          showToast('Passwords do not match.', 'warning');
          return;
        }

        try {
          var res = await supabase.auth.updateUser({ password: newPw });
          if (res.error) throw res.error;
          showToast('Password updated successfully!', 'success');
          document.getElementById('new-password').value = '';
          document.getElementById('confirm-password').value = '';
        } catch (e) {
          showToast('Failed to update password.', 'error');
        }
      });
    }
  })();

})();
