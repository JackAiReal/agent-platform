-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('USER', 'HOST', 'ROOM_ADMIN', 'SUPER_ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'BANNED');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SlotState" AS ENUM ('PENDING', 'OPENING', 'OPEN', 'SPEED_CLOSED', 'FINAL_OPEN', 'FINAL_CLOSED', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RankEntryStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'INVALID', 'REPLACED', 'TRANSFERRED', 'SETTLED');

-- CreateEnum
CREATE TYPE "RankSourceType" AS ENUM ('KEYWORD', 'MANUAL', 'FIXED', 'TOP_CARD', 'BUY8', 'INSERT', 'TRANSFER', 'CHALLENGE_PASS');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('SPEED', 'TASK', 'TOP', 'BUY8', 'INSERT', 'SPECIAL');

-- CreateEnum
CREATE TYPE "ChallengeType" AS ENUM ('MATH', 'IMAGE_CAPTCHA', 'FAKE_CODE', 'TWO_NUM', 'TWO_HANZI', 'QA');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "LeaveNoticeStatus" AS ENUM ('ACTIVE', 'RETURNED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PerkType" AS ENUM ('TOP_CARD', 'PRIORITY_JOIN', 'SPECIAL_SLOT', 'BUY8_TICKET');

-- CreateEnum
CREATE TYPE "BanType" AS ENUM ('QUEUE_BAN', 'TEMP_BAN', 'COOLDOWN', 'MUTE_ACTION');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('MINIAPP', 'INBOX', 'WECOM');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "MetricSourceType" AS ENUM ('USER', 'HOST', 'ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "openid" TEXT,
    "unionid" TEXT,
    "nickname" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "entryCoverUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRoomRole" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "roleCode" "RoleCode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRoomRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomConfig" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "configKey" TEXT NOT NULL,
    "configValue" JSONB NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomHostSchedule" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "hostUserId" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomHostSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomHostOverride" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "slotDate" DATE NOT NULL,
    "slotHour" INTEGER NOT NULL,
    "hostUserId" UUID NOT NULL,
    "oneTimeOnly" BOOLEAN NOT NULL DEFAULT true,
    "remark" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomHostOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomSlot" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "slotDate" DATE NOT NULL,
    "slotHour" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "speedCloseAt" TIMESTAMP(3) NOT NULL,
    "finalCloseAt" TIMESTAMP(3) NOT NULL,
    "state" "SlotState" NOT NULL DEFAULT 'PENDING',
    "hostUserId" UUID,
    "isFull" BOOLEAN NOT NULL DEFAULT false,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomRuleSet" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomRuleItem" (
    "id" UUID NOT NULL,
    "ruleSetId" UUID NOT NULL,
    "keyword" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "score" DECIMAL(10,2) NOT NULL,
    "ruleType" "RuleType" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomRuleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeInstance" (
    "id" UUID NOT NULL,
    "roomSlotId" UUID NOT NULL,
    "challengeType" "ChallengeType" NOT NULL,
    "promptText" TEXT NOT NULL,
    "promptAssetUrl" TEXT,
    "answerHash" TEXT NOT NULL,
    "answerPayload" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeSubmission" (
    "id" UUID NOT NULL,
    "challengeInstanceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "submitContent" TEXT NOT NULL,
    "isPassed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankEntry" (
    "id" UUID NOT NULL,
    "roomSlotId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sourceType" "RankSourceType" NOT NULL,
    "sourceContent" TEXT NOT NULL,
    "score" DECIMAL(10,2) NOT NULL,
    "status" "RankEntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "isTop" BOOLEAN NOT NULL DEFAULT false,
    "isBuy8" BOOLEAN NOT NULL DEFAULT false,
    "isInsert" BOOLEAN NOT NULL DEFAULT false,
    "originEntryId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RankEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankSnapshot" (
    "id" UUID NOT NULL,
    "roomSlotId" UUID NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "snapshotData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankActionLog" (
    "id" UUID NOT NULL,
    "roomSlotId" UUID NOT NULL,
    "operatorUserId" UUID,
    "targetUserId" UUID,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveNotice" (
    "id" UUID NOT NULL,
    "roomSlotId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "LeaveNoticeStatus" NOT NULL DEFAULT 'ACTIVE',
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnDeadline" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "remindCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPerkInventory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "perkType" "PerkType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "expireAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPerkInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerkUsageLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "roomSlotId" UUID,
    "perkType" "PerkType" NOT NULL,
    "usedQuantity" INTEGER NOT NULL,
    "targetEntryId" UUID,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerkUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricEvent" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "roomSlotId" UUID,
    "metricKey" TEXT NOT NULL,
    "actorUserId" UUID NOT NULL,
    "targetUserId" UUID,
    "delta" DECIMAL(10,2) NOT NULL,
    "hostUserId" UUID,
    "sourceType" "MetricSourceType" NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomBanPolicy" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "banType" "BanType" NOT NULL,
    "reason" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomBanPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorLog" (
    "id" UUID NOT NULL,
    "roomId" UUID,
    "roomSlotId" UUID,
    "operatorUserId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "templateCode" TEXT,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_openid_key" ON "User"("openid");

-- CreateIndex
CREATE UNIQUE INDEX "User_unionid_key" ON "User"("unionid");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- CreateIndex
CREATE INDEX "Room_status_isActive_idx" ON "Room"("status", "isActive");

-- CreateIndex
CREATE INDEX "UserRoomRole_roomId_roleCode_idx" ON "UserRoomRole"("roomId", "roleCode");

-- CreateIndex
CREATE INDEX "UserRoomRole_userId_idx" ON "UserRoomRole"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRoomRole_userId_roomId_roleCode_key" ON "UserRoomRole"("userId", "roomId", "roleCode");

-- CreateIndex
CREATE INDEX "RoomConfig_configKey_idx" ON "RoomConfig"("configKey");

-- CreateIndex
CREATE UNIQUE INDEX "RoomConfig_roomId_configKey_key" ON "RoomConfig"("roomId", "configKey");

-- CreateIndex
CREATE INDEX "RoomHostSchedule_roomId_weekday_startHour_endHour_idx" ON "RoomHostSchedule"("roomId", "weekday", "startHour", "endHour");

-- CreateIndex
CREATE INDEX "RoomHostSchedule_hostUserId_idx" ON "RoomHostSchedule"("hostUserId");

-- CreateIndex
CREATE INDEX "RoomHostOverride_hostUserId_idx" ON "RoomHostOverride"("hostUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomHostOverride_roomId_slotDate_slotHour_key" ON "RoomHostOverride"("roomId", "slotDate", "slotHour");

-- CreateIndex
CREATE INDEX "RoomSlot_roomId_state_idx" ON "RoomSlot"("roomId", "state");

-- CreateIndex
CREATE INDEX "RoomSlot_startAt_idx" ON "RoomSlot"("startAt");

-- CreateIndex
CREATE INDEX "RoomSlot_hostUserId_idx" ON "RoomSlot"("hostUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomSlot_roomId_slotDate_slotHour_key" ON "RoomSlot"("roomId", "slotDate", "slotHour");

-- CreateIndex
CREATE INDEX "RoomRuleSet_roomId_isActive_idx" ON "RoomRuleSet"("roomId", "isActive");

-- CreateIndex
CREATE INDEX "RoomRuleItem_ruleSetId_normalizedKeyword_idx" ON "RoomRuleItem"("ruleSetId", "normalizedKeyword");

-- CreateIndex
CREATE INDEX "RoomRuleItem_ruleSetId_ruleType_idx" ON "RoomRuleItem"("ruleSetId", "ruleType");

-- CreateIndex
CREATE INDEX "ChallengeInstance_roomSlotId_status_idx" ON "ChallengeInstance"("roomSlotId", "status");

-- CreateIndex
CREATE INDEX "ChallengeInstance_expiresAt_idx" ON "ChallengeInstance"("expiresAt");

-- CreateIndex
CREATE INDEX "ChallengeSubmission_challengeInstanceId_userId_idx" ON "ChallengeSubmission"("challengeInstanceId", "userId");

-- CreateIndex
CREATE INDEX "ChallengeSubmission_userId_createdAt_idx" ON "ChallengeSubmission"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RankEntry_roomSlotId_status_idx" ON "RankEntry"("roomSlotId", "status");

-- CreateIndex
CREATE INDEX "RankEntry_roomSlotId_userId_idx" ON "RankEntry"("roomSlotId", "userId");

-- CreateIndex
CREATE INDEX "RankEntry_roomSlotId_score_idx" ON "RankEntry"("roomSlotId", "score");

-- CreateIndex
CREATE INDEX "RankEntry_originEntryId_idx" ON "RankEntry"("originEntryId");

-- CreateIndex
CREATE INDEX "RankSnapshot_roomSlotId_snapshotType_idx" ON "RankSnapshot"("roomSlotId", "snapshotType");

-- CreateIndex
CREATE INDEX "RankActionLog_roomSlotId_action_idx" ON "RankActionLog"("roomSlotId", "action");

-- CreateIndex
CREATE INDEX "RankActionLog_targetUserId_idx" ON "RankActionLog"("targetUserId");

-- CreateIndex
CREATE INDEX "RankActionLog_operatorUserId_createdAt_idx" ON "RankActionLog"("operatorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaveNotice_roomSlotId_status_idx" ON "LeaveNotice"("roomSlotId", "status");

-- CreateIndex
CREATE INDEX "LeaveNotice_userId_createdAt_idx" ON "LeaveNotice"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserPerkInventory_userId_roomId_perkType_idx" ON "UserPerkInventory"("userId", "roomId", "perkType");

-- CreateIndex
CREATE INDEX "UserPerkInventory_expireAt_idx" ON "UserPerkInventory"("expireAt");

-- CreateIndex
CREATE INDEX "PerkUsageLog_userId_perkType_idx" ON "PerkUsageLog"("userId", "perkType");

-- CreateIndex
CREATE INDEX "PerkUsageLog_roomSlotId_idx" ON "PerkUsageLog"("roomSlotId");

-- CreateIndex
CREATE INDEX "MetricEvent_roomId_metricKey_createdAt_idx" ON "MetricEvent"("roomId", "metricKey", "createdAt");

-- CreateIndex
CREATE INDEX "MetricEvent_roomSlotId_idx" ON "MetricEvent"("roomSlotId");

-- CreateIndex
CREATE INDEX "MetricEvent_actorUserId_idx" ON "MetricEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "RoomBanPolicy_roomId_userId_banType_idx" ON "RoomBanPolicy"("roomId", "userId", "banType");

-- CreateIndex
CREATE INDEX "RoomBanPolicy_endAt_idx" ON "RoomBanPolicy"("endAt");

-- CreateIndex
CREATE INDEX "OperatorLog_roomId_createdAt_idx" ON "OperatorLog"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "OperatorLog_roomSlotId_createdAt_idx" ON "OperatorLog"("roomSlotId", "createdAt");

-- CreateIndex
CREATE INDEX "OperatorLog_operatorUserId_createdAt_idx" ON "OperatorLog"("operatorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_channel_idx" ON "NotificationLog"("userId", "channel");

-- CreateIndex
CREATE INDEX "NotificationLog_status_createdAt_idx" ON "NotificationLog"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "UserRoomRole" ADD CONSTRAINT "UserRoomRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoomRole" ADD CONSTRAINT "UserRoomRole_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomConfig" ADD CONSTRAINT "RoomConfig_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomHostSchedule" ADD CONSTRAINT "RoomHostSchedule_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomHostSchedule" ADD CONSTRAINT "RoomHostSchedule_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomHostOverride" ADD CONSTRAINT "RoomHostOverride_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomHostOverride" ADD CONSTRAINT "RoomHostOverride_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomSlot" ADD CONSTRAINT "RoomSlot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomSlot" ADD CONSTRAINT "RoomSlot_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomRuleSet" ADD CONSTRAINT "RoomRuleSet_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomRuleItem" ADD CONSTRAINT "RoomRuleItem_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "RoomRuleSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeInstance" ADD CONSTRAINT "ChallengeInstance_roomSlotId_fkey" FOREIGN KEY ("roomSlotId") REFERENCES "RoomSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeSubmission" ADD CONSTRAINT "ChallengeSubmission_challengeInstanceId_fkey" FOREIGN KEY ("challengeInstanceId") REFERENCES "ChallengeInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeSubmission" ADD CONSTRAINT "ChallengeSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankEntry" ADD CONSTRAINT "RankEntry_roomSlotId_fkey" FOREIGN KEY ("roomSlotId") REFERENCES "RoomSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankEntry" ADD CONSTRAINT "RankEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankSnapshot" ADD CONSTRAINT "RankSnapshot_roomSlotId_fkey" FOREIGN KEY ("roomSlotId") REFERENCES "RoomSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankActionLog" ADD CONSTRAINT "RankActionLog_roomSlotId_fkey" FOREIGN KEY ("roomSlotId") REFERENCES "RoomSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveNotice" ADD CONSTRAINT "LeaveNotice_roomSlotId_fkey" FOREIGN KEY ("roomSlotId") REFERENCES "RoomSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveNotice" ADD CONSTRAINT "LeaveNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPerkInventory" ADD CONSTRAINT "UserPerkInventory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPerkInventory" ADD CONSTRAINT "UserPerkInventory_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerkUsageLog" ADD CONSTRAINT "PerkUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerkUsageLog" ADD CONSTRAINT "PerkUsageLog_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerkUsageLog" ADD CONSTRAINT "PerkUsageLog_roomSlotId_fkey" FOREIGN KEY ("roomSlotId") REFERENCES "RoomSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricEvent" ADD CONSTRAINT "MetricEvent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricEvent" ADD CONSTRAINT "MetricEvent_roomSlotId_fkey" FOREIGN KEY ("roomSlotId") REFERENCES "RoomSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricEvent" ADD CONSTRAINT "MetricEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricEvent" ADD CONSTRAINT "MetricEvent_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricEvent" ADD CONSTRAINT "MetricEvent_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomBanPolicy" ADD CONSTRAINT "RoomBanPolicy_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomBanPolicy" ADD CONSTRAINT "RoomBanPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorLog" ADD CONSTRAINT "OperatorLog_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorLog" ADD CONSTRAINT "OperatorLog_roomSlotId_fkey" FOREIGN KEY ("roomSlotId") REFERENCES "RoomSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

