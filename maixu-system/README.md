# Maixu System

排麦系统工程骨架。

## 当前内容

- NestJS 后端骨架
- Prisma schema 第一版
- Redis / WebSocket / Logger / Prisma 基础设施模块
- 核心业务模块占位：auth、users、rooms、room-configs、host-schedules、slots、rank、challenges、leave-notices、notifications、audit

## 快速开始

```bash
cd maixu-system
npm install
cp apps/server/.env.example apps/server/.env
npm run prisma:generate
npm run build:server
npm run dev:server
```

## 下一步建议

1. 先实现 Auth / Rooms / Slots / Rank 主链路
2. 再接 Redis 实时榜单与 WebSocket 推送
3. 然后补 challenge、leave-notices、notifications
