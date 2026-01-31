import { DeleteObjectsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Express } from 'express';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.getOrThrow<string>('S3_ENDPOINT');
    const region = this.configService.get<string>('S3_REGION', 'ru-1');
    const accessKeyId =
      this.configService.getOrThrow<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.getOrThrow<string>(
      'S3_SECRET_ACCESS_KEY',
    );

    this.bucketName = this.configService.getOrThrow<string>('S3_BUCKET');
    this.publicBaseUrl = `https://${this.bucketName}.s3.twcstorage.ru`;

    this.s3Client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
    const extension = extname(file.originalname);
    const filename = `${uuidv4()}${extension}`;
    const key = normalizedFolder ? `${normalizedFolder}/${filename}` : filename;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      return `${this.publicBaseUrl}/${key}`;
    } catch (error: any) {
      this.logger.error(
        `Failed to upload file ${file.originalname} to S3`,
        error?.stack || error?.message || String(error),
      );
      throw error;
    }
  }

  async deleteFilesByUrls(urls: string[]): Promise<number> {
    const keys = urls
      .map((url) => this.extractKeyFromUrl(url))
      .filter((key): key is string => Boolean(key));

    const uniqueKeys = Array.from(new Set(keys));
    if (uniqueKeys.length === 0) {
      return 0;
    }

    try {
      await this.s3Client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucketName,
          Delete: {
            Objects: uniqueKeys.map((key) => ({ Key: key })),
            Quiet: true,
          },
        }),
      );

      return uniqueKeys.length;
    } catch (error: any) {
      this.logger.error(
        `Failed to delete ${uniqueKeys.length} file(s) from S3`,
        error?.stack || error?.message || String(error),
      );
      throw error;
    }
  }

  private extractKeyFromUrl(url: string): string | null {
    if (!url) {
      return null;
    }

    if (url.startsWith(`${this.publicBaseUrl}/`)) {
      return url.slice(this.publicBaseUrl.length + 1);
    }

    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname?.replace(/^\/+/, '') ?? '';
      return pathname || null;
    } catch {
      return null;
    }
  }
}
