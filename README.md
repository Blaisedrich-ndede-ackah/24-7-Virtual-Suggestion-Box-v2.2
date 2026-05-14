# 📬 24/7 Virtual Suggestion Box

A complete, production-ready, secure, and anonymous web-based suggestion/grievance system. Users can submit feedback anonymously, track submissions with a unique token, and engage in two-way anonymous communication with administrators.

---

## ✨ Features

- **100% Anonymous Submissions** — No personal information required, no IP/email stored in raw form
- **Unique Reference Tokens** — SHA-256 hashed tokens for secure, private tracking
- **Two-Way Anonymous Communication** — Users and admins can exchange messages without revealing identity
- **72-Hour Response Timer** — Automatic escalation if admin doesn't respond in time
- **Real-Time Admin Notifications** — Powered by Supabase Realtime with sound alerts
- **Admin Dashboard** — View, filter, reply, and manage all submissions
- **Analytics** — Status distribution, category breakdown, response time metrics (vanilla Canvas charts)
- **Rate Limiting** — Server-side + client-side rate limiting to prevent abuse
- **Math CAPTCHA** — Simple client-side verification on submission
- **Mobile-First Responsive Design** — Works on all devices from 320px to 4K
- **Zero External CSS/JS Frameworks** — Pure HTML5, CSS3, Vanilla JavaScript (only Supabase JS client via CDN)
- **Row Level Security (RLS)** — Database-level access control for all tables
- **Zero Demo Data** — System launches completely empty

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Pure HTML5, CSS3, Vanilla JavaScript |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (admin login only) |
| Realtime | Supabase Realtime (live notifications) |
| Backend Logic | Supabase Edge Functions (Deno) |
| Hosting | Vercel (static site) |
| Source Control | GitHub |

---

## 📁 Project Structure

```
/
├── index.html                  # Home page
├── submit.html                 # Submit feedback (anonymous/identified)
├── track.html                  # Track submission + view replies + respond
├── admin/
│   ├── login.html              # Admin login
│   └── dashboard.html          # Admin dashboard (inbox, analytics, settings)
├── css/
│   ├── main.css                # Global styles, variables, reset, components
│   ├── home.css                # Home page styles
│   ├── submit.css              # Submission form styles
│   ├── track.css               # User tracking page styles
│   └── admin.css               # Admin login + dashboard styles
├── js/
│   ├── supabase-client.js      # Supabase client initialization
│   ├── utils.js                # Shared utilities (hashing, sanitization, etc.)
│   ├── home.js                 # Home page interactions
│   ├── submit.js               # Form validation, submission, token generation
│   ├── track.js                # Fetch by token, display thread, send reply
│   ├── admin-login.js          # Admin authentication
│   └── admin-dashboard.js      # Dashboard logic (CRUD, realtime, analytics)
├── supabase/
│   ├── schema.sql              # Full DB schema + RLS + functions
│   ├── seed.sql                # Admin user setup instructions
│   └── functions/
│       ├── check-escalation/
│       │   └── index.ts        # Edge Function: auto-escalation
│       └── notify-admin/
│           └── index.ts        # Edge Function: webhook for notifications
├── .env.example                # Required environment variables
├── vercel.json                 # Vercel deployment configuration
└── README.md                   # This file
```

---

## 🚀 Setup & Deployment Guide

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/virtual-suggestion-box.git
cd virtual-suggestion-box
```

### 2. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in
2. Click **"New Project"**
3. Choose your organization, name the project, set a database password, and select a region
4. Wait for the project to be provisioned

### 3. Run the Database Schema

1. In your Supabase Dashboard, go to **SQL Editor**
2. Click **"New Query"**
3. Copy the entire contents of `supabase/schema.sql` and paste it
4. Click **"Run"** — this creates all tables, indexes, RLS policies, and functions
5. Verify: Go to **Table Editor** and confirm that `submissions`, `messages`, `admin_notifications`, and `rate_limit_log` tables exist

### 4. Create the Admin User

1. In Supabase Dashboard, go to **Authentication > Users**
2. Click **"Add User" > "Create New User"**
3. Enter admin email and a strong password
4. Check **"Auto Confirm User"**
5. Click **"Create User"**

> ⚠️ There is no self-registration. Only users created here can log in as admin.

### 5. Enable Realtime

1. Go to **Database > Replication**
2. Under "Supabase Realtime", ensure `admin_notifications` table is enabled
3. The schema.sql already runs `ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;` but verify it took effect

### 6. Configure Environment Variables

Get your API keys from **Supabase Dashboard > Settings > API**:

- `SUPABASE_URL` — Your project URL (e.g., `https://xxxxx.supabase.co`)
- `SUPABASE_ANON_KEY` — The `anon` / `public` key
- `SUPABASE_SERVICE_ROLE_KEY` — The `service_role` key (for Edge Functions only)

