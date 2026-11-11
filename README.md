# Online Movie Ticket Booking System — Backend

The backend provides the REST API for the Online Movie Ticket Booking System. It serves movie, cinema, screen, showtime, booking, payment, food, offer, user, and administration features. Persistent application data is stored in MongoDB, and optional movie-image uploads use Supabase Storage.

## Technologies

- Node.js and TypeScript
- Express 5
- MongoDB with Mongoose
- JSON Web Tokens (`jsonwebtoken`) for access and refresh tokens
- `bcryptjs` for password hashing
- PayHere Sandbox for online payments
- Supabase JavaScript client for image storage
- Multer for image upload handling
- `dotenv`, `cors`, and `cookie-parser`
- Node's test runner through `tsx`

## Architecture

The application is organized by responsibility:

1. `src/index.ts` configures Express middleware, connects to MongoDB, mounts API routers, and starts the expired-booking-hold sweeper.
2. `src/routes/` declares HTTP methods, paths, and middleware.
3. `src/middleware/` handles authentication, optional authentication, role checks, and uploads.
4. `src/controllers/` implements request handling and application operations.
5. `src/models/` defines Mongoose data models and persistence constraints.
6. `src/services/` contains booking-hold and PayHere integration logic.
7. `src/config/` configures PayHere and optional Supabase storage.
8. `src/utils/` contains booking-code, token, and storage helpers.
9. `tests/` covers booking flow and payment behavior.

## Main capabilities

- Registration, login, access-token refresh, and authenticated account details.
- Public movie, cinema, screen, showtime, food, and offer browsing.
- Admin management of cinema inventory and customer booking data.
- Super Admin management of administrator accounts.
- Guest or signed-in customer bookings, optional food items, and offer-code application.
- Seat availability checks and booking/payment status tracking.
- PayHere **Sandbox-only** checkout and asynchronous payment notification processing.
- Optional movie-image uploads to Supabase Storage.

## Authentication, roles, and permissions

Protected API calls use a bearer access token in the `Authorization` header. The API issues access and refresh tokens at login; `POST /api/auth/refresh` accepts a refresh token and returns a replacement access token. Passwords are hashed with `bcryptjs`.

The backend model defines these roles:

| Role | Intended access |
|---|---|
| `USER` | Registered customer account. Can access authenticated account and booking operations. |
| `CUSTOMER` | Defined in the backend role enum; the frontend normalizes it to the standard customer role. No separate route permission set is defined. |
| `ADMIN` | Manages movies, cinemas, screens, showtimes, bookings, foods, offers, and user accounts. |
| `SUPER_ADMIN` | Manages administrator accounts and can create admins. |

Guest bookings are supported on the booking creation route. The route permits an optional access token so a signed-in booking can be associated with an account. Admin and Super Admin endpoints enforce their corresponding roles with authentication and role-check middleware.

## Booking, seats, and payments

- Booking creation validates the showtime, screen layout, seat IDs, and availability. Guests provide name, email, and phone; signed-in bookings are linked to the account.
- Food items and valid offer codes can be included in the booking total.
- A new booking starts as `Pending`; a payment token is returned for checkout, and its stored representation is hashed.
- The default seat hold is 10 minutes. `PAYMENT_HOLD_MINUTES` can set it to a whole number from 1 to 60. The backend periodically releases expired holds and restores seat capacity.
- The payment integration is pinned in code to the PayHere Sandbox checkout URL, uses LKR, and permits up to three payment attempts per booking.
- PayHere notifications are checked for a valid signature, merchant, amount, and currency before payment and booking state is updated. The payment notification endpoint must be reachable by PayHere; a local development server therefore needs a public tunnel URL for callbacks.
- A successful verified payment confirms a booking. Pending, failed, cancelled, and chargeback statuses are recorded by the payment flow.

## API routes

All routes below are mounted under `/api`. The access column describes route middleware; payment checkout and booking-code lookup additionally use booking/payment data validation as applicable.

### Authentication — `/auth`

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a user account |
| `POST` | `/api/auth/login` | Public | Authenticate and issue tokens |
| `POST` | `/api/auth/refresh` | Public | Exchange a refresh token for an access token |
| `POST` | `/api/auth/create-admin` | Super Admin | Create an administrator |
| `GET` | `/api/auth/me` | Authenticated | Get the current account details |

