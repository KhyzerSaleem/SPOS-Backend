import { Controller, Get, Patch, Param, Query, Req, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequireFeature('settings')
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @RequirePermissions('notifications.view')
  @ApiOperation({ summary: 'Get paginated notifications for current user' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'category', required: false })
  async getNotifications(
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('category') category?: string,
  ) {
    const userId = (req.user as any).userId || (req.user as any).sub;
    const result = await this.notificationsService.getNotifications(userId, {
      limit: Number(limit) || undefined,
      page: Number(page) || undefined,
      category,
    });
    const unreadCount = await this.notificationsService.getUnreadCount(userId);
    return { ...result, unreadCount };
  }

  @Get('preferences')
  @RequirePermissions('notifications.view')
  @ApiOperation({ summary: "Get the current user's notification preferences" })
  async getPreferences(@Req() req: Request) {
    const user = req.user as any;
    return this.notificationsService.getPreferences(user.userId || user.sub);
  }

  @Patch('preferences')
  @RequirePermissions('notifications.manage')
  @ApiOperation({ summary: "Update the current user's notification preferences" })
  async updatePreferences(@Req() req: Request, @Body() body: any) {
    const user = req.user as any;
    return this.notificationsService.updatePreferences(user.userId || user.sub, body || {});
  }

  @Patch(':id/read')
  @RequirePermissions('notifications.manage')
  @ApiOperation({ summary: 'Mark notification as read' })
  async markAsRead(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.notificationsService.markAsRead(user.userId || user.sub, id);
  }

  @Patch('read-all')
  @RequirePermissions('notifications.manage')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@Req() req: Request) {
    const user = req.user as any;
    return this.notificationsService.markAllAsRead(user.userId || user.sub);
  }
}
