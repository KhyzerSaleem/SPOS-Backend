import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { PlatformPermissionGuard } from '../../common/guards/platform-permission.guard';
import { RequirePlatformPermissions } from '../../common/decorators/require-platform-permissions.decorator';
import { BlogService } from './blog.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';

/** Platform-staff blog CMS. Guarded like the rest of the admin panel. */
@ApiTags('Blog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard, PlatformPermissionGuard)
@Controller('blog/admin')
export class BlogAdminController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  @RequirePlatformPermissions('admin.blog.view')
  @ApiOperation({ summary: 'List all posts including drafts' })
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.blog.findAllAdmin({ page: Number(page), limit: Number(limit), status, search });
  }

  @Get(':id')
  @RequirePlatformPermissions('admin.blog.view')
  @ApiOperation({ summary: 'Get one post (any status) for editing' })
  get(@Param('id') id: string) {
    return this.blog.findByIdAdmin(id);
  }

  @Post()
  @RequirePlatformPermissions('admin.blog.manage')
  @ApiOperation({ summary: 'Create a post' })
  create(@Body() dto: CreateBlogDto) {
    return this.blog.create(dto);
  }

  @Patch(':id')
  @RequirePlatformPermissions('admin.blog.manage')
  @ApiOperation({ summary: 'Update a post' })
  update(@Param('id') id: string, @Body() dto: UpdateBlogDto) {
    return this.blog.update(id, dto);
  }

  @Delete(':id')
  @RequirePlatformPermissions('admin.blog.manage')
  @ApiOperation({ summary: 'Delete a post' })
  remove(@Param('id') id: string) {
    return this.blog.remove(id);
  }
}
