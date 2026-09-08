import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ContactService } from './contact.service';
import { JwtAuthGuard, Public } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { PlatformPermissionGuard } from '../../common/guards/platform-permission.guard';
import { RequirePlatformPermissions } from '../../common/decorators/require-platform-permissions.decorator';
import { IsString, IsEmail, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  company?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}

export class ReplyContactDto {
  @IsString()
  @IsNotEmpty()
  message: string;
}

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private contactService: ContactService) {}

  @Post()
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a contact form (public)' })
  async submitContact(@Body() dto: CreateContactDto) {
    return this.contactService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, SuperAdminGuard, PlatformPermissionGuard)
  @RequirePlatformPermissions('admin.support.view')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all contact submissions (super admin)' })
  async listContacts() {
    return this.contactService.findAll();
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, SuperAdminGuard, PlatformPermissionGuard)
  @RequirePlatformPermissions('admin.support.manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update contact submission status (super admin)' })
  async updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.contactService.updateStatus(id, status);
  }

  @Post(':id/reply')
  @UseGuards(JwtAuthGuard, SuperAdminGuard, PlatformPermissionGuard)
  @RequirePlatformPermissions('admin.support.manage')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send email reply to support ticket submitter (super admin)' })
  async replyToTicket(
    @Param('id') id: string,
    @Body() dto: ReplyContactDto,
    @Req() req: Request & { user?: { email?: string } },
  ) {
    return this.contactService.replyToTicket(id, dto.message, req.user?.email);
  }
}
