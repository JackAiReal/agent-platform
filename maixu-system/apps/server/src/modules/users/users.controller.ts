import { BanType, UserStatus } from '@prisma/client';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('health')
  health() {
    return this.usersService.getHealth();
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  search(
    @Query('keyword') keyword?: string,
    @Query('status') status?: UserStatus,
    @Query('roomId') roomId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.search({
      keyword,
      status,
      roomId,
      limit: Number(limit) || 20,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('id/:userId')
  getById(@Param('userId') userId: string) {
    return this.usersService.getById(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':userId/status')
  updateStatus(
    @Param('userId') userId: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { status: UserStatus; reason?: string },
  ) {
    return this.usersService.updateStatus(user.sub, userId, body.status, body.reason);
  }

  @UseGuards(JwtAuthGuard)
  @Get('rooms/:roomId/lists')
  getRoomLists(@Param('roomId') roomId: string) {
    return this.usersService.getRoomLists(roomId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('rooms/:roomId/lists/whitelist')
  setWhitelist(
    @Param('roomId') roomId: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { userId: string; enabled: boolean },
  ) {
    return this.usersService.setRoomList(user.sub, roomId, 'whitelist', body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('rooms/:roomId/lists/blacklist')
  setBlacklist(
    @Param('roomId') roomId: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { userId: string; enabled: boolean },
  ) {
    return this.usersService.setRoomList(user.sub, roomId, 'blacklist', body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('rooms/:roomId/ban-policies')
  listBanPolicies(
    @Param('roomId') roomId: string,
    @Query('banType') banType?: BanType,
    @Query('activeOnly') activeOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.listBanPolicies(roomId, {
      banType,
      activeOnly: activeOnly === 'true',
      limit: Number(limit) || 50,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('rooms/:roomId/ban-policies')
  createBanPolicy(
    @Param('roomId') roomId: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { userId: string; banType: BanType; reason?: string; endAt?: string },
  ) {
    return this.usersService.createBanPolicy(user.sub, roomId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('rooms/:roomId/ban-policies/:policyId')
  deleteBanPolicy(
    @Param('roomId') roomId: string,
    @Param('policyId') policyId: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.usersService.deleteBanPolicy(user.sub, roomId, policyId);
  }
}
