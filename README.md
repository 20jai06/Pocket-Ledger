# Pocket Ledger

A full-stack personal finance dashboard with password-protected accounts, transaction management, PostgreSQL storage, and visual spending insights.

## Stack

- React + Vite + Recharts
- Express REST API
- PostgreSQL
- `bcryptjs` password hashing and signed JWTs in HTTP-only cookies

## Run locally

1. Install PostgreSQL and create a database called `pocket_ledger`.
2. Copy `.env.example` to `.env`, then set a strong `JWT_SECRET` (at least 24 characters).
3. Install dependencies: `npm install`
4. Create the tables: `npm run db:init`
5. Start the app: `npm run dev`
6. Open `http://localhost:5173`.

## Run locally with Docker (no Node.js or PostgreSQL installation)

After installing Docker Desktop, run this from the project directory:

```powershell
docker compose up --build
```

Once Docker reports that the API is running, open `http://localhost:4000`. The first start downloads the PostgreSQL and Node images, builds the app, and creates the database tables. Later starts only need `docker compose up`.

To stop it, press `Ctrl+C`. To stop it and remove the local database data, use `docker compose down -v` (this permanently removes locally stored accounts and transactions).

## REST API

| Endpoint | Method | Purpose |
|---|---:|---|
| `/api/auth/signup` | POST | Create account and default categories |
| `/api/auth/login` | POST | Sign in |
| `/api/auth/logout` | POST | End session |
| `/api/auth/me` | GET | Current user |
| `/api/categories` | GET, POST | List or add categories |
| `/api/transactions` | GET, POST | List or create transactions |
| `/api/transactions/:id` | PUT, DELETE | Update or remove a transaction |
| `/api/dashboard` | GET | Totals and chart data |

All non-auth endpoints are authenticated and filter data by the logged-in user.

## Deploy on Render

1. Push this folder to a new GitHub repository.
2. In Render, select **New → Blueprint** and choose that repository. Render reads `render.yaml`, creating both the web service and PostgreSQL database.
3. Deploy. The schema setup runs automatically at service startup and is idempotent.

Alternatively, build it on any Docker host using the included `Dockerfile`, with `DATABASE_URL` and `JWT_SECRET` set as secrets.

### Production notes

- Use a strong generated `JWT_SECRET`; never commit `.env`.
- Set `DATABASE_SSL=true` only when connecting to an external PostgreSQL URL that requires TLS. Render's included private database connection uses `false`.
- Back up the database before migrations.
- The deployed service serves the compiled React app and API from the same origin, so session cookies work without cross-origin configuration.