### Movies — `/movies`

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/movies/now-showing` | Public | List now-showing movies |
| `GET` | `/api/movies/coming-soon` | Public | List coming-soon movies |
| `GET` | `/api/movies/:id` | Public | Get a movie |
| `POST` | `/api/movies/upload-image` | Admin | Upload a movie image |
| `POST` | `/api/movies` | Admin | Create a movie |
| `PUT` | `/api/movies/:id` | Admin | Update a movie |
| `DELETE` | `/api/movies/:id` | Admin | Delete a movie |

### Cinemas — `/cinemas`

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/cinemas` | Public | List cinemas |
| `GET` | `/api/cinemas/:id/screens` | Public | List screens for a cinema |
| `GET` | `/api/cinemas/:id` | Public | Get a cinema |
| `POST` | `/api/cinemas` | Admin | Create a cinema |
| `PUT` | `/api/cinemas/:id` | Admin | Update a cinema |
| `DELETE` | `/api/cinemas/:id` | Admin | Delete a cinema |

### Screens — `/screens`

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/screens` | Public | List screens |
| `GET` | `/api/screens/:id` | Public | Get a screen |
| `POST` | `/api/screens` | Admin | Create a screen |
| `PUT` | `/api/screens/:id` | Admin | Update a screen |
| `DELETE` | `/api/screens/:id` | Admin | Delete a screen |

### Showtimes — `/showtimes`

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/showtimes` | Public | List showtimes |
| `GET` | `/api/showtimes/movie/:movieId` | Public | List showtimes for a movie |
| `GET` | `/api/showtimes/:id/seats` | Public | Get booked seats for a showtime |
| `GET` | `/api/showtimes/:id` | Public | Get a showtime |
| `POST` | `/api/showtimes` | Admin | Create a showtime |
| `PUT` | `/api/showtimes/:id` | Admin | Update a showtime |
| `DELETE` | `/api/showtimes/:id` | Admin | Delete a showtime |

### Bookings — `/bookings`

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/bookings` | Public; optional authentication | Create a guest or signed-in booking |
| `GET` | `/api/bookings/code/:code` | Public | Look up a booking by booking code |
| `GET` | `/api/bookings/my-bookings` | Authenticated | List the signed-in user's bookings |
| `PUT` | `/api/bookings/cancel/:id` | Authenticated | Cancel a booking |
| `GET` | `/api/bookings` | Admin | List bookings for administration |

### Payments — `/payments`

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/payments/checkout` | Public route; requires a valid booking code and payment token | Create PayHere Sandbox checkout details |
| `POST` | `/api/payments/notify` | PayHere callback | Receive and verify a PayHere payment notification |
| `GET` | `/api/payments/status/:orderId` | Public route | Check payment status by order ID |

