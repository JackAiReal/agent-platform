<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mail Workspace</title>
  <link rel="stylesheet" href="/css/fontawesome.min.css">
  <style>
    :root { --bg:#111a22; --surface:#131d26; --surface-low:#17232d; --surface-mid:#1e2d38; --surface-high:#21313d; --line:#314654; --text:#e3edf5; --text-dim:#8ea5b6; --primary:#19a9e5; --primary-soft:rgba(25,169,229,.16); --success:#3ddc97; --danger:#ff6b6b; --card:#18242e; --white:#fff; --shadow:0 18px 40px rgba(0,0,0,.24); }
    * { box-sizing:border-box; }
    html,body { margin:0; min-height:100%; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    a { color:inherit; text-decoration:none; }
    button,input { font:inherit; }
    .app-shell { min-height:100vh; display:flex; flex-direction:column; background:var(--bg); }
    .topbar { height:68px; padding:0 24px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--line); background:var(--surface); position:sticky; top:0; z-index:30; }
    .brand { font-size:28px; font-weight:800; letter-spacing:-.02em; }
    .topbar-left,.topbar-right,.topbar-nav { display:flex; align-items:center; gap:18px; }
    .topbar-nav a { color:var(--text-dim); padding-bottom:4px; }
    .topbar-nav a.active { color:var(--primary); border-bottom:2px solid var(--primary); }
    .mode-badge { display:inline-flex; align-items:center; gap:8px; padding:6px 12px; border-radius:999px; background:var(--primary-soft); color:var(--primary); font-size:12px; font-weight:700; }
    .action-link { border:1px solid var(--line); background:var(--surface-mid); color:var(--text); border-radius:12px; padding:10px 14px; display:inline-flex; align-items:center; gap:8px; cursor:pointer; }
    .avatar { width:38px; height:38px; border-radius:12px; border:1px solid var(--line); overflow:hidden; background:var(--surface-low); box-shadow:var(--shadow); }
    .avatar img { width:100%; height:100%; object-fit:cover; display:block; }
    .body-shell { min-height:calc(100vh - 68px); display:grid; grid-template-columns:290px minmax(0,1fr); }
    .sidebar { border-right:1px solid var(--line); background:var(--surface-low); display:flex; flex-direction:column; min-width:0; }
    .sidebar-header,.sidebar-footer { padding:18px; border-bottom:1px solid var(--line); }
    .sidebar-footer { border-bottom:0; border-top:1px solid var(--line); margin-top:auto; }
    .sidebar-title-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:16px; }
    .sidebar-title { font-size:22px; font-weight:800; margin:0; }
    .sidebar-subtitle { margin:4px 0 0; font-size:12px; color:var(--text-dim); line-height:1.5; }
    .sidebar-badge { background:var(--surface-mid); color:var(--text-dim); padding:6px 10px; border-radius:10px; font-size:11px; font-weight:700; white-space:nowrap; }
    .sidebar-search { width:100%; background:var(--surface); border:1px solid var(--line); color:var(--text); border-radius:14px; padding:12px 14px; }
    .sidebar-actions { margin-top:12px; display:grid; gap:10px; }
    .btn-primary,.btn-secondary { width:100%; border:0; border-radius:14px; padding:12px 14px; display:inline-flex; align-items:center; justify-content:center; gap:8px; font-weight:700; cursor:pointer; }
    .btn-primary { background:var(--primary); color:var(--white); }
    .btn-secondary { background:var(--surface-mid); color:var(--text); border:1px solid var(--line); }
    .account-list { flex:1; overflow:auto; padding:12px; display:grid; gap:10px; }
    .account-card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:14px; display:grid; gap:10px; transition:.18s ease; cursor:pointer; }
    .account-card:hover,.account-card.active { border-color:rgba(25,169,229,.4); background:rgba(25,169,229,.08); }
    .account-card-header,.account-meta { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .account-email { font-size:14px; font-weight:700; word-break:break-all; }
    .account-status { font-size:10px; padding:4px 8px; border-radius:999px; background:var(--surface-mid); color:var(--text-dim); font-weight:700; }
    .account-status.online,.account-status.current { background:var(--primary); color:var(--white); }
    .account-meta,.account-extra { font-size:11px; color:var(--text-dim); }
    .account-empty { color:var(--text-dim); font-size:13px; line-height:1.7; border:1px dashed var(--line); border-radius:16px; padding:16px; }
    .sidebar-footer a,.sidebar-footer button { width:100%; border:0; background:transparent; color:var(--text-dim); display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:12px; cursor:pointer; }
    .sidebar-footer a:hover,.sidebar-footer button:hover { background:var(--surface-mid); color:var(--text); }
    .workspace { min-width:0; background:var(--bg); }
    #main { min-height:calc(100vh - 68px); }
    .workspace-grid { display:grid; grid-template-rows:auto auto minmax(280px,1fr); min-height:calc(100vh - 68px); }
    .workspace-head,.workspace-section,.workspace-detail { margin:16px; background:var(--surface); border:1px solid var(--line); border-radius:20px; overflow:hidden; box-shadow:var(--shadow); }
    .workspace-head { margin-bottom:0; }
    .workspace-section { margin-top:16px; margin-bottom:0; }
    .workspace-detail { margin-top:16px; }
    .workspace-head-inner { padding:24px; display:flex; align-items:flex-start; justify-content:space-between; gap:20px; flex-wrap:wrap; }
    .workspace-title { font-size:34px; font-weight:800; margin:0; letter-spacing:-.03em; word-break:break-all; }
    .workspace-tags { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
    .workspace-tag { padding:6px 10px; border-radius:999px; background:var(--primary-soft); color:var(--primary); font-size:12px; font-weight:700; }
    .workspace-tools { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
    .tool-btn,.ghost-btn { border-radius:12px; padding:10px 14px; display:inline-flex; align-items:center; gap:8px; border:1px solid var(--line); cursor:pointer; font-weight:700; background:var(--surface-low); color:var(--text); }
    .tool-btn.primaryish { background:var(--primary-soft); color:var(--primary); border-color:rgba(25,169,229,.26); }
    .code-card { min-width:360px; display:flex; align-items:center; gap:16px; padding:16px 18px; border-left:4px solid var(--primary); border-radius:18px; background:var(--surface-low); border:1px solid var(--line); }
    .code-card-info { min-width:96px; }
    .code-card-info strong { display:block; color:var(--primary); font-size:12px; letter-spacing:.08em; }
    .code-card-info span { display:block; margin-top:6px; color:var(--text-dim); font-size:11px; }
    .otp-digits { display:flex; gap:8px; }
    .otp-digit { width:40px; height:50px; border-radius:12px; background:var(--surface); border:1px solid var(--line); display:grid; place-items:center; font-size:24px; font-weight:800; }
    .code-card-side { min-width:0; }
    .code-card-side div:first-child { font-size:12px; font-weight:700; }
    .code-card-side div:last-child { margin-top:6px; font-size:11px; color:var(--text-dim); line-height:1.5; }
    .workspace-section-head,.workspace-detail-head { padding:16px 20px; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; gap:14px; background:var(--surface-low); }
    .section-title { font-size:18px; font-weight:800; margin:0; }
    .section-subtitle { margin-top:4px; color:var(--text-dim); font-size:12px; }
    .chip { padding:6px 10px; border-radius:999px; background:var(--primary-soft); color:var(--primary); font-size:12px; font-weight:700; }
    .mail-table-wrap { overflow:auto; }
    .mail-table { width:100%; border-collapse:collapse; }
    .mail-table th,.mail-table td { padding:14px 20px; text-align:left; border-bottom:1px solid rgba(49,70,84,.6); vertical-align:top; }
    .mail-table th { font-size:12px; color:var(--text-dim); font-weight:700; background:var(--surface-high); position:sticky; top:0; z-index:2; }
    .mail-table tr:hover td { background:rgba(25,169,229,.06); }
    .mail-table tr.active-row td { background:rgba(25,169,229,.1); }
    .mail-status { display:inline-flex; align-items:center; padding:5px 10px; border-radius:999px; font-size:11px; font-weight:700; }
    .mail-status.new { background:var(--primary); color:var(--white); }
    .mail-status.read { background:var(--surface-mid); color:var(--text-dim); }
    .detail-pane { padding:20px; }
    .detail-highlight { padding:14px 16px; border-radius:16px; background:rgba(25,169,229,.12); border:1px solid rgba(25,169,229,.18); display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:16px; }
    .detail-highlight strong { display:block; font-size:15px; }
    .detail-highlight span { display:block; margin-top:6px; font-size:12px; color:var(--text-dim); }
    .meta-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px 24px; margin-bottom:18px; padding-bottom:18px; border-bottom:1px solid var(--line); }
    .meta-item label { display:block; font-size:11px; color:var(--text-dim); font-weight:700; margin-bottom:8px; }
    .meta-item div { font-size:14px; word-break:break-word; }
    .detail-body { padding:18px; border-radius:18px; background:var(--surface-low); border:1px solid var(--line); font-size:14px; line-height:1.8; color:var(--text); overflow:auto; }
    .detail-body pre { white-space:pre-wrap; word-break:break-word; margin:0; font:inherit; color:inherit; }
    .detail-empty { padding:24px; color:var(--text-dim); line-height:1.8; }
    .admin-login,.intro-card { max-width:760px; margin:40px auto; padding:28px; border-radius:24px; background:var(--surface); border:1px solid var(--line); box-shadow:var(--shadow); }
    .admin-login h1,.intro-card h1 { margin:0 0 12px; font-size:34px; letter-spacing:-.03em; }
    .admin-login p,.intro-card p { color:var(--text-dim); line-height:1.8; }
    .admin-login input[type="password"] { width:100%; margin-top:12px; background:var(--surface-low); color:var(--text); border:1px solid var(--line); border-radius:16px; padding:14px 16px; }
    .admin-login input[type="submit"] { margin-top:12px; background:var(--primary); color:var(--white); border:0; border-radius:16px; padding:14px 16px; font-weight:700; cursor:pointer; }
    .intro-actions { margin-top:18px; display:flex; flex-wrap:wrap; gap:12px; }
    .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); border:0; }
    .htmx-indicator { position:fixed; right:18px; bottom:18px; background:var(--surface); border:1px solid var(--line); color:var(--text); border-radius:999px; padding:10px 14px; z-index:40; display:none; }
    .htmx-request .htmx-indicator,.htmx-request.htmx-indicator { display:inline-flex; align-items:center; gap:8px; }
    @media (max-width:1080px) { .body-shell { grid-template-columns:1fr; } .sidebar { border-right:0; border-bottom:1px solid var(--line); } .code-card { min-width:100%; } .workspace-head-inner { padding:18px; } .workspace-title { font-size:26px; } }
    @media (max-width:720px) { .topbar { height:auto; padding:14px; flex-direction:column; align-items:stretch; gap:12px; } .topbar-left,.topbar-right { justify-content:space-between; flex-wrap:wrap; } .topbar-nav { gap:12px; flex-wrap:wrap; } .workspace-head,.workspace-section,.workspace-detail { margin:12px; } .mail-table th,.mail-table td { padding:12px; } .meta-grid { grid-template-columns:1fr; } .otp-digit { width:34px; height:46px; font-size:22px; } }
  </style>
