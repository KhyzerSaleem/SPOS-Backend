import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/guards/permissions.guard';
import { AutomationRunnerService } from './automation-runner.service';

@ApiTags('Automations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('automations')
export class AutomationStatusController {
  constructor(private automationRunner: AutomationRunnerService) {}

  @Get('status')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'List configured automation jobs and latest run status' })
  listStatuses() {
    return this.automationRunner.listJobStatuses();
  }
}
