import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BlogPost, BlogPostSchema } from './schemas/blog-post.schema';
import { BlogService } from './blog.service';
import { BlogController } from './blog.controller';
import { BlogAdminController } from './blog-admin.controller';

/**
 * Platform-level marketing blog: public reads + platform-staff CMS.
 * Content is sanitized on write (see BlogService), so the public page renders
 * stored HTML directly.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: BlogPost.name, schema: BlogPostSchema }])],
  // BlogAdminController MUST be registered before BlogController: its exact
  // `blog/admin` routes would otherwise be captured by BlogController's
  // `blog/:slug` catch-all (slug="admin" → "Post not found"). Route matching is
  // registration-order based, not specificity based.
  controllers: [BlogAdminController, BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
