<?php
    $loucerAdminJustAuthenticated = false;
    if($_REQUEST['password'] && $_REQUEST['password'] == $settings['ADMIN_PASSWORD']) {
        $_SESSION['admin'] = true;
        $loucerAdminJustAuthenticated = true;
        if(($_SERVER['HTTP_HX_REQUEST'] ?? '') === 'true') {
            header('HX-Redirect: /');
            exit;
        }
    } else if($_REQUEST['password'] && $_REQUEST['password'] != $settings['ADMIN_PASSWORD']) {
        echo '<div class="error">管理员口令错误，请重新输入。</div>';
    }
?>

<?php if($settings['ADMIN_PASSWORD'] != "" && empty($_SESSION['admin'])): ?>
  <section class="admin-login">
    <h1>进入管理员模式</h1>
    <p>管理员模式会在左侧展示全部账号，并开放域名管理、Mail Bridge 配置与其他高级操作。</p>
    <form method="post" hx-post="/api/admin" hx-target="#main">
      <input type="password" name="password" placeholder="管理员口令" autocomplete="current-password" />
      <input type="submit" value="进入管理员模式" />
    </form>
  </section>
<?php return; endif; ?>

<section class="intro-card" id="mail-bridge-admin-root">
  <style>
    .bridge-admin-stack { display:grid; gap:18px; }
    .bridge-admin-panel { background:var(--surface-low); border:1px solid var(--line); border-radius:18px; padding:18px; }
    .bridge-admin-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .bridge-admin-title { margin:0; font-size:24px; font-weight:800; }
    .bridge-admin-subtitle { margin-top:8px; color:var(--text-dim); font-size:13px; line-height:1.8; }
    .bridge-admin-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px 16px; margin-top:16px; }
    .bridge-admin-field { display:grid; gap:8px; }
    .bridge-admin-field label { color:var(--text-dim); font-size:12px; font-weight:700; }
    .bridge-admin-field input { width:100%; background:var(--surface); color:var(--text); border:1px solid var(--line); border-radius:14px; padding:12px 14px; }
    .bridge-admin-actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:16px; }
    .bridge-admin-actions .btn-primary, .bridge-admin-actions .btn-secondary { width:auto; }
    .bridge-connection-toggle { margin-top:14px; display:flex; gap:10px; flex-wrap:wrap; }
    .bridge-connection-panel { display:none; margin-top:16px; background:rgba(25,169,229,.08); border:1px solid rgba(25,169,229,.22); border-radius:18px; padding:18px; }
    .bridge-connection-panel.is-visible { display:block; }
    .bridge-connection-title { margin:0; font-size:20px; font-weight:800; }
    .bridge-connection-subtitle { margin-top:8px; color:var(--text-dim); font-size:13px; line-height:1.8; }
    .bridge-connection-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px 16px; margin-top:16px; }
    .bridge-connection-item { display:grid; gap:8px; }
    .bridge-connection-item label { color:var(--primary); font-size:12px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; }
    .bridge-connection-item input { width:100%; background:var(--surface); color:var(--text); border:1px solid rgba(25,169,229,.24); border-radius:14px; padding:12px 14px; }
    .bridge-connection-actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:16px; }
    .bridge-connection-tip { margin-top:12px; color:var(--text-dim); font-size:12px; line-height:1.7; }
    .bridge-admin-status { margin-top:14px; padding:12px 14px; border-radius:14px; border:1px solid var(--line); background:var(--surface); color:var(--text-dim); font-size:13px; line-height:1.7; }
    .bridge-admin-status.success { color:var(--success); border-color:rgba(61,220,151,.35); }
    .bridge-admin-status.error { color:var(--danger); border-color:rgba(255,107,107,.35); }
    .bridge-admin-tip { margin-top:10px; color:var(--text-dim); font-size:12px; line-height:1.7; }
    @media (max-width:920px) { .bridge-admin-grid, .bridge-connection-grid { grid-template-columns:1fr; } }
  </style>

  <div class="bridge-admin-stack">
    <div>
      <h1>管理员控制台</h1>
      <p>这里可以查看 Mail Bridge 当前 API 地址与访问令牌。推荐把 Bridge Token 和管理员口令分开，避免业务接码调用与后台登录口令混用。</p>
    </div>
    <div class="bridge-admin-panel">
      <div class="bridge-admin-head">
        <div>
          <h2 class="bridge-admin-title">Mail Bridge 配置</h2>
          <div class="bridge-admin-subtitle">保存后会自动把新的 Bridge Token 写回服务器配置，并后台重载 OpenTrashmail。你的本地注册软件也需要同步这把 token。</div>
        </div>
        <a class="action-link" href="/" hx-get="/api/" hx-target="#main" hx-push-url="/"><i class="fas fa-arrow-left"></i>返回工作台</a>
      </div>

      <div class="bridge-admin-grid">
        <div class="bridge-admin-field">
          <label for="bridge-api-base">API 地址</label>
          <input id="bridge-api-base" type="text" readonly value="加载中...">
        </div>
        <div class="bridge-admin-field">
          <label for="bridge-auth-token">Bridge Token</label>
          <input id="bridge-auth-token" type="text" placeholder="点击下方按钮生成或填写新的 token">
        </div>
      </div>

      <div class="bridge-admin-actions">
        <button class="btn-secondary" type="button" onclick="MailBridgeAdmin.copyApi()">复制 API 地址</button>
        <button class="btn-secondary" type="button" onclick="MailBridgeAdmin.copyToken()">复制 Token</button>
        <button class="btn-secondary" type="button" onclick="MailBridgeAdmin.generateToken()">随机生成一把</button>
        <button class="btn-primary" type="button" onclick="MailBridgeAdmin.save()">保存 Token</button>
      </div>

      <div class="bridge-connection-toggle">
        <button id="bridge-connection-toggle-btn" class="btn-secondary" type="button" onclick="MailBridgeAdmin.toggleConnectionPanel()"><i class="fas fa-link"></i>显示注册软件连接信息</button>
      </div>

      <div id="bridge-connection-panel" class="bridge-connection-panel">
        <h3 class="bridge-connection-title">注册软件连接信息</h3>
        <div class="bridge-connection-subtitle">下面这两项就是你的注册软件在“自建邮箱 / self_hosted_mail_api”里需要填写的核心连接参数。部署给别人时，也请让对方在这里复制自己的地址和 token，不要再填写你的旧服务器地址。</div>

        <div class="bridge-connection-grid">
          <div class="bridge-connection-item">
            <label for="bridge-connect-api-base">Mail Bridge API 地址</label>
            <input id="bridge-connect-api-base" type="text" readonly value="加载中...">
          </div>
          <div class="bridge-connection-item">
            <label for="bridge-connect-auth-token">Bridge Token</label>
            <input id="bridge-connect-auth-token" type="text" readonly value="加载中...">
          </div>
        </div>

        <div class="bridge-connection-actions">
          <button class="btn-secondary" type="button" onclick="MailBridgeAdmin.copyConnectApi()">复制 Mail Bridge API 地址</button>
          <button class="btn-secondary" type="button" onclick="MailBridgeAdmin.copyConnectToken()">复制 Bridge Token</button>
        </div>

        <div class="bridge-connection-tip">注册软件里对应填写为：`mail.provider=self_hosted_mail_api`、`mail.api_base=这里的 Mail Bridge API 地址`、`mail.api_key=这里的 Bridge Token`。</div>
      </div>

      <div id="bridge-admin-status" class="bridge-admin-status">正在读取当前 Mail Bridge 配置...</div>
      <div class="bridge-admin-tip">建议外部注册软件统一使用这里显示的 API 地址与 Bridge Token 调用 `/api/latest`。管理员口令仍只用于后台登录与紧急兜底。</div>
    </div>
  </div>
