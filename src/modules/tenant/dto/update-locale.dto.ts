import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export const SUPPORTED_LOCALES = [
  'en',
  'ar',
  'de',
  'es',
  'fr',
  'hi',
  'ja',
  'pt',
  'ur',
  'zh',
] as const;

export class UpdateLocaleDto {
  @ApiProperty({ example: 'ar', enum: SUPPORTED_LOCALES })
  @IsString()
  @IsIn([...SUPPORTED_LOCALES])
  locale: string;
}
