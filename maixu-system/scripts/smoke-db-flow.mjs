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
  console.log(`🚀 Smoke test start: ${BASE_URL}`);

  const hostLogin = await login({ nickname: '演示主持', openid: 'seed-host-openid' });
  const guestLogin = await login({ nickname: '演示用户', openid: 'seed-guest-openid' });

  console.log('✅ seed users login ok');

  const rooms = await request('/rooms');
  assert(Array.isArray(rooms) && rooms.length > 0, 'rooms is empty');

  const room = rooms.find((item) => item.code === 'voice-hall-b') || rooms[0];
  assert(room?.id, 'missing room id');

  const slot = await request(`/rooms/${room.id}/current-slot`);
  const slotId = slot?.id;
  assert(slotId, 'missing current slot id');

  console.log(`✅ room/slot resolved: ${room.name} (${slotId})`);

  await request(`/rank/slots/${slotId}/reset-slot`, {
    method: 'POST',
    token: hostLogin.accessToken,
  });

  const joinPayload = {
    userId: guestLogin.user.id,
    sourceContent: `联调-${Date.now()}`,
    score: 66,
  };

  const joinResult = await request(`/rank/slots/${slotId}/join`, {
    method: 'POST',
    body: joinPayload,
  });

  assert(joinResult?.accepted === true, 'guest join should be accepted');

  const cancelResult = await request(`/rank/slots/${slotId}/cancel`, {
    method: 'POST',
    body: { userId: guestLogin.user.id },
  });
  assert(cancelResult?.cancelled === true, 'guest cancel should succeed');

  const manualAddResult = await request(`/rank/slots/${slotId}/manual-add`, {
    method: 'POST',
    token: hostLogin.accessToken,
    body: {
      userId: guestLogin.user.id,
      sourceContent: '主持手动加档',
      score: 999,
    },
  });
  assert(manualAddResult?.accepted === true, 'host manual-add should be accepted');

  const dashboard = await request(`/slots/${slotId}/host-dashboard`, {
    token: hostLogin.accessToken,
  });
  assert(Array.isArray(dashboard?.entries), 'host dashboard should contain entries');

  const closeSpeed = await request(`/slots/${slotId}/close-speed-stage`, {
    method: 'POST',
    token: hostLogin.accessToken,
  });
  assert(closeSpeed?.slot?.state === 'FINAL_OPEN', 'close-speed-stage should switch to FINAL_OPEN');

  const closeFinal = await request(`/slots/${slotId}/close-final-stage`, {
    method: 'POST',
    token: hostLogin.accessToken,
  });
  assert(closeFinal?.slot?.state === 'FINAL_CLOSED', 'close-final-stage should switch to FINAL_CLOSED');

  const reopenAdd = await request(`/slots/${slotId}/toggle-add-stage`, {
    method: 'POST',
    token: hostLogin.accessToken,
    body: { enabled: true },
  });
  assert(reopenAdd?.slot?.state === 'FINAL_OPEN', 'toggle-add-stage true should switch to FINAL_OPEN');

  const resetResult = await request(`/rank/slots/${slotId}/reset-slot`, {
    method: 'POST',
    token: hostLogin.accessToken,
  });
  assert(resetResult?.reset === true, 'reset-slot should succeed');

  const finalRank = await request(`/slots/${slotId}/rank`);
  assert(Array.isArray(finalRank?.entries) && finalRank.entries.length === 0, 'final rank should be empty after reset');

  console.log('✅ Smoke test passed: PostgreSQL mode main flow is healthy');
}

main().catch((error) => {
  console.error('❌ Smoke test failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
