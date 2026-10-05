import type { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"
import { config } from "./config.ts"
import { prisma } from "./db.ts"
import type { User } from "./generated/prisma/client.ts"
import { HttpError } from "./http.ts"

const TOKEN_TTL = "30d"

declare global {
  namespace Express {
    interface Request {
      user?: User
    }
  }
}

export function signToken(user: Pick<User, "id">): string {
  return jwt.sign({}, config.jwtSecret, { subject: user.id, expiresIn: TOKEN_TTL, algorithm: "HS256" })
}

/** Loads the signed-in user from the Bearer token, or rejects with 401. */
export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, "")
  if (!token) throw new HttpError(401, "Please sign in.")

  let userId: string | undefined
  try {
    userId = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }).sub as string | undefined
  } catch {
    throw new HttpError(401, "Your session has expired. Please sign in again.")
  }
  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null
  if (!user) throw new HttpError(401, "Your session has expired. Please sign in again.")

  req.user = user
  next()
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") throw new HttpError(403, "Admins only.")
  next()
}

/** The signed-in user. Only call in routes behind requireUser. */
export function currentUser(req: Request): User {
  if (!req.user) throw new HttpError(401, "Please sign in.")
  return req.user
}

export function publicUser(user: User) {
  return { id: user.id, name: user.name, phone: user.phone, address: user.address, role: user.role }
}
