# Real Estate Lead Capture Bot — Bot specification

**Archetype:** crm

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot for real estate agents to collect lead submissions from public users (name, phone, intent, note) with owner notifications and admin management of leads. Public users see only the submission flow, while the owner can view/edit leads in a paginated admin interface.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- prospective clients (public)
- real estate agent (owner)

## Success criteria

- Lead submissions are captured with confirmation UX
- Owner receives Telegram notifications for new leads
- Owner can manage leads via admin interface with New/Done status

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open public user menu with 'Submit a lead' button
- **/admin** (command, actor: user, command: /admin) — Open admin interface (only accessible to owner)
  - inputs: ADMIN_CHAT_ID
  - outputs: Paginated lead list with management options
- **Admin** (button, actor: user, callback: admin:list) — Open admin lead list from notification (only for owner)

## Flows

### Public lead submission
_Trigger:_ /start

1. Show 'Submit a lead' button
2. Collect name (typed)
3. Collect phone (typed or contact share)
4. Select intent (Buy/Rent/Sell buttons)
5. Enter note (free text)
6. Show confirmation summary with Confirm/Edit buttons

_Data touched:_ Lead

### Admin management
_Trigger:_ /admin

1. Verify owner identity
2. Show paginated lead list (10 per page)
3. Display lead details with New/Done toggle and delete option
4. Update lead status/deletion

_Data touched:_ Lead

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram user/chat ID to receive lead notifications and access admin
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **Lead** _(retention: persistent)_ — Client submission with status tracking
  - fields: id, submitter_telegram_id, name, phone, intent, note, status, timestamp

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- View/edit lead status (New/Done)
- Delete leads from admin interface

## Notifications

- New lead notification with summary and admin access button sent to ADMIN_CHAT_ID

## Permissions & privacy

- Only owner can access /admin and manage leads
- Phone numbers collected with minimal validation (digits and common separators)

## Edge cases

- Non-owner users attempting /admin access
- Incomplete form submissions
- Telegram contact sharing for phone input

## Required tests

- End-to-end lead submission with confirmation flow
- Admin interface pagination and status toggling
- Notification delivery to ADMIN_CHAT_ID with admin access button

## Assumptions

- Single ADMIN_CHAT_ID identifies the owner
- Phone input accepts various formats
- Admin list shows most recent leads first
