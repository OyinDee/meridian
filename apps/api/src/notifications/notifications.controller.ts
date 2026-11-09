import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AccessTokenClaims } from '../auth/tokens.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Recent notifications, newest first' })
  async list(@CurrentUser() user: AccessTokenClaims) {
    const items = await this.prisma.notification.findMany({
      where: { userId: user.sub },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return {
      unread: items.filter((item) => item.readAt === null).length,
      notifications: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body,
        read: item.readAt !== null,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  async markRead(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId: user.sub, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: true };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark every notification as read' })
  async markAllRead(@CurrentUser() user: AccessTokenClaims) {
    await this.prisma.notification.updateMany({
      where: { userId: user.sub, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: true };
  }
}
