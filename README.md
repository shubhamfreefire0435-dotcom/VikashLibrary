# VIKASH LIBRARY — new project

## Local run (Windows PowerShell)
1. Install Node.js 20 LTS or newer.
2. Copy `.env.example` to `.env`.
3. In `.env`, set a random `JWT_SECRET` of at least 32 characters and change `ADMIN_PASSWORD` to a unique password of at least 12 characters.
4. Run:
   ```powershell
   npm install
   npm start
   ```
5. Open `http://localhost:5000`. Status: `http://localhost:5000/api/status`.

The first admin is created on startup from `ADMIN_USERNAME` and `ADMIN_PASSWORD` if no admin account exists. Do not use the example password publicly.

## Public deploy on Render
1. Create a private GitHub repository; upload this project but NEVER `.env`, `node_modules`, `data/`, or real private user data.
2. In Render, create a Blueprint from that repository and use `render.yaml`.
3. Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `PUBLIC_BASE_URL` (the actual HTTPS service URL) in Render environment variables.
4. Confirm persistent disk is mounted at `/opt/render/project/src/persistent`; this holds SQLite and uploads.
5. Deploy, then test login, notices, application uploads, seat management and settings before sharing the link.

## Honest limitations
- Forgot password is included but email delivery is not configured. In development, the reset link is printed in the terminal. For a real public deployment, configure an email provider before relying on recovery.
- Payments are record-keeping only; no real UPI/card payment processing.
- SQLite is for a small single-instance library; back up the persistent disk regularly.
- Uploads are size/type limited, but a public production deployment should add malware scanning and managed object storage.
- Review and test all flows on the deployed URL before using real student information.
