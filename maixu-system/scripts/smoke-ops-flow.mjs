#!/usr/bin/env node

const BASE_URL = (process.env.MAIXU_API_BASE_URL || 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

async function login({ nickname, openid }) {
  const result = await request('/auth/dev-login', {
    method: 'POST',
    body: { nickname, openid },
  });

  assert(result?.accessToken, `login failed for ${nickname}`);
  return result;
}

async function main() {
  console.log(`🚀 Ops smoke start: ${BASE_URL}`);

  const adminLogin = await login({ nickname: '系统管理员', openid: 'seed-admin-openid' });
  const hostLogin = await login({ nickname: '演示主持', openid: 'seed-host-openid' });
  const guestLogin = await login({ nickname: '演示用户', openid: 'seed-guest-openid' });

  const rooms = await request('/rooms');
  const roomA = rooms.find((item) => item.code === 'voice-hall-a') || rooms[0];
  const roomB = rooms.find((item) => item.code === 'voice-hall-b') || rooms[0];
  assert(roomA?.id && roomB?.id, 'rooms not found');

  const slotA = await request(`/rooms/${roomA.id}/current-slot`);
  const slotB = await request(`/rooms/${roomB.id}/current-slot`);
  const slotAId = slotA.id;
  const slotBId = slotB.id;

  // 1) Users module
  const users = await request('/users?limit=20', { token: adminLogin.accessToken });
  assert(Array.isArray(users) && users.length > 0, 'users search should return list');

  const userDetail = await request(`/users/id/${guestLogin.user.id}`, { token: adminLogin.accessToken });
  assert(userDetail?.id === guestLogin.user.id, 'user detail mismatch');

  await request(`/users/${guestLogin.user.id}/status`, {
    method: 'PATCH',
    token: adminLogin.accessToken,
    body: { status: 'DISABLED', reason: 'ops smoke temp disable' },
  });

  const disabledJoin = await request(`/rank/slots/${slotBId}/join`, {
    method: 'POST',
    body: {
      userId: guestLogin.user.id,
      sourceContent: 'disabled-join',
      score: 22,
    },
  });
  assert(disabledJoin.accepted === false, 'disabled user should not be able to join');

  await request(`/users/${guestLogin.user.id}/status`, {
    method: 'PATCH',
    token: adminLogin.accessToken,
    body: { status: 'ACTIVE', reason: 'ops smoke restore' },
  });

  await request(`/users/rooms/${roomB.id}/lists/blacklist`, {
    method: 'POST',
    token: hostLogin.accessToken,
    body: { userId: guestLogin.user.id, enabled: true },
  });

  const blacklistJoin = await request(`/rank/slots/${slotBId}/join`, {
    method: 'POST',
    body: {
      userId: guestLogin.user.id,
      sourceContent: 'blacklist-join',
      score: 23,
    },
  });
  assert(blacklistJoin.accepted === false, 'blacklisted user should not be able to join');

  await request(`/users/rooms/${roomB.id}/lists/blacklist`, {
    method: 'POST',
    token: hostLogin.accessToken,
    body: { userId: guestLogin.user.id, enabled: false },
  });

  const ban = await request(`/users/rooms/${roomB.id}/ban-policies`, {
    method: 'POST',
    token: hostLogin.accessToken,
    body: {
      userId: guestLogin.user.id,
      banType: 'COOLDOWN',
      reason: 'ops smoke cooldown',
      endAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
  });

  const bannedJoin = await request(`/rank/slots/${slotBId}/join`, {
    method: 'POST',
    body: {
      userId: guestLogin.user.id,
      sourceContent: 'ban-join',
      score: 24,
    },
  });
  assert(bannedJoin.accepted === false, 'cooldown user should not be able to join');

  await request(`/users/rooms/${roomB.id}/ban-policies/${ban.id}`, {
    method: 'DELETE',
    token: hostLogin.accessToken,
  });

  // 2) Room configs + Host schedules
  const originConfigs = await request(`/room-configs/rooms/${roomB.id}`);
  const originStop = Number(originConfigs?.configs?.order_stop_minute ?? 12);

  const updatedConfigs = await request(`/room-configs/rooms/${roomB.id}`, {
    method: 'PUT',
    token: hostLogin.accessToken,
    body: { configs: { order_stop_minute: originStop + 1 } },
  });
  assert(Number(updatedConfigs?.configs?.order_stop_minute) === originStop + 1, 'room config update failed');

  const now = new Date();
  const weekday = now.getDay();
  const hour = now.getHours();

  const schedule = await request(`/host-schedules/rooms/${roomB.id}`, {
    method: 'POST',
    token: hostLogin.accessToken,
    body: {
      weekday,
      startHour: hour,
      endHour: Math.min(hour + 1, 24),
      hostUserId: guestLogin.user.id,
      priority: 99,
      isActive: true,
    },
  });

  const resolvedBySchedule = await request(
    `/host-schedules/rooms/${roomB.id}/resolve?slotDate=${now.toISOString().slice(0, 10)}&slotHour=${hour}`,
  );
  assert(resolvedBySchedule?.hostUserId, 'resolve host should return host user');

  const override = await request(`/host-schedules/rooms/${roomB.id}/overrides`, {
    method: 'POST',
    token: hostLogin.accessToken,
    body: {
      slotDate: now.toISOString().slice(0, 10),
      slotHour: hour,
      hostUserId: hostLogin.user.id,
      oneTimeOnly: true,
      remark: 'ops-smoke',
    },
  });

  const resolvedByOverride = await request(
    `/host-schedules/rooms/${roomB.id}/resolve?slotDate=${now.toISOString().slice(0, 10)}&slotHour=${hour}`,
  );
  assert(resolvedByOverride?.source === 'override', 'override should take precedence');

  await request(`/host-schedules/overrides/${override.id}`, { method: 'DELETE', token: hostLogin.accessToken });
  await request(`/host-schedules/${schedule.id}`, { method: 'DELETE', token: hostLogin.accessToken });

  await request(`/room-configs/rooms/${roomB.id}`, {
    method: 'PUT',
    token: hostLogin.accessToken,
    body: { configs: { order_stop_minute: originStop } },
  });

  // 3) Rule engine top-card / buy8 / insert / settle
  await request(`/rank/slots/${slotAId}/reset-slot`, { method: 'POST', token: hostLogin.accessToken });

  const topCardResult = await request(`/rank/slots/${slotAId}/use-top-card`, {
    method: 'POST',
    token: guestLogin.accessToken,
    body: { sourceContent: 'ops-top-card' },
  });
  assert(topCardResult.accepted === true, 'top-card should be accepted');

  const buy8Result = await request(`/rank/slots/${slotAId}/use-buy8`, {
    method: 'POST',
    token: guestLogin.accessToken,
    body: { sourceContent: 'ops-buy8', score: 88 },
  });
  assert(buy8Result.accepted === true, 'buy8 should be accepted');

  const insertResult = await request(`/rank/slots/${slotAId}/use-insert`, {
    method: 'POST',
    token: guestLogin.accessToken,
    body: { targetRank: 1, sourceContent: 'ops-insert' },
  });
  assert(insertResult.accepted === true, 'insert should be accepted');

  const settleResult = await request(`/rank/slots/${slotAId}/settle`, {
    method: 'POST',
    token: hostLogin.accessToken,
  });
  assert(settleResult.settled === true, 'settle should be true');

  // 4) Notifications timeout + logs
  await request(`/rank/slots/${slotBId}/reset-slot`, { method: 'POST', token: hostLogin.accessToken });
  await request(`/rank/slots/${slotBId}/join`, {
    method: 'POST',
    body: {
      userId: guestLogin.user.id,
      sourceContent: 'ops-smoke-join',
      score: 66,
    },
  });

  await request(`/leave-notices/slots/${slotBId}/report`, {
    method: 'POST',
    token: guestLogin.accessToken,
    body: { minutes: 1, reason: 'ops-smoke-leave' },
  });

  const timeoutResult = await request('/notifications/leave-notices/check-timeouts', {
    method: 'POST',
    token: hostLogin.accessToken,
    body: { slotId: slotBId, simulateNowOffsetSeconds: 120 },
  });
  assert(timeoutResult?.timeoutCount >= 1, 'timeout check should detect overdue notices');

  const notificationLogs = await request('/notifications/logs?limit=20', { token: hostLogin.accessToken });
  const hasTimeoutLog = notificationLogs.some((item) => String(item.templateCode || '').includes('leave_notice_timeout'));
  assert(hasTimeoutLog, 'notification logs should contain leave timeout template');

  // 5) Audit log checks
  const auditLogs = await request(`/audit/slots/${slotAId}?limit=100`, { token: hostLogin.accessToken });
  const auditActions = new Set(auditLogs.map((item) => item.action));
  assert(auditActions.has('rank.settle'), 'audit should contain rank.settle');

  console.log('✅ Ops smoke passed');
}

main().catch((error) => {
  console.error('❌ Ops smoke failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
