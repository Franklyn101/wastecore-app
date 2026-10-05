import { randomInt } from "node:crypto"

// No 0/O or 1/I/L, so references are easy to read out over the phone.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

export function newReference(prefix: "WC" | "TKT"): string {
  let code = ""
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return `${prefix}-${code}`
}

/** Retries `create` with a fresh reference if one collides with an existing row. */
export async function withUniqueReference<T>(prefix: "WC" | "TKT", create: (reference: string) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await create(newReference(prefix))
    } catch (err) {
      const isCollision = (err as { code?: string })?.code === "P2002"
      if (!isCollision || attempt >= 4) throw err
    }
  }
}
