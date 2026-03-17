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
  console.log(`🚀 Challenge smoke start: ${BASE_URL}`);

  const hostLogin = await login({ nickname: '演示主持', openid: 'seed-host-openid' });
  const guestLogin = await login({ nickname: '演示用户', openid: 'seed-guest-openid' });

  const rooms = await request('/rooms');
  const room = rooms.find((item) => item.code === 'voice-hall-a');
  assert(room?.id, 'roomA not found');
  assert(room.config?.enableChallenge === true, 'roomA challenge should be enabled');

  const slot = await request(`/rooms/${room.id}/current-slot`);
  const slotId = slot.id;
  assert(slotId, 'slotId not found');

  await request(`/rank/slots/${slotId}/reset-slot`, {
    method: 'POST',
    token: hostLogin.accessToken,
  });

  const noTicketJoin = await request(`/rank/slots/${slotId}/join`, {
    method: 'POST',
    body: {
      userId: guestLogin.user.id,
      sourceContent: '挑战前加榜尝试',
      score: 18,
    },
  });

  assert(noTicketJoin.accepted === false, 'join without ticket should be rejected');
  assert(typeof noTicketJoin.reason === 'string' && noTicketJoin.reason.includes('challenge'), 'reject reason should mention challenge');

  const challenge = await request(`/challenges/slots/${slotId}/issue`, {
    method: 'POST',
    body: { userId: guestLogin.user.id },
  });

  assert(challenge.enabled === true && challenge.challengeId, 'challenge issue failed');
  assert(challenge.expectedAnswer, 'expectedAnswer should exist in non-production env');

  const verify = await request(`/challenges/slots/${slotId}/verify`, {
    method: 'POST',
    body: {
      challengeId: challenge.challengeId,
      userId: guestLogin.user.id,
      answer: challenge.expectedAnswer,
    },
  });

  assert(verify.passed === true, 'challenge verify should pass');
  assert(verify.ticket, 'challenge ticket should exist');

  const join = await request(`/rank/slots/${slotId}/join`, {
    method: 'POST',
    body: {
      userId: guestLogin.user.id,
      sourceContent: '挑战后加榜',
      score: 18,
      challengeTicket: verify.ticket,
    },
  });

  assert(join.accepted === true, 'join with challenge ticket should pass');
  assert(join.currentRank?.entries?.some((item) => item.userId === guestLogin.user.id), 'rank should contain guest entry');

  console.log('✅ Challenge smoke passed');
}

main().catch((error) => {
  console.error('❌ Challenge smoke failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
