import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DemoStoreService } from '../../common/demo/demo-store.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly demoStoreService: DemoStoreService,
    private readonly prisma: PrismaService,
  ) {}

  private get useDemoMode() {
    return !process.env.DATABASE_URL;
  }

  getHealth() {
    return { module: 'auth', ok: true };
  }

  async devLogin(payload: { nickname: string; avatarUrl?: string; openid?: string }) {
    const nickname = payload.nickname?.trim();
    if (!nickname) {
      throw new UnauthorizedException('nickname is required');
    }

    const user = this.useDemoMode
      ? this.demoStoreService.createOrGetUser({
          nickname,
          avatarUrl: payload.avatarUrl,
          openid: payload.openid,
        })
      : await this.createOrUpsertDbUser({
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

  async getMeFromAuthHeader(authorization?: string) {
    if (!authorization) {
      throw new UnauthorizedException('authorization header is required');
    }

    const [type, token] = authorization.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('invalid authorization header');
    }

    const decoded = this.jwtService.verify<{ sub: string }>(token);
    const user = this.useDemoMode
      ? this.demoStoreService.getUserById(decoded.sub)
      : await this.prisma.user.findUnique({ where: { id: decoded.sub } });

    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    return user;
  }

  private async createOrUpsertDbUser(payload: { nickname: string; avatarUrl?: string; openid?: string }) {
    if (payload.openid) {
      return this.prisma.user.upsert({
        where: { openid: payload.openid },
        update: {
          nickname: payload.nickname,
          avatarUrl: payload.avatarUrl,
        },
        create: {
          openid: payload.openid,
          nickname: payload.nickname,
          avatarUrl: payload.avatarUrl,
        },
      });
    }

    return this.prisma.user.create({
      data: {
        nickname: payload.nickname,
        avatarUrl: payload.avatarUrl,
      },
    });
  }
}
