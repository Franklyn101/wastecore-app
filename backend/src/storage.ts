import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { v2 as cloudinary } from "cloudinary"
import multer from "multer"
import { config } from "./config.ts"
import { HttpError } from "./http.ts"

export const UPLOAD_DIR = path.resolve(import.meta.dirname, "..", "uploads")

const useCloudinary = Boolean(
  config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret,
)

if (useCloudinary) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
  })
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
}

const ALLOWED_IMAGE_TYPES = Object.keys(EXTENSIONS)

/** Accepts one image of up to 5 MB, kept in memory until it is checked and saved. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED_IMAGE_TYPES.includes(file.mimetype)
      ? cb(null, true)
      : cb(new HttpError(400, "The photo must be a JPEG, PNG, WEBP or HEIC image.")),
})

/** Checks the file's leading bytes, since the client-declared type can't be trusted. */
export function looksLikeImage(buf: Buffer): boolean {
  const ascii = (start: number, end: number) => buf.subarray(start, end).toString("ascii")
  return (
    (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) || // JPEG
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || // PNG
    (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") ||
    ascii(4, 8) === "ftyp" // HEIC/HEIF (iPhone photos)
  )
}

/** Stores an image (a payment receipt or a collector's proof photo) and returns its public URL. */
export async function saveImage(
  file: { buffer: Buffer; mimetype: string },
  orderReference: string,
  kind: "receipts" | "proof",
) {
  const name = `${orderReference}_${randomUUID()}`

  if (useCloudinary) {
    return new Promise<string>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: `wastecore/${kind}`, resource_type: "image", public_id: name }, (err, result) =>
          err || !result ? reject(err ?? new Error("Cloudinary upload failed")) : resolve(result.secure_url),
        )
        .end(file.buffer)
    })
  }

  const fileName = `${name}.${EXTENSIONS[file.mimetype] ?? "jpg"}`
  await mkdir(UPLOAD_DIR, { recursive: true })
  await writeFile(path.join(UPLOAD_DIR, fileName), file.buffer)
  return `${config.publicUrl}/uploads/${fileName}`
}
