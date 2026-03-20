import Taro from '@tarojs/taro';

const ACCOUNTS_KEY = 'maixu_wechat_accounts';
const ACTIVE_ACCOUNT_KEY = 'maixu_wechat_active_account';
const FRIEND_REQUESTS_KEY = 'maixu_wechat_friend_requests';
const FRIENDSHIPS_KEY = 'maixu_wechat_friendships';
const DIRECT_MESSAGES_KEY = 'maixu_wechat_direct_messages';
const DIRECT_READ_KEY = 'maixu_wechat_direct_reads';

export interface WechatAccount {
  account: string;
  password: string;
  nickname: string;
  avatarUrl?: string;
  backendOpenid: string;
  backendUserId?: string;
  createdAt: number;
  updatedAt: number;
}

type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface WechatFriendRequest {
  id: string;
  fromAccount: string;
  toAccount: string;
  message?: string;
  status: FriendRequestStatus;
  createdAt: number;
  updatedAt: number;
}

export interface WechatFriendship {
  id: string;
  userA: string;
  userB: string;
  createdAt: number;
}

export interface WechatDirectMessage {
  id: string;
  conversationId: string;
  senderAccount: string;
  text: string;
  createdAt: number;
}

export interface DirectConversationPreview {
  conversationId: string;
  friendAccount: string;
  friendNickname: string;
  friendAvatarUrl?: string;
  lastMessage: string;
  lastMessageAt: number;
  unreadCount: number;
}

function now() {
  return Date.now();
}

