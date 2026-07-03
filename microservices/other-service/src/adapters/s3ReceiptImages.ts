import { randomUUID } from "node:crypto";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Resource } from "sst";

import {
  ImageNotFoundError,
  ImageTooLargeError,
  UnsupportedMediaTypeError,
} from "../types/errors";

const ACCEPTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

type AcceptedMediaType = (typeof ACCEPTED_MEDIA_TYPES)[number];

const EXTENSION_BY_MEDIA_TYPE: Record<AcceptedMediaType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

function isAcceptedMediaType(
  value: string | undefined,
): value is AcceptedMediaType {
  return !!value && (ACCEPTED_MEDIA_TYPES as readonly string[]).includes(value);
}

export type ReceiptImage = {
  base64Data: string;
  mediaType: AcceptedMediaType;
};

export type UploadUrlResult = {
  key: string;
  uploadUrl: string;
  expiresIn: number;
};

const UPLOAD_URL_EXPIRY_SECONDS = 300;

/**
 * 8 MB ceiling on the stored image. Base64 inflates by 4/3 (≈10.7 MB),
 * which stays comfortably inside Claude's 32 MB request limit and bounds
 * what a Lambda buffers in memory. Checked against GetObject's
 * ContentLength header BEFORE the body is read, so an oversized object is
 * rejected without paying to download or encode it.
 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

let s3Client: S3Client | undefined;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: process.env.AWS_REGION });
  }
  return s3Client;
}

function getBucketName(): string {
  return Resource.ReceiptImages.name;
}

function isNoSuchKeyError(error: unknown): boolean {
  const name = (error as { name?: string } | undefined)?.name;
  return name === "NoSuchKey" || name === "NotFound";
}

export class S3ReceiptImagesAdapter {
  constructor(private readonly injectedClient?: S3Client) {}

  private get client(): S3Client {
    return this.injectedClient ?? getS3Client();
  }

  async getImage(key: string): Promise<ReceiptImage> {
    let object;
    try {
      object = await this.client.send(
        new GetObjectCommand({ Bucket: getBucketName(), Key: key }),
      );
    } catch (error) {
      if (isNoSuchKeyError(error)) {
        throw new ImageNotFoundError(key);
      }
      throw error;
    }

    if (!object.Body) {
      throw new ImageNotFoundError(key);
    }

    if (!isAcceptedMediaType(object.ContentType)) {
      throw new UnsupportedMediaTypeError(object.ContentType ?? "unknown");
    }

    if (
      object.ContentLength !== undefined &&
      object.ContentLength > MAX_IMAGE_BYTES
    ) {
      throw new ImageTooLargeError(object.ContentLength, MAX_IMAGE_BYTES);
    }

    const bytes = await object.Body.transformToByteArray();
    const base64Data = Buffer.from(bytes).toString("base64");

    return { base64Data, mediaType: object.ContentType };
  }

  async createUploadUrl(contentType: string): Promise<UploadUrlResult> {
    if (!isAcceptedMediaType(contentType)) {
      throw new UnsupportedMediaTypeError(contentType);
    }

    const extension = EXTENSION_BY_MEDIA_TYPE[contentType];
    const key = `receipts/${randomUUID()}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: UPLOAD_URL_EXPIRY_SECONDS,
    });

    return { key, uploadUrl, expiresIn: UPLOAD_URL_EXPIRY_SECONDS };
  }
}
