<div>
  <?php
    $limit = intval($limit ?? 10);
    $visibleCount = intval($visible_count ?? count($emails ?? []));
    $totalCount = intval($total_count ?? $visibleCount);
  ?>

  <?php if($totalCount > 0): ?>
    <div class="account-empty" style="margin-bottom:12px; border-style:solid; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
      <span>管理员模式默认仅展示最新 <?= $limit ?> 个邮箱，当前显示 <?= $visibleCount ?> / <?= $totalCount ?>，避免左侧列表过长影响页面加载。</span>
      <?php if($totalCount > $visibleCount && $limit < 50): ?>
        <button
          type="button"
          class="action-link"
          style="padding:8px 12px;"
          hx-get="/api/listaccounts/50"
          hx-target="#account-list-panel"
          hx-swap="innerHTML"
        >
          查看更多 50 个
        </button>
      <?php endif; ?>
    </div>
  <?php endif; ?>

  <?php foreach(($emails ?? []) as $email): ?>
    <div class="account-card" onclick="WorkspaceUI.loadAccount('<?= escape($email) ?>')">
      <div class="account-card-header">
        <div class="account-email"><?= escape($email) ?></div>
        <div class="account-status online">可查看</div>
      </div>
      <div class="account-meta">
        <span>收件数量 <?= countEmailsOfAddress($email); ?></span>
        <span>管理员全量可见</span>
      </div>
      <div class="account-extra">
        <a href="/address/<?= $email; ?>" hx-get="/api/address/<?= $email; ?>" hx-push-url="/address/<?= $email; ?>" hx-target="#main">打开这个邮箱并查看接码内容</a>
      </div>
    </div>
  <?php endforeach; ?>

  <?php if(empty($emails)): ?>
    <div class="account-empty">当前还没有可展示的邮箱账号。</div>
  <?php endif; ?>
</div>
