import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { v2 as cloudinary } from "cloudinary"
import { config } from "./config.ts"

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

export const ALLOWED_IMAGE_TYPES = Object.keys(EXTENSIONS)

/** Stores a payment receipt image and returns its public URL. */
export async function saveReceipt(file: { buffer: Buffer; mimetype: string }, orderReference: string) {
  const name = `${orderReference}_${randomUUID()}`

  if (useCloudinary) {
    return new Promise<string>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: "wastecore/receipts", resource_type: "image", public_id: name }, (err, result) =>
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
