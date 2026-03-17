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
  assert(result?.user?.id, `missing user id for ${nickname}`);
  return result;
}

async function main() {
  console.log(`🚀 Leave notice smoke start: ${BASE_URL}`);

  const hostLogin = await login({ nickname: '演示主持', openid: 'seed-host-openid' });
  const guestLogin = await login({ nickname: '演示用户', openid: 'seed-guest-openid' });

  const rooms = await request('/rooms');
  const room = rooms.find((item) => item.code === 'voice-hall-b') || rooms[0];
  assert(room?.id, 'room not found');

  const slot = await request(`/rooms/${room.id}/current-slot`);
  const slotId = slot.id;

  await request(`/rank/slots/${slotId}/reset-slot`, {
    method: 'POST',
    token: hostLogin.accessToken,
  });

  const join = await request(`/rank/slots/${slotId}/join`, {
    method: 'POST',
    body: {
      userId: guestLogin.user.id,
      sourceContent: `leave-smoke-${Date.now()}`,
      score: 39,
    },
  });
  assert(join.accepted === true, 'guest should join rank first');

  const report = await request(`/leave-notices/slots/${slotId}/report`, {
    method: 'POST',
    token: guestLogin.accessToken,
    body: {
      minutes: 5,
      reason: 'smoke test',
    },
  });
  assert(report?.notice?.status === 'ACTIVE', 'leave report should create ACTIVE notice');

  const myNotice = await request(`/leave-notices/slots/${slotId}/my`, {
    token: guestLogin.accessToken,
  });
  assert(myNotice?.notice?.status === 'ACTIVE', 'my leave notice should be ACTIVE');

  const hostView = await request(`/leave-notices/slots/${slotId}`, {
    token: hostLogin.accessToken,
  });
  assert(Array.isArray(hostView?.activeNotices), 'host view should return active notices');
  assert(hostView.activeNotices.some((item) => item.userId === guestLogin.user.id), 'host should see guest active notice');

  const returnResult = await request(`/leave-notices/slots/${slotId}/return`, {
    method: 'POST',
    token: guestLogin.accessToken,
  });
  assert(returnResult?.notice?.status === 'RETURNED', 'return should set status RETURNED');

  const myAfterReturn = await request(`/leave-notices/slots/${slotId}/my`, {
    token: guestLogin.accessToken,
  });
  assert(myAfterReturn?.notice === null, 'my notice should be null after return');

  console.log('✅ Leave notice smoke passed');
}

main().catch((error) => {
  console.error('❌ Leave notice smoke failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
