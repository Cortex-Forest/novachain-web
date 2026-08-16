
    var N = NovaApps;
    var ME = '';
    var USER = null, PANEL = null, UNREAD = 0, SEEN = {};

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function fmtTs(ts) {
      if (!ts) return '-';
      var d = new Date(ts);
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }
    function statusBadge(st) {
      var map = {
        pending_draw: ['arb.status.pending_draw', 'warn'], voting: ['arb.status.voting', 'good'],
        decided: ['arb.status.decided', 'good'], settled: ['arb.status.settled', 'dim'],
        second_pending: ['arb.status.second_pending', 'warn'], second_voting: ['arb.status.second_voting', 'good']
      };
      var m = map[st] || ['', 'dim'];
      return '<span class="badge ' + m[1] + '">' + N.t(m[0]) + '</span>';
    }
    function resText(r) {
      if (!r) return '-';
      return r === 'buyer' ? N.t('arb.cases.result.buyer') : N.t('arb.cases.result.seller');
    }
    function esc(s) { return N.esc(String(s == null ? '' : s)); }

    function switchTab(name) {
      document.querySelectorAll('#arbTabs .sf-tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === name); });
      document.querySelectorAll('.sf-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'sf-panel-' + name); });
    }

    async function loadAll() {
      ME = (N.getState().connected ? N.getState().addr : '') || '';
      try { await renderStats(); } catch (e) { console.error(e); }
      try { await renderPublic(); } catch (e) { console.error(e); }
      if (ME) {
        try { await renderUser(); } catch (e) { console.error(e); }
        try { await renderArb(); } catch (e) { console.error(e); }
      }
      if (ME) pollNotifs(true);
    }

    async function renderStats() {
      var d = await N.api('/api/arb/summary');
      var el = document.getElementById('arbStats');
      el.innerHTML = [
        stat(N.t('arb.summary.arbitrators'), d.arbitrators != null ? d.arbitrators : '-'),
        stat(N.t('arb.summary.candidates'), d.candidates != null ? d.candidates : '-'),
        stat(N.t('arb.summary.open'), d.open_cases != null ? d.open_cases : d.cases),
        stat(N.t('arb.summary.eco'), (d.eco_fund != null ? N.fmt(d.eco_fund) : '-') + ' NOVA')
      ].join('');
    }
    function stat(k, v) { return '<div class="arb-stat"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>'; }

    async function renderPublic() {
      var arb = await N.api('/api/arb/arbitrators');
      var al = document.getElementById('arbList');
      if (!arb.arbitrators || !arb.arbitrators.length) { al.innerHTML = '<p class="dim">-</p>'; }
      else {
        al.innerHTML = '<table class="table"><thead><tr><th>' + N.t('arb.list.addr') + '</th><th>' + N.t('arb.list.rep') +
          '</th><th>' + N.t('arb.list.cases') + '</th><th>' + N.t('arb.list.revenue') + '</th><th>' + N.t('arb.list.term') + '</th></tr></thead><tbody>' +
          arb.arbitrators.filter(function (x) { return x.status === 'active' || x.status === 'renewing'; }).map(function (x) {
            return '<tr><td class="mono">' + esc(x.addr) + '</td><td><b>' + x.rep + '</b></td><td>' + x.cases + '</td><td>' + N.fmt(x.revenue || 0) + ' NOVA</td><td>' + fmtTs(x.term_end) + '</td></tr>';
          }).join('') + '</tbody></table>';
      }
      var cand = await N.api('/api/arb/candidates');
      var cl = document.getElementById('candList');
      if (!cand.candidates || !cand.candidates.length) { cl.innerHTML = '<p class="dim">-</p>'; }
      else {
        cl.innerHTML = cand.candidates.map(function (c) {
          var st = c.status === 'voting' ? N.t('arb.cand.status.voting') : (c.status === 'passed' ? N.t('arb.cand.status.passed') : N.t('arb.cand.status.failed'));
          var kind = c.kind === 'renew' ? ' · ' + N.t('arb.cand.kind.renew') : '';
          var voteBtns = '';
          if (c.status === 'voting') {
            voteBtns = '<div class="row" style="margin-top:8px;"><button class="btn" style="padding:6px 12px;font-size:.78rem;" onclick="candVote(\'' + esc(c.addr) + '\',\'yes\')">' + N.t('arb.vote.yes') + '</button>' +
              '<button class="btn" style="padding:6px 12px;font-size:.78rem;" onclick="candVote(\'' + esc(c.addr) + '\',\'no\')">' + N.t('arb.vote.no') + '</button>' +
              '<button class="btn" style="padding:6px 12px;font-size:.78rem;color:var(--accent);" onclick="candSettle(\'' + esc(c.addr) + '\')">结算</button></div>';
          }
          return '<div class="sf-item"><div class="sf-bar"><h4 class="mono">' + esc(c.addr) + '</h4><span class="badge ' + (c.status === 'voting' ? 'warn' : (c.status === 'passed' ? 'good' : 'bad')) + '">' + st + kind + '</span></div>' +
            '<div class="sf-sub">申请时间 ' + fmtTs(c.applied_at) + ' ｜ 赞成 ' + (c.votes.yes || 0) + ' ｜ 反对 ' + (c.votes.no || 0) + '</div>' + voteBtns + '</div>';
        }).join('');
      }
      var cases = await N.api('/api/arb/cases');
      var pc = document.getElementById('pubCases');
      var list = cases.cases || [];
      if (!list.length) { pc.innerHTML = '<p class="dim">' + N.t('arb.cases.empty') + '</p>'; }
      else {
        pc.innerHTML = list.map(function (c) {
          return '<div class="sf-item"><div class="sf-bar"><h4 class="mono">' + esc(c.id) + '</h4>' + statusBadge(c.status) + '</div>' +
            '<div class="sf-sub">' + N.t('arb.detail.trade') + ' ' + esc(c.trade_id) + ' ｜ ' + N.t('arb.mine.you') + ' ' + esc(c.buyer) +
            ' ｜ ' + N.t('arb.mine.seller') + ' ' + esc(c.seller) + ' ｜ 结果 ' + resText(c.result) +
            ' ｜ 发起 ' + fmtTs(c.filed_at) + '</div>' +
            '<button class="btn" style="padding:5px 12px;font-size:.76rem;margin-top:8px;" onclick="toggleDetail(\'pub-' + esc(c.id) + '\')">详情</button>' +
            '<div class="detail-box" id="pub-' + esc(c.id) + '"></div></div>';
        }).join('');
        list.forEach(function (c) { loadCaseDetail('pub-' + c.id, c.id, ''); });
      }
    }

    async function loadCaseDetail(boxId, cid, viewer) {
      var d = await N.api('/api/arb/cases/' + cid + (viewer ? '?viewer=' + encodeURIComponent(viewer) : ''));
      var box = document.getElementById(boxId);
      if (!box || d.error) return;
      var panelRows = (d.panel || []).map(function (p) {
        return '<div>#' + p.number + ' ｜ 投票 ' + (p.side ? (p.side === 'buyer' ? N.t('arb.vote.buyer') : N.t('arb.vote.seller')) : '未投票') + '</div>';
      }).join('');
      var secRows = '';
      if (d.second_panel && d.second_panel.length) {
        secRows = '<div style="margin-top:6px;"><b>二次仲裁：</b>' + d.second_panel.map(function (p) {
          return '#' + p.number + (p.side ? ' → ' + (p.side === 'buyer' ? N.t('arb.vote.buyer') : N.t('arb.vote.seller')) : '');
        }).join('，') + '</div>';
      }
      box.innerHTML = '<div>' + N.t('arb.detail.reason') + '：' + esc(d.reason) + '</div>' +
        '<div>' + N.t('arb.detail.evidence') + '：<span class="mono">' + esc(d.evidence || '-') + '</span></div>' +
        '<div>保证金 ' + d.deposit + ' NOVA ｜ 冻结卖家 ' + d.seller_frozen + ' NOVA</div>' +
        (d.decided_at ? '<div>裁决时间 ' + fmtTs(d.decided_at) + '</div>' : '') +
        (d.second_result ? '<div>二次仲裁结果：' + resText(d.second_result) + '</div>' : '') +
        '<div style="margin-top:6px;"><b>' + N.t('arb.detail.panel') + '：</b>' + (panelRows || '-') + '</div>' + secRows +
        '<div style="margin-top:6px;">' + (d.events || []).map(function (e) { return fmtTs(e.at) + ' ' + esc(e.msg); }).join('<br>') + '</div>';
    }

    async function renderUser() {
      var d = await N.api('/api/arb/user/' + encodeURIComponent(ME));
      USER = d;
      document.getElementById('cpDeposit').textContent = (d.deposit != null ? d.deposit : 10) + ' NOVA';
      var mine = (d.complaints || []).filter(function (c) { return c.buyer === ME; });
      var el = document.getElementById('myCases');
      if (!mine.length) { el.innerHTML = '<p class="dim">' + N.t('arb.mine.empty') + '</p>'; }
      else {
        el.innerHTML = mine.map(function (c) {
          var actions = '';
          if (c.status === 'pending_draw') {
            actions = '<button class="btn" style="padding:5px 12px;font-size:.76rem;margin-top:8px;" onclick="doDraw(\'' + esc(c.id) + '\')">' + N.t('arb.mine.draw') + '</button>';
          }
          if (c.status === 'decided' && c.appeal_deadline && Date.now() < c.appeal_deadline) {
            actions += '<button class="btn" style="padding:5px 12px;font-size:.76rem;margin-top:8px;" onclick="doSecond(\'' + esc(c.id) + '\')">' + N.t('arb.second.cta') + '</button>';
          }
          if (c.status === 'decided' && c.appeal_deadline) {
            actions += '<span class="sf-sub" style="display:block;margin-top:6px;">' + N.t('arb.second.window') + ' ' + fmtTs(c.appeal_deadline) + '</span>';
          }
          var myNum = c.my_number ? ' ｜ 您的匿名编号 #' + c.my_number : '';
          return '<div class="sf-item"><div class="sf-bar"><h4 class="mono">' + esc(c.id) + ' ｜ ' + esc(c.trade_id) + '</h4>' + statusBadge(c.status) + '</div>' +
            '<div class="sf-sub">' + esc(c.reason) + ' ｜ 结果 ' + resText(c.result) + myNum + ' ｜ 发起 ' + fmtTs(c.filed_at) + '</div>' +
            actions +
            '<button class="btn" style="padding:5px 12px;font-size:.76rem;margin-top:8px;" onclick="toggleDetail(\'mine-' + esc(c.id) + '\')">详情</button>' +
            '<div class="detail-box" id="mine-' + esc(c.id) + '"></div></div>';
        }).join('');
        mine.forEach(function (c) { loadCaseDetail('mine-' + c.id, c.id, ME); });
      }
    }

    async function renderArb() {
      var d = await N.api('/api/arb/panel/' + encodeURIComponent(ME));
      PANEL = d;
      var tab = document.getElementById('tabArb');
      var role = document.getElementById('roleCard');
      if (d.found) {
        tab.style.display = '';
        var statusText = d.status === 'active' ? N.t('arb.role.arbitrator') : N.t('arb.stats.status.' + d.status) || d.status;
        document.getElementById('roleTitle').textContent = N.t('arb.role.arbitrator');
        document.getElementById('roleDesc').textContent = statusText + ' ｜ ' + N.t('arb.stats.rep') + ' ' + d.rep +
          ' ｜ ' + N.t('arb.stats.cases') + ' ' + d.cases + ' ｜ ' + N.t('arb.stats.term') + ' ' + Math.floor(d.term_remaining_days || 0) + ' ' + N.t('arb.day');
        renderRoleActions(d);
        renderArbStats(d);
        renderPending(d.pending || []);
        renderRulings(d);
      } else {
        role.style.display = '';
        document.getElementById('roleTitle').textContent = N.t('arb.role.user');
        var desc = N.t('arb.complain.deposit') + ': ' + ((USER && USER.deposit) || 10) + ' NOVA';
        if (USER && USER.is_candidate) desc += ' ｜ ' + N.t('arb.cand.status.voting');
        if (USER && USER.banned) desc += ' ｜ ' + N.t('arb.stats.status.banned');
        if (USER && USER.malicious && USER.malicious.lock_until && Date.now() < USER.malicious.lock_until) desc += ' ｜ 密文交易受限 30 天';
        document.getElementById('roleDesc').textContent = desc;
        document.getElementById('roleActions').innerHTML = '';
      }
    }

    function renderRoleActions(d) {
      var box = document.getElementById('roleActions');
      var btns = [];
      if (d.status === 'active' && d.term_remaining_days <= 7 && d.term_remaining_days > 0) {
        btns.push('<button class="btn" onclick="doRenew()">' + N.t('arb.renew.cta') + '</button>');
      }
      if (d.status === 'active' || d.status === 'renewing') {
        btns.push('<button class="btn" onclick="doExit()">' + N.t('arb.exit.cta') + '</button>');
      }
      if (d.status === 'suspended' && !d.banned) {
        btns.push('<button class="btn primary" onclick="doReactivate()">' + N.t('arb.reactivate.cta') + '</button>');
      }
      box.innerHTML = btns.join(' ');
      if (d.status === 'leaving' || d.status === 'retired') {
        checkClaimable();
      }
    }

    async function checkClaimable() {
      var a = N.arbStore ? N.arbStore() : null;
      if (a && a.stake_pending[ME]) {
        var p = a.stake_pending[ME];
        if (Date.now() >= p[1]) {
          var btn = '<button class="btn primary" onclick="doClaim()">' + N.t('arb.claim.cta') + '</button>';
          document.getElementById('roleActions').innerHTML = btn;
        }
      }
    }

    function renderArbStats(d) {
      var s = d.status;
      var stCls = (s === 'banned' || s === 'suspended') ? 'bad' : (s === 'active' ? 'good' : 'dim');
      var statusLabel = N.t('arb.stats.status.' + s) || s;
      var el = document.getElementById('arbStatsBox');
      el.innerHTML = '<div class="sf-bar"><div><div class="big-rep">' + d.rep + '</div><div class="sf-sub">' + N.t('arb.stats.rep') + '</div></div>' +
        '<span class="badge ' + stCls + '">' + statusLabel + '</span></div>' +
        '<div class="sf-grid2" style="margin-top:12px;">' +
        stat2(N.t('arb.stats.revenue'), N.fmt(d.revenue) + ' NOVA') +
        stat2(N.t('arb.stats.cases'), d.cases + ' 案') +
        stat2(N.t('arb.myruling.accuracy'), d.accuracy + '%') +
        stat2(N.t('arb.stats.term'), Math.floor(d.term_remaining_days || 0) + ' ' + N.t('arb.day')) +
        stat2(N.t('arb.stats.stake'), N.fmt(d.stake) + ' NOVA') +
        stat2(N.t('arb.list.rep'), d.correct + ' / ' + d.cases) +
        '</div>';
    }
    function stat2(k, v) { return '<div class="sf-item" style="margin:0;"><div class="sf-sub">' + k + '</div><div style="font-weight:700;font-size:1.05rem;">' + v + '</div></div>'; }

    function renderPending(list) {
      var el = document.getElementById('pendingList');
      if (!list.length) { el.innerHTML = '<p class="dim">' + N.t('arb.work.empty') + '</p>'; return; }
      el.innerHTML = list.map(function (p) {
        var voted = p.voted ? '<span class="badge good">' + N.t('arb.work.voted') + '</span>' : '<span class="badge warn">#' + p.number + '</span>';
        var btns = '';
        if (!p.voted) {
          btns = '<div class="row" style="margin-top:8px;">' +
            '<button class="btn" style="padding:6px 12px;font-size:.78rem;" onclick="doVote(\'' + esc(p.case_id) + '\',\'' + p.number + '\',\'buyer\',' + p.stage + ')">' + N.t('arb.vote.buyer') + '</button>' +
            '<button class="btn" style="padding:6px 12px;font-size:.78rem;" onclick="doVote(\'' + esc(p.case_id) + '\',\'' + p.number + '\',\'seller\',' + p.stage + ')">' + N.t('arb.vote.seller') + '</button>' +
            '<button class="btn" style="padding:6px 12px;font-size:.78rem;color:var(--dim);" onclick="doDecline(\'' + esc(p.case_id) + '\')">' + N.t('arb.decline') + '</button></div>';
        }
        return '<div class="sf-item"><div class="sf-bar"><h4 class="mono">' + esc(p.case_id) + '</h4>' + voted + '</div>' +
          '<div class="sf-sub">' + N.t('arb.detail.trade') + ' ' + esc(p.trade_id) + ' ｜ ' + esc(p.reason) + '</div>' +
          '<div class="sf-sub">' + N.t('arb.work.deadline') + ' ' + fmtTs(p.deadline) + (p.stage === 2 ? ' ｜ 二次仲裁' : '') + '</div>' +
          btns + '</div>';
      }).join('');
    }

    function renderRulings(d) {
      var el = document.getElementById('myRulings');
      var hist = d.history || [];
      if (!hist.length) { el.innerHTML = '<p class="dim">' + N.t('arb.myruling.empty') + '</p>'; return; }
      el.innerHTML = hist.map(function (h) {
        return '<div class="sf-item"><div class="sf-bar"><h4 class="mono">' + esc(h.case_id || '-') + '</h4><span class="sf-sub">' + fmtTs(h.at) + '</span></div>' +
          '<div class="sf-sub">' + esc(h.kind) + (h.side ? ' ｜ ' + (h.side === 'buyer' ? N.t('arb.vote.buyer') : N.t('arb.vote.seller')) : '') + '</div></div>';
      }).join('');
    }

    /* ---------- 操作 ---------- */
    function needWallet() {
      if (N.getState().connected) return true;
      N.toast(N.t('arb.toast.fail') + ': ' + N.t('chip.connect'));
      return false;
    }
    async function run(op, fields, amount, okMsg) {
      if (!needWallet()) return;
      var r = await N.sfAction(op, fields || {}, amount || 0);
      if (r && r.ok) { N.toast((okMsg || N.t('arb.toast.ok')) + (r.demo ? '' : '')); }
      else { N.toast(N.t('arb.toast.fail') + ': ' + ((r && r.error) || '')); }
      await loadAll();
    }
    function doApply() { run('nova:arb:apply', {}, 500, N.t('arb.cand.apply.cta')); }
    function candVote(addr, side) { run('nova:arb:candidate_vote', { candidate: addr, side: side }); }
    function candSettle(addr) { run('nova:arb:candidate_settle', { candidate: addr }); }
    function doDraw(cid) { run('nova:arb:draw', { case_id: cid }); }
    function doSecond(cid) { run('nova:arb:second', { case_id: cid }, 50); }
    function doVote(cid, num, side, stage) { run('nova:arb:vote', { case_id: cid, number: num, side: side, stage: stage || 1 }); }
    function doDecline(cid) { run('nova:arb:decline', { case_id: cid }); }
    function doRenew() { run('nova:arb:renew', {}); }
    function doExit() { run('nova:arb:exit', {}); }
    function doReactivate() { run('nova:arb:reactivate', {}, 500); }
    function doClaim() { run('nova:arb:claim_stake', {}); }
    function doComplain() {
      var trade = document.getElementById('cpTrade').value.trim();
      var seller = document.getElementById('cpSeller').value.trim();
      var reason = document.getElementById('cpReason').value.trim();
      var evidence = document.getElementById('cpEvidence').value.trim();
      if (!trade || !seller || !reason) { N.toast(N.t('arb.toast.fail') + ': ' + N.t('arb.complain.trade')); return; }
      var deposit = (USER && USER.deposit) || 10;
      run('nova:arb:complain', { trade_id: trade, seller: seller, reason: reason, evidence: evidence }, deposit);
    }

    function toggleDetail(id) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('open');
    }

    /* ---------- 通知系统：轮询 + 网页弹窗 ---------- */
    var POLLING = false;
    async function pollNotifs(initial) {
      if (!ME || POLLING) return;
      POLLING = true;
      try {
        var d = await N.api('/api/arb/notifications/' + encodeURIComponent(ME));
        var list = d.notifications || [];
        UNREAD = list.filter(function (n) { return !n.read; }).length;
        var dot = document.getElementById('bellDot');
        if (UNREAD > 0) { dot.style.display = 'flex'; dot.textContent = UNREAD > 99 ? '99+' : UNREAD; }
        else { dot.style.display = 'none'; }
        if (!initial) {
          list.forEach(function (n) {
            if (!n.read && !SEEN[n.id]) {
              SEEN[n.id] = 1;
              N.openModal({
                title: N.t('arb.notify.popup') + ' · ' + n.title,
                body: '<p class="dim" style="line-height:1.8;">' + esc(n.body) + '</p>',
                actions: [{ label: 'OK', cls: 'primary', onClick: function () { N.closeModal(); } }]
              });
            }
          });
        }
        list.forEach(function (n) { SEEN[n.id] = 1; });
      } catch (e) { console.error(e); }
      POLLING = false;
    }
    function openNotifPanel() {
      if (!ME) { N.toast(N.t('chip.connect')); return; }
      N.api('/api/arb/notifications/' + encodeURIComponent(ME)).then(function (d) {
        var list = d.notifications || [];
        var body = list.length ? list.map(function (n) {
          return '<div class="sf-item" style="margin-bottom:8px;"><div class="sf-bar"><b>' + esc(n.title) + '</b>' +
            (n.read ? '<span class="badge dim">已读</span>' : '<span class="badge warn">新</span>') + '</div>' +
            '<div class="sf-sub">' + esc(n.body) + '<br>' + fmtTs(n.at) + '</div></div>';
        }).join('') : '<p class="dim">' + N.t('arb.notif.empty') + '</p>';
        N.openModal({
          title: N.t('arb.notif.title') + ' (' + UNREAD + ')',
          body: '<div style="max-height:380px;overflow:auto;">' + body + '</div>',
          actions: [
            { label: N.t('arb.notif.markread'), onClick: function () {
              N.api('/api/arb/notifications/read', 'POST', { addr: ME }).then(function () { N.closeModal(); pollNotifs(true); });
            } },
            { label: 'OK', cls: 'primary', onClick: function () { N.closeModal(); } }
          ]
        });
      });
    }

    /* ---------- 初始化 ---------- */
    document.addEventListener('nova-wallet', function () { loadAll(); });
    document.addEventListener('nova-lang', function () { applyI18nStatic(); });
    function applyI18nStatic() {
      var n = document.querySelectorAll('[data-i18n]');
      // applyI18n 由 apps-common 在 initLang 中处理静态节点；动态文本在此刷新
      loadAll();
    }
    N.init({
      active: 'arbitration',
      onReady: function () {
        loadAll();
        setInterval(function () { pollNotifs(false); }, 15000);
      }
    });
  