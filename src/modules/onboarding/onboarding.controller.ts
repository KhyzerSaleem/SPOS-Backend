import { Controller, Get, Post, Put, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SkipSubscription } from '../../common/decorators/skip-subscription.decorator';
import { OnboardingService } from './onboarding.service';
import {
  CompleteOnboardingDto,
  UpdateUiModeDto,
  UpdateCatalogModeDto,
} from './dto/complete-onboarding.dto';

@ApiTags('Onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@SkipSubscription()
@Controller('onboarding')
export class OnboardingController {
  constructor(private svc: OnboardingService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get onboarding state' })
  async getStatus(@Req() req: Request) {
    const user = req.user as any;
    return this.svc.getStatus(user.tenantId);
  }

  @Post('complete')
  @ApiOperation({ summary: 'Complete onboarding wizard and optionally apply starter template' })
  async complete(@Req() req: Request, @Body() dto: CompleteOnboardingDto) {
    const user = req.user as any;
    const storeId = (req as any).headers['x-store-id'] as string | undefined;
    return this.svc.completeOnboarding(user.tenantId, storeId, dto);
  }

  @Put('ui-mode')
  @ApiOperation({ summary: 'Update tenant UI mode (simple / advanced)' })
  async updateUiMode(@Req() req: Request, @Body() dto: UpdateUiModeDto) {
    const user = req.user as any;
    return this.svc.updateUiMode(user.tenantId, dto.uiMode);
  }

  @Put('catalog-mode')
  @ApiOperation({ summary: 'Update tenant catalog mode (per_store / central)' })
  async updateCatalogMode(@Req() req: Request, @Body() dto: UpdateCatalogModeDto) {
    const user = req.user as any;
    return this.svc.updateCatalogMode(user.tenantId, dto.catalogMode);
  }
}
