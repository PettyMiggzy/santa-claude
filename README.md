# Santa Claude AI

The website for **$SANTA**: a chrome-plated AI Santa on Solana who talks back, remembers you, and keeps score on the Naughty-or-Nice list.

- **3D Santa** made from the project art with [Meshy](https://www.meshy.ai): rigged, with 6 animation clips (idle, wave, dance, YMCA, cheer, talk). He reacts to the chat.
- **Talk to Santa**: streaming chat powered by [Venice](https://venice.ai), with a Nice-o-meter and on-device memory (his name for you, the conversation).
- **Santa in characters**: an animated text-art version of Santa, drawn in the browser.
- **Workshop gallery**, **token section** with how-to-buy steps, and a **contract address bar** with copy, Solscan and chart links.

## Edit the token info

Everything token-related lives in [`src/config.js`](src/config.js): ticker, chain, contract address, buy/chart/explorer links, X and Telegram. Santa's chat reads the same file, so he always gives out the right address.

While `contractAddress` is empty the site says *"Contract address drops at launch"*, the buy buttons point to the token section, and Santa tells people the address isn't out yet.

## Run it locally

```bash
npm install
```

```bash
cp .env.example .env.local
```

Put your Venice key in `.env.local`, then start the dev server:

```bash
npm run dev
```

Open http://localhost:5173.

## Deploy

### Vercel (easiest)

1. Import this GitHub repo in Vercel. It detects Vite and the `api/` folder on its own.
2. In **Project → Settings → Environment Variables**, add `VENICE_API_KEY`.
3. Deploy.

### Any Node host (Render, Railway, Fly, a VPS)

Build command `npm install && npm run build`, start command `npm start`, and set `VENICE_API_KEY` (plus `PORT` if the host needs it).

## Environment variables

| Name | Needed | What it is |
|---|---|---|
| `VENICE_API_KEY` | yes | A Venice **inference** key. Don't use an admin key on a public site. Give the key a spending limit. |
| `VENICE_MODEL` | no | Model behind Santa. Default `deepseek-v4-1-flash-1017` (cheap, fast, stays in character). |
| `MESHY_API_KEY` | only for `npm run make-santa` | Regenerates the 3D model. |

Keys are only read on the server (`server/santa.js`) and never reach the browser.

## Costs and abuse protection

- Each chat message costs a fraction of a cent on the default model.
- `/api/chat` limits each IP to 25 messages per 10 minutes, keeps 12 messages of context, caps messages at 600 characters and replies at 320 tokens. These limits live in memory, per server instance. For a big launch, also set a spend cap on the Venice key, or move the limiter to a shared store such as Upstash Redis.

## Regenerate the 3D Santa

```bash
MESHY_API_KEY=msy_... npm run make-santa
```

This runs art → clean full-body reference → image to 3D → rigging → animations → compressed `public/models/santa.glb`, about 70–100 Meshy credits per run. Add `-- --ref art/santa-fullbody-reference.png` to skip the first step. Clip choices are in `scripts/make-santa-3d.mjs` (`ACTIONS`); their names must match `CLIPS` in `src/stage.js`.

## Project layout

```
index.html            page markup
src/config.js         token + links (edit me)
src/main.js           wires config into the page, loads everything
src/stage.js          three.js 3D Santa
src/chat.js           chat UI, Nice-o-meter, memory
src/ascii.js          Santa in text characters
src/style.css         styles
server/santa.js       Santa's persona + /api/chat handler (shared)
api/chat.js           Vercel function
server.mjs            production server for non-Vercel hosts
scripts/              Meshy pipeline
art/                  original artwork + the reference used for 3D
public/               model, images, icons
```

---

$SANTA is a memecoin for entertainment, with no intrinsic value or expectation of financial return. Not financial advice. Santa Claude is an AI character. Not affiliated with Anthropic, the Solana Foundation or any exchange.
