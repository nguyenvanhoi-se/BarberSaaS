import { AppError } from "../utils/app-error";

export const IMAGE_TYPES = {
  "image/jpeg": { extension: "jpg", extensions: ["jpg", "jpeg"] },
  "image/png": { extension: "png", extensions: ["png"] },
  "image/webp": { extension: "webp", extensions: ["webp"] },
} as const;

export type ImageContentType = keyof typeof IMAGE_TYPES;

export type ImageKind = "logo" | "cover" | "hero" | "barber_avatar" | "service_image" | "gallery";

export function requireMediaBucket(bucket?: R2Bucket): R2Bucket {
  if (!bucket) throw new AppError(503, "STORAGE_NOT_CONFIGURED", "Image uploads are temporarily unavailable because storage is not configured.");
  return bucket;
}

export function publicImageUrl(key: string): string {
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function imageKey(shopId: string, kind: ImageKind, contentType: ImageContentType, resourceId?: string): string {
  const id = crypto.randomUUID();
  const extension = IMAGE_TYPES[contentType].extension;
  switch (kind) {
    case "logo": case "cover": case "hero": case "gallery":
      return `shops/${shopId}/${kind}/${id}.${extension}`;
    case "barber_avatar":
      if (!resourceId) throw new AppError(422, "RESOURCE_REQUIRED", "Barber is required");
      return `shops/${shopId}/barbers/${resourceId}/${id}.${extension}`;
    case "service_image":
      if (!resourceId) throw new AppError(422, "RESOURCE_REQUIRED", "Service is required");
      return `shops/${shopId}/services/${resourceId}/${id}.${extension}`;
  }
}

export function userImageKey(userId: string, contentType: ImageContentType): string {
  return `users/${userId}/${crypto.randomUUID()}.${IMAGE_TYPES[contentType].extension}`;
}

export async function validateImageFile(file: File, maxBytes: number): Promise<ImageContentType> {
  if (file.size > maxBytes) throw new AppError(413, "FILE_TOO_LARGE", "File is too large");
  if (file.size < 1) throw new AppError(422, "INVALID_IMAGE", "Image file is empty");

  const mime = file.type.toLowerCase();
  if (!(mime in IMAGE_TYPES)) throw new AppError(422, "UNSUPPORTED_IMAGE", "Only JPEG, PNG, and WebP images are supported");
  const extension = file.name.split(/[\\/]/u).pop()?.split(".").pop()?.toLowerCase() ?? "";
  if (!(IMAGE_TYPES[mime as ImageContentType].extensions as readonly string[]).includes(extension)) {
    throw new AppError(422, "INVALID_IMAGE", "File extension does not match its image type");
  }

  await throwIfInvalidSignature(file, mime as ImageContentType);
  return mime as ImageContentType;
}

async function throwIfInvalidSignature(file: File, mime: ImageContentType): Promise<void> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const valid = mime === "image/jpeg"
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mime === "image/png"
      ? bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((byte,index)=>bytes[index]===byte)
      : bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
  if (!valid) throw new AppError(422, "INVALID_IMAGE", "Image content does not match its declared type");
}

export function isManagedImageKey(key: string): boolean {
  const id = "[A-Za-z0-9_-]{1,128}";
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  const image = `${uuid}\\.(?:jpg|png|webp)`;
  return new RegExp(`^(?:shops/${id}/(?:logo|cover|hero|gallery)/${image}|shops/${id}/(?:barbers|services)/${id}/${image}|users/${id}/${image})$`, "u").test(key)
    && !key.includes("..") && !key.includes("\\") && !key.includes("%") && !key.includes("//");
}

export class StorageService {
  constructor(private readonly bucket?: R2Bucket) {}

  async upload(key: string, body: ReadableStream<Uint8Array>, contentType: ImageContentType, metadata: Record<string, string>): Promise<void> {
    await requireMediaBucket(this.bucket).put(key, body, { httpMetadata: { contentType }, customMetadata: metadata });
  }

  async delete(key: string): Promise<void> { await requireMediaBucket(this.bucket).delete(key); }
  async get(key: string): Promise<R2ObjectBody | null> { return requireMediaBucket(this.bucket).get(key); }
  async exists(key: string): Promise<boolean> { return (await requireMediaBucket(this.bucket).head(key)) !== null; }
}
