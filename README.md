# 🎯 JobPingly — Enterprise-Grade Career Page Monitoring & Job Intelligence Platform

[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.33-C5F74F?style=for-the-badge&logo=drizzle)](https://orm.drizzle.team/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?style=for-the-badge&logo=postgresql)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)
[![Ollama / Groq](https://img.shields.io/badge/AI_Engine-Ollama%20%2F%20Groq%20%2F%20OpenAI-FF6F00?style=for-the-badge&logo=openai)](https://ollama.com/)
[![Build Status](https://img.shields.io/badge/Tests-Passing-brightgreen?style=for-the-badge)](file:///d:/JobPingly/scripts/run-tests.ts)

**JobPingly** is an autonomous, full-stack enterprise job monitoring and hiring intelligence platform. Instead of manually refreshing company career portals or relying on stale job aggregator boards, JobPingly tracks direct ATS (Applicant Tracking System) endpoints and custom career portals in near real-time. 

Built with a high-throughput **Multi-Tiered Adaptive Scraping Pipeline**, **SHA-256 Content-Hash Change Detection**, **Ollama/Groq AI Structured Extraction**, **Deterministic Job Fingerprinting**, and an **Anti-Spike Delta Engine**, JobPingly delivers precise job change detection and automated email digests with zero noise.

---

## 📌 Table of Contents

- [Architectural Highlights & Key Features](#-architectural-highlights--key-features)
- [System Architecture](#-system-architecture)
- [Multi-Tiered Adaptive Scraping Engine](#-multi-tiered-adaptive-scraping-engine)
- [Database Schema & ER Model](#-database-schema--er-model)
- [Security Architecture & Engineering Rigor](#-security-architecture--engineering-rigor)
- [Project Directory Structure](#-project-directory-structure)
- [Environment Variables Configuration](#-environment-variables-configuration)
- [Local Development & Setup Guide](#-local-development--setup-guide)
- [Background Worker & Scheduler](#-background-worker--scheduler)
- [Testing & Verification Suite](#-testing--verification-suite)
- [Engineering Highlights & Design Tradeoffs](#-engineering-highlights--design-tradeoffs)
- [License & Acknowledgments](#-license--acknowledgments)

---

## 🚀 Architectural Highlights & Key Features

### 🔍 1. Multi-Tiered Adaptive Scraper Engine
- **Dedicated ATS Adapters:** First-class API and HTML parsers for **Greenhouse**, **Lever**, **Workday**, and **Ashby**.
- **Automated API Endpoints Discovery:** Intercepts hidden JSON endpoints and structured payload URLs automatically.
- **SHA-256 Change Detection Pipeline:** Hashes cleaned HTML representations before AI invocations. If page content has not changed since the last check, LLM calls are skipped—reducing compute costs and response latency by up to **90%**.
- **Ollama Cloud / Groq / OpenAI Extraction:** Uses structured JSON LLM prompts validated through strict **Zod** schemas (`ExtractedPageSchema`) to reliably parse unstructured, complex HTML listings.
- **Playwright Headless Browser Fallback:** Seamlessly spawns a headless browser instance when encountering client-side JavaScript Single Page Applications (SPAs) or anti-bot protections.

### 🛡️ 2. Reliability & Anti-Spike Protection
- **Deterministic Multi-Tier Job Fingerprinting:** Prevents duplicate job creation across scraping runs using a three-tier hashing strategy:
  1. `ext:<ATS_External_ID>`
  2. `url:<Normalized_Job_URL>`
  3. `title_dept:<Title+Department_Hash>`
- **Anti-Spike Delta Guard:** Automatically flags scrapes as "suspicious" if a site suddenly drops >50% of its listings, preventing accidental mass job deletions caused by anti-bot blocks or temporary DOM failures.
- **Grace-Period Soft Deletes (`missedScrapes`):** Jobs are marked closed only after multiple consecutive verification failures.
- **Auto-Expiration Engine:** Scans and purges database records whose application deadlines or expiration timestamps have elapsed.

### 👥 3. Multi-Tenant Watchlists & Community Collaboration
- **Public & Private Watchlists:** Users can create custom watchlist collections or publish them for the community.
- **Keyword Alert Engine:** Supports positive (inclusion) and negative (exclusion) regex/keyword matching for instant or scheduled digests.
- **Community List Contributions:** Open submission flow allowing users to suggest new career pages to public lists, subject to list maintainer approval.
- **Granular Multi-Maintainer Permissions:** Invite co-maintainers with `editor` or `moderator` roles via cryptographically secure UUID tokens.

### 🔒 4. Enterprise-Grade Security Architecture
- **SSRF (Server-Side Request Forgery) Defense:** Sanitizes all input URLs, strips tracking parameters (`utm_*`, `ref`), blocks private IPv4/IPv6 ranges (`127.0.0.1`, `10.0.0.0/8`, `169.254.169.254` AWS metadata), and restricts allowed ports.
- **Dual JWT Auth Strategy:** Access tokens (short-lived, 15m) + HTTP-Only Refresh Tokens (7-day sliding expiration, database-backed with device fingerprinting and instant revocation).
- **Edge Rate-Limiting Middleware:** Windowed sliding-rate limiter protecting `/api/auth/` (15 req/min), `/api/admin/` (30 req/min), and general endpoints (60 req/min).
- **Admin Audit Logging & Dynamic Feature Flags:** Tracks all privilege escalation and administrative actions in real-time while providing instant toggling of runtime features (`scraper.enabled`, `scraper.use_global_timer`).

---

## 🏗️ System Architecture

The following block diagram highlights the decoupled, asynchronous architecture of JobPingly:

```mermaid
graph TD
    User([User / Browser]) <-->|HTTPS / REST API| NextApp[Next.js App Router API & UI]
    
    subgraph Core Platform Layer
        NextApp -->|Drizzle ORM| DB[(Supabase PostgreSQL)]
        NextApp -->|JWT Auth / Cookies| AuthModule[Custom Auth Engine]
        NextApp -->|Rate Limiting| Middleware[Middleware Rate Limiter]
        AuthModule -->|Google OAuth 2.0| GoogleAuth[Google Auth Library]
    end

    subgraph Background Execution & Engine
        WorkerProcess[TSX Background Worker Scheduler] -->|Poll Due Pages| DB
        WorkerProcess -->|Scrape Pipeline Trigger| ScraperPipeline[Multi-Tier Scraper Pipeline]
        
        ScraperPipeline -->|1. SSRF Check & URL Clean| SSRFGuard[SSRF Protection Engine]
        ScraperPipeline -->|2. Direct Fetch| ATSAdapters[Greenhouse / Lever / Workday / Generic]
        ScraperPipeline -->|3. Fallback Headless| PlaywrightEngine[Playwright Engine]
        ScraperPipeline -->|4. Change Detection| HashCompare{SHA-256 Hash Changed?}
        
        HashCompare -->|No| LogSkip[Skip AI & Store Log]
        HashCompare -->|Yes| AIExtractor[Ollama Cloud / Groq / OpenAI Engine]
        
        AIExtractor -->|5. Zod Schema Validation| ZodValidate[ExtractedPageSchema]
        ZodValidate -->|6. Fingerprinting & Delta| FingerprintEngine[Job Fingerprinter & Differ]
        FingerprintEngine -->|7. Persist Jobs & Logs| DB
    end

    subgraph Notification Subsystem
        FingerprintEngine -->|8. Push Matches| NotificationQueue[Notification Queue Table]
        NotificationQueue -->|Instant / Daily Digest| EmailSender[Brevo / Resend Email Engine]
        EmailSender -->|Transactional Email| Recipient([User Inbox])
    end
```

---

## ⚡ Multi-Tiered Adaptive Scraping Engine

JobPingly relies on a multi-stage fallback pipeline to handle diverse web career portals, ranging from simple static pages to complex enterprise ATS integrations:

```mermaid
sequenceDiagram
    autonumber
    participant Scheduler as Worker Scheduler
    participant Pipeline as Scraper Pipeline
    participant ATS as ATS Adapters
    participant Hash as SHA-256 Cleaner & Hasher
    participant AI as Ollama / Groq LLM API
    participant Differ as Fingerprinter & Anti-Spike Differ
    participant DB as Supabase PostgreSQL Database

    Scheduler->>Pipeline: Execute runScraperPipeline(careerPageId)
    Pipeline->>ATS: Attempt direct ATS adapter (Greenhouse / Lever / Workday)
    alt Direct ATS Match Found
        ATS-->>Pipeline: Return Normalized Jobs JSON
    else Custom / Generic HTML Portal
        Pipeline->>Hash: Fetch HTML -> Clean Tags -> Generate SHA-256 Hash
        Hash->>DB: Compare with lastContentHash
        alt Content Unchanged
            Hash-->>Pipeline: Hash match (Skip extraction)
        else Content Changed / New Page
            Pipeline->>AI: Send cleaned DOM to Ollama Cloud / Groq (Zod Enforced)
            AI-->>Pipeline: Return Structured Extracted Jobs JSON
        end
    end
    Pipeline->>Differ: Run Fingerprint & diffJobs(scrapedJobs, dbJobs)
    alt Delta Suspicious (>50% Drop)
        Differ-->>Pipeline: Flag Scrape as Suspicious (Trigger Alert)
    else Normal Delta
        Differ->>DB: Upsert New Jobs, Update Last Seen, Soft-Delete Missing
    end
    Pipeline->>Scheduler: Return Execution Metrics (Found, Added, Removed, Duration)
```

---

## 🗄️ Database Schema & ER Model

JobPingly utilizes **Drizzle ORM** targeting **PostgreSQL** with 16 interconnected, indexed tables designed for performance and integrity:

```mermaid
erDiagram
    users ||--o{ refresh_tokens : owns
    users ||--o{ oauth_accounts : links
    users ||--o{ lists : creates
    users ||--o{ subscriptions : subscribes
    users ||--o{ list_subscriptions : follows
    users ||--o{ list_collaborators : maintains

    lists ||--o{ list_career_pages : contains
    career_pages ||--o{ list_career_pages : belongs_to
    career_pages ||--o{ jobs : hosts
    career_pages ||--o{ scrape_logs : records
    
    users ||--o{ notification_queue : targets
    jobs ||--o{ notification_queue : triggers
    
    users ||--o{ reported_issues : files
    users ||--o{ email_approvals : requests

    users {
        uuid id PK
        string email UK
        string password_hash
        string role
        boolean is_blocked
        string notification_preference
        timestamp created_at
    }

    lists {
        uuid id PK
        uuid user_id FK
        string name
        string slug UK
        string visibility
        integer follower_count
    }

    career_pages {
        uuid id PK
        string url UK
        string company_name
        string ats_type
        string status
        string last_content_hash
        integer check_interval_minutes
    }

    jobs {
        uuid id PK
        uuid career_page_id FK
        string fingerprint UK
        string title
        string url
        string location
        string status
        integer missed_scrapes
    }

    scrape_logs {
        uuid id PK
        uuid career_page_id FK
        boolean success
        boolean suspicious
        integer jobs_found
        integer duration_ms
    }
```

---

## 🛡️ Security Architecture & Engineering Rigor

### 1. SSRF Mitigation Layer (`lib/security/ssrf.ts`)
To prevent internal resource probing via custom career page links, JobPingly validates every URL before execution:
- **Protocol Enforcement:** Accepts only `http:` and `https:`.
- **IP Blacklisting:** Blocks private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), loopback (`127.0.0.1/8`), link-local (`169.254.0.0/16`), IPv6 loopback (`::1`), and metadata domains (`instance-data`).
- **URL Normalization:** Strips query parameters, tracking tokens (`utm_*`, `fbclid`), hash fragments, and trailing slashes.

### 2. Dual-Token JWT Authentication (`lib/auth/jwt.ts`)
- **Access Token:** Short lifespan (15 minutes), signed with `HS256`, passed via secure cookies.
- **Refresh Token:** Long lifespan (7 days), hashed with SHA-256 before storage in the `refresh_tokens` table. Supports device binding (`device_hint`, `ip_address`) and single-click token revocation.

### 3. Edge Rate Limiting Middleware (`middleware.ts`)
Protects key endpoints using an in-memory sliding window algorithm:
- `/api/auth/*`: **15 requests / min**
- `/api/admin/*`: **30 requests / min**
- General `/api/*`: **60 requests / min**

---

## 📂 Project Directory Structure

```text
JobPingly/
├── app/                          # Next.js 14 App Router Architecture
│   ├── (auth)/                   # Authentication Routes Group (Login, Register, Reset)
│   ├── admin/                    # Admin Dashboard (Users, Audit Logs, Feature Flags, Issues)
│   ├── api/                      # RESTful Route Handlers
│   │   ├── admin/                # System management & flag control
│   │   ├── auth/                 # Login, Register, Google OAuth, Refresh, Logout
│   │   ├── career-pages/         # Career page management & force scrape routes
│   │   ├── collaborators/        # Watchlist collaboration invite routes
│   │   ├── issues/               # Support tickets & user feedback API
│   │   ├── lists/                # Watchlist CRUD & discovery APIs
│   │   └── me/                   # Authenticated user profiles & notification settings
│   ├── dashboard/                # Main User Dashboard & Watchlist Manager
│   ├── discover/                 # Community Public Watchlists Explorer
│   ├── lists/                    # Public List Detail & Share Views
│   ├── globals.css               # Global Tailwind CSS Styles
│   └── layout.tsx                # Base Layout Provider (Themes, Navbars, Toasts)
│
├── components/                   # Modular React UI Component Library
│   ├── WatchListDetailView.tsx   # Core Interactive Watchlist Interface (1,000+ LOC)
│   ├── JobCard.tsx               # Standardized Job Listing Card Component
│   ├── Navbar.tsx                # Navigation Header with Role Controls
│   ├── PublicUserProfileModal.tsx# Public User Profile & Social Links Modal
│   ├── ReportIssueModal.tsx      # Support & Scraper Feedback Modal
│   └── UserProfileDropdown.tsx   # Quick User Actions & Theme Toggle
│
├── lib/                          # Core Enterprise Libraries & Helpers
│   ├── ai/                       # Ollama Cloud / Groq / OpenAI LLM Client Wrapper
│   ├── auth/                     # JWT Generation, Verification & Cookie Helpers
│   ├── db/                       # Database Setup
│   │   ├── client.ts             # Postgres Connection Pool (postgres.js + Drizzle)
│   │   └── schema.ts             # Drizzle PostgreSQL Schema Definitions
│   ├── email/                    # Brevo Transactional Email Integration
│   ├── flags/                    # Dynamic Database-Backed Feature Flag Evaluator
│   ├── security/                 # SSRF Protection & URL Sanitizer
│   └── utils/                    # Common UI & String Formatting Utilities
│
├── packages/                     # Decoupled Monorepo Core Packages
│   ├── scraper/                  # Autonomous Scraping Engine Package
│   │   └── src/
│   │       ├── adapters/         # ATS Adapters (Greenhouse, Lever, Workday, Generic)
│   │       ├── aiExtractor.ts    # AI Extraction Engine with Zod Validation
│   │       ├── aiFallback.ts     # Fallback AI Normalizer
│   │       ├── cleaner.ts        # HTML Sanitizer & Minifier
│   │       ├── differ.ts         # Job Differ & Anti-Spike Guard
│   │       ├── fingerprint.ts    # Deterministic Fingerprint Generator
│   │       ├── pipeline.ts       # Main Scraper Execution Orchestrator
│   │       └── playwrightFallback.ts # Dynamic Browser Parser
│   └── notifications/            # Email Notification & Keyword Matching Engine
│       └── src/
│           ├── matcher.ts        # Keyword & Regex Alert Engine
│           └── sender.ts         # Digest Email Builder & Transporter
│
├── worker/                       # Independent Background Worker Node
│   └── scheduler.ts              # Async Task Scheduler for Due Career Pages
│
├── scripts/                      # CLI Operations & Testing Utility Scripts
│   ├── jobs-check.ts             # Ad-hoc Scraper Pipeline Execution CLI
│   ├── make-admin.ts             # User Role Escalation CLI Script
│   └── run-tests.ts              # Comprehensive Offline Integration Test Suite
│
├── drizzle/                      # Database Migration Files
├── drizzle.config.ts             # Drizzle Kit Configuration
├── middleware.ts                 # Next.js Edge Rate Limiting Middleware
├── tailwind.config.js            # Tailwind Theme Extensions
└── tsconfig.json                 # Strict TypeScript Configuration
```

---

## ⚙️ Environment Variables Configuration

Copy `.env.example` to `.env` and configure the following variables:

| Variable | Description | Required | Default / Example |
| :--- | :--- | :---: | :--- |
| `DATABASE_URL` | PostgreSQL Connection String | **Yes** | `postgresql://user:pass@localhost:5432/jobpingly` |
| `JWT_ACCESS_SECRET` | Secret key for signing 15m Access Tokens | **Yes** | Min 32-character string |
| `JWT_REFRESH_SECRET` | Secret key for signing 7d Refresh Tokens | **Yes** | Min 32-character string |
| `NEXT_PUBLIC_APP_URL` | Canonical Base URL of the Application | **Yes** | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID for Google Auth | No | `xxxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret | No | `GOCSPX-xxxx` |
| `OLLAMA_API_KEY` | Ollama Cloud API Key for AI extraction | No | `ollama_key_xxxx` |
| `OLLAMA_BASE_URL` | Endpoint for Ollama service | No | `https://api.ollama.com` |
| `GROQ_API_KEY` | Fallback Groq LLM API Key | No | `gsk_xxxx` |
| `OPENAI_API_KEY` | Fallback OpenAI API Key | No | `sk-proj-xxxx` |
| `BREVO_API_KEY` | Brevo API key for transactional emails | No | `xkeysib-xxxx` |
| `SENDER_EMAIL` | Outgoing email address | **Yes** | `notifications@jobpingly.com` |
| `WORKER_POLL_INTERVAL_MS`| Worker poll rate in milliseconds | No | `10000` (10 seconds) |

---

## 🛠️ Local Development & Setup Guide

### 1. Prerequisites
- **Node.js**: `v18.17.0` or higher
- **Package Manager**: `npm` or `pnpm`
- **Database**: Active **PostgreSQL** instance (Local or Supabase)

### 2. Installation Steps
```bash
# 1. Clone the repository
git clone https://github.com/your-username/JobPingly.git
cd JobPingly

# 2. Install dependencies
npm install

# 3. Environment configuration
cp .env.example .env
# Edit .env with your PostgreSQL credentials & JWT secrets
```

### 3. Database Migration
```bash
# Push schema directly to your database via Drizzle Kit
npm run db:push

# Generate Drizzle migration files if making schema adjustments
npm run db:generate
```

### 4. Running the Application
Launch both the Next.js development server and the background scraping worker:

```bash
# Terminal 1: Next.js Frontend & API Server
npm run dev

# Terminal 2: Background Scheduler Worker
npm run worker
```

Open [http://localhost:3000](http://localhost:3000) in your browser to access JobPingly.

---

## 🔄 Background Worker & Scheduler

The worker operates as a standalone daemon (`worker/scheduler.ts`) isolated from the web server:
- **Polling Loop:** Queries `career_pages` every 10 seconds for items where `nextCheckAt <= NOW()`.
- **Feature Flag Control:** Checks `scraper.enabled` before executing.
- **Auto Cleanup Routine:** Runs a daily maintenance pass via `autoRemoveExpiredJobsFromDb()` to remove expired jobs.
- **Execution Logging:** Records runtime, jobs discovered, jobs added, and error tracebacks to `scrape_logs`.

---

## 🧪 Testing & Verification Suite

JobPingly features an automated system integration test suite verifying critical engine paths offline without making live network requests.

To run the system test suite:
```bash
npm run jobs:test
```

### Verified Test Cases:
1. **SSRF Guard Test:** Verifies normalized URL stripping and private IP rejection (`127.0.0.1`, AWS Metadata `169.254.169.254`).
2. **Job Fingerprinting Test:** Validates deterministic hash creation across external IDs, URLs, and title/department combinations.
3. **Differ & Anti-Spike Test:** Asserts proper detection of new, unchanged, and removed jobs while confirming anti-spike alerts flag false mass-deletions.
4. **Keyword Alert Matcher Test:** Validates exact and fuzzy keyword matching against job titles and descriptions.

---

## 💡 Engineering Highlights & Design Tradeoffs

1. **Drizzle ORM over Prisma:** Chosen for zero-overhead SQL queries, native TypeScript type safety, and lightweight bundle footprint ideal for serverless environments.
2. **Content Hash Change Detection before AI Invocation:** By calculating a SHA-256 hash of cleaned HTML content, JobPingly avoids redundant LLM API calls on pages that haven't changed, reducing operational expenses dramatically.
3. **Anti-Spike Delta Guard:** Prevents scraper failures or site structural updates from deleting valid job listings from user dashboards.
4. **Custom Dual JWT Auth vs. Third-Party Providers:** Provides total control over session invalidation, table schema, rate limiting, and multi-tenant security headers without external vendor lock-in.

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/MishkatIT" target="_blank"><strong>Mishkatul Islam</strong></a>
</p>
