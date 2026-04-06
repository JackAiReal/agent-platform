<section class="intro-card" id="domain-manager-root">
  <style>
    .domain-manager-stack { display:grid; gap:18px; }
    .domain-summary-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
    .domain-stat { background:var(--surface-low); border:1px solid var(--line); border-radius:16px; padding:16px; }
    .domain-stat-label { color:var(--text-dim); font-size:12px; font-weight:700; }
    .domain-stat-value { margin-top:10px; font-size:26px; font-weight:800; }
    .domain-panel { background:var(--surface-low); border:1px solid var(--line); border-radius:18px; padding:18px; }
    .domain-panel-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; margin-bottom:14px; flex-wrap:wrap; }
    .domain-panel-title { margin:0; font-size:20px; font-weight:800; }
    .domain-panel-subtitle { margin-top:6px; color:var(--text-dim); font-size:12px; line-height:1.7; }
    .domain-status { padding:12px 14px; border-radius:14px; border:1px solid var(--line); background:var(--surface); color:var(--text-dim); font-size:13px; line-height:1.7; }
    .domain-status.success { border-color:rgba(61,220,151,.35); color:var(--success); }
    .domain-status.error { border-color:rgba(255,107,107,.35); color:var(--danger); }
    .domain-form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px 16px; }
    .domain-form-field { display:grid; gap:8px; }
    .domain-form-field label { font-size:12px; color:var(--text-dim); font-weight:700; }
    .domain-form-field input, .domain-form-field textarea { width:100%; background:var(--surface); color:var(--text); border:1px solid var(--line); border-radius:14px; padding:12px 14px; }
    .domain-form-field textarea { min-height:84px; resize:vertical; }
    .domain-check-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .domain-check-item { display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:14px; border:1px solid var(--line); background:var(--surface); }
    .domain-check-item input { width:18px; height:18px; }
    .domain-actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:16px; }
    .domain-actions .btn-secondary, .domain-actions .btn-primary { width:auto; }
    .domain-table-tools { display:flex; gap:10px; flex-wrap:wrap; }
    .domain-pill-row { display:flex; gap:8px; flex-wrap:wrap; }
    .domain-pill { display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border-radius:999px; background:var(--surface-mid); color:var(--text-dim); font-size:11px; font-weight:700; }
    .domain-pill.primary { background:var(--primary-soft); color:var(--primary); }
    .domain-pill.success { background:rgba(61,220,151,.12); color:var(--success); }
    .domain-cell-note { font-size:12px; color:var(--text-dim); line-height:1.6; white-space:pre-wrap; }
    .domain-table-actions { display:flex; gap:8px; flex-wrap:wrap; }
    .domain-table-actions button { border:1px solid var(--line); background:var(--surface); color:var(--text); border-radius:12px; padding:8px 10px; cursor:pointer; }
    .domain-table-actions button.danger { color:var(--danger); border-color:rgba(255,107,107,.35); }
    .domain-empty { padding:16px; border:1px dashed var(--line); border-radius:16px; color:var(--text-dim); line-height:1.7; }
    @media (max-width:920px) {
      .domain-summary-grid, .domain-form-grid, .domain-check-grid { grid-template-columns:1fr; }
    }
  </style>

  <div class="domain-manager-stack">
    <div>
      <h1>根域名管理</h1>
      <p>这里用于把你自己的根域名加入接码平台，不再依赖手改代码。保存后会自动同步到 OpenTrashmail 的 `DOMAINS`，并重载收信服务。</p>
    </div>

    <div id="domain-manager-status" class="domain-status">正在加载域名配置…</div>

    <div class="domain-summary-grid">
      <div class="domain-stat">
        <div class="domain-stat-label">启用根域名</div>
        <div class="domain-stat-value" id="stat-enabled-count">0</div>
      </div>
      <div class="domain-stat">
        <div class="domain-stat-label">手动可选</div>
        <div class="domain-stat-value" id="stat-manual-count">0</div>
      </div>
      <div class="domain-stat">
        <div class="domain-stat-label">参与随机分配</div>
        <div class="domain-stat-value" id="stat-random-count">0</div>
      </div>
      <div class="domain-stat">
        <div class="domain-stat-label">默认根域名</div>
        <div class="domain-stat-value" id="stat-default-domain" style="font-size:20px;">--</div>
      </div>
    </div>

    <div class="domain-panel">
      <div class="domain-panel-head">
        <div>
          <h2 class="domain-panel-title">域名列表</h2>
          <div class="domain-panel-subtitle">这里显示当前接码平台已接入的根域名。泛子域名接收由每个根域名单独控制。</div>
        </div>
        <div class="domain-table-tools">
          <button class="btn-secondary" type="button" onclick="DomainRegistryUI.reload()">刷新列表</button>
          <button class="btn-primary" type="button" onclick="DomainRegistryUI.prepareNew()">新增根域名</button>
        </div>
      </div>

      <div class="mail-table-wrap">
        <table class="mail-table">
          <thead>
            <tr>
              <th>根域名</th>
              <th>状态</th>
              <th>策略</th>
              <th>备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="domain-table-body">
            <tr>
              <td colspan="5" class="domain-empty">正在读取域名配置…</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="domain-panel">
      <div class="domain-panel-head">
        <div>
          <h2 class="domain-panel-title" id="domain-form-title">新增根域名</h2>
          <div class="domain-panel-subtitle">这里只填根域名本身，例如 `example.com`。不要填写 `*.example.com`。</div>
        </div>
      </div>

      <div class="domain-form-grid">
        <div class="domain-form-field">
          <label for="domain-root-input">根域名</label>
          <input id="domain-root-input" type="text" placeholder="example.com">
        </div>
        <div class="domain-form-field">
          <label for="domain-weight-input">权重</label>
          <input id="domain-weight-input" type="number" min="1" max="10000" value="100">
        </div>
      </div>

      <div class="domain-check-grid" style="margin-top:16px;">
        <label class="domain-check-item"><input id="domain-enabled-input" type="checkbox" checked><span>启用收信</span></label>
        <label class="domain-check-item"><input id="domain-default-input" type="checkbox"><span>设为默认根域名</span></label>
        <label class="domain-check-item"><input id="domain-wildcard-input" type="checkbox" checked><span>启用泛子域名接收</span></label>
        <label class="domain-check-item"><input id="domain-random-input" type="checkbox" checked><span>参与随机分配</span></label>
        <label class="domain-check-item"><input id="domain-manual-input" type="checkbox" checked><span>允许手动选择</span></label>
      </div>

      <div class="domain-form-field" style="margin-top:16px;">
        <label for="domain-note-input">备注</label>
        <textarea id="domain-note-input" placeholder="例如：客户 A / 主域名 / 用于随机子域名邮箱"></textarea>
      </div>

      <div class="domain-actions">
        <button class="btn-primary" type="button" onclick="DomainRegistryUI.upsertFromForm()">加入列表</button>
        <button class="btn-secondary" type="button" onclick="DomainRegistryUI.resetForm()">清空表单</button>
        <button class="btn-secondary" type="button" onclick="DomainRegistryUI.saveAll()">保存并应用到平台</button>
      </div>
    </div>
  </div>

  <script>
    (function () {
      const state = {
        domains: [],
        editingId: "",
      };

      const els = {
        status: document.getElementById("domain-manager-status"),
        tableBody: document.getElementById("domain-table-body"),
        formTitle: document.getElementById("domain-form-title"),
        statEnabled: document.getElementById("stat-enabled-count"),
        statManual: document.getElementById("stat-manual-count"),
        statRandom: document.getElementById("stat-random-count"),
        statDefault: document.getElementById("stat-default-domain"),
        root: document.getElementById("domain-root-input"),
        weight: document.getElementById("domain-weight-input"),
        enabled: document.getElementById("domain-enabled-input"),
        isDefault: document.getElementById("domain-default-input"),
        wildcard: document.getElementById("domain-wildcard-input"),
        random: document.getElementById("domain-random-input"),
        manual: document.getElementById("domain-manual-input"),
        note: document.getElementById("domain-note-input"),
      };

      function normalizeDomain(value) {
        return String(value || "").trim().toLowerCase().replace(/^\*\./, "").replace(/^[@.]+/, "").replace(/\.+$/, "");
      }

      function setStatus(message, tone) {
        els.status.textContent = message;
        els.status.className = "domain-status" + (tone ? " " + tone : "");
      }

      function syncSummary(summary) {
        els.statEnabled.textContent = String(summary?.enabled_root_count ?? 0);
        els.statManual.textContent = String(summary?.manual_selectable_count ?? 0);
        els.statRandom.textContent = String(summary?.random_assignable_count ?? 0);
        els.statDefault.textContent = summary?.default_domain || "--";
      }

      function syncWorkspaceDomainPicker() {
        if (!window.parent || !window.parent.WorkspaceUI) {
          return;
        }
        const enabledManualDomains = state.domains
          .filter((item) => item.enabled && item.allow_manual_selection)
          .map((item) => String(item.root_domain || "").trim().toLowerCase())
          .filter(Boolean);
        const profiles = state.domains
          .filter((item) => item.enabled && item.allow_manual_selection)
          .map((item) => ({
            root_domain: String(item.root_domain || "").trim().toLowerCase(),
            wildcard_enabled: Boolean(item.wildcard_enabled),
            allow_random_assignment: Boolean(item.allow_random_assignment),
            is_default: Boolean(item.is_default),
          }));
        window.parent.WorkspaceUI.applyDomainRegistry(enabledManualDomains, profiles);
      }

      function resetForm() {
        state.editingId = "";
        els.formTitle.textContent = "新增根域名";
        els.root.value = "";
        els.weight.value = "100";
        els.enabled.checked = true;
        els.isDefault.checked = false;
        els.wildcard.checked = true;
        els.random.checked = true;
        els.manual.checked = true;
        els.note.value = "";
      }

      function renderTable() {
        if (!state.domains.length) {
          els.tableBody.innerHTML = '<tr><td colspan="5" class="domain-empty">当前还没有根域名记录。你可以先在下方表单新增一个，再点“保存并应用到平台”。</td></tr>';
          return;
        }
        els.tableBody.innerHTML = state.domains.map((item) => {
          const statusRow = [
            item.enabled ? '<span class="domain-pill success">启用收信</span>' : '<span class="domain-pill">已停用</span>',
            item.is_default ? '<span class="domain-pill primary">默认</span>' : '',
          ].join('');
          const policyRow = [
            item.wildcard_enabled ? '<span class="domain-pill primary">泛子域名</span>' : '<span class="domain-pill">仅根域名</span>',
            item.allow_random_assignment ? '<span class="domain-pill success">随机分配</span>' : '<span class="domain-pill">不参与随机</span>',
            item.allow_manual_selection ? '<span class="domain-pill success">手动可选</span>' : '<span class="domain-pill">隐藏于下拉</span>',
            '<span class="domain-pill">权重 ' + item.weight + '</span>',
          ].join('');
          return `
            <tr>
              <td><strong>${item.root_domain}</strong></td>
              <td><div class="domain-pill-row">${statusRow}</div></td>
              <td><div class="domain-pill-row">${policyRow}</div></td>
              <td><div class="domain-cell-note">${item.note ? item.note.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "—"}</div></td>
              <td>
                <div class="domain-table-actions">
                  <button type="button" onclick="DomainRegistryUI.edit('${item.id}')">编辑</button>
                  <button type="button" onclick="DomainRegistryUI.setDefault('${item.id}')">设为默认</button>
                  <button type="button" class="danger" onclick="DomainRegistryUI.remove('${item.id}')">删除</button>
                </div>
              </td>
            </tr>`;
        }).join("");
      }

      async function request(url, options) {
        const response = await fetch(url, Object.assign({
          headers: {
            "Accept": "application/json",
          },
        }, options || {}));
        const data = await response.json().catch(() => ({ ok: false, message: "invalid_response" }));
        if (!response.ok || data.ok === false) {
          throw new Error(data.message || "请求失败");
        }
        return data;
      }

      async function reload() {
        setStatus("正在读取根域名配置…");
        try {
          const data = await request("/api/domain-registry");
          state.domains = Array.isArray(data.registry?.domains) ? data.registry.domains.slice() : [];
          renderTable();
          syncSummary(data.summary || {});
          syncWorkspaceDomainPicker();
          setStatus("根域名配置已加载，可以继续新增、编辑并保存。", "success");
        } catch (error) {
          setStatus("读取域名配置失败：" + error.message, "error");
        }
      }

      function buildEntryFromForm() {
        const rootDomain = normalizeDomain(els.root.value);
        if (!rootDomain) {
          throw new Error("请输入根域名");
        }
        return {
          id: state.editingId || rootDomain.replace(/[^a-z0-9]+/g, "_"),
          root_domain: rootDomain,
          enabled: els.enabled.checked,
          is_default: els.isDefault.checked,
          wildcard_enabled: els.wildcard.checked,
          allow_random_assignment: els.random.checked,
          allow_manual_selection: els.manual.checked,
          weight: Number(els.weight.value || 100),
          note: String(els.note.value || "").trim(),
        };
      }

      function upsertFromForm() {
        try {
          const next = buildEntryFromForm();
          state.domains = state.domains.filter((item) => item.root_domain !== next.root_domain && item.id !== state.editingId);
          if (next.is_default) {
            state.domains = state.domains.map((item) => ({ ...item, is_default: false }));
          }
          state.domains.unshift(next);
          renderTable();
          resetForm();
          setStatus("已加入本地待保存列表，点“保存并应用到平台”后才会真正生效。", "success");
        } catch (error) {
          setStatus(error.message, "error");
        }
      }

      function edit(id) {
        const item = state.domains.find((entry) => entry.id === id);
        if (!item) {
          return;
        }
        state.editingId = item.id;
        els.formTitle.textContent = "编辑根域名";
        els.root.value = item.root_domain || "";
        els.weight.value = String(item.weight || 100);
        els.enabled.checked = Boolean(item.enabled);
        els.isDefault.checked = Boolean(item.is_default);
        els.wildcard.checked = Boolean(item.wildcard_enabled);
        els.random.checked = Boolean(item.allow_random_assignment);
        els.manual.checked = Boolean(item.allow_manual_selection);
        els.note.value = item.note || "";
        els.root.focus();
      }

      function remove(id) {
        const item = state.domains.find((entry) => entry.id === id);
        if (!item) {
          return;
        }
        if (!window.confirm("确认删除根域名 " + item.root_domain + " 吗？保存后才会真正应用。")) {
          return;
        }
        state.domains = state.domains.filter((entry) => entry.id !== id);
        renderTable();
        setStatus("已从待保存列表移除。保存并应用后平台才会同步删除。", "success");
      }

      function setDefault(id) {
        state.domains = state.domains.map((item) => ({ ...item, is_default: item.id === id }));
        renderTable();
        setStatus("默认根域名已切换，保存并应用后平台才会真正同步。", "success");
      }

      async function saveAll() {
        setStatus("正在保存并同步到 OpenTrashmail，这一步会重载收信服务…");
        try {
          const data = await request("/api/domain-registry/save", {
            method: "POST",
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ domains: state.domains }),
          });
          state.domains = Array.isArray(data.registry?.domains) ? data.registry.domains.slice() : [];
          renderTable();
          syncSummary(data.summary || {});
          syncWorkspaceDomainPicker();
          resetForm();
          setStatus((data.message || "根域名配置已应用。") + " OpenTrashmail 已按新 DOMAINS 重载。", "success");
        } catch (error) {
          setStatus("保存失败：" + error.message, "error");
        }
      }

      window.DomainRegistryUI = {
        reload,
        prepareNew: resetForm,
        resetForm,
        upsertFromForm,
        edit,
        remove,
        setDefault,
        saveAll,
      };

      resetForm();
      reload();
    })();
  </script>
</section>
