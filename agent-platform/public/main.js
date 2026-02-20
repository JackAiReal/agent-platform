const tabs = document.querySelectorAll('.tab');
const menus = document.querySelectorAll('.menu');
const modal = document.getElementById('detail-modal');
const modalBody = document.getElementById('modal-body');

document.getElementById('modal-close').addEventListener('click', () => {
  modal.classList.add('hidden');
});
modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.classList.add('hidden');
});

menus.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
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
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function openDetail(item) {
  const costInfo = item.type === 'cost'
    ? `<div class="meta">费用: ${item.costMoney || 0} 元 | 时间: ${item.costTimeMinutes || 0} 分钟</div>`
    : '';
  modalBody.innerHTML = `
    <h2>${item.title}</h2>
    <div class="meta">${new Date(item.createdAt).toLocaleString()}</div>
    ${costInfo}
    <p style="white-space: pre-wrap; line-height:1.6;">${item.content}</p>
    ${item.imageUrl ? `<img src="${item.imageUrl}" alt="entry image" style="max-width:100%;border-radius:8px;"/>` : ''}
  `;
  modal.classList.remove('hidden');
}

function renderEntry(item) {
  const div = document.createElement('div');
  div.className = 'entry-item';
  const costInfo = item.type === 'cost'
    ? `<div class="meta">费用: ${item.costMoney || 0} 元 | 时间: ${item.costTimeMinutes || 0} 分钟</div>`
    : '';
  div.innerHTML = `
    <h3>${item.title}</h3>
    <div class="meta">${new Date(item.createdAt).toLocaleString()}</div>
    ${costInfo}
    <div>${item.content.slice(0, 120)}${item.content.length > 120 ? '...' : ''}</div>
    ${item.imageUrl ? `<img src="${item.imageUrl}" alt="entry image" />` : ''}
  `;
  div.addEventListener('click', () => openDetail(item));
  return div;
}

function getFilters(type) {
  const qEl = document.getElementById(`q-${type}`);
  const dateEl = document.getElementById(`date-${type}`);
  return {
    q: (qEl?.value || '').trim(),
    date: (dateEl?.value || '').trim(),
  };
}

let cachedLists = {
  diary: [],
  output: [],
  cost: [],
};

async function loadList(type) {
  const box = document.getElementById(`list-${type}`);
  box.innerHTML = '加载中...';
  const f = getFilters(type);
  const params = new URLSearchParams({ type });
  if (f.q) params.set('q', f.q);
  if (f.date) params.set('date', f.date);

  const data = await request(`/api/entries?${params.toString()}`);
  cachedLists[type] = data.entries || [];
  box.innerHTML = '';
  if (!data.entries.length) {
    box.innerHTML = '<div class="card">暂无记录</div>';
    return;
  }
  data.entries.forEach((item) => box.appendChild(renderEntry(item)));
}

async function loadSummary() {
  const s = await request('/api/summary');
  const wrap = document.getElementById('summary');
  wrap.innerHTML = `
    <div class="card"><strong>日记条数</strong><div>${s.diaryCount}</div></div>
    <div class="card"><strong>产出条数</strong><div>${s.outputCount}</div></div>
    <div class="card"><strong>费用总计</strong><div>${s.totalMoney.toFixed(2)} 元</div></div>
    <div class="card"><strong>时间总计</strong><div>${s.totalTimeMinutes} 分钟</div></div>
  `;
}

async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.imageUrl;
}

function bindForm(type) {
  const form = document.getElementById(`form-${type}`);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    let imageUrl = (fd.get('imageUrl') || '').toString().trim();
    const file = fd.get('imageFile');
    if (file && file.size > 0) {
      imageUrl = await uploadImage(file);
    }

    const payload = {
      type,
      title: fd.get('title'),
      content: fd.get('content'),
      imageUrl,
      costMoney: Number(fd.get('costMoney') || 0),
      costTimeMinutes: Number(fd.get('costTimeMinutes') || 0),
    };

    await request('/api/entries', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    form.reset();
    await Promise.all([loadList(type), loadSummary()]);
  });
}

function bindFilter(type) {
  document.getElementById(`btn-${type}-filter`).addEventListener('click', () => loadList(type));
  document.getElementById(`btn-${type}-reset`).addEventListener('click', () => {
    document.getElementById(`q-${type}`).value = '';
    document.getElementById(`date-${type}`).value = '';
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
    if (mode === 'day') {
      return d.toDateString() === now.toDateString();
    }
    const diff = (now - d) / (1000 * 60 * 60 * 24);
    return diff <= 7;
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
      const text = `${idx + 1}. ${item.title} | ${new Date(item.createdAt).toLocaleString()}\n${item.content}`;
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

bindForm('diary');
bindForm('output');
bindForm('cost');
bindFilter('diary');
bindFilter('output');
bindFilter('cost');

Promise.all([
  loadSummary(),
  loadList('diary'),
  loadList('output'),
  loadList('cost'),
]);
