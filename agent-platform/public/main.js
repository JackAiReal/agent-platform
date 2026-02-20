const tabs = document.querySelectorAll('.tab');
const menus = document.querySelectorAll('.menu');
const modal = document.getElementById('detail-modal');
const modalBody = document.getElementById('modal-body');

const statusText = {
  pending: '待审核',
  approved: '已通过',
  rejected: '需修改',
};

let cachedLists = { diary: [], output: [], cost: [] };

function setModal(open) {
  if (open) modal.classList.remove('hidden');
  else modal.classList.add('hidden');
}

document.getElementById('modal-close').addEventListener('click', () => setModal(false));
modal.addEventListener('click', (e) => {
  if (e.target === modal) setModal(false);
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await fetch('/logout', { method: 'POST' });
  location.href = '/login';
});

menus.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    if (!target) return;
    menus.forEach((m) => m.classList.remove('active'));
    tabs.forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(target).classList.add('active');
  });
});

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function badge(status) {
  const s = status || 'pending';
  return `<span class="badge ${s}">${statusText[s]}</span>`;
}

async function updateReview(id, reviewStatus, reviewNote) {
  await request(`/api/entries/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ reviewStatus, reviewNote }),
  });
  await refreshAll();
}

function openDetail(item) {
  const costInfo = item.type === 'cost'
    ? `<div class="meta">费用: ${item.costMoney || 0} 元 | 时间: ${item.costTimeMinutes || 0} 分钟</div>`
    : '';

  modalBody.innerHTML = `
    <h2>${item.title}</h2>
    ${badge(item.reviewStatus)}
    <div class="meta">${new Date(item.createdAt).toLocaleString()}</div>
    ${costInfo}
    ${item.type === 'diary' ? `<div class="meta">目标: ${item.goal || '-'} | 下一步: ${item.nextStep || '-'}</div>` : ''}
    ${(item.tags || []).length ? `<div class="meta">标签：${item.tags.join(' , ')}</div>` : ''}
    <p style="white-space: pre-wrap; line-height:1.6;">${item.content}</p>
    ${item.imageUrl ? `<img src="${item.imageUrl}" alt="entry image" style="max-width:100%;border-radius:8px;"/>` : ''}
    <hr style="margin:12px 0;border:0;border-top:1px solid #e5e7eb;" />
    <div style="display:grid;gap:8px;">
      <strong>审核操作</strong>
      <select id="review-status" style="padding:8px;border-radius:8px;border:1px solid #d1d5db;">
        <option value="pending" ${(item.reviewStatus || 'pending') === 'pending' ? 'selected' : ''}>待审核</option>
        <option value="approved" ${item.reviewStatus === 'approved' ? 'selected' : ''}>通过</option>
        <option value="rejected" ${item.reviewStatus === 'rejected' ? 'selected' : ''}>打回</option>
      </select>
      <textarea id="review-note" placeholder="审核批注" style="min-height:80px;padding:10px;border-radius:8px;border:1px solid #d1d5db;">${item.reviewNote || ''}</textarea>
      <button id="review-save" style="padding:10px;border:0;border-radius:8px;background:#111827;color:#fff;cursor:pointer;">保存审核结果</button>
    </div>
  `;

  setModal(true);
  document.getElementById('review-save').onclick = async () => {
    const reviewStatus = document.getElementById('review-status').value;
    const reviewNote = document.getElementById('review-note').value;
    await updateReview(item.id, reviewStatus, reviewNote);
    setModal(false);
  };
}

function renderEntry(item) {
  const div = document.createElement('div');
  div.className = 'entry-item';
  const costInfo = item.type === 'cost'
    ? `<div class="meta">费用: ${item.costMoney || 0} 元 | 时间: ${item.costTimeMinutes || 0} 分钟</div>`
    : '';
  div.innerHTML = `
    ${badge(item.reviewStatus)}
    <h3>${item.title}</h3>
    <div class="meta">${new Date(item.createdAt).toLocaleString()}</div>
    ${costInfo}
    ${(item.tags || []).length ? `<div class="meta">标签：${item.tags.join(' , ')}</div>` : ''}
    <div>${item.content.slice(0, 120)}${item.content.length > 120 ? '...' : ''}</div>
    ${item.imageUrl ? `<img src="${item.imageUrl}" alt="entry image" />` : ''}
  `;
  div.addEventListener('click', () => openDetail(item));
  return div;
}

function getFilters(type) {
  const qEl = document.getElementById(`q-${type}`);
  const dateEl = document.getElementById(`date-${type}`);
  const statusEl = document.getElementById(`status-${type}`);
  return {
    q: (qEl?.value || '').trim(),
    date: (dateEl?.value || '').trim(),
    reviewStatus: (statusEl?.value || '').trim(),
  };
}

async function loadList(type) {
  const box = document.getElementById(`list-${type}`);
  box.innerHTML = '加载中...';
  const f = getFilters(type);
  const params = new URLSearchParams({ type });
  if (f.q) params.set('q', f.q);
  if (f.date) params.set('date', f.date);
  if (f.reviewStatus) params.set('reviewStatus', f.reviewStatus);

  const data = await request(`/api/entries?${params.toString()}`);
  cachedLists[type] = data.entries || [];
  box.innerHTML = '';
  if (!data.entries.length) {
    box.innerHTML = '<div class="card">暂无记录</div>';
    return;
  }
  data.entries.forEach((item) => box.appendChild(renderEntry(item)));
}

function renderPendingQueue() {
  const wrap = document.getElementById('pending-list');
  const all = [...cachedLists.diary, ...cachedLists.output, ...cachedLists.cost];
  const rows = all
    .filter((e) => (e.reviewStatus || 'pending') === 'pending')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);

  if (!rows.length) {
    wrap.innerHTML = '<div class="pending-item">暂无待审核记录</div>';
    return;
  }
  wrap.innerHTML = rows
    .map((r) => `<div class="pending-item"><strong>${r.title}</strong><div class="meta">${new Date(r.createdAt).toLocaleString()}</div></div>`)
    .join('');
}

function drawTimelineChart(rows) {
  const canvas = document.getElementById('timeline-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.clientWidth || 500;
  const height = 120;
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  const values = rows.map((r) => r.diary + r.output + r.cost);
  const max = Math.max(1, ...values);
  const stepX = width / Math.max(1, rows.length - 1);

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#2563eb';
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = i * stepX;
    const y = height - (v / max) * (height - 16) - 8;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = '#1f2937';
  ctx.font = '11px sans-serif';
  ctx.fillText('14天记录趋势', 8, 12);
}

async function loadTimeline() {
  const data = await request('/api/timeline');
  drawTimelineChart(data.timeline || []);
}

async function loadSummary() {
  const s = await request('/api/summary');
  const wrap = document.getElementById('summary');
  wrap.innerHTML = `
    <div class="card"><strong>日记条数</strong><div>${s.diaryCount}</div></div>
    <div class="card"><strong>产出条数</strong><div>${s.outputCount}</div></div>
    <div class="card"><strong>待审核</strong><div>${s.pendingCount}</div></div>
    <div class="card"><strong>已通过</strong><div>${s.approvedCount}</div></div>
    <div class="card"><strong>需修改</strong><div>${s.rejectedCount}</div></div>
    <div class="card"><strong>费用总计</strong><div>${s.totalMoney.toFixed(2)} 元</div></div>
    <div class="card"><strong>时间总计</strong><div>${s.totalTimeMinutes} 分钟</div></div>
  `;
}

async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).imageUrl;
}

function parseTags(raw) {
  return String(raw || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function bindForm(type) {
  const form = document.getElementById(`form-${type}`);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    let imageUrl = (fd.get('imageUrl') || '').toString().trim();
    const file = fd.get('imageFile');
    if (file && file.size > 0) imageUrl = await uploadImage(file);

    const payload = {
      type,
      title: fd.get('title'),
      content: fd.get('content'),
      goal: fd.get('goal') || '',
      action: fd.get('action') || '',
      result: fd.get('result') || '',
      nextStep: fd.get('nextStep') || '',
      imageUrl,
      tags: parseTags(fd.get('tags')),
      costMoney: Number(fd.get('costMoney') || 0),
      costTimeMinutes: Number(fd.get('costTimeMinutes') || 0),
    };

    await request('/api/entries', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    await refreshAll();
  });
}

function bindFilter(type) {
  document.getElementById(`btn-${type}-filter`).addEventListener('click', () => loadList(type));
  document.getElementById(`btn-${type}-reset`).addEventListener('click', () => {
    document.getElementById(`q-${type}`).value = '';
    document.getElementById(`date-${type}`).value = '';
    const status = document.getElementById(`status-${type}`);
    if (status) status.value = '';
    loadList(type);
  });
}

function exportDiaryPdf(mode) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const now = new Date();
  const rows = cachedLists.diary || [];
  const list = rows.filter((e) => {
    const d = new Date(e.createdAt);
    if (mode === 'day') return d.toDateString() === now.toDateString();
    return (now - d) / (1000 * 60 * 60 * 24) <= 7;
  });

  let y = 15;
  doc.setFontSize(14);
  doc.text(mode === 'day' ? 'Agent 日报' : 'Agent 周报', 14, y);
  y += 8;
  doc.setFontSize(10);

  if (!list.length) {
    doc.text('暂无记录', 14, y);
  } else {
    list.forEach((item, idx) => {
      const text = `${idx + 1}. ${item.title} [${statusText[item.reviewStatus || 'pending']}]\n${item.content}`;
      const lines = doc.splitTextToSize(text, 180);
      if (y + lines.length * 5 > 280) {
        doc.addPage();
        y = 15;
      }
      doc.text(lines, 14, y);
      y += lines.length * 5 + 3;
    });
  }

  doc.save(mode === 'day' ? 'agent-daily-report.pdf' : 'agent-weekly-report.pdf');
}

document.getElementById('btn-export-day').addEventListener('click', () => exportDiaryPdf('day'));
document.getElementById('btn-export-week').addEventListener('click', () => exportDiaryPdf('week'));

async function refreshAll() {
  await Promise.all([
    loadSummary(),
    loadList('diary'),
    loadList('output'),
    loadList('cost'),
    loadTimeline(),
  ]);
  renderPendingQueue();
}

bindForm('diary');
bindForm('output');
bindForm('cost');
bindFilter('diary');
bindFilter('output');
bindFilter('cost');

refreshAll();
