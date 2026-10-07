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

The app has a few things the bot doesn't: accounts with a phone number and password, saved addresses pinned on a map, an order history, a payment progress tracker, and order references (`WC-XXXXXX`) for the transfer narration.

## Service areas, addresses and maps

WasteCore launches city by city: **Yenagoa (Bayelsa) first**, then **Port Harcourt**, then **Lagos**. Each city is a circle around its centre (Yenagoa 15 km, Port Harcourt 20 km, Lagos 35 km). Bookings are only accepted inside a **live** city. At launch only Yenagoa is live.

- **Saved addresses.** Customers save addresses (Home, Office, Shop) with the street, a landmark ("opposite the church, blue gate") and the exact spot pinned on a map. Every pickup, plan and bag order is booked at a saved address.
- **The map follows the customer.** It opens at the phone's location (if they allow it), otherwise at the first live city. They move the map until the pin sits on their gate. As they move it, the app shows "We pick up here: Yenagoa, Bayelsa" or "We're not in Port Harcourt yet", with a **Notify me** button.
- **Collectors** see the pin on a map in each job, the landmark, and a **Directions** button that opens Google Maps with turn-by-turn directions to the exact spot.
- **Staff** open **Account → Service areas** to see each city on a map, with its saved addresses, open orders and how many people asked to be notified. They can **launch or pause** a city and change how far it reaches. Launching a city sends a notification to everyone who tapped **Notify me** there. Collectors are linked to a city, and when staff assign an order, collectors from the order's city are listed first.

Maps use OpenStreetMap through Leaflet, so no Google Maps key is needed. For heavy production use, switch the tile URL in `mobile/src/components/LeafletMap.tsx` to a hosted tile provider (for example MapTiler or Stadia), per the [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/).

The cities are added by the `service_areas` database migration. To add another city later, insert a `ServiceArea` row (slug, name, state, centre, radius, `active = false`, next `launchOrder`), then launch it from the app.

## Managing pickups

- **Time of day.** Pickups booked for a date (and plans) can be set to **Morning (8am to 12pm)** or **Afternoon (12pm to 5pm)**, or left as any time. A plan's preferred time can be changed under **My plan** and applies to its upcoming pickups. Collectors see the time on each job.
- **Reschedule.** Customers can move a pickup to another day or time from the order screen until the collector sets off. Plan pickups stay within the paid period; one-off pickups can move up to 30 days ahead. The assigned collector is notified.
- **Skip.** A single plan pickup can be skipped (for example when the customer is away). The others are unchanged.
- **Ratings.** After a pickup or delivery is done, the customer rates it 1 to 5 stars with an optional comment. Staff are notified of 1 and 2-star ratings and see ratings on the order. Collectors see their average rating over the last 90 days.
- **Report a problem.** Every paid order has a **Report a problem** button that opens a support ticket linked to the order. Staff jump from the ticket to the order.
- **Payment history.** **Account → Payment history** lists online payments and confirmed bank transfers with a running total.

## Staff (admin) screens

Staff use the **same app**. When someone with an admin account signs in, they get the staff tabs instead of the customer screens. It works on a phone or in a desktop browser (`npm run web`).

| Tab | What staff do there |
| --- | --- |
| **Orders** | A queue filtered by status (To do, Assigned, Unpaid, …) with counts, plus search by reference, customer name or phone. Open an order to view the receipt, then **confirm the payment and assign a collector** (or activate an upgrade plan), **reject the receipt** with a message the customer sees, mark the order completed or incomplete, change the collector, cancel it, or keep an internal note. One tap calls or WhatsApps the customer. |
| **Plans** | Every customer plan with its period and renewal. Set a plan's regular collector, who is then assigned all its pickups. |
| **Collectors** | Add drivers, edit their details (including the city they work in), and deactivate them. |
| **Overview** | The day at a glance: pickups due, done and not done, orders needing a collector, receipts to check, collectors on duty, each area's pickups against its daily limit, money in (today, 7 and 30 days, after refunds), active plans, new customers, ratings and low bag stock. Links to Customers, Bag stock, Refunds, Reports and Service areas. |
| **Tickets** | Support tickets by status: call the customer, start, resolve or reopen. Tickets raised from an order link to it. |

