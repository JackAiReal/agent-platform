const tabs = document.querySelectorAll('.tab');
const menus = document.querySelectorAll('.menu');

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
    <div>${item.content}</div>
    ${item.imageUrl ? `<img src="${item.imageUrl}" alt="entry image" />` : ''}
  `;
  return div;
}

async function loadList(type) {
  const box = document.getElementById(`list-${type}`);
  box.innerHTML = '加载中...';
  const data = await request(`/api/entries?type=${type}`);
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

function bindForm(type) {
  const form = document.getElementById(`form-${type}`);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      type,
      title: fd.get('title'),
      content: fd.get('content'),
      imageUrl: fd.get('imageUrl') || '',
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

bindForm('diary');
bindForm('output');
bindForm('cost');

Promise.all([
  loadSummary(),
  loadList('diary'),
  loadList('output'),
  loadList('cost'),
]);
