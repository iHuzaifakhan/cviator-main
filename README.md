# Cviator Pro — University CV Builder

A full-stack, role-aware CV builder for university students with live preview, server-side PDF export, email verification, and an admin dashboard.

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | Next.js (pages router) + Tailwind   |
| Backend   | Node.js + Express                   |
| PDF       | Puppeteer (server-side rendering)   |
| Database  | PostgreSQL 16 (JSONB for CV data)   |
| Auth      | JWT (stateless, 7-day expiry)       |
| Email     | Nodemailer (SMTP or console in dev) |
| Containers| Docker + Docker Compose             |
| CI        | GitHub Actions                      |
| IaC       | Terraform (AWS EC2 skeleton)        |

---

## Roles

| Role    | Can build CV | Can view all CVs | Notes                              |
|---------|:------------:|:----------------:|------------------------------------|
| Student | Yes          | No               | Requires reg no, faculty, batch    |
| Admin   | No           | Yes              | Gated by `ADMIN_SIGNUP_CODE`       |

---

## Project Structure

```
cviator/
├── frontend/                  # Next.js + Tailwind
│   ├── pages/
│   │   ├── index.js           # CV builder (auto-save, live preview)
│   │   ├── login.js
│   │   ├── signup.js
│   │   ├── verify-email.js    # Post-signup email verification
│   │   ├── forgot-password.js
│   │   ├── reset-password.js
│   │   └── admin/index.js     # Admin dashboard
│   ├── components/
│   │   ├── ResumeForm.js
│   │   ├── LivePreview.js
│   │   └── templates/         # TemplateClassic, TemplateModern
│   ├── hooks/useAuth.js
│   └── services/              # api.js, auth.js, cv.js, admin.js
├── backend/
│   ├── server.js              # Express app + rate limiting
│   ├── config.js
│   ├── routes/
│   │   ├── auth.js            # signup/login/verify-email/reset-password
│   │   ├── cv.js              # GET/PUT /api/cv
│   │   ├── admin.js           # user list, per-user PDF, bulk ZIP
│   │   └── pdf.js             # /generate-pdf (Puppeteer)
│   ├── db/
│   │   ├── schema.sql         # Idempotent schema (safe on every boot)
│   │   └── pool.js
│   ├── middleware/auth.js      # requireAuth, requireAdmin, requireNonAdmin
│   └── utils/
│       ├── generateHTML.js    # CV → HTML for Puppeteer
│       └── mailer.js          # Email sending (SMTP or console fallback)
├── .env.example               # Root env template for docker-compose
├── docker-compose.yml
└── terraform/main.tf          # AWS EC2 skeleton
```

---

## Local Setup (without Docker)

### Prerequisites
- Node.js 18+
- PostgreSQL 16 running locally

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in JWT_SECRET, ADMIN_SIGNUP_CODE, DB_* vars
npm run dev            # starts on http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev            # starts on http://localhost:3000
```

---

## Running with Docker

```bash
cp .env.example .env   # fill in JWT_SECRET and ADMIN_SIGNUP_CODE at minimum
docker-compose up --build
```

Services:
- Frontend → **http://localhost:3000**
- Backend  → **http://localhost:5000**
- Postgres → port 5432 (internal)

```bash
docker-compose down        # stop
docker-compose down -v     # stop + wipe DB volume
```

---

## Environment Variables

### Required (must be set before deploying)

| Variable            | Description                                      |
|---------------------|--------------------------------------------------|
| `JWT_SECRET`        | Long random string for signing JWTs              |
| `ADMIN_SIGNUP_CODE` | Secret code required to create an admin account  |
| `DB_PASSWORD`       | Postgres password                                |

Generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Optional — SMTP (email verification & password reset)

| Variable    | Default                   | Description               |
|-------------|---------------------------|---------------------------|
| `SMTP_HOST` | *(empty)*                 | Leave blank in dev — links are logged to console instead |
| `SMTP_PORT` | `587`                     |                           |
| `SMTP_USER` |                           |                           |
| `SMTP_PASS` |                           |                           |
| `SMTP_FROM` | `noreply@cviator.local`   |                           |

---

## Auth Flows

### Signup (Student)
1. Fill form → POST `/api/auth/signup`
2. Backend creates user, sends verification email (or logs link to console in dev)
3. Frontend redirects to `/verify-email`
4. User clicks link → `GET /api/auth/verify-email/:token` → redirected to `/login?verified=1`

### Signup (Admin)
1. Fill form + admin code → POST `/api/auth/signup`
2. Immediately receives JWT and is redirected to `/admin`

### Password Reset
1. `/forgot-password` → POST `/api/auth/forgot-password` → email sent
2. User clicks link → `/reset-password?token=...`
3. POST `/api/auth/reset-password` → password updated → redirect to `/login`

---

## Deployment on AWS EC2

1. Launch Ubuntu 22.04, `t2.medium` (Puppeteer needs memory). Security group: open ports **22, 3000, 5000** from `0.0.0.0/0`.
2. SSH in and install Docker + Docker Compose:
   ```bash
   sudo apt-get update -y
   sudo apt-get install -y docker.io docker-compose git
   sudo usermod -aG docker ubuntu && newgrp docker
   ```
3. Clone the repo and set up env:
   ```bash
   git clone <your-repo-url> cviator && cd cviator
   cp .env.example .env
   # edit .env: set JWT_SECRET, DB_PASSWORD, ROOT_ADMIN_EMAIL
   # leave NEXT_PUBLIC_API_URL EMPTY and FRONTEND_URL=*
   ```
4. `docker-compose up -d --build`
5. Open `http://<EC2-PUBLIC-IP>:3000` in your browser.

### Why login used to fail with "Failed to fetch"

`NEXT_PUBLIC_API_URL` is baked into the Next.js bundle at **build time**. If you build with `http://localhost:5000`, the user's browser will try to call *their* localhost, not your EC2.

The frontend now **auto-detects** the backend at `<same-host>:5000` in the browser, so leaving `NEXT_PUBLIC_API_URL` empty makes the same image work on localhost AND on any EC2 IP without rebuilding.

---

## CI/CD (GitHub Actions)

File: `.github/workflows/main.yml`

On push to `main`:
1. Install deps + build Next.js frontend
2. Build Docker images
3. *(Optional)* Push to Docker Hub if `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` secrets are set

---

## Known Limitations / Roadmap

- No automated test suite (Jest + Supertest planned)
- No automated deploy step in CI (SSH deploy job planned)
- Schema uses `ADD COLUMN IF NOT EXISTS` for migrations; non-trivial changes need a migration tool
- JWT logout is client-side only (no server-side revocation)
