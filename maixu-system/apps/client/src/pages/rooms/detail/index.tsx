import { Button, Input, ScrollView, Text, View } from '@tarojs/components';
import Taro, { getCurrentInstance, useDidShow, useUnload } from '@tarojs/taro';
import { useRef, useState } from 'react';
import type { LeaveNoticeSnapshotVO, RankResponseVO, RoomDetailVO, UserVO } from '@maixu/frontend-sdk';
import { requireLogin } from '../../../services/auth';
import { getCurrentUser, sdk } from '../../../services/sdk';
import { createWsRankSubscription } from '../../../services/ws';
import { showError } from '../../../utils/message';
import './index.scss';

type ChatRole = 'me' | 'bot' | 'system';

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number;
}

const SCORE_MAP: Record<string, number> = {
  手速: 0,
  任务A: 20,
  任务B: 30,
  'task-a': 20,
  'task-b': 30,
};

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
    .slice(0, 8)
    .map((item) => `${item.userId}:${item.rank}:${item.sourceContent}:${item.score}`)
    .join('|');
}

function buildLeaveSignature(snapshot: LeaveNoticeSnapshotVO | null) {
  if (!snapshot) return 'empty';
  return snapshot.activeNotices
    .slice(0, 8)
    .map((item) => `${item.userId}:${item.status}`)
    .join('|');
}

function buildRankText(rank: RankResponseVO | null, limit = 6) {
  if (!rank) return '当前还没有麦序数据。';
  if (!rank.entries.length) return '当前空麦，直接发「排麦 手速」就能上榜。';

  const rows = rank.entries.slice(0, limit).map((item) => {
    const nickname = item.user?.nickname || item.userId;
    return `No.${item.rank} ${nickname}（${item.sourceContent} / ${item.score}分）`;
  });

  return [`当前共 ${rank.entries.length} 人排麦：`, ...rows].join('\n');
}

