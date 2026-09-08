import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import {
  PermissionsGuard,
  RequirePermissions,
  RequireFeature,
} from '../../common/guards/permissions.guard';
import { MigrationService } from './migration.service';
import { ParseImportDto, RunImportDto } from './dto/migration.dto';
import { ImportEntityType } from '../../database/schemas/import-job.schema';

@ApiTags('Migration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StoreGuard, PermissionsGuard)
@RequireFeature('products')
@Controller('migration')
export class MigrationController {
  constructor(private migrationService: MigrationService) {}

  @Get('help/:entityType')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Format help for entity type' })
  help(@Param('entityType') entityType: ImportEntityType) {
    return { helpText: this.migrationService.helpText(entityType) };
  }

  @Get('jobs')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'List recent import jobs' })
  listJobs(@Req() req: Request) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.migrationService.listJobs(user.tenantId, store.id);
  }

  @Get('jobs/:id')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Get import job status' })
  getJob(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.migrationService.getJob(user.tenantId, store.id, id);
  }

  @Post('parse')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Parse upload and preview import (dry run)' })
  parse(@Req() req: Request, @Body() dto: ParseImportDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.migrationService.parseFile({
      tenantId: user.tenantId,
      storeId: store.id,
      userId: user.sub,
      entityType: dto.entityType,
      format: dto.format || 'csv',
      content: dto.content,
      fileName: dto.fileName,
      columnMapping: dto.columnMapping,
      duplicateStrategy: dto.duplicateStrategy,
    });
  }

  @Post('run')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Execute import job' })
  run(@Req() req: Request, @Body() dto: RunImportDto) {
    const user = req.user as any;
    const store = (req as any).store;
    return this.migrationService.runJob(user.tenantId, store.id, user.sub, dto.jobId);
  }
}