</head>
<body>
  <?php
    $isAdminView = !empty($_SESSION['admin']);
    $activePath = trim((string)$url, '/');
    $showLogsNav = $isAdminView && !empty($this->settings['SHOW_LOGS']);
    $showDomainManagerNav = $isAdminView;
    $showLogsDisabledMessage = str_starts_with($activePath, 'logs') && !$showLogsNav;
    $configIniPath = dirname(ROOT).DS.'config.ini';
    $configIni = file_exists($configIniPath) ? parse_ini_file($configIniPath, true, INI_SCANNER_TYPED) : [];
    $configuredDomains = $configIni['GENERAL']['DOMAINS'] ?? '';
    $availableDomains = [];
    $domainProfiles = [];
    $registryPath = dirname(ROOT).DS.'..'.DS.'data'.DS.'.mail-bridge-domain-registry.json';
    if(file_exists($registryPath)) {
      $registryRaw = file_get_contents($registryPath);
      $registryData = json_decode((string)$registryRaw, true);
      if(is_array($registryData) && is_array($registryData['domains'] ?? null)) {
        foreach ($registryData['domains'] as $domainItem) {
          if(!is_array($domainItem)) continue;
          if(empty($domainItem['enabled']) || empty($domainItem['allow_manual_selection'])) continue;
          $rootDomain = strtolower(trim((string)($domainItem['root_domain'] ?? '')));
          if($rootDomain !== '' && !in_array($rootDomain, $availableDomains, true)) {
            $availableDomains[] = $rootDomain;
            $domainProfiles[] = [
              'root_domain' => $rootDomain,
              'wildcard_enabled' => !empty($domainItem['wildcard_enabled']),
              'allow_random_assignment' => !empty($domainItem['allow_random_assignment']),
              'is_default' => !empty($domainItem['is_default']),
            ];
          }
        }
      }
    }
    if(empty($availableDomains)) {
      foreach (array_map('trim', explode(',', (string)$configuredDomains)) as $domainItem) {
        if($domainItem === '' || str_starts_with($domainItem, '*.')) continue;
        if(!in_array($domainItem, $availableDomains, true)) {
          $availableDomains[] = $domainItem;
          $domainProfiles[] = [
            'root_domain' => $domainItem,
            'wildcard_enabled' => true,
            'allow_random_assignment' => true,
            'is_default' => empty($domainProfiles),
          ];
        }
      }
    }
    $defaultDomain = $availableDomains[0] ?? '';
  ?>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar-left">
        <div class="brand">Mail Workspace</div>
        <nav class="topbar-nav">
          <a class="<?= $activePath === '' || str_starts_with($activePath, 'address') || str_starts_with($activePath, 'read') ? 'active' : '' ?>" href="/">工作台</a>
          <?php if($showLogsNav): ?><a class="<?= str_starts_with($activePath, 'logs') ? 'active' : '' ?>" href="/logs">日志</a><?php endif; ?>
          <?php if($showDomainManagerNav): ?><a class="<?= str_starts_with($activePath, 'domain-manager') ? 'active' : '' ?>" href="/domain-manager" hx-get="/api/domain-manager" hx-target="#main" hx-push-url="/domain-manager">域名管理</a><?php endif; ?>
          <a href="/json/listaccounts" target="_blank">接口</a>
        </nav>
      </div>
      <div class="topbar-right">
        <div class="mode-badge"><i class="fas <?= $isAdminView ? 'fa-user-shield' : 'fa-user'; ?>"></i><?= $isAdminView ? '管理员模式' : '普通模式'; ?></div>
        <?php if($this->settings['ADMIN_ENABLED']==true): ?><a class="action-link" href="/admin" hx-get="/api/admin" hx-target="#main" hx-push-url="/admin"><i class="fas fa-user-shield"></i><?= $isAdminView ? '管理中' : '进入管理'; ?></a><?php endif; ?>
        <button class="action-link" onclick="WorkspaceUI.refreshCurrent()"><i class="fas fa-sync-alt"></i>刷新</button>
        <div class="avatar"><img src="/avatar.jpg" alt="Mail Workspace Avatar"></div>
      </div>
    </header>
    <div class="body-shell">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-title-row">
            <div>
              <h2 class="sidebar-title">账号区</h2>
              <p class="sidebar-subtitle"><?= $isAdminView ? '管理员模式：展示全部账号、实时状态与域名管理入口' : '普通模式：只展示自己生成的账号'; ?></p>
            </div>
              <div class="sidebar-badge"><?= $isAdminView ? '全量账号 + 域名管理' : '个人账号视图'; ?></div>
          </div>
          <label class="sr-only" for="workspace-email-input">输入临时邮箱地址</label>
          <input id="workspace-email-input" class="sidebar-search" type="email" placeholder="<?= $isAdminView ? '搜索或输入邮箱地址' : '搜索自己的邮箱'; ?>">
          <?php if (!empty($availableDomains)): ?>
            <label class="sr-only" for="workspace-domain-select">选择邮箱域名</label>
            <select id="workspace-domain-select" class="sidebar-search" style="margin-top:12px;" aria-label="选择邮箱域名">
              <?php foreach ($availableDomains as $domainOption): ?>
                <option value="<?= htmlspecialchars($domainOption, ENT_QUOTES, 'UTF-8') ?>" <?= $domainOption === $defaultDomain ? 'selected' : '' ?>><?= htmlspecialchars($domainOption, ENT_QUOTES, 'UTF-8') ?></option>
              <?php endforeach; ?>
            </select>
          <?php endif; ?>
          <div class="sidebar-actions">
            <button class="btn-primary" onclick="WorkspaceUI.generateRandom()"><i class="fas fa-random"></i>按所选域名生成邮箱</button>
            <button class="btn-secondary" onclick="WorkspaceUI.generateRandomSubdomain()"><i class="fas fa-sitemap"></i>按所选域名生成二级邮箱</button>
            <button class="btn-secondary" onclick="WorkspaceUI.openTypedEmail()"><i class="fas fa-keyboard"></i>打开输入邮箱</button>
          </div>
        </div>
        <div id="account-list-panel" class="account-list"><?php if(!$isAdminView): ?><div id="recent-account-list" class="account-empty">这里会显示你最近打开或生成过的邮箱。生成新邮箱后，它会自动出现在这里。</div><?php endif; ?></div>
        <div class="sidebar-footer">
          <button type="button" onclick="WorkspaceUI.refreshSidebar()"><i class="fas fa-rotate"></i>刷新账号区</button>
          <a href="/json/listaccounts" target="_blank"><i class="fas fa-file-code"></i>查看 JSON 接口</a>
        </div>
      </aside>
      <section class="workspace">
        <button class="htmx-indicator" aria-busy="true"><i class="fas fa-spinner fa-spin"></i>加载中…</button>
        <?php if($showLogsDisabledMessage): ?>
          <main id="main">
            <section class="intro-card">
              <h1>日志页当前不可用</h1>
              <p><?= $isAdminView ? '当前站点尚未启用系统日志展示，因此这里不会直接显示运行日志。你仍可在需要时打开管理接口或稍后启用 SHOW_LOGS。' : '系统日志仅在管理员模式且站点开启日志展示时可见。请先进入管理员模式，或由管理员启用日志展示。'; ?></p>
              <div class="intro-actions">
                <a class="btn-secondary" href="/">返回工作台</a>
                <?php if(!$isAdminView): ?><a class="btn-primary" href="/admin" hx-get="/api/admin" hx-target="#main" hx-push-url="/admin">进入管理</a><?php endif; ?>
              </div>
            </section>
          </main>
        <?php else: ?>
          <main id="main" hx-get="/api/<?= $url ?>" hx-trigger="load"></main>
        <?php endif; ?>
      </section>
    </div>
  </div>
  <script src="/js/opentrashmail.js"></script>
  <script src="/js/htmx.min.js"></script>
  <script src="/js/moment-with-locales.min.js"></script>
  <script>
    window.WorkspaceUI = {
      isAdmin: <?= $isAdminView ? 'true' : 'false' ?>, currentEmail: '', key: 'loucer_recent_accounts', availableDomains: <?= json_encode($availableDomains, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>, domainProfiles: <?= json_encode($domainProfiles, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>,
      normalizeEmail(email) { return String(email || '').trim().toLowerCase(); },
      normalizeDomain(domain) { return String(domain || '').trim().toLowerCase(); },
      getDomainSelect() { return document.getElementById('workspace-domain-select'); },
      renderDomainSelect() {
        const select = this.getDomainSelect();
        if (!select) return;
        const currentValue = this.normalizeDomain(select.value);
        if (!this.availableDomains.length) {
          select.innerHTML = '';
          return;
        }
        select.innerHTML = this.availableDomains
          .map((domain) => `<option value="${domain}">${domain}</option>`)
          .join('');
        const nextValue = this.availableDomains.includes(currentValue) ? currentValue : this.normalizeDomain(this.availableDomains[0] || '');
        if (nextValue) {
          select.value = nextValue;
        }
      },
      applyDomainRegistry(domains, profiles) {
        this.availableDomains = Array.isArray(domains)
          ? domains.map((item) => this.normalizeDomain(item)).filter(Boolean)
          : [];
        this.domainProfiles = Array.isArray(profiles) ? profiles : [];
        this.renderDomainSelect();
      },
      getSelectedDomain() { const select = this.getDomainSelect(); const picked = this.normalizeDomain(select ? select.value : ''); return picked || this.normalizeDomain(this.availableDomains[0] || ''); },
      findDomainProfile(domain) { return this.domainProfiles.find((item) => this.normalizeDomain(item.root_domain) === this.normalizeDomain(domain)) || null; },
      pickRootDomainForEmail(domain) {
        const normalized = this.normalizeDomain(domain);
        if (!normalized) return '';
        if (this.availableDomains.includes(normalized)) return normalized;
        const matched = this.availableDomains.find((root) => normalized === root || normalized.endsWith('.' + root));
        return matched || normalized;
      },
      syncDomainByEmail(email) { const parts = this.normalizeEmail(email).split('@'); if (parts.length !== 2) return; const rootDomain = this.pickRootDomainForEmail(parts[1]); const select = this.getDomainSelect(); if (select && this.availableDomains.includes(rootDomain)) select.value = rootDomain; },
      createRandomToken(length = 10) { return Math.random().toString(16).slice(2, 2 + length); },
      createRandomRootEmail() {
        const rootDomain = this.getSelectedDomain();
        if (!rootDomain) return '';
        const mailbox = 'oc' + this.createRandomToken(10);
        return `${mailbox}@${rootDomain}`;
      },
      createRandomSubdomainEmail() {
        const rootDomain = this.getSelectedDomain();
        if (!rootDomain) return '';
        const profile = this.findDomainProfile(rootDomain);
        const mailbox = 'oc' + this.createRandomToken(10);
        if (profile && profile.wildcard_enabled) {
          const subdomain = this.createRandomToken(6);
          return `${mailbox}@${subdomain}.${rootDomain}`;
        }
        return `${mailbox}@${rootDomain}`;
      },
      loadAccount(email) { const normalized = this.normalizeEmail(email); if (!normalized) return; this.currentEmail = normalized; document.getElementById('workspace-email-input').value = normalized; this.syncDomainByEmail(normalized); history.pushState({ urlpath: '/address/' + normalized }, '', '/address/' + normalized); htmx.ajax('GET', '/api/address/' + normalized, { target: '#main', swap: 'innerHTML' }); },
      openTypedEmail() { this.loadAccount(document.getElementById('workspace-email-input').value); },
      generateRandom() { const generated = this.createRandomRootEmail(); if (!generated) { htmx.ajax('GET', '/api/random', { target: '#main', swap: 'innerHTML' }); return; } this.loadAccount(generated); },
      generateRandomSubdomain() { const generated = this.createRandomSubdomainEmail(); if (!generated) { htmx.ajax('GET', '/api/random', { target: '#main', swap: 'innerHTML' }); return; } this.loadAccount(generated); },
      refreshCurrent() { if (this.currentEmail) { this.loadAccount(this.currentEmail); return; } htmx.ajax('GET', '/api/<?= $url ?>', { target: '#main', swap: 'innerHTML' }); },
      getRecentAccounts() { try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch (e) { return []; } },
      setRecentAccounts(accounts) { localStorage.setItem(this.key, JSON.stringify(accounts.slice(0, 8))); },
      remember(email) { const normalized = this.normalizeEmail(email); if (!normalized) return; this.currentEmail = normalized; if (this.isAdmin) return; const accounts = this.getRecentAccounts().filter(item => item.email !== normalized); accounts.unshift({ email: normalized, updatedAt: new Date().toISOString() }); this.setRecentAccounts(accounts); this.renderRecentAccounts(); },
      renderRecentAccounts() {
        if (this.isAdmin) return;
        const panel = document.getElementById('account-list-panel'); const accounts = this.getRecentAccounts();
        if (!accounts.length) { panel.innerHTML = '<div class="account-empty">这里会显示你最近打开或生成过的邮箱。生成新邮箱后，它会自动出现在这里。</div>'; return; }
        panel.innerHTML = accounts.map((item, index) => `<div class="account-card ${item.email === this.currentEmail ? 'active' : ''}" onclick="WorkspaceUI.loadAccount('${item.email.replace(/'/g, "\\'")}')"><div class="account-card-header"><div class="account-email">${item.email}</div><div class="account-status ${item.email === this.currentEmail ? 'current' : ''}">${item.email === this.currentEmail ? '当前' : '已保存'}</div></div><div class="account-meta"><span>最近记录 ${index === 0 ? '刚刚更新' : '已保存'}</span></div><div class="account-extra">普通模式只展示你自己生成或打开过的邮箱。</div></div>`).join('');
      },
      refreshSidebar() { if (this.isAdmin) { htmx.ajax('GET', '/api/listaccounts', { target: '#account-list-panel', swap: 'innerHTML' }); } else { this.renderRecentAccounts(); } },
      syncFromRoot(root) { const current = root.querySelector('[data-current-email]'); if (current && current.dataset.currentEmail) { this.remember(current.dataset.currentEmail); } }
    };
    document.addEventListener('DOMContentLoaded', function () { WorkspaceUI.renderDomainSelect(); WorkspaceUI.refreshSidebar(); document.getElementById('workspace-email-input').addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); WorkspaceUI.openTypedEmail(); } }); });
    document.body.addEventListener('htmx:afterSwap', function (event) { if (event.detail && event.detail.target && event.detail.target.id === 'main') { WorkspaceUI.syncFromRoot(event.detail.target); } });
  </script>
</body>
</html>