More staff tools:

- **Customers.** Search by name or phone, see a customer's addresses, plans, orders and payments, call or WhatsApp them, and **suspend** an account (with a reason kept for staff). A suspended customer is signed out and can't sign in until restored.
- **Refunds.** From any paid order: refund part or all of what was paid. Orders paid online are refunded through Paystack automatically; for bank transfers staff send the money and record it. Optionally cancel the order at the same time. The customer is notified and sees the refund on the order and in their payment history. **Overview → Refunds** lists them all.
- **Auto-assign.** Per area. When on, an order that's paid goes straight to the on-duty collector in that area with the fewest jobs that day. **Auto-assign waiting orders** on the Overview catches up on anything left.
- **Daily limit.** Per area, the most pickups a day. Full days are hidden from the date picker, "as soon as possible" moves to the next day with room, and rescheduling onto a full day is refused. Plan pickups always go ahead and count toward the limit.
- **Bag stock.** Staff add stock per bag size (and write off damaged packs). Packs come out of stock when a bag order is delivered, orders larger than what's available are refused, and staff are warned when a size runs low. Sizes without stock entered aren't limited.
- **Reports.** CSV downloads of orders, payments, refunds, collector payouts and new customers for the last 7, 30, 90 or 365 days. They open in Excel or Google Sheets.

Admin accounts are created with `npm run db:create-admin` (see below). The server checks the role on every admin request; a customer who opens an admin link gets nothing.

## Collector app

Collectors (drivers) use the same app. There are two ways to get them in:

1. **Staff add them.** Staff set a password under **Collectors → (collector) → App login**. The collector signs in with their phone number and that password, and can start straight away.
2. **They apply in the app.** On the sign-up screen they choose **Work as a collector** and enter their name, phone, password, the city they'll work in and the neighbourhoods they cover. They can sign in at once but see **Waiting for approval** until staff approve them. Staff see new applications at the top of the **Collectors** tab, with **Approve** and **Reject** buttons.

Applicants never see jobs (customer names, numbers and addresses) before approval. If someone applies with the number of a collector staff already added, the login is linked to that record but still needs approval. Rejecting removes the login.

Deactivating a collector, or removing their login, stops them signing in.

| Screen | What the collector does |
| --- | --- |
| **My jobs** | Their open pickups and bag deliveries, grouped Overdue / Today / Tomorrow / by date, with ASAP jobs flagged. Shows jobs done today and this week. |
| **Job** | Customer name with **Call** and **WhatsApp**, the address and landmark with the spot on a map and **Directions**, what to collect or deliver, and staff notes (e.g. gate code). Tap **I'm on my way** (the customer sees "On the way"), then **Mark completed** with an optional photo and note, or **Couldn't complete** with a reason. |
| **History** | Jobs they closed in the last 30 days, with their notes, photos and the customer's rating. |
| **On duty** | A switch on the jobs screen. Staff see who's on duty, and on-duty collectors are listed first when assigning. |
| **Today's route** | Today's and overdue stops on a map, nearest first from where the collector is, with a **Navigate all stops in Google Maps** button. |
| **Bags collected** | When completing a pickup, the collector enters the bags actually taken. On an instant pickup, extra bags are charged at the per-bag price: the customer either paid the collector in cash (switch on), or is asked to pay the balance in the app. |
| **Earnings** | What they've earned since their last payout, the last 7 days, and past payouts. |

**Pay.** Collectors earn ₦300 per pickup plus ₦50 per bag collected, and ₦200 per bag delivery (set in `backend/src/catalog.ts`, `COLLECTOR_PAY`). Staff open a collector to see what's due and tap **Record payout** after paying them; cash the collector took for extra bags is kept back. The collector is notified.

