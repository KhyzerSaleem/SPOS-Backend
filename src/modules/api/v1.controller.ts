import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { Public } from '../../common/guards/jwt-auth.guard';
import { ApiKeyGuard } from './api-key.guard';
import { ApiService } from './api.service';

@ApiTags('Public API v1')
@ApiHeader({ name: 'X-API-Key', required: true })
@Public()
@UseGuards(ApiKeyGuard, ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('v1')
export class V1Controller {
  constructor(private apiService: ApiService) {}

  @Get('products')
  @ApiOperation({ summary: 'List products (respects catalog mode)' })
  async getProducts(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    return this.apiService.getProducts(user.tenantId, query);
  }

  @Get('sales')
  @ApiOperation({ summary: 'List sales (optional storeId filter)' })
  async getSales(@Req() req: Request, @Query() query: any) {
    const user = req.user as any;
    return this.apiService.getSales(user.tenantId, query);
  }

  @Get('stores')
  @ApiOperation({ summary: 'List tenant stores' })
  async getStores(@Req() req: Request) {
    const user = req.user as any;
    return this.apiService.getStores(user.tenantId);
  }
}