function buildCommandHelp() {
  return [
    '可用指令：',
    '1) 排麦 手速',
    '2) 排麦 任务A 20',
    '3) 取消排麦',
    '4) 报备 5',
    '5) 回厅',
    '6) 麦序 / 我的位置',
  ].join('\n');
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

export default function RoomDetailPage() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsCleanupRef = useRef<null | (() => void)>(null);
  const rankSignatureRef = useRef('');
  const leaveSignatureRef = useRef('');
  const initializedRef = useRef(false);

  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState<RoomDetailVO | null>(null);
  const [rank, setRank] = useState<RankResponseVO | null>(null);
  const [leaveSnapshot, setLeaveSnapshot] = useState<LeaveNoticeSnapshotVO | null>(null);
  const [currentUser, setCurrentUser] = useState<UserVO | undefined>(() => getCurrentUser<UserVO>());
  const [wsConnected, setWsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [scrollIntoView, setScrollIntoView] = useState('');
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);

  const pushMessage = (role: ChatRole, text: string) => {
    const nextMessage: ChatMessage = {
      id: createId(),
      role,
      text,
      createdAt: Date.now(),
    };

    setMessages((prev) => {
      const next = [...prev, nextMessage].slice(-120);
      return next;
    });
    setScrollIntoView(nextMessage.id);
  };

  const hydrateState = async (activeRoomId: string) => {
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

    requireLogin(`/pages/rooms/detail/index?roomId=${activeRoomId}`).then(async (user) => {
      if (!user) return;
      setCurrentUser(user);

      try {
        const loaded = await hydrateState(activeRoomId);

        if (!initializedRef.current) {
          pushMessage('system', `已进入群聊：${loaded.roomDetail.name}`);
          pushMessage('bot', '我是麦序机器人，直接给我发指令就行。');
          pushMessage('bot', buildCommandHelp());
          pushMessage('bot', buildRankText(loaded.rankData));
          initializedRef.current = true;
        }

        wsCleanupRef.current?.();
        wsCleanupRef.current = createWsRankSubscription({
          slotId: loaded.roomDetail.currentSlot.id,
          roomId: loaded.roomDetail.id,
          onConnected: () => setWsConnected(true),
          onDisconnected: () => setWsConnected(false),
          onRankUpdated: (nextRank) => {
            setRank(nextRank);
            const signature = buildRankSignature(nextRank);
            if (signature !== rankSignatureRef.current) {
              rankSignatureRef.current = signature;
              pushMessage('bot', `📣 麦序更新\n${buildRankText(nextRank, 5)}`);
            }
          },
          onLeaveNoticeUpdated: (snapshot) => {
            setLeaveSnapshot(snapshot);
            const signature = buildLeaveSignature(snapshot);
            if (signature !== leaveSignatureRef.current) {
              leaveSignatureRef.current = signature;
              pushMessage('bot', `暂离状态更新：当前 ${snapshot.activeNotices.length} 人暂离`);
            }
          },
        });
      } catch (error) {
        showError(error);
      }

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(async () => {
        try {
          await hydrateState(activeRoomId);
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
    setWsConnected(false);
  });

  const ensureChallengeTicket = async () => {
    if (!room || !currentUser?.id || !room.config.enableChallenge) {
      return undefined;
    }

    const issueResult = await sdk.challenges.issue(room.currentSlot.id, {
      userId: currentUser.id,
    });

    if (!issueResult.enabled || issueResult.bypass) {
      return undefined;
    }

    const modal = await Taro.showModal({
      title: '排麦挑战验证',
      content: issueResult.promptText || '请输入挑战答案',
      editable: true,
      placeholderText: '请输入答案',
      confirmText: '提交',
      cancelText: '取消',
    });

    if (!modal.confirm) {
      throw new Error('已取消挑战验证');
    }

    const answer = (modal.content || '').trim();
    if (!answer) {
      throw new Error('请输入挑战答案');
    }

    const verifyResult = await sdk.challenges.verify(room.currentSlot.id, {
      challengeId: issueResult.challengeId || '',
      userId: currentUser.id,
      answer,
    });

    if (!verifyResult.passed || !verifyResult.ticket) {
      throw new Error(verifyResult.reason || '挑战验证失败，请重试');
    }

    return verifyResult.ticket;
  };

  const handleJoin = async (sourceContent: string, score: number) => {
    if (!room || !currentUser?.id) return;

    const challengeTicket = await ensureChallengeTicket();
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

    pushMessage('bot', `✅ 排麦成功，你当前在 No.${result.rank ?? '-'}。`);
    pushMessage('bot', buildRankText(result.currentRank));
  };

  const handleCancel = async () => {
    if (!room || !currentUser?.id) return;

    const result = await sdk.rank.cancel(room.currentSlot.id, { userId: currentUser.id });
    setRank(result.currentRank);
    rankSignatureRef.current = buildRankSignature(result.currentRank);
    pushMessage('bot', '✅ 已取消排麦。');
    pushMessage('bot', buildRankText(result.currentRank));
  };

  const handleLeaveReport = async (minutes: number) => {
    if (!room) return;

    const result = await sdk.leaveNotices.report(room.currentSlot.id, { minutes });
    setLeaveSnapshot(result.snapshot);
    leaveSignatureRef.current = buildLeaveSignature(result.snapshot);
    pushMessage('bot', `📝 已报备暂离 ${minutes} 分钟，记得按时回厅。`);
  };

  const handleLeaveReturn = async () => {
    if (!room) return;

    const result = await sdk.leaveNotices.returnFromLeave(room.currentSlot.id);
    setLeaveSnapshot(result.snapshot);
    leaveSignatureRef.current = buildLeaveSignature(result.snapshot);
    pushMessage('bot', '🙌 已记录回厅，继续排麦。');
  };

  const handleMyStatus = () => {
    if (!currentUser?.id) {
      pushMessage('bot', '你还没登录。');
      return;
    }

    const myEntry = rank?.entries.find((item) => item.userId === currentUser.id);
    const myLeave = leaveSnapshot?.activeNotices.find((item) => item.userId === currentUser.id);

    if (!myEntry) {
      pushMessage('bot', '你当前不在麦序里。发「排麦 手速」就能上麦。');
      return;
    }

    const rows = [
      `你的当前位置：No.${myEntry.rank}`,
      `排麦内容：${myEntry.sourceContent}`,
      `分数：${myEntry.score}`,
    ];

    if (myLeave) {
      rows.push(`暂离中，最晚回厅：${new Date(myLeave.returnDeadline).toLocaleTimeString()}`);
    }

    pushMessage('bot', rows.join('\n'));
  };

  const executeCommand = async (rawInput: string) => {
    const input = rawInput.trim().replace(/\s+/g, ' ');

    if (!input) return;

    if (/^(帮助|菜单|help|\/help)$/i.test(input)) {
      pushMessage('bot', buildCommandHelp());
      return;
    }

    if (/^(麦序|榜单|查看麦序|\/rank)$/i.test(input)) {
      if (room) {
        const nextRank = await sdk.slots.rank(room.currentSlot.id);
        setRank(nextRank);
        rankSignatureRef.current = buildRankSignature(nextRank);
        pushMessage('bot', buildRankText(nextRank));
      }
      return;
    }

    if (/^(我的位置|我的麦序|我在哪|\/me)$/i.test(input)) {
      handleMyStatus();
      return;
    }

    if (/^(取消排麦|取消|\/cancel)$/i.test(input)) {
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

    const joinMatch = input.match(/^(?:排麦|\/join)(?:\s+(.+))?$/i);
    if (joinMatch) {
      const payload = (joinMatch[1] || '').trim();
      let sourceContent = '手速';
      let score = SCORE_MAP[sourceContent];

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

      await handleJoin(sourceContent, score);
      return;
    }

    if (/^\/host$/i.test(input)) {
      if (room) {
        await Taro.navigateTo({ url: `/pages/host/dashboard/index?slotId=${room.currentSlot.id}` });
      }
      return;
    }

    pushMessage('bot', `我主要处理麦序指令。\n${buildCommandHelp()}`);
  };

  const handleSend = async (presetText?: string) => {
    const text = (presetText ?? composer).trim();
    if (!text || !room) return;

    if (!presetText) {
      setComposer('');
    }

    pushMessage('me', text);
    setSending(true);

    try {
      await executeCommand(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : '操作失败';
      pushMessage('bot', `❌ ${message}`);
      showError(error);
    } finally {
      setSending(false);
    }
  };

  if (!room) {
    return (
      <View className='wx-chat-page'>
        <View className='wx-loading'>正在进入群聊...</View>
      </View>
    );
  }

  return (
    <View className='wx-chat-page'>
      <View className='wx-chat-header'>
        <View className='wx-chat-title'>{room.name}</View>
        <Text className='wx-chat-meta'>
          {rank?.entries.length || 0} 人排麦 · {wsConnected ? '实时连接' : '轮询兜底'}
        </Text>
      </View>

      <ScrollView className='wx-message-list' scrollY scrollWithAnimation scrollIntoView={scrollIntoView}>
        {messages.map((message) => (
          <View
            id={message.id}
            key={message.id}
            className={`wx-message-row ${message.role === 'me' ? 'is-me' : ''} ${
              message.role === 'system' ? 'is-system' : ''
            }`}
          >
            {message.role !== 'me' ? (
              <View className={`wx-avatar ${message.role === 'system' ? 'sys' : ''}`}>
                {message.role === 'system' ? '系' : '麦'}
              </View>
            ) : null}

            <View className={`wx-bubble ${message.role === 'me' ? 'me' : ''} ${message.role === 'system' ? 'system' : ''}`}>
              <Text className='wx-text'>{message.text}</Text>
              <Text className='wx-time'>{formatTime(message.createdAt)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View className='wx-quick-actions'>
        <Button className='quick-btn' size='mini' onClick={() => handleSend('排麦 手速')}>
          排麦
        </Button>
        <Button className='quick-btn' size='mini' onClick={() => handleSend('取消排麦')}>
          取消
        </Button>
        <Button className='quick-btn' size='mini' onClick={() => handleSend('麦序')}>
          麦序
        </Button>
        <Button className='quick-btn' size='mini' onClick={() => handleSend('我的位置')}>
          我的
        </Button>
      </View>

      <View className='wx-composer'>
        <Input
          className='wx-input'
          value={composer}
          onInput={(e) => setComposer(e.detail.value)}
          onConfirm={() => handleSend()}
          confirmType='send'
          placeholder='发消息给麦序机器人，例如：排麦 手速'
        />
        <Button className='wx-send-btn' loading={sending} onClick={() => handleSend()}>
          发送
        </Button>
      </View>
    </View>
  );
}
