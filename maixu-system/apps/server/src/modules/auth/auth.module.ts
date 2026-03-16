import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { SlotRoleGuard } from '../../common/auth/slot-role.guard';
import { RoomAuthorizationService } from '../../common/auth/room-authorization.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret', 'change_me'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.expiresIn', '7d'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, SlotRoleGuard, RoomAuthorizationService],
  exports: [AuthService, JwtModule, JwtAuthGuard, SlotRoleGuard, RoomAuthorizationService],
})
export class AuthModule {}
