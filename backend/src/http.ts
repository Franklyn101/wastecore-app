import type { ErrorRequestHandler } from "express"
import { ZodError } from "zod"

/** An error whose message is safe to show to the API caller. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const first = err.issues[0]
    res.status(400).json({
      error: first?.message ?? "Invalid request.",
      fields: Object.fromEntries(err.issues.map((i) => [i.path.join("."), i.message])),
    })
    return
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  // Multer and body-parser errors carry a status and a safe message.
  if (typeof err?.status === "number" && err.status < 500) {
    res.status(err.status).json({ error: err.message })
    return
  }
  if (err?.name === "MulterError") {
    res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Receipt image must be 5 MB or smaller." : err.message })
    return
  }
  console.error(err)
  res.status(500).json({ error: "Something went wrong. Please try again." })
}
