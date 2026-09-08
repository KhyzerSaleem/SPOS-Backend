import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/guards/jwt-auth.guard';
import { BlogService } from './blog.service';

/** Public marketing-blog reads. All routes are @Public(). */
@ApiTags('Blog')
@Controller('blog')
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List published posts (paginated, filterable)' })
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('tag') tag?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.blog.findPublished({
      page: Number(page),
      limit: Number(limit),
      tag,
      category,
      search,
    });
  }

  // Declared before ':slug' so it isn't captured as a slug param.
  @Get('meta')
  @Public()
  @ApiOperation({ summary: 'Distinct tags + categories for filters' })
  meta() {
    return this.blog.meta();
  }

  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'Get one published post by slug (+ related)' })
  bySlug(@Param('slug') slug: string) {
    return this.blog.findBySlug(slug);
  }
}
