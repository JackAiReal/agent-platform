import { Textarea, ScrollView, Text, View } from '@tarojs/components';
import Taro, { getCurrentInstance, useDidShow, useUnload } from '@tarojs/taro';
import { useMemo, useRef, useState } from 'react';
import type { LeaveNoticeSnapshotVO, RankResponseVO, RoomDetailVO, UserVO } from '@maixu/frontend-sdk';
import { requireLogin } from '../../../services/auth';
import { getCurrentUser, sdk } from '../../../services/sdk';
import { createWsRankSubscription } from '../../../services/ws';
import { showError } from '../../../utils/message';
import './index.scss';

type ChatRole = 'self' | 'bot' | 'member' | 'time';

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  senderName?: string;
  createdAt: number;
}

type BottomPanelType = 'plus' | 'history' | null;

type PlusPanelItem = {
  key: string;
  icon: string;
  label: string;
};

const BOT_NAME = '爱看看';
const HISTORY_LIMIT = 8;
const UNREAD_PILL_THRESHOLD = 20;
const MAX_CHAT_MESSAGES = 300;

const SCORE_MAP: Record<string, number> = {
  手速: 0,
  任务A: 20,
  任务B: 30,
  补: 5,
  'task-a': 20,
  'task-b': 30,
};

const PLUS_PANEL_ITEMS: PlusPanelItem[] = [
  { key: 'album', icon: '🖼️', label: '相册' },
  { key: 'camera', icon: '📷', label: '拍摄' },
  { key: 'call', icon: '📞', label: '语音通话' },
  { key: 'location', icon: '📍', label: '位置' },
  { key: 'redpack', icon: '🧧', label: '红包' },
  { key: 'gift', icon: '🎁', label: '礼物' },
  { key: 'transfer', icon: '💸', label: '转账' },
  { key: 'voice-input', icon: '🎙️', label: '语音输入' },
];

function createId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function buildRankSignature(rank: RankResponseVO | null) {
  if (!rank) return 'empty';
  return rank.entries
    .slice(0, 10)
    .map((item) => `${item.userId}:${item.rank}:${item.sourceContent}:${item.score}`)
    .join('|');
}

function buildLeaveSignature(snapshot: LeaveNoticeSnapshotVO | null) {
  if (!snapshot) return 'empty';
  return snapshot.activeNotices
    .slice(0, 10)
    .map((item) => `${item.userId}:${item.status}:${item.returnDeadline}`)
    .join('|');
}

function resolveRoomId() {
  const fromRouter = getCurrentInstance().router?.params?.roomId;
  if (fromRouter) return fromRouter;

  if (typeof window !== 'undefined') {
    const hash = window.location.hash || '';
    const query = hash.includes('?') ? hash.split('?')[1] : '';
    return new URLSearchParams(query).get('roomId') || '';
  }

  return '';
}

function buildMentionName(entry: RankResponseVO['entries'][number]) {
  return entry.user?.nickname || entry.userId.slice(0, 4);
}

function buildSpeedRankText(rank: RankResponseVO | null) {
  if (!rank) return '手速排名\n当前暂无数据';

  const list = rank.entries.slice(0, 5);

  if (!list.length) {
    return ['手速排名', '当前空麦，发送「全麦+1」或「排麦 手速」即可上榜。'].join('\n');
  }

  const rows = list.map((item, index) => `${index + 1}.@${buildMentionName(item)}(${item.sourceContent || '手速'})`);
  const mentionLine = list.map((item) => `@${buildMentionName(item)}`).join('');

  return ['手速排名', ...rows, '', '──────────', mentionLine].join('\n');
}

function buildHostCardText(rank: RankResponseVO | null, room: RoomDetailVO, hostName: string) {
  const list = rank?.entries.slice(0, 5) || [];
  const slotHour = room.currentSlot.slotHour;
  const endHour = (slotHour + 1) % 24;
  const closeTitle = rank?.slot?.state === 'CLOSED' ? '麦序截止' : '当前麦序列表（1）';

  const rows = list.length
    ? list.map((item, index) => `${index + 1}.@${buildMentionName(item)}(${item.sourceContent || '手速'})`)
    : ['1.（当前无人排麦）'];

  const capacity = Math.max((room.config.maxRank || 6) - list.length, 0);
  const mentionLine = list.length ? list.map((item) => `@${buildMentionName(item)}`).join('') : '@暂无';

  return [
    `主持: ${hostName}`,
    `时间: ${slotHour} - ${endHour}`,
    '──────────',
    closeTitle,
    ...rows,
    `空: ${capacity}`,
    '──────────',
    mentionLine,
    `${slotHour}:30 前可补排`,
  ].join('\n');
}

