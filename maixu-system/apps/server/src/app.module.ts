import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import appConfig from './config/app.config';
import dbConfig from './config/db.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { WsModule } from './infrastructure/ws/ws.module';
import { LoggerModule } from './infrastructure/logger/logger.module';
import { DemoStoreModule } from './common/demo/demo-store.module';
import { RepositoriesModule } from './common/repositories/repositories.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { RoomConfigsModule } from './modules/room-configs/room-configs.module';
import { HostSchedulesModule } from './modules/host-schedules/host-schedules.module';
import { SlotsModule } from './modules/slots/slots.module';
import { RankModule } from './modules/rank/rank.module';
import { ChallengesModule } from './modules/challenges/challenges.module';
import { LeaveNoticesModule } from './modules/leave-notices/leave-notices.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, dbConfig, redisConfig, jwtConfig],
    }),
    ScheduleModule.forRoot(),
    LoggerModule,
    DemoStoreModule,
    RepositoriesModule,
    PrismaModule,
    RedisModule,
    WsModule,
    AuthModule,
    UsersModule,
    RoomsModule,
    RoomConfigsModule,
    HostSchedulesModule,
    SlotsModule,
    RankModule,
    ChallengesModule,
    LeaveNoticesModule,
    NotificationsModule,
    AuditModule,
  ],
})
export class AppModule {}
