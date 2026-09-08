import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BlogPostDocument = HydratedDocument<BlogPost>;

@Schema({ _id: false })
export class TocItem {
  @Prop() id: string;
  @Prop() text: string;
  @Prop() level: number;
}
const TocItemSchema = SchemaFactory.createForClass(TocItem);

@Schema({ _id: false })
export class BlogSeo {
  @Prop({ default: '' }) metaTitle: string;
  @Prop({ default: '' }) metaDescription: string;
  @Prop({ default: '' }) ogImage: string;
}
const BlogSeoSchema = SchemaFactory.createForClass(BlogSeo);

/**
 * Platform-level (global) marketing blog post — not tenant-scoped. Managed by
 * platform staff, served on the public marketing site. `content` is stored as
 * already-sanitized HTML (see BlogService.prepareContent), with heading ids
 * injected and a table of contents pre-computed.
 */
@Schema({ timestamps: true })
export class BlogPost {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, unique: true, index: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ default: '' })
  excerpt: string;

  @Prop({ default: '' })
  content: string;

  @Prop({ default: '' })
  coverImage: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: '' })
  category: string;

  @Prop({ default: '' })
  authorName: string;

  @Prop({ default: '' })
  authorAvatar: string;

  @Prop({ type: String, enum: ['draft', 'published'], default: 'draft', index: true })
  status: string;

  @Prop({ type: Date, default: null })
  publishedAt: Date;

  @Prop({ default: 1 })
  readingTime: number;

  @Prop({ default: 0 })
  views: number;

  @Prop({ type: [TocItemSchema], default: [] })
  toc: TocItem[];

  @Prop({ type: BlogSeoSchema, default: () => ({}) })
  seo: BlogSeo;
}

export const BlogPostSchema = SchemaFactory.createForClass(BlogPost);
BlogPostSchema.index({ status: 1, publishedAt: -1 });
BlogPostSchema.index({ tags: 1 });
BlogPostSchema.index({ category: 1 });