**Weak signal.** The jobs list is saved on the phone. If there's no connection, "On my way", "Completed" and "Couldn't complete" are saved and sent automatically when signal returns (every 30 seconds, and when the app is reopened).

Collectors only see jobs assigned to them, and never see order prices or payment details. The customer sees the collector's note, the photo, and the reason if a pickup couldn't be done. Staff see all of it on the order, with times.

## Phone verification

New customers and collectors get a 6-digit code by SMS when they sign up, and enter it on a **Verify your phone** screen before they can use the app. Collectors who apply in the app verify first, then wait for staff approval.

- Unverified accounts can't place orders, subscribe, pay, raise tickets or see collector jobs; the server enforces this.
- Codes work like password reset codes (15 minutes, 5 wrong tries, resend once a minute).
- **Already verified:** staff accounts, collector logins staff create, and accounts that existed before this feature.
- Resetting a password with an SMS code also verifies the phone.
- **Typed the wrong number?** A new sign-up replaces an unverified customer account on the same number, so a typo can't block the real owner. Only the person who receives the code can verify it.

## Passwords

- **Forgot password?** on the sign-in screen. The person enters their phone number and gets a 6-digit code by **SMS** (Termii), and also by **email** if the account has one. They enter the code and a new password, and they're signed in.
  - The code expires after 15 minutes, allows 5 wrong tries, and works once.
  - A new code can be sent once a minute, up to 5 an hour.
  - The reply is the same whether or not the number has an account, so the screen can't be used to find out who uses WasteCore.
- **Change password** in each Account tab (needs the current password).
- Changing or resetting a password **signs the account out on every other device**.
- **Staff fallback:** in the staff Account tab, staff can set a temporary password for a customer or collector who can't receive the code (after checking who they are on a call). Staff accounts can't be reset this way.

Set `TERMII_*` and `SMTP_*` in `backend/.env` (see `.env.example`). For SMS to reach numbers on Do-Not-Disturb (most Nigerian lines), Termii needs an approved sender ID and the `dnd` channel. Without these settings, codes are printed in the server log, which is fine for local development.

## Notifications

Customers, collectors and staff get **push notifications** on their phones, and every alert is also kept in the app's notification list (the bell at the top right, with an unread count). Tapping one opens the order, job or plan it's about.

