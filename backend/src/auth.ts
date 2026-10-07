import type { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"
import { config } from "./config.ts"
import { prisma } from "./db.ts"
import type { Collector, User } from "./generated/prisma/client.ts"
import { HttpError } from "./http.ts"

const TOKEN_TTL = "30d"

declare global {
  namespace Express {
    interface Request {
      user?: User
      collector?: Collector
    }
  }
}

/** Changes whenever the password does, so older tokens stop working. */
const passwordVersion = (user: Pick<User, "passwordChangedAt">) => user.passwordChangedAt?.getTime() ?? 0

export function signToken(user: Pick<User, "id" | "passwordChangedAt">): string {
  return jwt.sign({ pv: passwordVersion(user) }, config.jwtSecret, {
    subject: user.id,
    expiresIn: TOKEN_TTL,
    algorithm: "HS256",
  })
}

/** Loads the signed-in user from the Bearer token, or rejects with 401. */
export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, "")
  if (!token) throw new HttpError(401, "Please sign in.")

  let claims: jwt.JwtPayload
  try {
    claims = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as jwt.JwtPayload
  } catch {
    throw new HttpError(401, "Your session has expired. Please sign in again.")
  }
  const user = claims.sub ? await prisma.user.findUnique({ where: { id: claims.sub } }) : null
  if (!user) throw new HttpError(401, "Your session has expired. Please sign in again.")
  // Tokens from before the last password change no longer work.
  if ((claims.pv ?? 0) !== passwordVersion(user)) {
    throw new HttpError(401, "Your password was changed. Please sign in again.")
  }

  req.user = user
  next()
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") throw new HttpError(403, "Admins only.")
  next()
}

/** Customer-only routes (ordering, plans, payments, support). Staff and collectors use their own. */
export function requireCustomer(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "CUSTOMER") throw new HttpError(403, "This is for customer accounts.")
  next()
}

/** Lets in only collectors whose collector record is still active. */
export async function requireCollector(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "COLLECTOR") throw new HttpError(403, "Collectors only.")
  const collector = await prisma.collector.findUnique({ where: { userId: req.user.id } })
  if (!collector?.active) throw new HttpError(403, "Your collector account is inactive. Please contact the office.")
  req.collector = collector
  next()
}

/** Jobs are only for collectors staff have approved. */
export function requireApprovedCollector(req: Request, _res: Response, next: NextFunction) {
  if (!req.collector?.approvedAt) {
    throw new HttpError(403, "Your collector account is waiting for approval by the WasteCore office.")
  }
  next()
}

export function currentCollector(req: Request): Collector {
  if (!req.collector) throw new HttpError(403, "Collectors only.")
  return req.collector
}

/** The signed-in user. Only call in routes behind requireUser. */
export function currentUser(req: Request): User {
  if (!req.user) throw new HttpError(401, "Please sign in.")
  return req.user
}

export function publicUser(user: User) {
  return { id: user.id, name: user.name, phone: user.phone, email: user.email, address: user.address, role: user.role }
}
