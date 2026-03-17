import {
  PerkType,
  Prisma,
  PrismaClient,
  RoleCode,
  RoomStatus,
  RuleType,
  SlotState,
  UserStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

async function seedRoomConfigs(roomId: string, config: Record<string, unknown>) {
  for (const [configKey, configValue] of Object.entries(config)) {
    await prisma.roomConfig.upsert({
      where: {
        roomId_configKey: {
          roomId,
          configKey,
        },
      },
      update: {
        configValue: configValue as Prisma.InputJsonValue,
      },
      create: {
        roomId,
        configKey,
        configValue: configValue as Prisma.InputJsonValue,
      },
    });
  }
}

async function main() {
  const admin = await prisma.user.upsert({
    where: { openid: 'seed-admin-openid' },
    update: {
      nickname: '系统管理员',
      status: UserStatus.ACTIVE,
    },
    create: {
      openid: 'seed-admin-openid',
      nickname: '系统管理员',
      status: UserStatus.ACTIVE,
    },
  });

  const host = await prisma.user.upsert({
    where: { openid: 'seed-host-openid' },
    update: {
      nickname: '演示主持',
      status: UserStatus.ACTIVE,
    },
    create: {
      openid: 'seed-host-openid',
      nickname: '演示主持',
      status: UserStatus.ACTIVE,
    },
  });

  const guest = await prisma.user.upsert({
    where: { openid: 'seed-guest-openid' },
    update: {
      nickname: '演示用户',
      status: UserStatus.ACTIVE,
    },
    create: {
      openid: 'seed-guest-openid',
      nickname: '演示用户',
      status: UserStatus.ACTIVE,
    },
  });

  const roomA = await prisma.room.upsert({
    where: { code: 'voice-hall-a' },
    update: {
      name: '一号语音厅',
      description: '默认演示房间 A',
      status: RoomStatus.ACTIVE,
      isActive: true,
    },
    create: {
      code: 'voice-hall-a',
      name: '一号语音厅',
      description: '默认演示房间 A',
      status: RoomStatus.ACTIVE,
      isActive: true,
    },
  });

  const roomB = await prisma.room.upsert({
    where: { code: 'voice-hall-b' },
    update: {
      name: '二号语音厅',
      description: '默认演示房间 B',
      status: RoomStatus.ACTIVE,
      isActive: true,
    },
    create: {
      code: 'voice-hall-b',
      name: '二号语音厅',
      description: '默认演示房间 B',
      status: RoomStatus.ACTIVE,
      isActive: true,
    },
  });

  await seedRoomConfigs(roomA.id, {
    max_rank: 7,
    order_start_minute: 0,
    order_stop_minute: 10,
    order_add_minute: 20,
    allow_cancel: true,
    allow_buy8: true,
    enable_challenge: true,
    challenge_ttl_seconds: 120,
  });

  await seedRoomConfigs(roomB.id, {
    max_rank: 8,
    order_start_minute: 0,
    order_stop_minute: 12,
    order_add_minute: 20,
    allow_cancel: true,
    allow_buy8: false,
    enable_challenge: false,
    challenge_ttl_seconds: 120,
  });

  const roomRoles = [
    { userId: admin.id, roomId: roomA.id, roleCode: RoleCode.SUPER_ADMIN },
    { userId: admin.id, roomId: roomB.id, roleCode: RoleCode.SUPER_ADMIN },
    { userId: host.id, roomId: roomA.id, roleCode: RoleCode.HOST },
    { userId: host.id, roomId: roomA.id, roleCode: RoleCode.ROOM_ADMIN },
    { userId: host.id, roomId: roomB.id, roleCode: RoleCode.HOST },
    { userId: guest.id, roomId: roomA.id, roleCode: RoleCode.USER },
    { userId: guest.id, roomId: roomB.id, roleCode: RoleCode.USER },
  ];

  for (const item of roomRoles) {
    await prisma.userRoomRole.upsert({
      where: {
        userId_roomId_roleCode: {
          userId: item.userId,
          roomId: item.roomId,
          roleCode: item.roleCode,
        },
      },
      update: {},
      create: item,
    });
  }

  await prisma.roomHostSchedule.deleteMany({ where: { roomId: roomA.id } });
  await prisma.roomHostSchedule.deleteMany({ where: { roomId: roomB.id } });

  for (let weekday = 0; weekday <= 6; weekday++) {
    await prisma.roomHostSchedule.create({
      data: {
        roomId: roomA.id,
        weekday,
        startHour: 0,
        endHour: 24,
        hostUserId: host.id,
      },
    });

    await prisma.roomHostSchedule.create({
      data: {
        roomId: roomB.id,
        weekday,
        startHour: 0,
        endHour: 24,
        hostUserId: host.id,
      },
    });
  }

  await prisma.roomRuleSet.deleteMany({ where: { roomId: roomA.id } });
  await prisma.roomRuleSet.deleteMany({ where: { roomId: roomB.id } });

  const roomARuleSet = await prisma.roomRuleSet.create({
    data: {
      roomId: roomA.id,
      name: '默认规则集 A',
      version: 1,
      isActive: true,
      createdById: admin.id,
    },
  });

  const roomBRuleSet = await prisma.roomRuleSet.create({
    data: {
      roomId: roomB.id,
      name: '默认规则集 B',
      version: 1,
      isActive: true,
      createdById: admin.id,
    },
  });

  await prisma.roomRuleItem.createMany({
    data: [
      {
        ruleSetId: roomARuleSet.id,
        keyword: '手速',
        normalizedKeyword: '手速',
        score: 0,
        ruleType: RuleType.SPEED,
      },
      {
        ruleSetId: roomARuleSet.id,
        keyword: '任务A',
        normalizedKeyword: '任务a',
        score: 20,
        ruleType: RuleType.TASK,
      },
      {
        ruleSetId: roomARuleSet.id,
        keyword: '任务B',
        normalizedKeyword: '任务b',
        score: 30,
        ruleType: RuleType.TASK,
      },
      {
        ruleSetId: roomBRuleSet.id,
        keyword: '手速',
        normalizedKeyword: '手速',
        score: 0,
        ruleType: RuleType.SPEED,
      },
      {
        ruleSetId: roomBRuleSet.id,
        keyword: '买8大任务',
        normalizedKeyword: '买8大任务',
        score: 88,
        ruleType: RuleType.BUY8,
      },
    ],
  });

  const slotDate = new Date();
  slotDate.setHours(0, 0, 0, 0);
  const slotHour = new Date().getHours();

  const slotA = await prisma.roomSlot.upsert({
    where: {
      roomId_slotDate_slotHour: {
        roomId: roomA.id,
        slotDate,
        slotHour,
      },
    },
    update: {
      state: SlotState.OPEN,
      hostUserId: host.id,
    },
    create: {
      roomId: roomA.id,
      slotDate,
      slotHour,
      startAt: new Date(slotDate.getTime() + slotHour * 3600 * 1000),
      speedCloseAt: new Date(slotDate.getTime() + slotHour * 3600 * 1000 + 10 * 60 * 1000),
      finalCloseAt: new Date(slotDate.getTime() + slotHour * 3600 * 1000 + 20 * 60 * 1000),
      state: SlotState.OPEN,
      hostUserId: host.id,
    },
  });

  const slotB = await prisma.roomSlot.upsert({
    where: {
      roomId_slotDate_slotHour: {
        roomId: roomB.id,
        slotDate,
        slotHour,
      },
    },
    update: {
      state: SlotState.OPEN,
      hostUserId: host.id,
    },
    create: {
      roomId: roomB.id,
      slotDate,
      slotHour,
      startAt: new Date(slotDate.getTime() + slotHour * 3600 * 1000),
      speedCloseAt: new Date(slotDate.getTime() + slotHour * 3600 * 1000 + 12 * 60 * 1000),
      finalCloseAt: new Date(slotDate.getTime() + slotHour * 3600 * 1000 + 22 * 60 * 1000),
      state: SlotState.OPEN,
      hostUserId: host.id,
    },
  });

  await prisma.rankEntry.deleteMany({ where: { roomSlotId: { in: [slotA.id, slotB.id] } } });

  await prisma.rankEntry.create({
    data: {
      roomSlotId: slotA.id,
      userId: host.id,
      sourceType: 'MANUAL',
      sourceContent: '固定档',
      score: 999,
    },
  });

  await prisma.rankEntry.create({
    data: {
      roomSlotId: slotB.id,
      userId: guest.id,
      sourceType: 'KEYWORD',
      sourceContent: '手速',
      score: 0,
    },
  });

  await prisma.userPerkInventory.upsert({
    where: {
      id: '00000000-0000-0000-0000-000000000001',
    },
    update: {
      userId: guest.id,
      roomId: roomA.id,
      perkType: PerkType.TOP_CARD,
      quantity: 3,
    },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      userId: guest.id,
      roomId: roomA.id,
      perkType: PerkType.TOP_CARD,
      quantity: 3,
    },
  });

  console.log('seed complete');
  console.log({
    users: { admin: admin.id, host: host.id, guest: guest.id },
    rooms: { roomA: roomA.id, roomB: roomB.id },
    slots: { slotA: slotA.id, slotB: slotB.id },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