</section>

<script>
  (function () {
    const els = {
      apiBase: document.getElementById('bridge-api-base'),
      token: document.getElementById('bridge-auth-token'),
      connectApiBase: document.getElementById('bridge-connect-api-base'),
      connectToken: document.getElementById('bridge-connect-auth-token'),
      connectionPanel: document.getElementById('bridge-connection-panel'),
      connectionToggleBtn: document.getElementById('bridge-connection-toggle-btn'),
      status: document.getElementById('bridge-admin-status'),
    };

    function setStatus(message, type) {
      els.status.textContent = message;
      els.status.className = 'bridge-admin-status' + (type ? ' ' + type : '');
    }

    async function load() {
      setStatus('正在读取当前 Mail Bridge 配置...', '');
      try {
        const response = await fetch('/api/mail-bridge-settings', {
          headers: { 'Accept': 'application/json' },
          credentials: 'same-origin',
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || '读取失败');
        }
        els.apiBase.value = payload.api_base || '';
        els.token.value = payload.auth_token || '';
        els.connectApiBase.value = payload.api_base || '';
        els.connectToken.value = payload.auth_token || '';
        setStatus(payload.message || '当前配置已加载，可以直接复制或生成新 token。', 'success');
      } catch (error) {
        setStatus('读取 Mail Bridge 配置失败：' + (error.message || 'unknown_error'), 'error');
      }
    }

    function randomToken() {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_';
      const bytes = new Uint8Array(40);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
    }

    window.MailBridgeAdmin = {
      async copyApi() {
        if (!els.apiBase.value) return;
        await navigator.clipboard.writeText(els.apiBase.value);
        setStatus('Mail Bridge API 地址已复制。', 'success');
      },
      async copyConnectApi() {
        if (!els.connectApiBase.value) return;
        await navigator.clipboard.writeText(els.connectApiBase.value);
        setStatus('注册软件使用的 Mail Bridge API 地址已复制。', 'success');
      },
      async copyToken() {
        if (!els.token.value) return;
        await navigator.clipboard.writeText(els.token.value);
        setStatus('Bridge Token 已复制。', 'success');
      },
      async copyConnectToken() {
        if (!els.connectToken.value) return;
        await navigator.clipboard.writeText(els.connectToken.value);
        setStatus('注册软件使用的 Bridge Token 已复制。', 'success');
      },
      generateToken() {
        els.token.value = randomToken();
        setStatus('已生成新的随机 token，确认无误后点击保存。', 'success');
      },
      toggleConnectionPanel() {
        if (!els.connectionPanel || !els.connectionToggleBtn) return;
        const visible = els.connectionPanel.classList.toggle('is-visible');
        els.connectionToggleBtn.innerHTML = visible
          ? '<i class=\"fas fa-eye-slash\"></i>隐藏注册软件连接信息'
          : '<i class=\"fas fa-link\"></i>显示注册软件连接信息';
      },
      async save() {
        const nextToken = String(els.token.value || '').trim();
        if (!nextToken) {
          setStatus('请先填写 Bridge Token。', 'error');
          return;
        }

        setStatus('正在保存新的 Bridge Token...', '');
        try {
          const response = await fetch('/api/mail-bridge-settings/save', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify({ auth_token: nextToken }),
          });
          const payload = await response.json();
          if (!response.ok || !payload.ok) {
            throw new Error(payload.message || '保存失败');
          }
          els.apiBase.value = payload.api_base || els.apiBase.value;
          els.token.value = payload.auth_token || nextToken;
          els.connectApiBase.value = payload.api_base || els.apiBase.value;
          els.connectToken.value = payload.auth_token || nextToken;
          setStatus(payload.message || 'Bridge Token 已保存。', 'success');
        } catch (error) {
          setStatus('保存 Bridge Token 失败：' + (error.message || 'unknown_error'), 'error');
        }
      },
    };

    load();
  })();
</script>
