#!/usr/bin/env node

import { io } from 'socket.io-client';

const BASE_URL = (process.env.MAIXU_API_BASE_URL || 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const WS_BASE_URL = process.env.MAIXU_WS_BASE_URL || BASE_URL.replace(/\/api\/v1\/?$/, '');

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

async function waitForSubscribed(socket, slotId, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout waiting for slot subscribe ack'));
    }, timeoutMs);

    const onSubscribed = (payload) => {
      if (payload?.slotId !== slotId) return;
      cleanup();
      resolve(payload);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('subscribed', onSubscribed);
    };

    socket.on('subscribed', onSubscribed);
  });
}

async function waitForRankUpdated(socket, slotId, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout waiting for rank.updated'));
    }, timeoutMs);

    const onRankUpdated = (payload) => {
      if (payload?.slot?.id !== slotId) return;
      cleanup();
      resolve(payload);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('rank.updated', onRankUpdated);
    };

    socket.on('rank.updated', onRankUpdated);
  });
}

async function main() {
  console.log(`🚀 WS smoke start: api=${BASE_URL} ws=${WS_BASE_URL}/ws`);

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

  const socket = io(`${WS_BASE_URL}/ws`, {
    transports: ['websocket'],
    timeout: 5000,
  });

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket connect timeout')), 8000);
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve(null);
      });
      socket.on('connect_error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    const subscribedPromise = waitForSubscribed(socket, slotId, 8000);
    socket.emit('slot:subscribe', { slotId });
    await subscribedPromise;

    const waitPromise = waitForRankUpdated(socket, slotId, 12000);

    await request(`/rank/slots/${slotId}/join`, {
      method: 'POST',
      body: {
        userId: guestLogin.user.id,
        sourceContent: 'WS冒烟测试',
        score: 28,
      },
    });

    const updated = await waitPromise;
    assert(updated?.entries?.some((entry) => entry.userId === guestLogin.user.id), 'rank.updated missing guest entry');

    console.log('✅ WS smoke passed');
  } finally {
    socket.disconnect();
  }
}

main().catch((error) => {
  console.error('❌ WS smoke failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
