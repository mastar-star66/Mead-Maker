# 🍯 MeadCraft — Viking Brew Master

A scientifically-accurate mead brewing tracker, recipe designer, and AI companion. Viking/Norse aesthetic. Fully offline-capable PWA.

## Features

- ⚓ **Fleet (My Brews)** — Track active mead batches with gravity logs, TOSNA checklists, stabilization status, racking reminders, pH/temp health tracking
- ⚗️ **Recipe Builder** — Design recipes with honey-to-water calculator, interactive TOSNA tracker, fruit/spice pickers with scientifically-accurate SG calculations
- ✦ **Calculator** — Advanced ABV formula (corrected for high-gravity), honey→water ratio, batch reference chart, yeast tolerance visualization, honey variety guide
- 🐉 **Skáld AI** — AI brewing companion powered by Claude (requires API setup — see below)
- 📜 **Compendium** — Deep-dive into History, Science, Styles, Technique, Equipment, and Troubleshooting (40+ expandable entries)
- ⚔️ **Glossary** — Complete brewing lexicon, quick conversions, stabilization checklist

## Deployment (GitHub Pages)

1. Fork or clone this repository
2. Push to your GitHub account
3. Go to **Settings → Pages → Source** → Deploy from main branch `/` (root)
4. Your app will be live at `https://yourusername.github.io/meadcraft/`

The app is fully static — no backend required for everything except the AI companion.

## AI Companion Setup (Skáld)

The Skáld AI tab requires a server-side proxy to protect your API key. **Never put your API key directly in the frontend JavaScript** — it will be visible to anyone who views your source code.

### Option A: Cloudflare Worker Proxy (Recommended — Free)

1. Create a [Cloudflare account](https://cloudflare.com)
2. Go to **Workers & Pages → Create Worker**
3. Paste this worker code:

```javascript
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    const body = await request.json();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};
```

4. Add secret: `ANTHROPIC_API_KEY = sk-ant-your-key-here`
5. In `app.js`, replace the fetch URL:
   ```javascript
   // Change this line in renderAITab → sendMsg:
   const res = await fetch('https://api.anthropic.com/v1/messages', {
   // To your worker URL:
   const res = await fetch('https://your-worker.workers.dev', {
   ```
   And remove the `headers: { 'Content-Type': ... }` block (the worker adds auth).

### Option B: Vercel/Netlify Serverless Function

Create `api/chat.js`:
```javascript
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(req.body),
  });
  
  const data = await response.json();
  res.json(data);
}
```

Set `ANTHROPIC_API_KEY` in your deployment environment variables.

## Local Development

Just open `index.html` in a browser — it's fully static.  
For service worker support, serve with a local server:

```bash
# Python
python -m http.server 8080

# Node
npx serve .

# Then visit http://localhost:8080
```

## Data Persistence

All brew data is saved to `localStorage` automatically. Data persists across browser sessions, app installs, and device restarts. No account or cloud sync required.

## File Structure

```
meadcraft/
├── index.html        # App shell, PWA meta, install banner
├── style.css         # Full Viking/Norse dark theme
├── app.js            # All app logic, science engine, AI companion
├── sw.js             # Service worker (offline support)
├── manifest.json     # PWA manifest (installability)
├── icon.svg          # App icon (all sizes)
└── README.md         # This file
```

## Science Credits

- **ABV Formula**: Advanced high-gravity correction `(76.08*(OG-FG)/(1.775-OG))*(FG/0.794)`
- **Honey PPG**: ~37 gravity points per pound per gallon (wildflower average)
- **Water Calculation**: Honey volume displacement ~0.339L per pound
- **TOSNA Protocol**: Tailored Organic Staggered Nutrient Addition by Sergio Moutela
- **Stabilization**: Potassium metabisulfite + potassium sorbate dual-agent approach

## License

MIT — brew freely, brew scientifically, brew with honor. ⚓

---
*"The best mead is the one made with knowledge, patience, and the spirit of Valhalla."*
