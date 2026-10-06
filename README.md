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
| 1 – Instant Pickup (₦2,000) | **Instant pickup**: a one-time order with no subscription, **₦700 per bag**. Customers choose **As soon as possible** (same day if booked before 5pm Lagos time, otherwise the next day) or a date. |
| 2 – Weekly Pickup | **Weekly plans** (subscription): 1/2/3 pickups per week at the bot's weekly prices, billed every 4 weeks |
| 3 – Upgrade Plan | **Premium plans** (subscription): Basic, Standard or Premium, billed monthly. Customers on a plan can **upgrade** at any time. |
| 4 – Order Waste Bags | **Waste bags**: size, number of packs, delivery address |
| 5 – Speak to Support | **Support**: category, description, preferred contact time, plus a ticket ID |
| Bank transfer + receipt image | **Pay online with Paystack** (card, bank transfer or USSD), confirmed automatically. Manual bank transfer with a receipt upload is still available for one-off orders. |
| "Active Request Found" | Home screen lists active requests. The **My orders** tab shows all orders with live status. |
| Typing `cancel` | Unpaid orders can be cancelled in the app. Paid ones go through support. |

The app has a few things the bot doesn't: accounts with a phone number and password, a saved default address, an order history, a payment progress tracker, and order references (`WC-XXXXXX`) for the transfer narration.

## Staff (admin) screens

Staff use the **same app**. When someone with an admin account signs in, they get the staff tabs instead of the customer screens. It works on a phone or in a desktop browser (`npm run web`).

| Tab | What staff do there |
| --- | --- |
| **Orders** | A queue filtered by status (To do, Assigned, Unpaid, …) with counts, plus search by reference, customer name or phone. Open an order to view the receipt, then **confirm the payment and assign a collector** (or activate an upgrade plan), **reject the receipt** with a message the customer sees, mark the order completed or incomplete, change the collector, cancel it, or keep an internal note. One tap calls or WhatsApps the customer. |
| **Plans** | Every customer plan with its period and renewal. Set a plan's regular collector, who is then assigned all its pickups. |
| **Collectors** | Add drivers, edit their details, and deactivate them. |
| **Tickets** | Support tickets by status: call the customer, start, resolve or reopen. |

Admin accounts are created with `npm run db:create-admin` (see below). The server checks the role on every admin request; a customer who opens an admin link gets nothing.

## Plans and payments

**Subscriptions.** A customer picks a plan, address, waste type and first pickup date, then pays with Paystack. Once paid:
- The plan becomes **Active** for one billing period (4 weeks for weekly plans, 1 month for premium plans).
- All pickups for the period are created at once, spread evenly through each week (2/week → days 0 and 3; daily → every day). They appear on the customer's **My plan** tab and in the staff queue.
- If staff have set a **regular collector** for the plan, its pickups are assigned to them automatically.

**Renewal.** Paying by card saves the card (as a Paystack authorization token; card numbers never touch our server) and turns on **automatic renewal**: the card is charged a day before the period ends, at most once per period. Customers can turn this off; they can then renew by hand from 7 days before the end. A plan that isn't renewed becomes **Expired** and can be restarted.

**Upgrades.** Changing plan mid-period gives credit for the unused days of the current plan, and the new plan starts today. For example, halfway through a ₦5,000 plan, Premium (₦35,000) costs ₦32,500. Switching to a cheaper plan mid-period would waste the credit, so the app asks the customer to switch when the current period ends.

**Payment safety.**
- The server sets every amount; the app never sends one.
- Each payment is verified with Paystack: status, amount (in kobo) and currency.
- Webhooks are checked against Paystack's HMAC-SHA512 signature.
- A payment is applied exactly once, even though the webhook, the browser redirect and the app all report it.
- After checkout, customers are only sent back to allowed app addresses (`APP_RETURN_URLS`).

**Going live with Paystack.**
1. Set `PAYSTACK_SECRET_KEY` (start with your `sk_test_…` key).
2. In the Paystack dashboard, set the webhook URL to `https://<your API>/payments/paystack/webhook`.
3. Make a test payment with Paystack's test card, then switch to the live key.

This code was written against Paystack's documented API and tested with a local stand-in (`npm run paystack:mock`), because Paystack couldn't be reached from the development environment. **Run one real test-mode payment before launch.**

### Order lifecycle

```
AWAITING_PAYMENT ──receipt uploaded──▶ PENDING ──staff confirm + assign collector──▶ ASSIGNED ──▶ COMPLETED
   ▲    │                                  │                                              └──▶ INCOMPLETE
   │    └── customer cancels ──▶ CANCELLED  ├── upgrade plan confirmed ──▶ COMPLETED
   └──── staff reject receipt (with a message to the customer) ───────┘
                                          (staff can cancel any open order)
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
| GET / POST | `/subscriptions` | customer | List plans, or sign up `{ plan, address, wasteType, startDate }` (active once paid) |
| GET | `/subscriptions/:id` | customer | A plan with its upcoming pickups |
| GET | `/subscriptions/:id/change-quote?plan=` | customer | Credit and amount due to switch plan today |
| POST | `/subscriptions/:id/change` | customer | Start a plan change (replaces the current plan once paid) |
| PATCH | `/subscriptions/:id` | customer | `{ autoRenew }` |
| POST | `/subscriptions/:id/cancel` | customer | Drop an unpaid sign-up or plan change |
| POST | `/payments` | customer | `{ orderId \| subscriptionId, email?, returnUrl? }` → Paystack checkout URL |
| GET | `/payments/:reference` | customer | Verifies with Paystack and returns the outcome |
| GET | `/payments/paystack/callback` | Paystack | Browser return after checkout; sends the customer back to the app |
| POST | `/payments/paystack/webhook` | Paystack | Signed payment notifications |
| GET | `/admin/summary` | admin | Order counts by status and number of open tickets |
| GET | `/admin/orders?status=&type=&q=` | admin | Orders with customer and collector details; `q` searches reference, name and phone |
| GET | `/admin/orders/:id` | admin | One order |
| PATCH | `/admin/orders/:id` | admin | `{ status?, collectorId?, adminNote?, customerNote? }`. Only valid status moves are accepted (see the lifecycle above). |
| GET / POST / PATCH | `/admin/collectors` | admin | Manage collectors |
| GET / PATCH | `/admin/support-tickets?status=` | admin | View and update tickets |
| GET | `/admin/subscriptions` | admin | Active and expired customer plans |
| PATCH | `/admin/subscriptions/:id` | admin | `{ collectorId }`: sets the plan's regular collector and assigns its upcoming pickups |

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

- **Deploy** the API and database, and turn on Cloudinary, so the team can test on real phones.
- **Push notifications** (Expo Notifications) for "payment confirmed", "receipt rejected", "collector assigned" and "pickup completed", replacing the bot's WhatsApp templates.
- **A collector role**, so drivers see only their own pickups and mark them done.
- **Phone number verification** (SMS OTP) at sign-up, and password reset.
