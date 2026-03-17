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

  const hostLogin = await login({ nickname: '演示主持', openid: 'seed-host-openid' });
  const guestLogin = await login({ nickname: '演示用户', openid: 'seed-guest-openid' });

  const rooms = await request('/rooms');
  const room = rooms.find((item) => item.code === 'voice-hall-b') || rooms[0];
  assert(room?.id, 'room not found');

  const slot = await request(`/rooms/${room.id}/current-slot`);
  const slotId = slot.id;

  const originConfigs = await request(`/room-configs/rooms/${room.id}`);
  const originStop = Number(originConfigs?.configs?.order_stop_minute ?? 12);

  const updatedConfigs = await request(`/room-configs/rooms/${room.id}`, {
    method: 'PUT',
    token: hostLogin.accessToken,
    body: {
      configs: {
        order_stop_minute: originStop + 1,
      },
    },
  });
  assert(Number(updatedConfigs?.configs?.order_stop_minute) === originStop + 1, 'room config update failed');

  const now = new Date();
  const weekday = now.getDay();
  const hour = now.getHours();

  const schedule = await request(`/host-schedules/rooms/${room.id}`, {
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

  const resolvedBySchedule = await request(`/host-schedules/rooms/${room.id}/resolve?slotDate=${now.toISOString().slice(0, 10)}&slotHour=${hour}`);
  assert(resolvedBySchedule?.hostUserId, 'resolve host should return host user');

  const override = await request(`/host-schedules/rooms/${room.id}/overrides`, {
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

  const resolvedByOverride = await request(`/host-schedules/rooms/${room.id}/resolve?slotDate=${now.toISOString().slice(0, 10)}&slotHour=${hour}`);
  assert(resolvedByOverride?.source === 'override', 'override should take precedence');
  assert(resolvedByOverride?.hostUserId === hostLogin.user.id, 'override host should match');

  await request(`/host-schedules/overrides/${override.id}`, {
    method: 'DELETE',
    token: hostLogin.accessToken,
  });

  await request(`/host-schedules/${schedule.id}`, {
    method: 'DELETE',
    token: hostLogin.accessToken,
  });

  await request(`/room-configs/rooms/${room.id}`, {
    method: 'PUT',
    token: hostLogin.accessToken,
    body: {
      configs: {
        order_stop_minute: originStop,
      },
    },
  });

  await request(`/rank/slots/${slotId}/reset-slot`, {
    method: 'POST',
    token: hostLogin.accessToken,
  });

  await request(`/rank/slots/${slotId}/manual-add`, {
    method: 'POST',
    token: hostLogin.accessToken,
    body: {
      userId: guestLogin.user.id,
      sourceContent: 'ops-smoke-manual',
      score: 88,
    },
  });

  await request(`/slots/${slotId}/close-speed-stage`, {
    method: 'POST',
    token: hostLogin.accessToken,
  });

  const auditLogs = await request(`/audit/slots/${slotId}?limit=50`, {
    token: hostLogin.accessToken,
  });

  const auditActions = new Set(auditLogs.map((item) => item.action));
  assert(auditActions.has('rank.manual_add'), 'audit should contain rank.manual_add');
  assert(auditActions.has('slot.close_speed_stage'), 'audit should contain slot.close_speed_stage');

  await request(`/leave-notices/slots/${slotId}/report`, {
    method: 'POST',
    token: guestLogin.accessToken,
    body: {
      minutes: 1,
      reason: 'ops-smoke-leave',
    },
  });

  const timeoutResult = await request('/notifications/leave-notices/check-timeouts', {
    method: 'POST',
    token: hostLogin.accessToken,
    body: {
      slotId,
      simulateNowOffsetSeconds: 120,
    },
  });

  assert(timeoutResult?.timeoutCount >= 1, 'notifications timeout check should detect overdue notices');
  assert(timeoutResult?.logsCreated >= 1, 'notifications timeout check should create logs');

  const notificationLogs = await request('/notifications/logs?limit=20', {
    token: hostLogin.accessToken,
  });

  const hasTimeoutLog = notificationLogs.some((item) => String(item.templateCode || '').includes('leave_notice_timeout'));
  assert(hasTimeoutLog, 'notification logs should contain leave timeout template');

  console.log('✅ Ops smoke passed');
}

main().catch((error) => {
  console.error('❌ Ops smoke failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
