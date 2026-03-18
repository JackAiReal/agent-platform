import { Input, ScrollView, Text, View } from '@tarojs/components';
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

type PlusPanelItem = {
  key: string;
  icon: string;
  label: string;
};

const BOT_NAME = '爱看看';
const HISTORY_LIMIT = 8;
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

function getHistoryKey(roomId: string) {
  return `maixu_chat_recent_commands_${roomId}`;
}

function loadRecentCommands(roomId: string) {
  if (!roomId) return [] as string[];
  try {
    const raw = Taro.getStorageSync(getHistoryKey(roomId)) as string[] | undefined;
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => typeof item === 'string' && item.trim()).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function saveRecentCommands(roomId: string, list: string[]) {
  if (!roomId) return;
  Taro.setStorageSync(getHistoryKey(roomId), list.slice(0, HISTORY_LIMIT));
}

export default function RoomDetailPage() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsCleanupRef = useRef<null | (() => void)>(null);
  const rankSignatureRef = useRef('');
  const leaveSignatureRef = useRef('');
  const initializedRef = useRef(false);
  const lastTimeDividerRef = useRef(0);

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
  const [sending, setSending] = useState(false);

  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showPlusPanel, setShowPlusPanel] = useState(false);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);

  const hasInputText = useMemo(() => composer.trim().length > 0, [composer]);

  const titleText = useMemo(() => {
    if (!room) return '排麦群';
    const count = memberCount || 1;
    return `${room.name}排麦群🚫闲聊(${count})`;
  }, [room, memberCount]);

  const pushMessage = (role: ChatRole, text: string, senderName?: string) => {
    const nextMessage: ChatMessage = {
      id: createId(),
      role,
      text,
      senderName,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, nextMessage].slice(-160));
    setScrollIntoView(nextMessage.id);
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
    if (!normalized || !roomId) return;

    setRecentCommands((prev) => {
      const next = [normalized, ...prev.filter((item) => item !== normalized)].slice(0, HISTORY_LIMIT);
      saveRecentCommands(roomId, next);
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
      setMemberCount(uniqueSet.size || 1);
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

    setRoomId(activeRoomId);
    setRecentCommands(loadRecentCommands(activeRoomId));

    requireLogin(`/pages/rooms/detail/index?roomId=${activeRoomId}`).then(async (user) => {
      if (!user) return;
      setCurrentUser(user);

      try {
        const loaded = await hydrateState(activeRoomId, user);

        if (!initializedRef.current) {
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

    if (!autoAnswer) {
      return undefined;
    }

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
    if (!input || !room) return;

    if (/^(麦序|榜单|手速排名|查看麦序|\/rank)$/i.test(input)) {
      const nextRank = await sdk.slots.rank(room.currentSlot.id);
      setRank(nextRank);
      rankSignatureRef.current = buildRankSignature(nextRank);
      pushMessage('bot', buildSpeedRankText(nextRank), BOT_NAME);
      pushMessage('bot', buildHostCardText(nextRank, room, hostName), BOT_NAME);
      return;
    }

    if (/^(取消排麦|取消|全麦-1|\/cancel)$/i.test(input)) {
      await handleCancel();
      return;
    }

    if (/^(回厅|我回来了|\/back)$/i.test(input)) {
      await handleLeaveReturn();
      return;
    }

    const leaveMatch = input.match(/^(?:报备|\/leave)(?:\s+(\d+))?$/i);
    if (leaveMatch) {
      const minutes = Number(leaveMatch[1] || '5');
      await handleLeaveReport(Math.min(Math.max(minutes, 1), 60));
      return;
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
      return;
    }

    if (/^\/host$/i.test(input)) {
      await Taro.navigateTo({ url: `/pages/host/dashboard/index?slotId=${room.currentSlot.id}` });
      return;
    }

    pushMessage('bot', '可用命令：全麦+1、全麦-1、补、麦序、报备 5、回厅', BOT_NAME);
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? composer).trim();
    if (!text || !room) return;

    setComposer('');
    setShowHistoryPanel(false);
    setShowPlusPanel(false);
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
    }
  };

  const handleVoiceIcon = () => {
    if (sending) return;
    handleSend('全麦+1');
  };

  const handleHistoryButton = () => {
    setShowPlusPanel(false);
    setShowHistoryPanel((prev) => !prev);
  };

  const handlePlusButton = () => {
    setShowHistoryPanel(false);
    setShowPlusPanel((prev) => !prev);
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

      <View className='new-msg-pill'>⌃ 226 条新消息</View>

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

        <Input
          className='composer-input'
          value={composer}
          onInput={(e) => setComposer(e.detail.value)}
          onConfirm={() => handleSend()}
          confirmType='send'
          placeholder='发消息'
          onFocus={() => {
            setShowHistoryPanel(false);
            setShowPlusPanel(false);
          }}
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

      {showHistoryPanel ? (
        <View className='history-panel'>
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

      {showPlusPanel ? (
        <View className='plus-panel'>
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
