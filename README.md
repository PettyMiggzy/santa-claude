# Santa Claude AI

The website for **$SANTA**: a chrome-plated AI Santa on Solana who talks back, remembers you, and keeps score on the Naughty-or-Nice list.

- **Splash**: night sky over the workshop, the neon sleigh crossing the screen, a boot log tied to the real 3D download, and an *Enter the workshop* button that turns the sound on.
- **3D Santa** made from the project art with [Meshy](https://www.meshy.ai): rigged, with idle, wave, dance, cheer, talk, YMCA and bow. His gift sack sits at his feet and his candy-cane Naughty List blaster is slung on his back: be rude and he draws it, aims at you and fires coal. He reacts to the chat.
- **Talk to Santa**: streaming chat powered by [Venice](https://venice.ai), with a Nice-o-meter and on-device memory (his name for you, the conversation).
- **Santa's voice**: every reply is spoken with Venice text-to-speech (Kokoro, `am_santa` voice). If Venice can't answer, the browser's own voice takes over. Each reply has a 🔊 replay button.
- **Sound**: a music-box medley of public-domain carols, sleigh bells and small UI sounds, all synthesized in the browser (no audio files to license). Toggle in the header.
- **Atmosphere**: workshop panorama behind the page, parallax snow that drifts around your cursor, sleigh flyovers, a candy-cane cursor with sparkle trail and click bursts (desktop).
- **Santa in characters**: an animated text-art version of Santa, drawn in the browser.
- **Workshop gallery**, **token section** with how-to-buy steps, **live numbers** (price, market cap, volume, liquidity from DexScreener once the contract address is set) and a **contract address bar** with copy, Solscan and chart links.

## Holders, cookies 🍪 and Santa Clips

Same loop as clankuwu: **cookies** are the credit you spend (1 per chat message, voice included; 100 per Santa Clip), and **$SANTA** is how you get them without buying: holders get a daily cookie drop that grows with their balance. Part of the AI revenue buying back and burning $SANTA is shown as *planned*, with a live "burned so far" counter (initial supply minus current onchain supply).

- Visitors without a wallet get a few free messages a day.
- Anyone can **sign in with a Solana wallet** (Phantom, Solflare, Backpack): a free signature, no transaction. Phones get "Open in Phantom/Solflare" links.
- Balances are read onchain at sign-in (cached 10 minutes) once `contractAddress` is set.
- Tiers, costs and daily amounts are all in `src/config.js` → `perks`.
- **Santa Clips**: visitors type a scene and get a ~6 second video of Santa (image-to-video from his reference image). Cookies are refunded automatically if a clip fails.

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
| `VENICE_TTS_MODEL` | no | Voice model. Default `tts-kokoro` (about $3.50 per million characters). |
| `VENICE_TTS_VOICE` | no | Voice. Default `am_santa`. |
| `VENICE_VIDEO_MODEL` | no | Model for Santa Clips. Default `grok-imagine-1-5-lite-image-to-video` (about $0.19 per 6s clip). |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | strongly recommended | Upstash Redis (Vercel → Storage → Upstash). Stores daily cookie use and clip jobs. Without it, limits live in memory and reset whenever Vercel spins up a new instance. `UPSTASH_REDIS_REST_URL`/`_TOKEN` also work. |
| `SOLANA_RPC_URL` | recommended | Solana RPC used to read $SANTA balances and supply. Defaults to the public mainnet RPC, which rate-limits; a free Helius or QuickNode URL is better. |
| `SESSION_SECRET` | recommended | Any long random string; signs wallet sessions. Falls back to one derived from `VENICE_API_KEY`. |
| `MESHY_API_KEY` | only for `npm run make-santa` | Regenerates the 3D model. |

Keys are only read on the server (`server/santa.js`) and never reach the browser.

## Costs and abuse protection

- Each chat message costs a fraction of a cent on the default model, and speaking it costs far less.
- `/api/speak` only voices text that `/api/chat` signed (an HMAC derived from `VENICE_API_KEY`), so nobody can make Santa's voice say arbitrary things. It allows 40 clips per IP per 10 minutes.
- `/api/chat` limits each IP to 25 messages per 10 minutes, keeps 12 messages of context, caps messages at 600 characters and replies at 320 tokens. These limits live in memory, per server instance. For a big launch, also set a spend cap on the Venice key, or move the limiter to a shared store such as Upstash Redis.

## Regenerate the 3D Santa

```bash
MESHY_API_KEY=msy_... npm run make-santa
```

This runs art → stocky front reference → side and back views → 3D built from all views → rigging → animations → compressed `public/models/santa.glb`, about 80–100 Meshy credits per run. Building from several views is what gives Santa real depth (a single front image gave flat, paper-thin arms). Add `-- --ref art/santa-fullbody-reference.png` to reuse the current front reference. Clip choices are in `scripts/make-santa-3d.mjs` (`ACTIONS`); their names must match `CLIPS` in `src/stage.js`.

## Project layout

```
index.html            page markup
src/config.js         token + links (edit me)
src/main.js           wires config into the page, loads everything
src/stage.js          three.js 3D Santa
src/chat.js           chat UI, Nice-o-meter, memory
src/ascii.js          Santa in text characters
src/splash.js         the intro screen
src/sound.js          music, sleigh bells, UI sounds, Santa's voice
src/fx.js             snow, cursor, sleigh flyovers, sky parallax
src/live.js           live token numbers (DexScreener)
src/style.css         styles
server/santa.js       Santa's persona + /api/chat handler (shared)
server/speak.js       /api/speak handler (Venice text-to-speech)
server/sign.js        reply signing + rate limiter
api/chat.js           Vercel function
api/speak.js          Vercel function
server.mjs            production server for non-Vercel hosts
scripts/              Meshy pipeline
art/                  original artwork + the reference used for 3D
public/               model, images, icons
```

---

$SANTA is a memecoin for entertainment, with no intrinsic value or expectation of financial return. Not financial advice. Santa Claude is an AI character. Not affiliated with Anthropic, the Solana Foundation or any exchange.