function buildJoinAck(userName: string, rankValue?: number | null) {
  return [
    `@${userName} 记录全麦关键词+1 成功`,
    `当前时段已全麦至 ${rankValue ?? '-'}${rankValue ? '.0' : ''}`,
    '❗如报备错误，请扣 全麦-1',
  ].join('\n');
}

function parseMathAnswer(promptText?: string) {
  if (!promptText) return null;
  const match = promptText.match(/(-?\d+)\s*([+\-xX*])\s*(-?\d+)/);
  if (!match) return null;

  const a = Number(match[1]);
  const op = match[2];
  const b = Number(match[3]);

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (op === '+') return String(a + b);
  if (op === '-') return String(a - b);
  return String(a * b);
}

function getRecentKey(roomId: string) {
  return `maixu_chat_recent_commands_${roomId}`;
}

function getMessagesKey(roomId: string) {
  return `maixu_chat_messages_${roomId}`;
}

function getReadAtKey(roomId: string) {
  return `maixu_chat_last_read_at_${roomId}`;
}

function loadRecentCommands(roomId: string) {
  if (!roomId) return [] as string[];
  try {
    const raw = Taro.getStorageSync(getRecentKey(roomId)) as string[] | undefined;
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => typeof item === 'string' && item.trim()).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function saveRecentCommands(roomId: string, list: string[]) {
  if (!roomId) return;
  Taro.setStorageSync(getRecentKey(roomId), list.slice(0, HISTORY_LIMIT));
}

function loadCachedMessages(roomId: string): ChatMessage[] {
  if (!roomId) return [];
  try {
    const raw = Taro.getStorageSync(getMessagesKey(roomId)) as ChatMessage[] | undefined;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item) => item && typeof item.text === 'string' && typeof item.createdAt === 'number')
      .slice(-MAX_CHAT_MESSAGES);
  } catch {
    return [];
  }
}

function saveCachedMessages(roomId: string, list: ChatMessage[]) {
  if (!roomId) return;
  Taro.setStorageSync(getMessagesKey(roomId), list.slice(-MAX_CHAT_MESSAGES));
}

function loadLastReadAt(roomId: string) {
  if (!roomId) return 0;
  const raw = Taro.getStorageSync(getReadAtKey(roomId));
  return typeof raw === 'number' ? raw : 0;
}

function saveLastReadAt(roomId: string, timestamp: number) {
  if (!roomId) return;
  Taro.setStorageSync(getReadAtKey(roomId), timestamp);
}

function calcInputLines(text: string) {
  if (!text) return 1;
  const hardLines = text.split('\n');
  const estimated = hardLines.reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 18)), 0);
  return Math.min(3, Math.max(1, estimated));
}

