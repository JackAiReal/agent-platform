import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('health')
  health() {
    return this.authService.getHealth();
  }

  @Post('dev-login')
  devLogin(@Body() body: { nickname: string; avatarUrl?: string; openid?: string }) {
    return this.authService.devLogin(body);
  }

  @Post('wechat-mini/login')
  wechatMiniLogin(@Body() body: { code?: string; nickname?: string; avatarUrl?: string; openid?: string }) {
    return this.authService.wechatMiniLogin(body);
  }

  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refresh(body.refreshToken);
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    return this.authService.getMeFromAuthHeader(authorization);
  }
}
