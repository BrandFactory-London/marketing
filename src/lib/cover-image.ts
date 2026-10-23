import sharp from "sharp";

// The cover as it goes to Wix (γ6 orientation Q3, as amended at approval). Wix's single upload URL takes files up to
// 10 MB, so a larger photo is downscaled to about 2,400px on its long edge, as JPEG. Smaller photos go unchanged.

export const SINGLE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const DOWNSCALE_LONG_EDGE = 2400;
export const DOWNSCALE_QUALITY = 85;

export type PreparedCover = { bytes: Uint8Array; mimeType: string; fileName: string; downscaled: boolean; originalBytes: number };

export async function prepareCover(input: { bytes: Uint8Array; mimeType: string; fileName: string }): Promise<PreparedCover> {
  const originalBytes = input.bytes.byteLength;
  if (originalBytes <= SINGLE_UPLOAD_MAX_BYTES) return { ...input, downscaled: false, originalBytes };
  let output: Buffer;
  try {
    output = await sharp(input.bytes)
      .rotate()
      .resize({ width: DOWNSCALE_LONG_EDGE, height: DOWNSCALE_LONG_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: DOWNSCALE_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new Error(`This photo is ${(originalBytes / 1_000_000).toFixed(1)} MB and could not be read to make a smaller copy. Choose another photo, or a JPEG copy of it.`);
  }
  if (output.byteLength > SINGLE_UPLOAD_MAX_BYTES) throw new Error("Even downscaled, this photo is over 10 MB. Choose another photo.");
  const base = input.fileName.replace(/\.[A-Za-z0-9]+$/, "");
  return { bytes: new Uint8Array(output), mimeType: "image/jpeg", fileName: `${base}.jpg`, downscaled: true, originalBytes };
}
