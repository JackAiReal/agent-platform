import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DemoStoreService } from '../../common/demo/demo-store.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly demoStoreService: DemoStoreService,
  ) {}

  getHealth() {
    return { module: 'auth', ok: true };
  }

  devLogin(payload: { nickname: string; avatarUrl?: string; openid?: string }) {
    const nickname = payload.nickname?.trim();
    if (!nickname) {
      throw new UnauthorizedException('nickname is required');
    }

    const user = this.demoStoreService.createOrGetUser({
      nickname,
      avatarUrl: payload.avatarUrl,
      openid: payload.openid,
    });

    const accessToken = this.jwtService.sign({
      sub: user.id,
      nickname: user.nickname,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      user,
    };
  }

  getMeFromAuthHeader(authorization?: string) {
    if (!authorization) {
      throw new UnauthorizedException('authorization header is required');
    }

    const [type, token] = authorization.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('invalid authorization header');
    }

    const decoded = this.jwtService.verify<{ sub: string }>(token);
    const user = this.demoStoreService.getUserById(decoded.sub);

    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    return user;
  }
}
