import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/guards/jwt-auth.guard';
import { AdminService } from './admin.service';
import { PlatformSettingsService } from './platform-settings.service';

@ApiTags('Public')
@Controller('public')
export class PublicController {
  constructor(
    private readonly adminService: AdminService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  @Get('plans')
  @Public()
  @ApiOperation({ summary: 'Active subscription plans for marketing site' })
  getPlans() {
    return this.adminService.getPublicPlans();
  }

  @Get('site-settings')
  @Public()
  @ApiOperation({ summary: 'Public site CMS — marketing content, SEO, maintenance flag' })
  getSiteSettings() {
    return this.platformSettings.getPublicSiteSettings();
  }
}
