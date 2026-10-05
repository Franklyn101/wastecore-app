# WasteCore App

A mobile app for WasteCore waste collection, built with **React Native + Expo** on a **Node.js + PostgreSQL** backend.

It follows the WasteCore WhatsApp bot's service flow as a native app, but it is a separate project with its own code and database.

```
wastecore-app/
├── backend/   Express 5 + TypeScript API, PostgreSQL via Prisma, JWT auth
└── mobile/    Expo (SDK 57) app with Expo Router, for iOS, Android and web
```

## What the app does

| Bot menu option | In the app |
| --- | --- |
| 1 – Instant Pickup (₦2,000) | **Instant pickup**: address, waste type, date |
| 2 – Weekly Pickup | **Weekly pickup**: 1/2/3 pickups per week, address, waste type, first date |
| 3 – Upgrade Plan | **Upgrade plan**: Basic, Standard or Premium, address, start date |
| 4 – Order Waste Bags | **Waste bags**: size, number of packs, delivery address |
| 5 – Speak to Support | **Support**: category, description, preferred contact time, plus a ticket ID |
| Bank transfer + receipt image | Order screen shows bank details (tap to copy the account number). The customer uploads a receipt from the gallery or camera. |
| "Active Request Found" | Home screen lists active requests. The **My orders** tab shows all orders with live status. |
| Typing `cancel` | Unpaid orders can be cancelled in the app. Paid ones go through support. |

The app has a few things the bot doesn't: accounts with a phone number and password, a saved default address, an order history, a payment progress tracker, and order references (`WC-XXXXXX`) for the transfer narration.

### Order lifecycle

```
AWAITING_PAYMENT ──receipt uploaded──▶ PENDING ──admin assigns collector──▶ ASSIGNED ──▶ COMPLETED
        │                                                                        └──▶ INCOMPLETE
        └── customer cancels ──▶ CANCELLED      (admins can also set CANCELLED)
```

Prices live in one place, `backend/src/catalog.ts`. The app reads them from `GET /catalog`, so a price change needs no app release. The server always calculates the amount and never trusts one sent by the client.

## Run it locally

You need Node.js 22.12+ and PostgreSQL 14+.

### 1. Backend

```bash
cd backend
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
npm install
npm run db:migrate            # creates the tables
npm run dev                   # http://localhost:4000
```

Create a staff account for the admin endpoints (set `ADMIN_PHONE` and `ADMIN_PASSWORD` in `.env` first):

```bash
npm run db:create-admin
```

Run the tests. They need a separate, disposable database; set `TEST_DATABASE_URL`, otherwise they use `postgresql://postgres@localhost:5433/wastecore_test`:

```bash
createdb wastecore_test
TEST_DATABASE_URL=postgresql://USER:PASS@localhost:5432/wastecore_test npm test
```

### 2. Mobile app

```bash
cd mobile
cp .env.example .env.local    # set EXPO_PUBLIC_API_URL
npm install
npm start                     # then press i (iOS), a (Android) or w (web)
```

On a **physical phone** running Expo Go, `localhost` points at the phone itself. Set `EXPO_PUBLIC_API_URL` to your computer's LAN address, for example `http://192.168.1.20:4000`.

## API

All endpoints take and return JSON. Authenticated endpoints need `Authorization: Bearer <token>`.

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | `{ name, phone, password }` → `{ token, user }` |
| POST | `/auth/login` | public | `{ phone, password }` → `{ token, user }` |
| GET / PATCH | `/me` | customer | Read or update name and default address |
| GET | `/catalog` | public | Plans, prices, waste types, support categories, bank details |
| POST | `/orders` | customer | Create an order (body depends on `type`, see `src/routes/orders.ts`) |
| GET | `/orders`, `/orders/:id` | customer | The customer's own orders |
| POST | `/orders/:id/receipt` | customer | Multipart `receipt` image (JPEG/PNG/WEBP/HEIC, ≤ 5 MB) |
| POST | `/orders/:id/cancel` | customer | Cancel an unpaid order |
| POST / GET | `/support-tickets` | customer | Raise or list support tickets |
| GET | `/admin/orders?status=&type=` | admin | All orders with customer and collector details |
| PATCH | `/admin/orders/:id` | admin | `{ status?, collectorId?, adminNote? }` |
| GET / POST / PATCH | `/admin/collectors` | admin | Manage collectors |
| GET / PATCH | `/admin/support-tickets` | admin | View and update tickets |

Phone numbers are accepted in any common Nigerian format (`0801…`, `+234 801…`, `234801…`) and stored as `+234…`.

Customers never see collector details, the same rule the bot follows.

## Deploying

**Backend.** Any Node host works, for example Railway, Render, Fly.io or a VPS, with a managed PostgreSQL database.

```bash
npm ci && npm run build && npm run db:deploy && npm start
```

Set `DATABASE_URL`, `JWT_SECRET`, `PUBLIC_URL` and the bank details. Set the `CLOUDINARY_*` variables so receipts survive redeploys; without them, receipts are saved to the server's local disk.

**Mobile.** Build and publish with EAS:

```bash
npx eas-cli@latest build -p android
npx eas-cli@latest build -p ios
```

Set `EXPO_PUBLIC_API_URL` to the production API URL in your EAS environment.

## Next steps

- **Admin dashboard.** The admin API is ready, but there is no admin UI yet. Staff can't verify payments from a screen until one is built.
- **Push notifications** (Expo Notifications) for "collector assigned" and "pickup completed", replacing the bot's WhatsApp templates.
- **Phone number verification** (SMS OTP) at sign-up, and password reset.
- **Online payments** (Paystack or Flutterwave) in place of manual transfer and receipt checks.