Generate a token salt:
```bash
openssl rand -hex 32
```

### 7. Update the Frontend Configuration

**Option A: Direct replacement (simplest)**

Edit `js/supabase-client.js` and replace the placeholder values:
```javascript
var SUPABASE_URL = 'https://your-project.supabase.co';
var SUPABASE_ANON_KEY = 'your-anon-key-here';
```

Edit `js/utils.js` and update the salt in `hashToken()`:
```javascript
var salt = 'your-generated-salt-here';
```

**Option B: Runtime config (recommended for multiple environments)**

Create a `config.js` file that sets `window._env` before other scripts load:
```html
<script>
  window._env = {
    SUPABASE_URL: 'https://your-project.supabase.co',
    SUPABASE_ANON_KEY: 'your-anon-key-here',
    TOKEN_SECRET_SALT: 'your-salt-here'
  };
</script>
```

### 8. Deploy Edge Functions (Optional)

If you want automatic escalation via Supabase Edge Functions:

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy functions
supabase functions deploy check-escalation
supabase functions deploy notify-admin
```

### 9. Set Up Escalation Scheduling

**Option A: pg_cron (Supabase Pro plan)**

Run in SQL Editor:
```sql
SELECT cron.schedule(
  'check-escalations',
  '*/30 * * * *',
  $$ SELECT public.flag_escalated_submissions(); $$
);
```

**Option B: Vercel Cron (included in vercel.json)**

The `vercel.json` already includes a cron configuration. Create an API route or use the Edge Function URL as the cron target.

**Option C: Manual / External cron**

Call the `flag_escalated_submissions()` function via any scheduler by hitting:
```
POST https://your-project.supabase.co/rest/v1/rpc/flag_escalated_submissions
Authorization: Bearer YOUR_SERVICE_ROLE_KEY
```

### 10. Deploy to Vercel

1. Push your code to GitHub
2. Go to [https://vercel.com](https://vercel.com) and import your GitHub repository
3. Vercel will auto-detect it as a static site
4. Add environment variables in **Vercel Dashboard > Project > Settings > Environment Variables** (if using runtime config)
5. Click **Deploy**
6. Every `git push` will automatically trigger a new deployment

---

## 📖 How to Use

### User Flow
1. Visit the home page and click **"Submit Feedback"**
2. Fill out the form (anonymous by default)
3. Complete the CAPTCHA and submit
4. **Save your reference token** (e.g., `VSB-A3F92K`) — copy it or download as .txt
5. Visit **"Track My Submission"** and enter your token
6. View status, countdown timer, and any admin replies
7. Reply to the admin anonymously if needed

### Admin Flow
1. Navigate to `/admin` or `/admin/login.html`
2. Sign in with credentials created in Supabase
3. View all submissions in the **Inbox**
4. Click any submission to open the detail panel
5. Read the message thread and send replies
6. Update status (Pending → In Progress → Resolved)
7. Monitor **real-time notifications** via the bell icon
8. Check **Analytics** for status/category breakdowns
9. Change password in **Settings**

---

## 🔒 Security Notes

- **No raw PII stored** — Emails, phone numbers, and IPs are SHA-256 hashed before storage
- **Token security** — Display tokens are hashed with a secret salt; even DB access can't reverse them
- **Row Level Security** — All tables enforce RLS; anon users can only INSERT, not SELECT directly
- **Admin auth** — Supabase Auth JWT with automatic expiration
- **No self-registration** — Admin accounts are created only via Supabase Dashboard
- **Rate limiting** — Max 3 submissions per IP hash per hour (server-side function)
- **Input sanitization** — All user inputs stripped of HTML tags before storage
- **Security headers** — CSP, X-Frame-Options, X-Content-Type-Options configured in vercel.json
- **HTTPS enforced** — All Supabase connections use HTTPS by default

---

## 🛡️ Best Practices

- Rotate the `TOKEN_SECRET_SALT` periodically (existing tokens will be invalidated)
- Use a strong admin password (12+ characters)
- Monitor the escalation rate in Analytics — high rates indicate response bottlenecks
- Regularly review and resolve escalated cases
- Back up your Supabase database regularly
- Keep the Supabase service role key strictly in server-side code

---

## 📄 License

MIT License — See [LICENSE](LICENSE) for details.
