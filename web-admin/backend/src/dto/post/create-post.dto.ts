// src/dto/post/create-post.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePostDto {
  @ApiProperty({
    description: 'Title of the post',
    example: 'How to use NestJS with Prisma',
  })
  title: string;

  @ApiPropertyOptional({
    description: 'Post content',
    example: 'This post explains how to connect NestJS and Prisma...',
  })
  content?: string;

  @ApiProperty({
    description: 'Email of existing author',
    example: 'alice@example.com',
  })
  authorEmail: string;
}
