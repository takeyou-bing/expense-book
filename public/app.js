(() => {
  const $ = (sel) => document.querySelector(sel);
  const won = (n) => Number(n).toLocaleString('ko-KR') + '원';

  function localDate(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      credentials: 'same-origin',
    });
    if (res.status === 401 && path !== '/api/login') {
      showLogin();
      throw new Error('로그인이 필요합니다.');
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
    return data;
  }

  /* ---------- 상태 ---------- */
  const state = { filter: {}, categories: [] };

  /* ---------- 로그인 ---------- */
  function showLogin() {
    $('#app-view').hidden = true;
    $('#login-view').hidden = false;
    $('#login-password').value = '';
    $('#login-password').focus();
  }

  async function showApp() {
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    await init();
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-error').textContent = '';
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('#login-password').value }) });
      await showApp();
    } catch (err) {
      $('#login-error').textContent = err.message;
    }
  });

  $('#logout-btn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    showLogin();
  });

  /* ---------- 초기화 ---------- */
  let initialized = false;
  async function init() {
    if (!initialized) {
      state.categories = await api('/api/categories');
      $('#f-category').innerHTML = state.categories.map((c) => `<option>${escapeHtml(c)}</option>`).join('');
      const thisYear = new Date().getFullYear();
      $('#m-year').innerHTML = [`<option value="">전체 연도</option>`]
        .concat(Array.from({ length: 6 }, (_, i) => thisYear - i).map((y) => `<option value="${y}">${y}년</option>`))
        .join('');
      $('#m-year').value = String(thisYear);
      $('#c-month').value = localDate().slice(0, 7);
      initialized = true;
    }
    resetForm();
    await refreshAll();
  }

  async function refreshAll() {
    await Promise.all([loadExpenses(), loadMonthly(), loadCategory()]);
  }

  /* ---------- 지출 내역 ---------- */
  async function loadExpenses() {
    const params = new URLSearchParams();
    const { from, to } = state.filter;
    if (from && to && from === to) params.set('date', from);
    else {
      if (from) params.set('from', from);
      if (to) params.set('to', to);
    }
    const rows = await api('/api/expenses' + (params.toString() ? `?${params}` : ''));
    renderExpenses(rows);
  }

  function renderExpenses(rows) {
    const tbody = $('#expense-rows');
    if (!rows.length) {
      tbody.innerHTML = '<tr class="empty"><td colspan="5">지출 내역이 없습니다.</td></tr>';
    } else {
      tbody.innerHTML = rows.map((r) => `
        <tr>
          <td>${r.spent_on}</td>
          <td>${escapeHtml(r.item)}</td>
          <td><span class="tag">${escapeHtml(r.category)}</span></td>
          <td class="num">${won(r.amount)}</td>
          <td class="actions">
            <button class="btn small ghost" data-edit="${r.id}">수정</button>
            <button class="btn small ghost danger" data-del="${r.id}">삭제</button>
          </td>
        </tr>`).join('');
    }
    state.rows = rows;
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    const { from, to } = state.filter;
    const range = from || to ? `${from || '처음'} ~ ${to || '현재'}` : '전체 기간';
    $('#list-summary').textContent = `${range} · ${rows.length}건 · 합계 ${won(total)}`;
  }

  $('#expense-rows').addEventListener('click', async (e) => {
    const editId = e.target.dataset.edit;
    const delId = e.target.dataset.del;
    if (editId) {
      const r = state.rows.find((x) => String(x.id) === editId);
      if (r) startEdit(r);
    } else if (delId) {
      const r = state.rows.find((x) => String(x.id) === delId);
      if (!confirm(`'${r ? r.item : ''}' 내역을 삭제할까요?`)) return;
      try {
        await api(`/api/expenses/${delId}`, { method: 'DELETE' });
        if ($('#expense-id').value === delId) resetForm();
        await refreshAll();
      } catch (err) {
        alert(err.message);
      }
    }
  });

  /* ---------- 검색 ---------- */
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const from = $('#s-from').value;
    const to = $('#s-to').value;
    if (from && to && from > to) {
      alert('시작 날짜가 종료 날짜보다 늦습니다.');
      return;
    }
    state.filter = { from, to };
    loadExpenses().catch((err) => alert(err.message));
  });

  $('#s-today').addEventListener('click', () => {
    const today = localDate();
    $('#s-from').value = today;
    $('#s-to').value = today;
    state.filter = { from: today, to: today };
    loadExpenses().catch((err) => alert(err.message));
  });

  $('#s-reset').addEventListener('click', () => {
    $('#s-from').value = '';
    $('#s-to').value = '';
    state.filter = {};
    loadExpenses().catch((err) => alert(err.message));
  });

  /* ---------- 추가 / 수정 ---------- */
  function resetForm() {
    $('#expense-id').value = '';
    $('#f-date').value = localDate();
    $('#f-item').value = '';
    $('#f-amount').value = '';
    $('#f-category').selectedIndex = 0;
    $('#form-title').textContent = '지출 추가';
    $('#submit-btn').textContent = '추가';
    $('#cancel-edit').hidden = true;
    $('#form-error').textContent = '';
  }

  function startEdit(r) {
    $('#expense-id').value = r.id;
    $('#f-date').value = r.spent_on;
    $('#f-item').value = r.item;
    $('#f-category').value = r.category;
    $('#f-amount').value = r.amount;
    $('#form-title').textContent = '지출 수정';
    $('#submit-btn').textContent = '저장';
    $('#cancel-edit').hidden = false;
    $('#form-error').textContent = '';
    $('#f-item').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $('#cancel-edit').addEventListener('click', resetForm);

  $('#expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#form-error').textContent = '';
    const id = $('#expense-id').value;
    const body = JSON.stringify({
      spent_on: $('#f-date').value,
      item: $('#f-item').value,
      category: $('#f-category').value,
      amount: Number($('#f-amount').value),
    });
    const btn = $('#submit-btn');
    btn.disabled = true;
    try {
      if (id) await api(`/api/expenses/${id}`, { method: 'PUT', body });
      else await api('/api/expenses', { method: 'POST', body });
      resetForm();
      await refreshAll();
    } catch (err) {
      $('#form-error').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------- 월별 합계 ---------- */
  async function loadMonthly() {
    const year = $('#m-year').value;
    const rows = await api('/api/summary/monthly' + (year ? `?year=${year}` : ''));
    $('#monthly-rows').innerHTML = rows.length
      ? rows.map((r) => `<tr><td>${r.month.replace('-', '년 ')}월</td><td class="num">${r.count}</td><td class="num">${won(r.total)}</td></tr>`).join('')
      : '<tr class="empty"><td colspan="3">데이터가 없습니다.</td></tr>';
    $('#monthly-count').textContent = rows.reduce((s, r) => s + Number(r.count), 0);
    $('#monthly-total').textContent = won(rows.reduce((s, r) => s + Number(r.total), 0));
  }
  $('#m-year').addEventListener('change', () => loadMonthly().catch((err) => alert(err.message)));

  /* ---------- 카테고리별 합계 + 막대그래프 ---------- */
  async function loadCategory() {
    const month = $('#c-month').value;
    const rows = await api('/api/summary/category' + (month ? `?month=${month}` : ''));
    renderCategory(rows, month);
  }
  $('#c-month').addEventListener('change', () => loadCategory().catch((err) => alert(err.message)));

  function renderCategory(rows, month) {
    const total = rows.reduce((s, r) => s + Number(r.total), 0);
    const max = Math.max(0, ...rows.map((r) => Number(r.total)));
    const label = month ? `${month.replace('-', '년 ')}월` : '전체 기간';
    $('#cat-total').textContent = `${label} 총 지출 ${won(total)}`;

    const chart = $('#cat-chart');
    if (!rows.length) {
      chart.innerHTML = '<div class="bar-empty">이 기간의 지출이 없습니다.</div>';
    } else {
      chart.innerHTML = rows.map((r, i) => {
        const pct = max ? (Number(r.total) / max) * 100 : 0;
        return `<div class="bar-row" data-i="${i}">
          <span class="bar-label">${escapeHtml(r.category)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <span class="bar-value">${won(r.total)}</span>
        </div>`;
      }).join('');
    }

    $('#cat-rows').innerHTML = rows.length
      ? rows.map((r) => `<tr><td>${escapeHtml(r.category)}</td><td class="num">${r.count}</td><td class="num">${won(r.total)}</td>
          <td class="num">${total ? ((Number(r.total) / total) * 100).toFixed(1) : 0}%</td></tr>`).join('')
      : '<tr class="empty"><td colspan="4">데이터가 없습니다.</td></tr>';

    // 막대 hover 툴팁
    const tip = $('#tooltip');
    chart.onmousemove = (e) => {
      const row = e.target.closest('.bar-row');
      if (!row) { tip.hidden = true; return; }
      const r = rows[Number(row.dataset.i)];
      const share = total ? ((Number(r.total) / total) * 100).toFixed(1) : 0;
      tip.textContent = `${r.category} · ${won(r.total)} · ${r.count}건 · ${share}%`;
      tip.hidden = false;
      const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
      tip.style.left = `${x}px`;
      tip.style.top = `${e.clientY + 14}px`;
    };
    chart.onmouseleave = () => { tip.hidden = true; };
  }

  /* ---------- 시작 ---------- */
  api('/api/session')
    .then(({ authenticated }) => (authenticated ? showApp() : showLogin()))
    .catch(() => showLogin());
})();
