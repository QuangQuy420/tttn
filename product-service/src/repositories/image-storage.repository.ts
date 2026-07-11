import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export interface UploadImageInput {
  buffer: Buffer;
  key: string;
  contentType: string;
}

export interface IImageStorageRepository {
  upload(input: UploadImageInput): Promise<string>;
}

/**
 * Wraps `@aws-sdk/client-s3` against MinIO (S3-compatible) for product images (T10).
 * Creates the `product-images` bucket on module init if it doesn't already exist.
 */
@Injectable()
export class S3ImageStorageRepository
  implements IImageStorageRepository, OnModuleInit
{
  private readonly logger = new Logger(S3ImageStorageRepository.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('MINIO_ENDPOINT');
    const accessKeyId = this.configService.get<string>('MINIO_ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>('MINIO_SECRET_KEY');
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'MINIO_ENDPOINT/MINIO_ACCESS_KEY/MINIO_SECRET_KEY are not set — check your .env file.',
      );
    }

    this.bucket =
      this.configService.get<string>('MINIO_BUCKET_PRODUCT_IMAGES') ??
      'product-images';
    this.publicUrl = (
      this.configService.get<string>('MINIO_PUBLIC_URL') ?? endpoint
    ).replace(/\/$/, '');

    this.client = new S3Client({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created MinIO bucket "${this.bucket}"`);
    } catch (error) {
      const code =
        (error as { Code?: string; name?: string })?.Code ??
        (error as { name?: string })?.name;
      if (
        code !== 'BucketAlreadyOwnedByYou' &&
        code !== 'BucketAlreadyExists'
      ) {
        throw error;
      }
    }

    // Product image URLs are served straight to the browser (MINIO_PUBLIC_URL) — the
    // bucket needs public-read so an uploaded image actually loads.
    await this.client.send(
      new PutBucketPolicyCommand({
        Bucket: this.bucket,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${this.bucket}/*`],
            },
          ],
        }),
      }),
    );
  }

  async upload(input: UploadImageInput): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.buffer,
        ContentType: input.contentType,
      }),
    );
    return `${this.publicUrl}/${this.bucket}/${input.key}`;
  }
}
