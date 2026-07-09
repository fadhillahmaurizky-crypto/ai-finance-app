# AI Integration

All AI calls go to **Groq** (OpenAI-compatible chat-completions API), but as of the security work, always through Vercel serverless functions — never directly from the browser. See `backend.md` for why.

## 1. AI Chat Assistant (`chat-ai.js` → `/api/ai-chat.js`)

```mermaid
sequenceDiagram
    participant U as User
    participant UI as chat-ai.js
    participant API as /api/ai-chat (Vercel)
    participant SB as Supabase
    participant GROQ as Groq API

    U->>UI: opens chat sheet, sends message
    UI->>UI: canAI() — client-side plan check, just for instant UX feedback
    UI->>API: POST { user_id, messages }
    API->>SB: fetch this user's plan/tokens_used/tokens_limit (server-side, authoritative check)
    API->>GROQ: chat completion, using GROQ_API_KEY (server-only)
    GROQ-->>API: reply + token usage
    API-->>UI: { reply, tokensUsed }
    UI->>SB: PATCH users.tokens_used (client updates its own counter)
```

- **Context gathering**: `updateCtx(sumData)` in `dashboard.js` rebuilds a plain-language summary (saldo, income, expense, category breakdowns) every time `loadSummary()` finishes, so chat always has fresh numbers without an extra fetch.
- **Gating happens twice**: client-side (`canAI()`, instant feedback, skippable by a modified client) and server-side inside `/api/ai-chat.js` (the real check, using the user's actual DB row — this is what actually matters).
- No tool calls, no agent loop — single-turn completion per message.

## 2. Receipt Scanning (`transactions.js` → `scanStruk()` → `/api/ai-scan.js`)

```mermaid
sequenceDiagram
    participant U as User
    participant Cam as triggerCam() / nav-cam input
    participant Scan as scanStruk()
    participant API as /api/ai-scan (Vercel)
    participant GROQ as Groq (llama-4-scout, vision)

    U->>Cam: taps Foto nav button
    Cam->>Cam: canScan() check, opens native camera
    U->>Cam: takes photo
    Scan->>Scan: FileReader → base64
    Scan->>API: POST { user_id, image_base64, mime_type }
    API->>API: server-side plan/token check (same as ai-chat)
    API->>GROQ: vision request, strict-JSON prompt
    GROQ-->>API: JSON string (or {"error":"Bukan struk"})
    API-->>Scan: { content, tokensUsed }
    Scan->>U: fills Catat form (jenis, nominal, kategori, keterangan), defaults account to user's default — shown for review, never auto-saved
```

- **Model**: `meta-llama/llama-4-scout-17b-16e-instruct`.
- **Category hint in the prompt** must be kept in sync with `DEFAULT_CATEGORIES` in `config.js` — these are two separate hardcoded places and have drifted before.
- Camera trigger (`triggerCam()`) now gives explicit toast feedback on empty/cancelled capture instead of failing silently (this was a real, if minor, reported bug).
- **Known unresolved risk**: if Android kills the WebView process while the native camera app is in the foreground (a real, documented TWA/low-memory-device behavior), the scan can appear to silently fail. This is a native-Android-layer issue, not fixable from this web codebase alone — see `roadmap.md`.

## 3. Auto-Detect Transactions — stub, not real AI (yet)

Settings → "Deteksi Transaksi Otomatis" polls the `detected_transactions` table every 15s for `status='pending'` rows and shows a confirm/dismiss popup. **Nothing in this codebase writes to that table.** A browser fundamentally cannot read another app's notifications (GoPay, bank apps) — that's an OS-level permission no web platform exposes. The intended design: a phone-side automation tool (Tasker/MacroDroid) posts directly to Supabase's REST API on notification-received; the popup lets the user correct/confirm before it becomes a real transaction. No AI is involved unless a parsing step is added to whatever posts into that table.

## 4. Fonnte WhatsApp bot — on hold

`gas/wangku-backend.gs` drafts a Llama-3.3 text-based parser that extracts `jenis/nominal/kategori/akun/prioritas/keterangan` from a WhatsApp message, with the user's real account/category names passed as context. **Explicitly on hold** by product decision, and **unverified against the real live script** — see `backend.md` before touching this.
