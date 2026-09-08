import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as sanitizeHtml from 'sanitize-html';
import { BlogPost, BlogPostDocument } from './schemas/blog-post.schema';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';

function slugify(input: string): string {
  return (
    (input || '')
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'post'
  );
}

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1',
    'h2',
    'h3',
    'h4',
    'p',
    'a',
    'ul',
    'ol',
    'li',
    'blockquote',
    'strong',
    'em',
    'u',
    's',
    'code',
    'pre',
    'img',
    'br',
    'hr',
    'span',
    'figure',
    'figcaption',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'mark',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'title'],
    span: ['class'],
    code: ['class'],
    pre: ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      rel: 'noopener noreferrer',
      target: '_blank',
    }),
  },
};

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(BlogPost.name)
    private readonly blogModel: Model<BlogPostDocument>,
  ) {}

  /**
   * Sanitize author HTML, inject heading ids, and build a table of contents.
   * Content is stored already-clean so the public page can render it directly.
   */
  prepareContent(html: string): {
    content: string;
    toc: { id: string; text: string; level: number }[];
  } {
    const clean = sanitizeHtml(html || '', SANITIZE_OPTS);

    const toc: {
      id: string;
      text: string;
      level: number;
    }[] = [];

    let i = 0;

    const withIds = clean.replace(
      /<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi,
      (match, level: string, _attrs: string, inner: string) => {
        const text = inner.replace(/<[^>]+>/g, '').trim();

        if (!text) return match;

        const id = `${slugify(text)}-${i++}`;

        toc.push({
          id,
          text,
          level: Number(level),
        });

        return `<h${level} id="${id}">${inner}</h${level}>`;
      },
    );

    return {
      content: withIds,
      toc,
    };
  }

  private readingTimeOf(html: string): number {
    const text = sanitizeHtml(html || '', {
      allowedTags: [],
      allowedAttributes: {},
    });

    const words = text.split(/\s+/).filter(Boolean).length;

    return Math.max(1, Math.ceil(words / 200));
  }

  private excerptOf(html: string): string {
    const text = sanitizeHtml(html || '', {
      allowedTags: [],
      allowedAttributes: {},
    }).trim();

    return text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text;
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    const root = slugify(base);
    let candidate = root;
    let n = 1;

    while (
      await this.blogModel.exists({
        slug: candidate,
        _id: { $ne: excludeId },
      })
    ) {
      n += 1;
      candidate = `${root}-${n}`;
    }

    return candidate;
  }

  async create(dto: CreateBlogDto): Promise<BlogPost> {
    const { content, toc } = this.prepareContent(dto.content || '');

    const slug = await this.uniqueSlug(dto.slug || dto.title);

    const status = dto.status === 'published' ? 'published' : 'draft';

    const doc = await this.blogModel.create({
      title: dto.title,
      slug,
      excerpt: dto.excerpt?.trim() || this.excerptOf(content),
      content,
      toc,
      coverImage: dto.coverImage || '',
      tags: (dto.tags || []).map((s) => s.trim()).filter(Boolean),
      category: dto.category || '',
      authorName: dto.authorName || '',
      authorAvatar: dto.authorAvatar || '',
      status,
      publishedAt: status === 'published' ? new Date() : null,
      readingTime: this.readingTimeOf(content),
      seo: dto.seo || {},
    });

    return doc.toObject();
  }

  async update(id: string, dto: UpdateBlogDto): Promise<BlogPost> {
    const existing = await this.blogModel.findById(id);

    if (!existing) {
      throw new NotFoundException('Post not found');
    }

    if (dto.content !== undefined) {
      const { content, toc } = this.prepareContent(dto.content);

      existing.content = content;
      existing.toc = toc;
      existing.readingTime = this.readingTimeOf(content);

      if (!dto.excerpt && !existing.excerpt) {
        existing.excerpt = this.excerptOf(content);
      }
    }

    if (dto.title !== undefined) {
      existing.title = dto.title;
    }

    if (dto.slug !== undefined) {
      existing.slug = await this.uniqueSlug(dto.slug || existing.title, id);
    }

    if (dto.excerpt !== undefined) {
      existing.excerpt = dto.excerpt.trim();
    }

    if (dto.coverImage !== undefined) {
      existing.coverImage = dto.coverImage;
    }

    if (dto.tags !== undefined) {
      existing.tags = dto.tags.map((s) => s.trim()).filter(Boolean);
    }

    if (dto.category !== undefined) {
      existing.category = dto.category;
    }

    if (dto.authorName !== undefined) {
      existing.authorName = dto.authorName;
    }

    if (dto.authorAvatar !== undefined) {
      existing.authorAvatar = dto.authorAvatar;
    }

    if (dto.seo !== undefined) {
      existing.seo = {
        ...existing.seo,
        ...dto.seo,
      } as any;
    }

    if (dto.status !== undefined) {
      existing.status = dto.status === 'published' ? 'published' : 'draft';

      if (existing.status === 'published' && !existing.publishedAt) {
        existing.publishedAt = new Date();
      }
    }

    await existing.save();

    return existing.toObject();
  }

  async remove(id: string): Promise<{ ok: boolean }> {
    const res = await this.blogModel.findByIdAndDelete(id);

    if (!res) {
      throw new NotFoundException('Post not found');
    }

    return { ok: true };
  }

  // ── Public reads ──────────────────────────────────────────────────────────

  async findPublished(opts: {
    page?: number;
    limit?: number;
    tag?: string;
    category?: string;
    search?: string;
  }) {
    const page = Math.max(1, Number(opts.page) || 1);

    const limit = Math.min(50, Math.max(1, Number(opts.limit) || 9));

    const filter: any = {
      status: 'published',
    };

    if (opts.tag) {
      filter.tags = opts.tag;
    }

    if (opts.category) {
      filter.category = opts.category;
    }

    if (opts.search) {
      filter.title = {
        $regex: opts.search,
        $options: 'i',
      };
    }

    const [items, total] = await Promise.all([
      this.blogModel
        .find(filter)
        .select('-content')
        .sort({
          publishedAt: -1,
          createdAt: -1,
        })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      this.blogModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findBySlug(slug: string) {
    const post = await this.blogModel
      .findOneAndUpdate(
        {
          slug: slug.toLowerCase(),
          status: 'published',
        },
        {
          $inc: {
            views: 1,
          },
        },
        {
          new: true,
        },
      )
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const related = await this.blogModel
      .find({
        _id: {
          $ne: post._id,
        },
        status: 'published',
        ...(post.category
          ? {
              category: post.category,
            }
          : {
              tags: {
                $in: post.tags || [],
              },
            }),
      })
      .select('-content')
      .sort({
        publishedAt: -1,
      })
      .limit(3)
      .lean();

    return {
      post,
      related,
    };
  }

  async meta() {
    const [tags, categories] = await Promise.all([
      this.blogModel.distinct('tags', {
        status: 'published',
      }),

      this.blogModel.distinct('category', {
        status: 'published',
      }),
    ]);

    return {
      tags: (tags as string[]).filter(Boolean).sort(),

      categories: (categories as string[]).filter(Boolean).sort(),
    };
  }

  async publishedSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
    return this.blogModel
      .find({
        status: 'published',
      })
      .select('slug updatedAt')
      .sort({
        publishedAt: -1,
      })
      .lean() as any;
  }

  // ── Admin reads ───────────────────────────────────────────────────────────

  async findAllAdmin(opts: { page?: number; limit?: number; status?: string; search?: string }) {
    const page = Math.max(1, Number(opts.page) || 1);

    const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));

    const filter: any = {};

    if (opts.status) {
      filter.status = opts.status;
    }

    if (opts.search) {
      filter.title = {
        $regex: opts.search,
        $options: 'i',
      };
    }

    const [items, total] = await Promise.all([
      this.blogModel
        .find(filter)
        .select('-content')
        .sort({
          updatedAt: -1,
        })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      this.blogModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findByIdAdmin(id: string) {
    const post = await this.blogModel.findById(id).lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }
}