### Food and offers

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/foods` | Public | List foods |
| `GET` | `/api/foods/:id` | Public | Get a food item |
| `POST` | `/api/foods` | Admin | Create a food item |
| `PUT` | `/api/foods/:id` | Admin | Update a food item |
| `DELETE` | `/api/foods/:id` | Admin | Delete a food item |
| `PATCH` | `/api/foods/:id/toggle` | Admin | Toggle food availability |
| `GET` | `/api/offers` | Public | List offers |
| `GET` | `/api/offers/code/:code` | Public | Look up an offer code |
| `POST` | `/api/offers` | Admin | Create an offer |
| `PUT` | `/api/offers/:id` | Admin | Update an offer |
| `DELETE` | `/api/offers/:id` | Admin | Delete an offer |
| `PATCH` | `/api/offers/:id/toggle` | Admin | Toggle offer status |

### Admin and Super Admin

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Admin | Get admin dashboard statistics |
| `GET` | `/api/admin/movies` | Admin | List movies for administration |
| `GET` | `/api/admin/foods` | Admin | List foods for administration |
| `GET` | `/api/admin/offers` | Admin | List offers for administration |
| `GET` | `/api/admin/users` | Admin | List users |
| `POST` | `/api/admin/users` | Admin | Create a user |
| `PUT` | `/api/admin/users/:id` | Admin | Update a user |
| `PATCH` | `/api/admin/users/:id/status` | Admin | Update user status |
| `DELETE` | `/api/admin/users/:id` | Admin | Delete a user |
| `GET` | `/api/super-admin/stats` | Super Admin | Get Super Admin dashboard statistics |
| `GET` | `/api/super-admin/admins` | Super Admin | List administrator accounts |
| `PATCH` | `/api/super-admin/admins/:id/status` | Super Admin | Update administrator status |
| `DELETE` | `/api/super-admin/admins/:id` | Super Admin | Delete an administrator |

The root `GET /` route is a simple API availability response. No generated OpenAPI/Swagger specification was found in the repository; the route list above is based on the Express routers.

## Project structure

```text
src/
├── config/          # PayHere and Supabase configuration
├── controllers/     # Request handlers for API features
├── middleware/      # Authentication, role restrictions, and uploads
├── models/          # Mongoose schemas and models
├── routes/          # Express route definitions
├── scripts/         # Administrative scripts, including Super Admin seeding
├── services/        # Booking-hold and PayHere business logic
├── utils/           # Booking-code, token, and storage helpers
└── index.ts         # Express app, database connection, and server lifecycle
tests/               # Node test-runner booking and payment tests
```

## Prerequisites

- Node.js and npm
- A MongoDB instance and connection string
- PayHere Sandbox merchant details to use online checkout
- Supabase project and service-role key only if movie image uploads are needed

## Environment variables

Create a `.env` file in the backend repository root. The following are variable names used by the source code; replace placeholders locally and never commit real credentials:

```dotenv
PORT=5001
MONGO_URL=your_mongodb_connection_string
JWT_SECRET=replace_with_a_long_random_secret
JWT_REFRESH_SECRET=replace_with_a_different_long_random_secret

# Used by npm run seed:super-admin
SUPER_ADMIN_USERNAME=your_super_admin_username
SUPER_ADMIN_EMAIL=your_super_admin_email
SUPER_ADMIN_PASSWORD=replace_with_a_strong_password

# Required when using PayHere Sandbox checkout; checkout is sandbox-only
PAYHERE_MODE=sandbox
PAYHERE_MERCHANT_ID=your_sandbox_merchant_id
PAYHERE_MERCHANT_SECRET=your_sandbox_merchant_secret
BACKEND_PUBLIC_URL=https://your-public-backend-url
FRONTEND_URL=http://localhost:5173
PAYMENT_HOLD_MINUTES=10

# Required only for image uploads
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_BUCKET=movie-posters
```

`PORT` defaults to `5001`; `PAYMENT_HOLD_MINUTES` defaults to 10 and accepts integer values from 1 through 60. `PAYHERE_MODE` may be omitted or set to `sandbox`; other modes are rejected. The backend example environment file currently has the filename `.exmaple.env` and does not list the PayHere variables above. Use this README's variable names to complete your local `.env`. Keep JWT, PayHere, MongoDB, and Supabase secrets out of source control; the Supabase service-role key must remain server-side.

`BACKEND_PUBLIC_URL` must be reachable by PayHere for payment notifications. A local development server is not publicly reachable without a tunnel. `FRONTEND_URL` is used to build the payment return and cancellation URLs.

## Installation and local development

From the backend repository root:

```bash
npm install
```

Create and configure the `.env` file, then start the development server:

```bash
npm run dev
```

The API listens on port `5001` by default. Its root route can be checked at `http://localhost:5001/`.

To compile TypeScript and run the compiled server:

```bash
npm run build
npm start
```

Create the initial Super Admin account after configuring `MONGO_URL`, `SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD`:

```bash
npm run seed:super-admin
```

The seed script will not create a second Super Admin if one already exists.

## Tests

Run the backend test suite with:

```bash
npm test
```

The test files cover booking creation/seat holds and PayHere service, route, and controller behavior.

## API documentation and screenshots

The endpoint tables above are the API route reference currently present in this repository. There is no generated Swagger/OpenAPI document in the source tree. Add screenshots of API requests/responses or link an approved API collection here if required for a project submission.
