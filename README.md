# Online Movie Ticket Booking System — Backend

A TypeScript REST API for an online cinema ticket booking platform. The backend manages movies, cinemas, screens, showtimes, seat reservations, bookings, demo payments, users, food items, offers, administrator access, AI-assisted movie recommendations, and booking e-tickets.

**Backend repository:** [Movie-Booking-System-Backend-MERN-Stack](https://github.com/Mayantha2003/Movie-Booking-System-Backend-MERN-Stack)  
**Frontend repository:** [Movie-Booking-System-Frontend-MERN-Stack](https://github.com/Mayantha2003/Movie-Booking-System-Frontend-MERN-Stack)  
**Deployed API:** `https://movie-booking-system-backend-mern-s.vercel.app`  
**API base path:** `/api`

---

## 1. Project overview

The backend follows a client–server architecture. The React frontend sends HTTP requests to the Express API. The API validates requests, applies authentication and role permissions where required, performs business logic, and reads or writes application data through Mongoose and MongoDB.

The main booking workflow is:

1. A customer browses movies and selects a cinema, showtime, and seats.
2. The frontend sends a booking request to the backend.
3. The backend validates the showtime and seat availability, calculates the booking amount, and creates a temporary pending booking.
4. The selected seats are held for a limited period while the customer completes the demo payment flow.
5. The demo payment endpoint verifies the booking/payment token and confirms the booking.
6. After a successful confirmation, the backend generates a QR-code PDF ticket and sends it to the customer's email when email configuration is available.

The project supports both guest bookings and bookings made by signed-in customers.

## 2. Technology stack

| Technology | Purpose |
|---|---|
| Node.js | JavaScript runtime for the server |
| TypeScript | Static typing and maintainable backend code |
| Express 5 | REST API and middleware |
| MongoDB | Persistent database |
| Mongoose | MongoDB schemas, models, validation, and queries |
| JWT (`jsonwebtoken`) | Access and refresh token authentication |
| bcryptjs | Password hashing |
| Redux Toolkit | Used in the frontend; not a backend dependency |
| Supabase Storage | Movie poster/banner image storage |
| Multer | Multipart image upload handling |
| Groq API | AI-assisted trending movie recommendations |
| Nodemailer | Booking confirmation email delivery |
| PDFKit | PDF e-ticket generation |
| qrcode | QR code generation for e-tickets |
| dotenv | Environment variable loading |
| CORS | Cross-origin frontend/API communication |
| tsx | TypeScript development and test execution |

## 3. Main backend features

### Customer and authentication
- Customer registration and login.
- Password hashing with `bcryptjs`.
- JWT access and refresh token handling.
- Refresh-token endpoint and logout support.
- Authenticated account details endpoint.
- Guest booking support through optional authentication.

### Movie and cinema management
- Browse now-showing and coming-soon movies.
- Retrieve individual movie details.
- Manage movies, cinemas, screens, and showtimes through protected admin endpoints.
- Upload movie images to Supabase Storage when storage credentials are configured.

### Booking and seat management
- Create bookings as a guest or signed-in customer.
- Validate showtime, screen, seats, and booking information.
- Add food items and apply valid offer codes to a booking.
- Generate a unique booking reference.
- Temporarily hold seats while payment is pending.
- Release expired pending holds through a background hold-sweeper.
- Prevent two active bookings from reserving the same seat for the same showtime using a MongoDB unique partial index.
- View bookings by booking code or view the signed-in customer's bookings.
- Cancel eligible bookings.

### Demo payment flow
- The current source code implements a **demo payment flow**, not a live card-processing gateway.
- The frontend submits a booking code and payment token to `POST /api/payments/demo`.
- The backend validates the token and pending booking, checks the seat-hold expiry, and processes a simulated successful payment.
- Demo payments can be enabled or disabled using `DEMO_PAYMENTS_ENABLED`.
- The backend limits the number of demo payment attempts for a booking.
- No real money is transferred by this demo implementation.

### E-ticket and email
- Generate a PDF e-ticket using PDFKit.
- Generate a QR code from the booking reference.
- Include movie, cinema, screen, showtime, seat, amount, and payment details in the ticket.
- Send the PDF ticket as an email attachment using Nodemailer after a successful paid/confirmed booking.
- Email delivery requires valid email environment settings.

### AI recommendations and analytics
- `GET /api/recommendations/trending` returns up to five recommended now-showing movies.
- The recommendation service can call the Groq API using the configured model.
- Recent paid ticket counts and movie ratings are supplied as recommendation context.
- AI output is validated against the current movie catalogue.
- If AI is unavailable or returns no valid recommendations, a local fallback ranking is used.
- Recommendation results are cached for a limited time and the endpoint has rate limiting.
- Admin analytics are available through the admin analytics endpoint.

### Administration
- Admins can manage movies, cinemas, screens, showtimes, bookings, food items, offers, and users.
- Super Admins can create and manage administrator accounts.
- Backend middleware enforces role-based permissions; frontend route protection alone is not treated as security.

## 4. Architecture and folder structure

```text
Movie-Booking-Backend/
├── src/
│   ├── config/          # Email and Supabase configuration
│   ├── controllers/     # Request handling and business operations
│   ├── middleware/      # Authentication, optional auth, roles, rate limits, uploads
│   ├── models/          # Mongoose schemas and models
│   ├── routes/          # REST API route definitions
│   ├── scripts/         # Super Admin seed script
│   ├── services/        # Booking holds, AI, email, PDF and token services
│   ├── utils/           # Validation, tokens, booking codes and storage helpers
│   └── index.ts         # Express app, middleware, DB connection and server
├── tests/               # Booking and payment tests
├── .env.example         # Environment variable template
├── package.json
└── tsconfig.json
```

### Request flow

```text
React + TypeScript Frontend
          |
          | HTTP / JSON (Axios)
          v
     Express Router
          |
          v
 Middleware
 (JWT / Role / Validation)
          |
          v
      Controller
          |
          v
 Service Layer (when required)
          |
          v
 Mongoose Models
          |
          v
       MongoDB
```

External services are used for Groq AI recommendations, Supabase image storage, and email delivery through Gmail SMTP/Nodemailer.

## 5. Database models

The backend defines the following main Mongoose models:

| Model | Responsibility |
|---|---|
| User | Customer, Admin, and Super Admin account information and roles |
| Movie | Movie information, genres, descriptions, ratings, status, and media |
| Cinema | Cinema information |
| Screen | Screens and their seat layouts |
| Showtime | Movie screening date, time, cinema, screen, and availability |
| Booking | Customer/guest booking, seats, food, offer, amounts, and booking status |
| Payment | Demo payment attempts, status, event history, and email tracking |
| Food | Food and refreshment items |
| Offer | Discount offers and offer codes |
| RevokedToken | Token revocation records used by authentication logic |

Bookings reference related Movie, Cinema, Screen, Showtime, and optionally User documents through MongoDB ObjectIds.

## 6. API endpoints

All API routes are mounted under `/api`. Protected routes require a valid access token and the appropriate role.

### Authentication — `/api/auth`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/register` | Public | Register a customer |
| POST | `/login` | Public | Login and receive authentication tokens |
| POST | `/refresh` | Public | Refresh an access token |
| POST | `/logout` | Authenticated/session-aware | Logout and revoke the relevant token |
| GET | `/me` | Authenticated | Get current user details |
| POST | `/create-admin` | Super Admin | Create an Admin account |

### Movies — `/api/movies`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/now-showing` | Public | List now-showing movies |
| GET | `/coming-soon` | Public | List coming-soon movies |
| GET | `/:id` | Public | Get movie details |
| POST | `/upload-image` | Admin | Upload a movie image |
| POST | `/` | Admin | Create a movie |
| PUT | `/:id` | Admin | Update a movie |
| DELETE | `/:id` | Admin | Delete a movie |

### Cinemas — `/api/cinemas`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | Public | List cinemas |
| GET | `/:id` | Public | Get cinema details |
| GET | `/:id/screens` | Public | Get screens belonging to a cinema |
| POST | `/` | Admin | Create a cinema |
| PUT | `/:id` | Admin | Update a cinema |
| DELETE | `/:id` | Admin | Delete a cinema |

### Screens — `/api/screens`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | Public | List screens |
| GET | `/:id` | Public | Get screen details |
| POST | `/` | Admin | Create a screen |
| PUT | `/:id` | Admin | Update a screen |
| DELETE | `/:id` | Admin | Delete a screen |

### Showtimes — `/api/showtimes`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | Public | List showtimes |
| GET | `/movie/:movieId` | Public | List showtimes for a movie |
| GET | `/:id/seats` | Public | Get booked/held seats for a showtime |
| GET | `/:id` | Public | Get showtime details |
| POST | `/` | Admin | Create a showtime |
| PUT | `/:id` | Admin | Update a showtime |
| DELETE | `/:id` | Admin | Delete a showtime |

### Bookings — `/api/bookings`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/` | Public; optional authentication | Create a guest or signed-in booking |
| GET | `/code/:code` | Public; optional authentication | Retrieve booking information by booking code |
| POST | `/code/:code` | Public; optional authentication | Booking-code lookup route also registered in the source |
| GET | `/my-bookings` | Authenticated | Get the signed-in user's bookings |
| PUT | `/cancel/:id` | Authenticated | Cancel a booking |
| GET | `/` | Admin | List bookings for administration |

### Payments — `/api/payments`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/demo` | Public route; booking code and payment token are validated | Process a demo payment |

The current payment router registers `/demo`. It does not register a PayHere checkout or payment-notification route.

### Food — `/api/foods`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | Public | List food items |
| GET | `/:id` | Public | Get a food item |
| POST | `/` | Admin | Create a food item |
| PUT | `/:id` | Admin | Update a food item |
| DELETE | `/:id` | Admin | Delete a food item |
| PATCH | `/:id/toggle` | Admin | Toggle food availability |

### Offers — `/api/offers`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | Public | List offers |
| GET | `/code/:code` | Public | Find an offer by code |
| POST | `/` | Admin | Create an offer |
| PUT | `/:id` | Admin | Update an offer |
| DELETE | `/:id` | Admin | Delete an offer |
| PATCH | `/:id/toggle` | Admin | Toggle offer status |

### Admin — `/api/admin`

All routes in this group require the `ADMIN` role.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/stats` | Dashboard statistics |
| GET | `/analytics` | Analytics data |
| GET | `/movies` | Movies for administration |
| GET | `/foods` | Food items for administration |
| GET | `/offers` | Offers for administration |
| GET | `/users` | List users |
| POST | `/users` | Create a user |
| PUT | `/users/:id` | Update a user |
| PATCH | `/users/:id/status` | Update user status |
| DELETE | `/users/:id` | Delete a user |

### Super Admin — `/api/super-admin`

All routes in this group require the `SUPER_ADMIN` role.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/stats` | Super Admin dashboard statistics |
| GET | `/admins` | List administrator accounts |
| PATCH | `/admins/:id/status` | Update an administrator's status |
| DELETE | `/admins/:id` | Delete an administrator |

### Recommendations — `/api/recommendations`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/trending` | Public; rate limited | Return up to five trending movie recommendations |

The root endpoint `GET /` returns a simple API-running message.

## 7. Environment variables

Create a `.env` file in the backend project root. The repository includes `.env.example` as a template.

```dotenv
# Server
PORT=5001

# MongoDB
MONGO_URL=your_mongodb_connection_string

# JWT
JWT_SECRET=your_long_random_access_secret
JWT_REFRESH_SECRET=your_different_long_random_refresh_secret

# Initial Super Admin (used by the seed script)
SUPER_ADMIN_USERNAME=superadmin
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=change_this_password

# Supabase image storage
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_BUCKET=movie-posters

# Demo payment and seat hold
DEMO_PAYMENTS_ENABLED=true
PAYMENT_HOLD_MINUTES=10

# Email (Gmail SMTP through Nodemailer)
EMAIL_USER=your_email_address
EMAIL_PASS=your_email_app_password
EMAIL_FROM=your_sender_email
FRONTEND_URL=http://localhost:5173

# Groq AI recommendations
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-20b
```

**Important security notes**
- Never commit `.env` or real credentials to GitHub.
- Use strong, different values for `JWT_SECRET` and `JWT_REFRESH_SECRET`.
- Keep the Supabase service-role key and Groq API key on the backend only.
- `DEMO_PAYMENTS_ENABLED=true` enables the simulated payment endpoint; it does not enable real payment processing.
- `PAYMENT_HOLD_MINUTES` controls how long pending bookings hold seats. The service validates the allowed range.
- Configure email credentials only if booking confirmation emails should be sent.
- Configure Supabase credentials only if movie image uploads are required.
- Configure `GROQ_API_KEY` to use AI recommendations. The fallback recommendation logic can be used when AI is not configured or fails.

## 8. Installation and local setup

### Requirements
- Node.js and npm
- MongoDB database (local MongoDB or MongoDB Atlas)
- Optional: Supabase project for image uploads
- Optional: Groq API key for AI recommendations
- Optional: Gmail app password for email delivery

### Step 1 — Clone the repository

```bash
git clone https://github.com/Mayantha2003/Movie-Booking-System-Backend-MERN-Stack.git
cd Movie-Booking-System-Backend
```

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Configure environment variables

Create `.env` using `.env.example` and enter your own values.

### Step 4 — Create the initial Super Admin

After configuring the MongoDB connection and Super Admin variables, run:

```bash
npm run seed:super-admin
```

The seed script checks whether a Super Admin already exists before creating one.

### Step 5 — Start the development server

```bash
npm run dev
```

By default, the API runs at:

```text
http://localhost:5001
```

Check the root endpoint:

```text
http://localhost:5001/
```

## 9. Available npm scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the TypeScript development server using `tsx watch` |
| `npm run build` | Compile TypeScript into the `dist` directory |
| `npm start` | Run the compiled server |
| `npm test` | Run backend tests using Node's test runner through `tsx` |
| `npm run seed:super-admin` | Create the initial Super Admin account |

## 10. Testing

Run the test suite:

```bash
npm test
```

The repository includes tests for booking and payment-related behavior. Tests should be run after changes to booking validation, seat-hold logic, payment processing, or related services.

## 11. Deployment

The repository contains a `vercel.json` configuration for deploying the backend through Vercel.

Typical deployment checklist:

1. Push the backend source code to GitHub.
2. Import the backend repository into Vercel.
3. Configure the required environment variables in the Vercel project settings.
4. Set `MONGO_URL` to the production MongoDB Atlas connection string.
5. Add the Groq, email, and Supabase variables only when those features are required.
6. Set `DEMO_PAYMENTS_ENABLED` according to whether the demo payment flow should be available.
7. Deploy and test the root API endpoint and important `/api` routes.
8. Configure the frontend's `VITE_API_URL` to point to the deployed backend API base URL.

**Deployed backend base URL:**  
`https://movie-booking-system-backend-mern-s.vercel.app`

**API base URL:**  
`https://movie-booking-system-backend-mern-s.vercel.app/api`

## 12. Security and reliability considerations

- Passwords are stored as hashes using `bcryptjs`, not as plain text.
- JWT middleware authenticates protected requests.
- Role middleware restricts Admin and Super Admin operations.
- Refresh-token and revoked-token logic supports session management.
- Request validation is handled through shared validation utilities and controller checks.
- Booking/payment tokens are validated before demo payment processing; the stored booking token is hashed.
- A MongoDB unique partial index provides a database-level guard against duplicate active seat reservations for a showtime.
- Expired seat holds are released by the booking-hold service.
- Secrets are read from environment variables.
- AI recommendation requests are rate-limited and cached; AI output is restricted to IDs from the existing movie catalogue.

## 13. Current implementation scope

This README describes the implementation found in the repository. The payment feature is a simulated/demo payment workflow and must not be described as a live payment gateway. Deployment availability can change, so verify the deployed URL before submission.

---

**Developed as the backend component of the Online Movie Ticket Booking System — Rapid Application Development (RAD) coursework.**