export default function RoomDetailPage() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsCleanupRef = useRef<null | (() => void)>(null);
  const rankSignatureRef = useRef('');
  const leaveSignatureRef = useRef('');
  const initializedRef = useRef(false);
  const lastTimeDividerRef = useRef(0);
  const roomIdRef = useRef('');

  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState<RoomDetailVO | null>(null);
  const [rank, setRank] = useState<RankResponseVO | null>(null);
  const [leaveSnapshot, setLeaveSnapshot] = useState<LeaveNoticeSnapshotVO | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<UserVO | undefined>(() => getCurrentUser<UserVO>());
  const [hostName, setHostName] = useState('小果');
  const [announcement, setAnnouncement] = useState('群公告：欢迎来到排麦群，禁止闲聊，按格式发送关键词参与排麦。');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [scrollIntoView, setScrollIntoView] = useState('');
  const [composer, setComposer] = useState('');
  const [inputLineCount, setInputLineCount] = useState(1);
  const [sending, setSending] = useState(false);

  const [unreadEntryCount, setUnreadEntryCount] = useState(0);
  const [bottomPanel, setBottomPanel] = useState<BottomPanelType>(null);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);

  const hasInputText = useMemo(() => composer.trim().length > 0, [composer]);

  const titleText = useMemo(() => {
    if (!room) return '排麦群';
    const count = memberCount || 1;
    return `${room.name}排麦群🚫闲聊(${count})`;
  }, [room, memberCount]);

  const persistMessages = (list: ChatMessage[]) => {
    const activeRoomId = roomIdRef.current;
    if (!activeRoomId) return;
    saveCachedMessages(activeRoomId, list);
  };

  const setAndPersistMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setMessages((prev) => {
      const next = updater(prev).slice(-MAX_CHAT_MESSAGES);
      persistMessages(next);
      return next;
    });
  };

  const pushMessage = (role: ChatRole, text: string, senderName?: string) => {
    const nextMessage: ChatMessage = {
      id: createId(),
      role,
      text,
      senderName,
      createdAt: Date.now(),
    };

    setAndPersistMessages((prev) => [...prev, nextMessage]);
    setScrollIntoView(nextMessage.id);
  };

  const markConversationRead = () => {
    const activeRoomId = roomIdRef.current;
    if (!activeRoomId) return;
    saveLastReadAt(activeRoomId, Date.now());
    setUnreadEntryCount(0);
  };

  const maybePushTimeDivider = () => {
    const now = Date.now();
    if (!lastTimeDividerRef.current || now - lastTimeDividerRef.current > 4 * 60 * 1000) {
      pushMessage('time', formatTime(now));
      lastTimeDividerRef.current = now;
    }
  };

  const updateRecentCommand = (command: string) => {
    const normalized = command.trim();
    const activeRoomId = roomIdRef.current;
    if (!normalized || !activeRoomId) return;

    setRecentCommands((prev) => {
      const next = [normalized, ...prev.filter((item) => item !== normalized)].slice(0, HISTORY_LIMIT);
      saveRecentCommands(activeRoomId, next);
      return next;
    });
  };

  const hydrateState = async (activeRoomId: string, user?: UserVO) => {
    const roomDetail = await sdk.rooms.detail(activeRoomId);
    const rankData = await sdk.slots.rank(roomDetail.currentSlot.id);

    let leaveData: LeaveNoticeSnapshotVO;
    try {
      leaveData = await sdk.leaveNotices.list(roomDetail.currentSlot.id);
    } catch {
      leaveData = {
        slotId: roomDetail.currentSlot.id,
        activeNotices: [],
        allNotices: [],
        updatedAt: new Date().toISOString(),
      };
    }

    try {
      const resolve = await sdk.hostSchedules.resolve(roomDetail.id, {
        slotDate: roomDetail.currentSlot.slotDate,
        slotHour: roomDetail.currentSlot.slotHour,
      });
      if (resolve.hostUser?.nickname) {
        setHostName(resolve.hostUser.nickname);
      }
    } catch {
      // ignore host resolve error
    }

    try {
      const users = await sdk.users.search({ roomId: roomDetail.id, limit: 200 });
      const uniqueSet = new Set(users.map((item) => item.id));
      rankData.entries.forEach((item) => uniqueSet.add(item.userId));
      leaveData.activeNotices.forEach((item) => uniqueSet.add(item.userId));
      if (user?.id) uniqueSet.add(user.id);
      setMemberCount(Math.max(1, uniqueSet.size));
    } catch {
      const fallbackSet = new Set(rankData.entries.map((item) => item.userId));
      if (user?.id) fallbackSet.add(user.id);
      setMemberCount(Math.max(1, fallbackSet.size));
    }

    setAnnouncement(roomDetail.description?.trim() || '群公告：欢迎来到排麦群，禁止闲聊，按格式发送关键词参与排麦。');

    setRoom(roomDetail);
    setRank(rankData);
    setLeaveSnapshot(leaveData);
    rankSignatureRef.current = buildRankSignature(rankData);
    leaveSignatureRef.current = buildLeaveSignature(leaveData);

    return { roomDetail, rankData, leaveData };
  };

  useDidShow(() => {
    const activeRoomId = resolveRoomId();
    if (!activeRoomId) return;

    roomIdRef.current = activeRoomId;
    setRoomId(activeRoomId);
    setRecentCommands(loadRecentCommands(activeRoomId));

    const cachedMessages = loadCachedMessages(activeRoomId);
    setMessages(cachedMessages);
    if (cachedMessages.length) {
      setScrollIntoView(cachedMessages[cachedMessages.length - 1].id);
    }

    const unreadCount = cachedMessages.filter((item) => item.role !== 'self' && item.createdAt > loadLastReadAt(activeRoomId)).length;
    setUnreadEntryCount(unreadCount >= UNREAD_PILL_THRESHOLD ? unreadCount : 0);

    requireLogin(`/pages/rooms/detail/index?roomId=${activeRoomId}`).then(async (user) => {
      if (!user) return;
      setCurrentUser(user);

      try {
        const loaded = await hydrateState(activeRoomId, user);

        if (!cachedMessages.length && !initializedRef.current) {
          pushMessage('bot', buildSpeedRankText(loaded.rankData), BOT_NAME);
          pushMessage('bot', buildHostCardText(loaded.rankData, loaded.roomDetail, hostName), BOT_NAME);
          maybePushTimeDivider();
          initializedRef.current = true;
        }

        wsCleanupRef.current?.();
        wsCleanupRef.current = createWsRankSubscription({
          slotId: loaded.roomDetail.currentSlot.id,
          roomId: loaded.roomDetail.id,
          onRankUpdated: (nextRank) => {
            setRank(nextRank);
            const signature = buildRankSignature(nextRank);
            if (signature !== rankSignatureRef.current) {
              rankSignatureRef.current = signature;
              pushMessage('bot', buildSpeedRankText(nextRank), BOT_NAME);
            }
          },
          onLeaveNoticeUpdated: (snapshot) => {
            setLeaveSnapshot(snapshot);
            const signature = buildLeaveSignature(snapshot);
            if (signature !== leaveSignatureRef.current) {
              leaveSignatureRef.current = signature;
              if (snapshot.activeNotices.length) {
                pushMessage('bot', `@全体成员 当前有 ${snapshot.activeNotices.length} 人处于报备中`, BOT_NAME);
              }
            }
          },
        });
      } catch (error) {
        showError(error);
      }

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(async () => {
        try {
          await hydrateState(activeRoomId, user);
        } catch {
          // ignore silent poll error
        }
      }, 15000);
    });
  });

  useUnload(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    wsCleanupRef.current?.();
    wsCleanupRef.current = null;
    markConversationRead();
  });

  const ensureChallengeTicketSilently = async () => {
    if (!room || !currentUser?.id || !room.config.enableChallenge) {
      return undefined;
    }

    const issueResult = await sdk.challenges.issue(room.currentSlot.id, {
      userId: currentUser.id,
    });

    if (!issueResult.enabled || issueResult.bypass) {
      return undefined;
    }

    const autoAnswer = issueResult.expectedAnswer || parseMathAnswer(issueResult.promptText);
    if (!autoAnswer) return undefined;

    const verifyResult = await sdk.challenges.verify(room.currentSlot.id, {
      challengeId: issueResult.challengeId || '',
      userId: currentUser.id,
      answer: autoAnswer,
    });

    if (!verifyResult.passed || !verifyResult.ticket) {
      return undefined;
    }

    return verifyResult.ticket;
  };

  const handleJoin = async (sourceContent: string, score: number) => {
    if (!room || !currentUser?.id) return;

    const challengeTicket = await ensureChallengeTicketSilently();

    const result = await sdk.rank.join(room.currentSlot.id, {
      userId: currentUser.id,
      sourceContent,
      score,
      challengeTicket,
    });

    setRank(result.currentRank);
    rankSignatureRef.current = buildRankSignature(result.currentRank);

    if (!result.accepted) {
      throw new Error(result.reason || '排麦失败');
    }

    pushMessage('bot', buildJoinAck(currentUser.nickname || '你', result.rank), BOT_NAME);
    pushMessage('bot', buildHostCardText(result.currentRank, room, hostName), BOT_NAME);
  };

  const handleCancel = async () => {
    if (!room || !currentUser?.id) return;

    const result = await sdk.rank.cancel(room.currentSlot.id, { userId: currentUser.id });
    setRank(result.currentRank);
    rankSignatureRef.current = buildRankSignature(result.currentRank);

    pushMessage('bot', `@${currentUser.nickname || '你'} 已执行全麦-1`, BOT_NAME);
    pushMessage('bot', buildHostCardText(result.currentRank, room, hostName), BOT_NAME);
  };

  const handleLeaveReport = async (minutes: number) => {
    if (!room || !currentUser) return;

    const result = await sdk.leaveNotices.report(room.currentSlot.id, { minutes });
    setLeaveSnapshot(result.snapshot);
    leaveSignatureRef.current = buildLeaveSignature(result.snapshot);
    pushMessage('bot', `@${currentUser.nickname} 报备成功，${minutes} 分钟内回厅`, BOT_NAME);
  };

  const handleLeaveReturn = async () => {
    if (!room || !currentUser) return;

    const result = await sdk.leaveNotices.returnFromLeave(room.currentSlot.id);
    setLeaveSnapshot(result.snapshot);
    leaveSignatureRef.current = buildLeaveSignature(result.snapshot);
    pushMessage('bot', `@${currentUser.nickname} 已回厅`, BOT_NAME);
  };

  const executeCommand = async (rawInput: string) => {
    const input = rawInput.trim().replace(/\s+/g, ' ');
    if (!input || !room) return false;

    if (/^(麦序|榜单|手速排名|查看麦序|\/rank)$/i.test(input)) {
      const nextRank = await sdk.slots.rank(room.currentSlot.id);
      setRank(nextRank);
      rankSignatureRef.current = buildRankSignature(nextRank);
      pushMessage('bot', buildSpeedRankText(nextRank), BOT_NAME);
      pushMessage('bot', buildHostCardText(nextRank, room, hostName), BOT_NAME);
      return true;
    }

    if (/^(取消排麦|取消|全麦-1|\/cancel)$/i.test(input)) {
      await handleCancel();
      return true;
    }

    if (/^(回厅|我回来了|\/back)$/i.test(input)) {
      await handleLeaveReturn();
      return true;
    }

    const leaveMatch = input.match(/^(?:报备|\/leave)(?:\s+(\d+))?$/i);
    if (leaveMatch) {
      const minutes = Number(leaveMatch[1] || '5');
      await handleLeaveReport(Math.min(Math.max(minutes, 1), 60));
      return true;
    }

    const plusOneJoin = /^(全麦\+1|补|手速)$/i.test(input);
    const joinMatch = input.match(/^(?:排麦|\/join)(?:\s+(.+))?$/i);

    if (plusOneJoin || joinMatch) {
      let sourceContent = '手速';
      let score = SCORE_MAP[sourceContent];

      if (/^补$/i.test(input)) {
        sourceContent = '补';
        score = SCORE_MAP[sourceContent] ?? 5;
      }

      if (joinMatch) {
        const payload = (joinMatch[1] || '').trim();
        if (payload) {
          const tokens = payload.split(' ');
          const last = tokens[tokens.length - 1];
          const maybeScore = Number(last);
          const hasScore = Number.isFinite(maybeScore) && /^-?\d+$/.test(last);

          if (hasScore) {
            sourceContent = tokens.slice(0, -1).join(' ') || '手速';
            score = maybeScore;
          } else {
            sourceContent = payload;
            score = SCORE_MAP[sourceContent] ?? 0;
          }
        }
      }

      await handleJoin(sourceContent, score);
      return true;
    }

    if (/^\/host$/i.test(input)) {
      await Taro.navigateTo({ url: `/pages/host/dashboard/index?slotId=${room.currentSlot.id}` });
      return true;
    }

    // 普通聊天内容直接发，不再强制命令
    return false;
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? composer).trim();
    if (!text || !room) return;

    setComposer('');
    setInputLineCount(1);
    setBottomPanel(null);
    updateRecentCommand(text);

    maybePushTimeDivider();
    pushMessage('self', text, currentUser?.nickname || '我');
    setSending(true);

    try {
      await executeCommand(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : '操作失败';
      pushMessage('bot', `❗${message}`, BOT_NAME);
      showError(error);
    } finally {
      setSending(false);
      markConversationRead();
    }
  };

  const handleVoiceIcon = () => {
    if (sending) return;
    handleSend('全麦+1');
  };

  const handleHistoryButton = () => {
    setBottomPanel((prev) => (prev === 'history' ? null : 'history'));
  };

  const handlePlusButton = () => {
    setBottomPanel((prev) => (prev === 'plus' ? null : 'plus'));
  };

  const handlePlusItemClick = (item: PlusPanelItem) => {
    Taro.showToast({ title: `${item.label} 功能开发中`, icon: 'none' });
  };

  const handleAnnouncementClick = async () => {
    await Taro.showModal({
      title: '群公告',
      content: announcement,
      showCancel: false,
      confirmText: '我知道了',
    });
  };

  const handleUnreadPillClick = () => {
    if (messages.length) {
      setScrollIntoView(messages[messages.length - 1].id);
    }
    markConversationRead();
  };

  const textareaExtraProps = {
    onKeyDown: (e: {
      key?: string;
      shiftKey?: boolean;
      preventDefault?: () => void;
    }) => {
      if (e?.key === 'Enter' && !e?.shiftKey) {
        e.preventDefault?.();
        handleSend();
      }
    },
  } as Record<string, unknown>;

  if (!room) {
    return (
      <View className='wechat-chat-page'>
        <View className='wechat-loading'>正在进入群聊...</View>
      </View>
    );
  }

  return (
    <View className='wechat-chat-page'>
      <View className='chat-topbar'>
        <View className='chat-back' onClick={() => Taro.navigateBack()}>‹</View>
        <View className='chat-title-wrap'>
          <Text className='chat-title'>{titleText}</Text>
        </View>
        <View
          className='chat-top-actions'
          onClick={() => Taro.navigateTo({ url: `/pages/rooms/group-info/index?roomId=${room.id}` })}
        >
          <Text className='top-action'>◌</Text>
          <Text className='top-action'>⋯</Text>
        </View>
      </View>

      <View className='chat-notice' onClick={handleAnnouncementClick}>
        <Text className='notice-icon'>🌞</Text>
        <Text className='notice-text'>{announcement}</Text>
      </View>

      {unreadEntryCount >= UNREAD_PILL_THRESHOLD ? (
        <View className='new-msg-pill' onClick={handleUnreadPillClick}>⌃ {unreadEntryCount} 条新消息</View>
      ) : null}

      <ScrollView
        className='chat-scroll'
        scrollY
        enhanced
        showScrollbar={false}
        scrollWithAnimation
        scrollIntoView={scrollIntoView}
      >
        {messages.map((message) => {
          if (message.role === 'time') {
            return (
              <View className='msg-time' id={message.id} key={message.id}>
                <Text>{message.text}</Text>
              </View>
            );
          }

          const isSelf = message.role === 'self';
          const isBot = message.role === 'bot';
          const senderName = message.senderName || (isBot ? BOT_NAME : '成员');

          return (
            <View className={`msg-row ${isSelf ? 'self' : ''}`} id={message.id} key={message.id}>
              {!isSelf ? (
                <View className={`msg-avatar ${isBot ? 'bot' : ''}`}>{senderName.slice(0, 1)}</View>
              ) : null}

              <View className={`msg-main ${isSelf ? 'self' : ''}`}>
                {!isSelf ? <Text className='msg-name'>{senderName}</Text> : null}
                <View className={`msg-bubble ${isSelf ? 'self' : ''}`}>
                  <Text className='msg-text'>{message.text}</Text>
                </View>
              </View>

              {isSelf ? <View className='msg-avatar self'>{senderName.slice(0, 1)}</View> : null}
            </View>
          );
        })}
      </ScrollView>

      <View className='chat-composer'>
        <View className='composer-circle' onClick={handleVoiceIcon}>◉</View>

        <Textarea
          {...textareaExtraProps}
          className={`composer-input ${inputLineCount >= 3 ? 'max-lines' : ''}`}
          value={composer}
          onInput={(e) => {
            const next = e.detail.value;
            setComposer(next);
            setInputLineCount(calcInputLines(next));
          }}
          onConfirm={() => handleSend()}
          maxlength={500}
          showConfirmBar={false}
          confirmType='send'
          fixed
          cursorSpacing={20}
          placeholder='发消息'
          style={{ height: `${inputLineCount * 40 + 20}px` }}
          onFocus={() => setBottomPanel(null)}
        />

        {hasInputText ? (
          <View className={`send-btn ${sending ? 'disabled' : ''}`} onClick={() => handleSend()}>
            发送
          </View>
        ) : (
          <>
            <View className='composer-circle history' onClick={handleHistoryButton}>⏱</View>
            <View className='composer-circle plus' onClick={handlePlusButton}>＋</View>
          </>
        )}
      </View>

      {bottomPanel === 'history' ? (
        <View className='bottom-panel history-panel'>
          <View className='history-title'>最近发送</View>
          {recentCommands.length ? (
            recentCommands.map((item) => (
              <View className='history-item' key={item} onClick={() => handleSend(item)}>
                <Text>{item}</Text>
              </View>
            ))
          ) : (
            <View className='history-empty'>暂无记录</View>
          )}
        </View>
      ) : null}

      {bottomPanel === 'plus' ? (
        <View className='bottom-panel plus-panel'>
          <View className='plus-grid'>
            {PLUS_PANEL_ITEMS.map((item) => (
              <View className='plus-item' key={item.key} onClick={() => handlePlusItemClick(item)}>
                <View className='plus-icon'>{item.icon}</View>
                <Text className='plus-label'>{item.label}</Text>
              </View>
            ))}
          </View>
          <View className='plus-dots'>
            <Text className='dot active'>●</Text>
            <Text className='dot'>○</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
