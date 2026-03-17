import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { DemoStoreService } from '../../common/demo/demo-store.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

type LoginPayload = { nickname: string; avatarUrl?: string; openid?: string; unionid?: string };

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

    const user = await this.createOrUpsertUser({
      nickname,
      avatarUrl: payload.avatarUrl,
      openid: payload.openid,
    });

    return this.issueAuthResult(user);
  }

  async wechatMiniLogin(payload: { code?: string; nickname?: string; avatarUrl?: string; openid?: string }) {
    if (payload.code) {
      const session = await this.fetchWechatMiniSession(payload.code);
      const nickname = payload.nickname?.trim() || `wx_${this.hashShort(session.openid)}`;

      const user = await this.createOrUpsertUser({
        nickname,
        avatarUrl: payload.avatarUrl,
        openid: session.openid,
        unionid: session.unionid,
      });

      return this.issueAuthResult(user);
    }

    if (payload.openid) {
      const nickname = payload.nickname?.trim() || `wx_${this.hashShort(payload.openid)}`;
      const user = await this.createOrUpsertUser({
        nickname,
        avatarUrl: payload.avatarUrl,
        openid: payload.openid,
      });
      return this.issueAuthResult(user);
    }

    throw new UnauthorizedException('code or openid is required for wechat mini login');
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('refreshToken is required');
    }

    const decoded = this.jwtService.verify<{ sub: string; type: string; nickname?: string }>(refreshToken, {
      secret: this.getRefreshSecret(),
    });

    if (decoded.type !== 'refresh') {
      throw new UnauthorizedException('invalid refresh token type');
    }

    const user = this.useDemoMode
      ? this.demoStoreService.getUserById(decoded.sub)
      : await this.prisma.user.findUnique({ where: { id: decoded.sub } });

    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    return this.issueAuthResult(user);
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

  private async createOrUpsertUser(payload: LoginPayload) {
    if (this.useDemoMode) {
      return this.demoStoreService.createOrGetUser({
        nickname: payload.nickname,
        avatarUrl: payload.avatarUrl,
        openid: payload.openid,
      });
    }

    return this.createOrUpsertDbUser(payload);
  }

  private issueAuthResult(user: { id: string; nickname: string }) {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      nickname: user.nickname,
      type: 'access',
    });

    const refreshToken = this.jwtService.sign(
      {
        sub: user.id,
        nickname: user.nickname,
        type: 'refresh',
      },
      {
        secret: this.getRefreshSecret(),
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
      },
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      user,
    };
  }

  private getRefreshSecret() {
    return process.env.JWT_REFRESH_SECRET || `${process.env.JWT_SECRET || 'change_me'}:refresh`;
  }

  private async fetchWechatMiniSession(code: string) {
    const appid = process.env.WECHAT_MINI_APP_ID;
    const secret = process.env.WECHAT_MINI_APP_SECRET;

    if (!appid || !secret) {
      throw new UnauthorizedException('wechat mini app credentials are not configured');
    }

    const url =
      `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}` +
      `&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;

    const response = await fetch(url);
    const data = (await response.json()) as {
      openid?: string;
      unionid?: string;
      errcode?: number;
      errmsg?: string;
    };

    if (!response.ok || data.errcode || !data.openid) {
      throw new UnauthorizedException(`wechat login failed: ${data.errmsg || response.statusText}`);
    }

    return {
      openid: data.openid,
      unionid: data.unionid,
    };
  }

  private hashShort(input: string) {
    return createHash('sha1').update(input).digest('hex').slice(0, 8);
  }

  private async createOrUpsertDbUser(payload: LoginPayload) {
    if (payload.openid) {
      return this.prisma.user.upsert({
        where: { openid: payload.openid },
        update: {
          nickname: payload.nickname,
          avatarUrl: payload.avatarUrl,
          ...(payload.unionid ? { unionid: payload.unionid } : {}),
        },
        create: {
          openid: payload.openid,
          ...(payload.unionid ? { unionid: payload.unionid } : {}),
          nickname: payload.nickname,
          avatarUrl: payload.avatarUrl,
        },
      });
    }

    const existing = await this.prisma.user.findFirst({
      where: { nickname: payload.nickname },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          nickname: payload.nickname,
          avatarUrl: payload.avatarUrl,
          ...(payload.unionid ? { unionid: payload.unionid } : {}),
        },
      });
    }

    return this.prisma.user.create({
      data: {
        nickname: payload.nickname,
        avatarUrl: payload.avatarUrl,
        ...(payload.openid ? { openid: payload.openid } : {}),
        ...(payload.unionid ? { unionid: payload.unionid } : {}),
      },
    });
  }
}