| Who | Is told when |
| --- | --- |
| **Customer** | Payment received or confirmed · receipt not accepted (with the reason) · collector assigned · collector on the way · pickup completed or not completed · order cancelled · plan started, renewed, renewal failed, ending in 3 days (if it won't renew), ended · support ticket updated |
| **Collector** | New job (or new ASAP job) · job reassigned or cancelled · made a plan's regular collector · application approved |
| **Staff** | New paid order · receipt to check · job a collector couldn't complete · new support ticket · new collector application |

Pushes go through Expo's push service. They need:
1. **An EAS project id** in the app. Run `npx eas-cli@latest init` in `mobile/`, which adds it to `app.json`.
2. **A development or store build of the app.** Expo Go can't receive remote push on Android, so build with `npx eas-cli@latest build --profile development`. iOS also needs an Apple Developer account; EAS sets up the push credentials for you.
3. **For Android, Firebase Cloud Messaging credentials.** Upload them to EAS (`npx eas-cli credentials`).

Without these, the in-app notification list still works everywhere, including the web version. All wording is in `backend/src/events.ts`.

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

## Try everything locally with Docker

The quickest way to test the whole system on your computer. You only need [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up --build
```

The first build takes a few minutes. Then open:

| What | Where |
| --- | --- |
| The app (web version) | http://localhost:8081 |
| **Text messages**: verification and password reset codes | http://localhost:4597 |
| **Emails**: password reset emails | http://localhost:8025 |
| The API | http://localhost:4000 |

Demo accounts (created automatically):

| Role | Phone | Password |
| --- | --- | --- |
| Staff | 08090000001 | staff-password-123 |
| Customer | 08035551234 | customer-pass-1 |
| Collector | 07011112222 | collector-pass-1 |

You can also sign up new customers and collectors; their codes appear in the text messages page.

**What's real and what's a stand-in:**
- **Paystack:** a test checkout page with **Pay** and **Cancel** buttons. No real money moves.
- **SMS and email:** caught locally and shown on the pages above, never sent.
- **Push notifications:** need a real phone build, so locally use the bell in the app.

Stop with `Ctrl+C`. `docker compose down -v` also deletes the test data.

**On a phone:**
1. Keep Docker running.
2. On your computer, run `cd mobile && npm install && EXPO_PUBLIC_API_URL=http://<your computer's LAN IP>:4000 npx expo start`.
3. Scan the QR code with Expo Go.

Paystack checkout won't open on the phone in this setup, because its stand-in runs on your computer's `localhost`. Use bank transfer with a receipt to test payments there.

This setup is for testing only. Its passwords and keys are public, so don't deploy it as is.

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
| POST | `/auth/register-collector` | public | `{ name, phone, password, area, serviceAreaId? }`: applies as a collector (needs staff approval) |
| POST | `/auth/password-reset/request` | public | `{ phone }`: texts (and emails) a 6-digit code |
| POST | `/auth/password-reset/confirm` | public | `{ phone, code, password }` → `{ token, user }` |
| POST | `/me/phone/send-code` | any | Sends a new verification code (once a minute) |
| POST | `/me/phone/verify` | any | `{ code }` → the verified user |
| POST | `/me/password` | any | `{ currentPassword, password }` → a new token; other devices are signed out |
| POST | `/admin/users/password` | admin | `{ phone, password }`: temporary password for a customer or collector |
| POST | `/auth/login` | public | `{ phone, password }` → `{ token, user }` (customers, staff and collectors) |
| GET / PATCH | `/me` | customer | Read or update name and default address |
| GET | `/catalog` | public | Plans, prices, waste types, support categories, bank details |
| GET | `/areas` | public | Cities in launch order, with centre, radius and whether they're live |
| GET | `/areas/locate?lat=&lng=` | public | Whether a pinned spot is served, which city it's in, and the nearest city |
| POST | `/areas/interest` | any | `{ lat, lng }`: "Notify me when you launch here" |
| GET / POST | `/addresses` | customer | Saved addresses; create with `{ label, address, landmark?, lat, lng }` (must be in a live city) |
| PATCH / DELETE | `/addresses/:id` | customer | Edit (moving the pin re-checks the city) or remove an address |
| POST | `/orders` | customer | Create an order (body depends on `type`, see `src/routes/orders.ts`). Location is `{ addressId }`, or `{ address, landmark?, lat, lng }`; spots outside a live city get a 422. |
| GET | `/orders`, `/orders/:id` | customer | The customer's own orders |
| POST | `/orders/:id/receipt` | customer | Multipart `receipt` image (JPEG/PNG/WEBP/HEIC, ≤ 5 MB) |
| POST | `/orders/:id/cancel` | customer | Cancel an unpaid order |
| POST | `/orders/:id/reschedule` | customer | `{ date, timeWindow? }`: move a pickup before the collector sets off |
| POST | `/orders/:id/skip` | customer | Skip one plan pickup |
| POST | `/orders/:id/rating` | customer | `{ stars, comment? }` once the order is completed |
| GET | `/payments` | customer | Payment history (online payments and confirmed transfers) with a total |
| POST / GET | `/support-tickets` | customer | Raise or list support tickets; `orderId` links a ticket to an order |
| POST / DELETE | `/me/push-tokens` | any | `{ token, platform }`: register or remove this phone for push |
| GET | `/notifications` | any | The latest 50 notifications and the unread count |
| POST | `/notifications/read` | any | `{ ids? }`: mark some, or all, as read |
| GET / POST | `/subscriptions` | customer | List plans, or sign up `{ plan, addressId, wasteType, startDate }` (active once paid) |
| GET | `/subscriptions/:id` | customer | A plan with its upcoming pickups |
| GET | `/subscriptions/:id/change-quote?plan=` | customer | Credit and amount due to switch plan today |
| POST | `/subscriptions/:id/change` | customer | Start a plan change (replaces the current plan once paid) |
| PATCH | `/subscriptions/:id` | customer | `{ autoRenew?, timeWindow? }` |
| POST | `/subscriptions/:id/cancel` | customer | Drop an unpaid sign-up or plan change |
| POST | `/payments` | customer | `{ orderId \| subscriptionId, email?, returnUrl? }` → Paystack checkout URL (for a completed order with extra bags, pays the balance) |
| GET | `/payments/:reference` | customer | Verifies with Paystack and returns the outcome |
| GET | `/payments/paystack/callback` | Paystack | Browser return after checkout; sends the customer back to the app |
| POST | `/payments/paystack/webhook` | Paystack | Signed payment notifications |
| GET | `/admin/summary` | admin | Order counts by status and number of open tickets |
| GET / PATCH | `/admin/areas`, `/admin/areas/:id` | admin | Cities with counts; `{ active?, radiusKm?, autoAssign?, dailyCapacity? }` |
| GET | `/admin/orders?status=&type=&areaId=&q=` | admin | Orders with customer and collector details; `q` searches reference, name and phone |
| GET | `/admin/orders/:id` | admin | One order |
| PATCH | `/admin/orders/:id` | admin | `{ status?, collectorId?, adminNote?, customerNote? }`. Only valid status moves are accepted (see the lifecycle above). |
| GET / POST / PATCH | `/admin/collectors` | admin | Manage collectors |
| GET | `/admin/dashboard` | admin | The Overview numbers |
| POST | `/admin/auto-assign` | admin | Assigns waiting paid orders due by tomorrow in auto-assign areas |
| GET | `/admin/customers?q=&suspended=` | admin | Customer list |
| GET | `/admin/customers/:id` | admin | One customer with orders, plans and addresses |
| POST | `/admin/customers/:id/suspend`, `/restore` | admin | `{ reason }` to suspend; restore lifts it |
| POST | `/admin/orders/:id/refund` | admin | `{ amount, reason, cancel? }`: Paystack refund, or a manual one for transfers |
| GET | `/admin/refunds` | admin | All refunds |
| GET / POST | `/admin/stock`, `/admin/stock/:size` | admin | Stock levels and recent changes; `{ change, reason, lowAt? }` to restock or write off |
| GET | `/admin/exports/:kind.csv?from=&to=` | admin | CSV of `orders`, `payments`, `refunds`, `payouts` or `customers` |
| GET | `/areas/:id/full-days` | public | Days an area is fully booked |
| GET / PATCH | `/admin/support-tickets?status=` | admin | View and update tickets |
| POST | `/admin/collectors/:id/approve` | admin | Approves a collector who applied in the app |
| POST | `/admin/collectors/:id/reject` | admin | Turns down an application and removes its login |
| PUT / DELETE | `/admin/collectors/:id/login` | admin | `{ password }` creates the collector's app login or resets its password; DELETE removes it |
| GET / PATCH | `/collector/me` | collector | Profile; `{ onDuty }` switches duty on or off |
| GET | `/collector/route?lat=&lng=` | collector | Today's and overdue stops, nearest first, with distances |
| GET | `/collector/earnings` | collector | Unpaid earnings, cash held, last 7 days and payouts |
| GET | `/admin/collectors/:id/earnings` | admin | The same for one collector |
| POST | `/admin/collectors/:id/payouts` | admin | `{ note? }`: records a payout for all unpaid completed jobs |
| GET | `/collector/jobs` | collector | Open jobs, the last 30 days of closed jobs, and done-today/this-week counts |
| GET | `/collector/jobs/:id` | collector | One of the collector's jobs |
| POST | `/collector/jobs/:id/on-the-way` | collector | Tells the customer the collector is coming |
| POST | `/collector/jobs/:id/complete` | collector | Multipart, with optional `proof` photo, `note`, `bags` collected and `extraPaidCash` |
| POST | `/collector/jobs/:id/incomplete` | collector | `{ reason }` (shown to the customer) |
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
