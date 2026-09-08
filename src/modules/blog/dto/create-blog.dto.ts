import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class BlogSeoDto {
  @IsOptional() @IsString() @MaxLength(200) metaTitle?: string;
  @IsOptional() @IsString() @MaxLength(400) metaDescription?: string;
  @IsOptional() @IsString() @MaxLength(1000) ogImage?: string;
}

export class CreateBlogDto {
  @IsString() @MinLength(1) @MaxLength(300) title: string;

  @IsOptional() @IsString() @MaxLength(200) slug?: string;

  @IsOptional() @IsString() @MaxLength(600) excerpt?: string;

  @IsOptional() @IsString() content?: string;

  @IsOptional() @IsString() @MaxLength(1000) coverImage?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];

  @IsOptional() @IsString() @MaxLength(120) category?: string;

  @IsOptional() @IsString() @MaxLength(160) authorName?: string;

  @IsOptional() @IsString() @MaxLength(1000) authorAvatar?: string;

  @IsOptional() @IsIn(['draft', 'published']) status?: string;

  @IsOptional() @ValidateNested() @Type(() => BlogSeoDto) seo?: BlogSeoDto;
}
