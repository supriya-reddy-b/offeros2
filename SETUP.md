# OfferOS Setup Guide

## Prerequisites

- Node.js 18+
- PostgreSQL database
- Box developer account
- OpenAI API key
- Apify account
- Resend account

## 1. Fill in .env.local

```
DATABASE_URL="postgresql://user:pass@localhost:5432/offeros"
BOX_CLIENT_ID="..."
BOX_CLIENT_SECRET="..."
BOX_DEVELOPER_TOKEN="..."       # From Box Developer Console
BOX_COMMON_FOLDER_ID="..."      # Box folder ID for common docs
OPENAI_API_KEY="..."
APIFY_API_TOKEN="..."
RESEND_API_KEY="..."
RESEND_FROM_EMAIL="noreply@yourdomain.com"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## 2. Box Setup

1. Go to developer.box.com → Create App → Custom App → Server Authentication (Developer Token)
2. Enable permissions: Read/Write files and folders
3. Copy Client ID, Client Secret, Developer Token
4. Create a folder in Box called "OfferOS Common" — copy its folder ID from the URL

## 3. Database Setup

```bash
# Create the database
createdb offeros

# Run migrations
npx prisma migrate dev --name init
```

## 4. Run the App

```bash
npm run dev
```

## 5. Demo Flow

1. Go to http://localhost:3000/hr
2. Upload common docs (Benefits Guide, Equity FAQ, etc.) to Box
3. Click "Invite Candidate" → fill in name/email/role
4. Candidate receives magic link email
5. Candidate clicks link → lands on /candidate?token=...
6. Candidate asks questions → AI answers from Box docs
7. Candidate asks about compensation → escalation created
8. HR views candidate profile at /hr/candidates/{id}
9. HR responds to escalation
10. HR clicks "Generate Candidate Brief"

## Routes

| Route | Description |
|-------|-------------|
| `/hr` | HR Dashboard |
| `/hr/candidates/{id}` | Candidate detail page |
| `/candidate?token={token}` | Candidate portal (magic link) |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/hr/candidates` | GET, POST | List / create candidates |
| `/api/hr/candidates/{id}` | GET, PATCH | Get / update candidate |
| `/api/hr/documents` | GET, POST, DELETE | Manage Box common docs |
| `/api/hr/escalations/{id}` | PATCH | Respond to escalation |
| `/api/candidate/auth` | GET | Validate magic token |
| `/api/candidate/ask` | POST | Ask a question (AI pipeline) |
| `/api/intelligence/{candidateId}` | POST | Refresh Apify intelligence |
| `/api/brief/{candidateId}` | POST | Generate AI candidate brief |