function normalizeAccount(account: string) {
  return account.trim().toLowerCase();
}

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = Taro.getStorageSync(key);
    if (raw === '' || raw === undefined || raw === null) return fallback;
    return raw as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown) {
  Taro.setStorageSync(key, value);
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getAccounts() {
  const accounts = safeRead<WechatAccount[]>(ACCOUNTS_KEY, []);
  if (!Array.isArray(accounts)) return [];
  return accounts;
}

function setAccounts(accounts: WechatAccount[]) {
  safeWrite(ACCOUNTS_KEY, accounts);
}

function getFriendRequests() {
  const list = safeRead<WechatFriendRequest[]>(FRIEND_REQUESTS_KEY, []);
  return Array.isArray(list) ? list : [];
}

function setFriendRequests(list: WechatFriendRequest[]) {
  safeWrite(FRIEND_REQUESTS_KEY, list);
}

function getFriendships() {
  const list = safeRead<WechatFriendship[]>(FRIENDSHIPS_KEY, []);
  return Array.isArray(list) ? list : [];
}

function setFriendships(list: WechatFriendship[]) {
  safeWrite(FRIENDSHIPS_KEY, list);
}

function getDirectMessages() {
  const list = safeRead<WechatDirectMessage[]>(DIRECT_MESSAGES_KEY, []);
  return Array.isArray(list) ? list : [];
}

function setDirectMessages(list: WechatDirectMessage[]) {
  safeWrite(DIRECT_MESSAGES_KEY, list.slice(-3000));
}

function getReadMap() {
  return safeRead<Record<string, number>>(DIRECT_READ_KEY, {});
}

function setReadMap(map: Record<string, number>) {
  safeWrite(DIRECT_READ_KEY, map);
}

function readKey(account: string, conversationId: string) {
  return `${account}::${conversationId}`;
}

function directConversationId(accountA: string, accountB: string) {
  const [a, b] = [normalizeAccount(accountA), normalizeAccount(accountB)].sort();
  return `direct:${a}::${b}`;
}

export function registerWechatAccount(payload: { account: string; password: string; nickname: string; avatarUrl?: string }) {
  const account = normalizeAccount(payload.account);
  const password = payload.password.trim();
  const nickname = payload.nickname.trim();

  if (!account) throw new Error('账号不能为空');
  if (account.length < 3) throw new Error('账号至少 3 位');
  if (!password || password.length < 6) throw new Error('密码至少 6 位');
  if (!nickname) throw new Error('昵称不能为空');

  const accounts = getAccounts();
  if (accounts.some((item) => item.account === account)) {
    throw new Error('账号已存在');
  }

  const item: WechatAccount = {
    account,
    password,
    nickname,
    avatarUrl: payload.avatarUrl,
    backendOpenid: `wx-clone-${account}`,
    createdAt: now(),
    updatedAt: now(),
  };

  accounts.push(item);
  setAccounts(accounts);
  return item;
}

export function loginWechatAccount(payload: { account: string; password: string }) {
  const account = normalizeAccount(payload.account);
  const password = payload.password.trim();
  const accounts = getAccounts();
  const found = accounts.find((item) => item.account === account);

  if (!found || found.password !== password) {
    throw new Error('账号或密码错误');
  }

  safeWrite(ACTIVE_ACCOUNT_KEY, account);
  return found;
}

export function logoutWechatAccount() {
  Taro.removeStorageSync(ACTIVE_ACCOUNT_KEY);
}

export function getActiveWechatAccountId() {
  const raw = safeRead<string | undefined>(ACTIVE_ACCOUNT_KEY, undefined);
  if (!raw) return '';
  return normalizeAccount(raw);
}

export function getWechatAccountById(account: string) {
  const target = normalizeAccount(account);
  return getAccounts().find((item) => item.account === target);
}

export function getActiveWechatAccount() {
  const account = getActiveWechatAccountId();
  if (!account) return undefined;
  return getWechatAccountById(account);
}

export function syncActiveAccountProfile(payload: { nickname?: string; avatarUrl?: string; backendUserId?: string }) {
  const account = getActiveWechatAccountId();
  if (!account) return;

  const accounts = getAccounts();
  const idx = accounts.findIndex((item) => item.account === account);
  if (idx < 0) return;

  const current = accounts[idx];
  accounts[idx] = {
    ...current,
    ...(payload.nickname ? { nickname: payload.nickname } : {}),
    ...(payload.avatarUrl !== undefined ? { avatarUrl: payload.avatarUrl } : {}),
    ...(payload.backendUserId ? { backendUserId: payload.backendUserId } : {}),
    updatedAt: now(),
  };

  setAccounts(accounts);
}

export function updateActiveWechatAccountProfile(payload: { nickname: string; avatarUrl?: string }) {
  const account = getActiveWechatAccountId();
  if (!account) throw new Error('未登录账号');

  const nickname = payload.nickname.trim();
  if (!nickname) throw new Error('昵称不能为空');

  const accounts = getAccounts();
  const idx = accounts.findIndex((item) => item.account === account);
  if (idx < 0) throw new Error('账号不存在');

  accounts[idx] = {
    ...accounts[idx],
    nickname,
    avatarUrl: payload.avatarUrl,
    updatedAt: now(),
  };

  setAccounts(accounts);
  return accounts[idx];
}

export function listAllWechatAccounts() {
  return getAccounts();
}

function hasFriendship(accountA: string, accountB: string) {
  const a = normalizeAccount(accountA);
  const b = normalizeAccount(accountB);
  return getFriendships().some((item) => {
    const pair = [item.userA, item.userB].sort();
    return pair[0] === [a, b].sort()[0] && pair[1] === [a, b].sort()[1];
  });
}

export function sendFriendRequest(payload: { toAccount: string; message?: string }) {
  const fromAccount = getActiveWechatAccountId();
  if (!fromAccount) throw new Error('请先登录');

  const toAccount = normalizeAccount(payload.toAccount);
  if (!toAccount) throw new Error('请输入对方账号');
  if (toAccount === fromAccount) throw new Error('不能添加自己');

  const target = getWechatAccountById(toAccount);
  if (!target) throw new Error('目标账号不存在');

  if (hasFriendship(fromAccount, toAccount)) {
    throw new Error('你们已经是好友了');
  }

  const requests = getFriendRequests();
  const existsPending = requests.some(
    (item) =>
      item.status === 'pending' &&
      ((item.fromAccount === fromAccount && item.toAccount === toAccount) ||
        (item.fromAccount === toAccount && item.toAccount === fromAccount)),
  );

  if (existsPending) {
    throw new Error('好友申请已存在，请等待处理');
  }

  const request: WechatFriendRequest = {
    id: createId('fr'),
    fromAccount,
    toAccount,
    message: payload.message?.trim() || '',
    status: 'pending',
    createdAt: now(),
    updatedAt: now(),
  };

  requests.unshift(request);
  setFriendRequests(requests);
  return request;
}

export function listIncomingFriendRequests() {
  const account = getActiveWechatAccountId();
  if (!account) return [] as WechatFriendRequest[];

  return getFriendRequests()
    .filter((item) => item.toAccount === account)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function listOutgoingFriendRequests() {
  const account = getActiveWechatAccountId();
  if (!account) return [] as WechatFriendRequest[];

  return getFriendRequests()
    .filter((item) => item.fromAccount === account)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function ensureFriendship(accountA: string, accountB: string) {
  if (hasFriendship(accountA, accountB)) return;

  const list = getFriendships();
  list.push({
    id: createId('fs'),
    userA: normalizeAccount(accountA),
    userB: normalizeAccount(accountB),
    createdAt: now(),
  });
  setFriendships(list);
}

export function handleFriendRequest(requestId: string, action: 'accept' | 'reject') {
  const account = getActiveWechatAccountId();
  if (!account) throw new Error('请先登录');

  const requests = getFriendRequests();
  const idx = requests.findIndex((item) => item.id === requestId);
  if (idx < 0) throw new Error('申请不存在');

  const request = requests[idx];
  if (request.toAccount !== account) throw new Error('无权处理该申请');
  if (request.status !== 'pending') throw new Error('申请已处理');

  request.status = action === 'accept' ? 'accepted' : 'rejected';
  request.updatedAt = now();

  requests[idx] = request;
  setFriendRequests(requests);

  if (action === 'accept') {
    ensureFriendship(request.fromAccount, request.toAccount);
  }

  return request;
}

function getFriendAccountIds(account: string) {
  const current = normalizeAccount(account);
  return getFriendships().reduce<string[]>((acc, item) => {
    if (item.userA === current) acc.push(item.userB);
    if (item.userB === current) acc.push(item.userA);
    return acc;
  }, []);
}

export function listFriends() {
  const account = getActiveWechatAccountId();
  if (!account) return [] as WechatAccount[];

  const ids = getFriendAccountIds(account);
  const accountMap = new Map(getAccounts().map((item) => [item.account, item]));

  return ids
    .map((id) => accountMap.get(id))
    .filter((item): item is WechatAccount => Boolean(item))
    .sort((a, b) => (a.nickname || a.account).localeCompare(b.nickname || b.account));
}

export function getDirectConversationIdWith(friendAccount: string) {
  const current = getActiveWechatAccountId();
  if (!current) throw new Error('请先登录');

  const target = normalizeAccount(friendAccount);
  if (!target) throw new Error('好友账号无效');
  if (!hasFriendship(current, target)) throw new Error('你们还不是好友');

  return directConversationId(current, target);
}

export function listDirectMessages(conversationId: string) {
  return getDirectMessages()
    .filter((item) => item.conversationId === conversationId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function sendDirectMessage(conversationId: string, text: string) {
  const sender = getActiveWechatAccountId();
  if (!sender) throw new Error('请先登录');
  if (!text.trim()) throw new Error('消息不能为空');

  const messages = getDirectMessages();
  const item: WechatDirectMessage = {
    id: createId('dm'),
    conversationId,
    senderAccount: sender,
    text: text.trim(),
    createdAt: now(),
  };

  messages.push(item);
  setDirectMessages(messages);
  return item;
}

export function markDirectConversationRead(conversationId: string) {
  const account = getActiveWechatAccountId();
  if (!account) return;

  const map = getReadMap();
  map[readKey(account, conversationId)] = now();
  setReadMap(map);
}

function getDirectConversationUnreadCount(account: string, conversationId: string) {
  const map = getReadMap();
  const lastReadAt = map[readKey(account, conversationId)] || 0;

  return listDirectMessages(conversationId).filter((item) => item.senderAccount !== account && item.createdAt > lastReadAt).length;
}

export function listDirectConversationPreviews() {
  const account = getActiveWechatAccountId();
  if (!account) return [] as DirectConversationPreview[];

  const friendIds = getFriendAccountIds(account);
  const accountMap = new Map(getAccounts().map((item) => [item.account, item]));

  const previews = friendIds.map((friendAccount) => {
    const conversationId = directConversationId(account, friendAccount);
    const messages = listDirectMessages(conversationId);
    const last = messages[messages.length - 1];
    const friend = accountMap.get(friendAccount);

    return {
      conversationId,
      friendAccount,
      friendNickname: friend?.nickname || friendAccount,
      friendAvatarUrl: friend?.avatarUrl,
      lastMessage: last?.text || '你们已经成为好友，开始聊天吧',
      lastMessageAt: last?.createdAt || 0,
      unreadCount: getDirectConversationUnreadCount(account, conversationId),
    } satisfies DirectConversationPreview;
  });

  return previews.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export function getAccountLabel(accountId: string) {
  const item = getWechatAccountById(accountId);
  if (!item) return accountId;
  return item.nickname || item.account;
}
