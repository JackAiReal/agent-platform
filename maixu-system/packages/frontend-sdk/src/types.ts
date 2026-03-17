export interface UserVO {
  id: string;
  nickname: string;
  avatarUrl?: string;
  createdAt?: string;
}

export interface AuthLoginPayload {
  nickname: string;
  avatarUrl?: string;
  openid?: string;
}

export interface AuthLoginResponse {
  accessToken: string;
  tokenType: 'Bearer' | string;
  user: UserVO;
}

export interface RoomConfigVO {
  maxRank: number;
  orderStartMinute: number;
  orderStopMinute: number;
  enableChallenge?: boolean;
  challengeTtlSeconds?: number;
}

export interface SlotVO {
  id: string;
  roomId: string;
  slotDate: string;
  slotHour: number;
  startAt: string;
  speedCloseAt: string;
  finalCloseAt: string;
  state: string;
  isFull: boolean;
}

export interface RoomVO {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  config: RoomConfigVO;
}

export interface RoomListItemVO extends RoomVO {
  currentSlot: SlotVO;
  currentRankCount: number;
}

export interface RoomDetailVO extends RoomVO {
  currentSlot: SlotVO;
  currentRankCount: number;
  topEntries: RankEntryVO[];
}

export interface RankEntryVO {
  rank: number;
  id: string;
  roomSlotId: string;
  userId: string;
  user?: UserVO;
  sourceType: string;
  sourceContent: string;
  score: number;
  status: string;
  inTop: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RankResponseVO {
  slot: SlotVO;
  room: RoomVO;
  entries: RankEntryVO[];
  topEntries: RankEntryVO[];
  maxRank: number;
}

export interface JoinRankPayload {
  userId: string;
  sourceContent: string;
  score: number;
  challengeTicket?: string;
}

export interface CancelRankPayload {
  userId?: string;
  entryId?: string;
}

export interface ManualAddPayload {
  userId: string;
  sourceContent: string;
  score: number;
}

export interface InvalidateEntryPayload {
  entryId: string;
}

export interface TransferEntryPayload {
  entryId: string;
  toUserId: string;
}

export interface JoinRankResponse {
  slotId: string;
  accepted: boolean;
  reason: string | null;
  entry?: {
    id: string;
    roomSlotId: string;
    userId: string;
    sourceType: string;
    sourceContent: string;
    score: number;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  rank?: number | null;
  currentRank: RankResponseVO;
  mode?: string;
}

export interface CancelRankResponse {
  slotId: string;
  cancelled: boolean;
  entry: Record<string, unknown>;
  currentRank: RankResponseVO;
}

export interface ResetSlotResponse {
  slotId: string;
  reset: boolean;
  affectedCount: number;
  slot: SlotVO;
  currentRank: RankResponseVO;
}

export interface TransferEntryResponse {
  slotId: string;
  transferred: boolean;
  fromEntryId: string;
  toEntry: Record<string, unknown>;
  currentRank: RankResponseVO;
}

export interface HostDashboardVO {
  slot: SlotVO;
  room: RoomVO;
  summary: {
    totalEntries: number;
    topCount: number;
    maxRank: number;
    state: string;
    isFull: boolean;
  };
  entries: RankEntryVO[];
  topEntries: RankEntryVO[];
}

export interface ToggleAddStagePayload {
  enabled: boolean;
}

export interface SlotActionResponse {
  slotId: string;
  action: string;
  enabled?: boolean;
  slot: SlotVO;
}

export interface RankPoliciesVO {
  buy8: string;
  topCard: string;
  insert: string;
  cancel: string;
  transfer: string;
}

export interface ChallengeIssuePayload {
  userId: string;
}

export interface ChallengeIssueResponse {
  enabled: boolean;
  bypass: boolean;
  reason?: string;
  challengeId?: string;
  challengeType?: string;
  promptText?: string;
  expiresAt?: string;
  ttlSeconds?: number;
  expectedAnswer?: string;
}

export interface ChallengeVerifyPayload {
  challengeId: string;
  userId: string;
  answer: string;
}

export interface ChallengeVerifyResponse {
  passed: boolean;
  reason: string | null;
  challengeId: string;
  ticket?: string;
  expiresAt?: string;
}

export interface LeaveNoticeVO {
  id: string;
  roomSlotId: string;
  userId: string;
  user?: UserVO;
  status: 'ACTIVE' | 'RETURNED' | 'EXPIRED' | 'CANCELLED' | string;
  startAt: string;
  returnDeadline: string;
  returnedAt?: string;
  remindCount: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveNoticeSnapshotVO {
  slotId: string;
  activeNotices: LeaveNoticeVO[];
  allNotices: LeaveNoticeVO[];
  updatedAt: string;
}

export interface LeaveNoticeMyVO {
  slotId: string;
  notice: LeaveNoticeVO | null;
}

export interface LeaveNoticeReportPayload {
  minutes?: number;
  reason?: string;
}

export interface LeaveNoticeReportResponse {
  slotId: string;
  notice: LeaveNoticeVO;
  snapshot: LeaveNoticeSnapshotVO;
}

export interface LeaveNoticeReturnResponse {
  slotId: string;
  notice: LeaveNoticeVO;
  snapshot: LeaveNoticeSnapshotVO;
}

export interface ApiErrorPayload {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}
