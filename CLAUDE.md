@AGENTS.md

# DrugID — Dad's Pill Checker

A mobile-first Next.js app that lets an elderly person photograph a pill and confirm it's the right medication. Uses Claude vision to identify the pill, checks it against a hardcoded medication list, and enriches results with openFDA.

## Stack
- Next.js (App Router, TypeScript, Tailwind CSS)
- Anthropic SDK (`@anthropic-ai/sdk`) — model: `claude-sonnet-4-6`
- openFDA NDC API (fail-silent enrichment)
- Deployed on Vercel

## Key Files
- `app/page.tsx` — main UI (multi-photo upload, compression, results display)
- `app/api/identify/route.ts` — server action: receives images, calls Claude, checks med list, calls openFDA
- `lib/medList.js` — **edit this file** to update the patient's medication list
- `lib/utils.ts` — `checkMedList()` helper (case-insensitive partial match)

## Medication List
Edit `lib/medList.js` to match the patient's actual medications. Each entry needs `brand`, `generic`, and `strength`.

## Environment
- `ANTHROPIC_API_KEY` — required in `.env.local` (and Vercel env vars)

## Multi-Photo Support
Users can upload up to 3 photos (front, back, side). All are compressed client-side (max 1600px, 85% JPEG) before upload. The API sends all images to Claude in a single message for best identification accuracy.

## Body Size Limit
Set to 10mb in `next.config.ts` to handle multiple compressed mobile photos.
