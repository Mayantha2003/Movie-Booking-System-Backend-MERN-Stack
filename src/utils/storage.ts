import { randomUUID } from "crypto";
import { getSupabase, STORAGE_BUCKET } from "../config/supabase";

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

const EXTENSION: Record<ImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Look at the real file bytes. The mimetype sent by the browser can be faked.
export const detectImageType = (b: Buffer): ImageType | null => {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
};

// Uploads to Supabase Storage and returns the FULL public URL.
export const uploadImage = async (buffer: Buffer, type: ImageType, folder: string) => {
  const path = `${folder}/${Date.now()}-${randomUUID()}.${EXTENSION[type]}`;
  const storage = getSupabase().storage.from(STORAGE_BUCKET);

  const { error } = await storage.upload(path, buffer, {
    contentType: type,
    cacheControl: "31536000", // file names are unique, so browsers may cache for a year
    upsert: false,
  });
  if (error) throw error;

  const { data } = storage.getPublicUrl(path);
  return { url: data.publicUrl, path };
};

// "https://x.supabase.co/storage/v1/object/public/<bucket>/posters/a.jpg" -> "posters/a.jpg"
// Returns null for links that are not in our bucket (e.g. an old external link).
export const pathFromPublicUrl = (url?: string | null): string | null => {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
};

// Best-effort cleanup of an image we no longer use. Never throws.
export const deleteImageByUrl = async (url?: string | null) => {
  const path = pathFromPublicUrl(url);
  if (!path) return;
  try {
    await getSupabase().storage.from(STORAGE_BUCKET).remove([path]);
  } catch (error) {
    console.warn("Could not delete image:", path, error);
  }
};