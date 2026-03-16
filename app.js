'use strict';
// ═══════════════════════════════════════════════════════════════════════
//  MeadCraft — Viking Brew Master  |  app.js  v3.1 (fixed)
// ═══════════════════════════════════════════════════════════════════════

// ── localStorage ───────────────────────────────────────────────────────
const LS = {
  KEY: 'meadcraft_v3',
  load() { try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch { return {}; } },
  save(d) { try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch(e) { console.warn(e); } }
};

// ── State ──────────────────────────────────────────────────────────────
const State = {
  brews: [],
  selectedBrew: null,   // null | 'new' | index number
  activeTab: 'brews',
  chatHistory: [],
  init() {
    const d = LS.load();
    this.brews       = d.brews       || makeDemoBrews();
    this.chatHistory = d.chatHistory || [];
    this.activeTab   = d.activeTab   || 'brews';
  },
  persist() {
    LS.save({ brews: this.brews, chatHistory: this.chatHistory, activeTab: this.activeTab });
  }
};

function makeDemoBrews() {
  return [
    {
      id: Date.now() - 1e6,
      name: 'Valhalla Cherry Melomel', type: 'Melomel', status: 'Fermenting',
      emoji: '⚔️', honey: 'Wildflower', lbsHoney: 15, gallons: 5,
      yeast: 'Lalvin 71B', fruits: ['Cherry', 'Raspberry'], spices: ['Rose Hip'],
      ogReading: 1.110, currentGravity: 1.045, targetFG: 1.010,
      startDate: '2026-01-15', notes: 'Deep crimson color. Viking-worthy.',
      readings: [
        { date: '1/20/2026', gravity: 1.072, note: 'Active fermentation' },
        { date: '1/28/2026', gravity: 1.045, note: 'Slowing nicely' }
      ],
      ph: '3.8', temp: '68',
      tosnaChecked: { t0: true, t24: true, t48: false, t13: false }
    },
    {
      id: Date.now() - 2e6,
      name: 'Golden Odin Traditional', type: 'Traditional', status: 'Conditioning',
      emoji: '🍯', honey: 'Acacia', lbsHoney: 12, gallons: 5,
      yeast: 'Lalvin D47', fruits: [], spices: ['Vanilla'],
      ogReading: 1.090, currentGravity: 1.009, targetFG: 1.008,
      startDate: '2025-11-01', notes: 'Crystal clear. Awaiting Odin\'s blessing.',
      readings: [
        { date: '12/1/2025',  gravity: 1.040, note: 'Good fermentation' },
        { date: '1/5/2026',   gravity: 1.009, note: 'Nearly done' },
        { date: '1/20/2026',  gravity: 1.009, note: 'Confirmed stable' }
      ],
      ph: '3.7', temp: '65',
      tosnaChecked: { t0: true, t24: true, t48: true, t13: true }
    }
  ];
}

// ── Science ────────────────────────────────────────────────────────────
const Sci = {
  abv(og, fg) {
    const v = (76.08 * (og - fg) / (1.775 - og)) * (fg / 0.794);
    return isNaN(v) || v < 0 ? '0.0' : v.toFixed(1);
  },
  abvSimple(og, fg) { return Math.max(0, (og - fg) * 131.25).toFixed(1); },
  og(lbs, gal)      { return 1.0 + (lbs * 37) / (gal * 1000); },
  fg(og, att)       { return 1.0 + (og - 1) * (1 - att); },
  honeyFor(og, gal) { return ((og - 1) * 1000 * gal) / 37; },
  waterL(lbs, gal)  { return Math.max(0, gal * 3.785 - lbs * 0.339); },
  waterGal(lbs, gal){ return Sci.waterL(lbs, gal) / 3.785; },
  style(fg) {
    if (fg < 1.006) return 'Bone Dry';
    if (fg < 1.012) return 'Dry';
    if (fg < 1.020) return 'Semi-Dry';
    if (fg < 1.035) return 'Semi-Sweet';
    if (fg < 1.060) return 'Sweet';
    return 'Dessert Sweet';
  },
  daysSince(d) {
    if (!d) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(d)) / 86400000));
  },
  addMonths(d, m) {
    if (!d) return '—';
    const dt = new Date(d); dt.setMonth(dt.getMonth() + m);
    return dt.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
  },
  stabStatus(brew) {
    const r   = brew.readings || [];
    const yeast = DATA.yeasts.find(y => y.name === brew.yeast);
    const curAbv = parseFloat(Sci.abv(brew.ogReading, brew.currentGravity));
    const tol    = yeast ? yeast.tol : 14;
    const near   = Math.abs(brew.currentGravity - brew.targetFG) <= 0.002;
    const stable = r.length >= 2 && Math.abs(r[r.length-1].gravity - r[r.length-2].gravity) <= 0.001;
    if (near && stable)       return { cls: 'status-safe',        label: '✅ Safe to Stabilize' };
    if (!near && curAbv < tol) return { cls: 'status-risk',        label: '⚠️ Re-ferment Risk' };
    if (near && !stable)      return { cls: 'status-wait',        label: '⏳ Confirm 2 Readings' };
    return                           { cls: 'status-fermenting',  label: '🍯 Fermenting' };
  },
  tosnaG(gal) { return (gal * 3.785 * 0.5).toFixed(1); },
  phAdvice(ph) {
    const v = parseFloat(ph);
    if (!ph || isNaN(v)) return null;
    if (v < 3.0) return { cls: 'info-red',   msg: '⚠️ Critical: pH below 3.0 — yeast will stall. Add potassium bicarbonate.' };
    if (v < 3.4) return { cls: 'info-amber', msg: '⚠️ pH 3.0–3.4: borderline. Monitor and consider K-bicarb.' };
    if (v > 4.5) return { cls: 'info-amber', msg: '🔶 pH elevated. Usually fine; monitor.' };
    return           { cls: 'info-green', msg: `✅ pH ${v.toFixed(1)} is in the ideal 3.5–4.0 range.` };
  },
  tempAdvice(t, yeastName) {
    const v = parseFloat(t);
    if (!t || isNaN(v)) return null;
    const isD47 = yeastName && yeastName.includes('D47');
    if (isD47 && v > 65) return { cls: 'info-red',   msg: `⚠️ D47 above 65°F (${v}°F) — fusel alcohols! Cool immediately.` };
    if (v > 78)          return { cls: 'info-red',   msg: `⚠️ ${v}°F too warm — risk of fusel alcohols.` };
    if (v < 58)          return { cls: 'info-amber', msg: `⚠️ ${v}°F may stall fermentation below 60°F.` };
    return               { cls: 'info-green', msg: `✅ ${v}°F is in the optimal range (60–75°F).` };
  }
};

// ── Static Data ────────────────────────────────────────────────────────
const DATA = {
  fruits: [
    { name:'Raspberry',     emoji:'🍓', sgBoost:1.5 }, { name:'Blackberry',    emoji:'🫐', sgBoost:1.8 },
    { name:'Blueberry',     emoji:'🫐', sgBoost:1.6 }, { name:'Strawberry',    emoji:'🍓', sgBoost:1.2 },
    { name:'Cherry',        emoji:'🍒', sgBoost:2.0 }, { name:'Peach',         emoji:'🍑', sgBoost:1.4 },
    { name:'Mango',         emoji:'🥭', sgBoost:2.2 }, { name:'Pineapple',     emoji:'🍍', sgBoost:2.5 },
    { name:'Apple',         emoji:'🍎', sgBoost:1.3 }, { name:'Lemon',         emoji:'🍋', sgBoost:0.5 },
    { name:'Orange',        emoji:'🍊', sgBoost:1.8 }, { name:'Grape',         emoji:'🍇', sgBoost:2.0 },
    { name:'Watermelon',    emoji:'🍉', sgBoost:1.0 }, { name:'Pomegranate',   emoji:'🍎', sgBoost:2.3 },
    { name:'Passion Fruit', emoji:'🌺', sgBoost:2.8 }, { name:'Cranberry',     emoji:'🍒', sgBoost:1.1 },
    { name:'Apricot',       emoji:'🍑', sgBoost:1.6 }, { name:'Fig',           emoji:'🫐', sgBoost:2.4 },
  ],
  spices: [
    { name:'Cinnamon',    emoji:'🌿', tip:'1–2 sticks, max 2 weeks in secondary' },
    { name:'Vanilla',     emoji:'🌼', tip:'1–2 split beans per 5 gal' },
    { name:'Clove',       emoji:'🌿', tip:'Very potent — 2–4 whole cloves, taste daily' },
    { name:'Ginger',      emoji:'🫚', tip:'1–2oz fresh sliced or 0.5oz dried' },
    { name:'Cardamom',    emoji:'🌿', tip:'6–10 crushed pods per 5 gal' },
    { name:'Nutmeg',      emoji:'🌰', tip:'¼–½ tsp fresh grated — overpowers fast' },
    { name:'Star Anise',  emoji:'⭐', tip:'2–4 pods; pairs well with citrus' },
    { name:'Lavender',    emoji:'💜', tip:'2–4 tbsp dried flowers; very floral' },
    { name:'Rose Hip',    emoji:'🌹', tip:'Adds tartness and Vitamin C' },
    { name:'Hibiscus',    emoji:'🌺', tip:'Brilliant crimson color + tart flavor' },
    { name:'Chamomile',   emoji:'🌼', tip:'Calming apple-honey notes; 2–4 tbsp' },
    { name:'Elderflower', emoji:'🌸', tip:'Delicate floral — add 3–5 days only' },
    { name:'Hops',        emoji:'🌾', tip:'0.5–1oz pellets for Braggot' },
    { name:'Mint',        emoji:'🍃', tip:'Fresh only; 3–5 days max' },
    { name:'Lemongrass',  emoji:'🌿', tip:'2 stalks bruised; 1 week max' },
    { name:'Black Pepper',emoji:'⚫', tip:'10–15 cracked peppercorns' },
  ],
  honeys: [
    { name:'Wildflower',     emoji:'🌸', ppg:37, desc:'Complex floral; regional terroir' },
    { name:'Clover',         emoji:'🍀', ppg:38, desc:'Classic, clean, neutral' },
    { name:'Orange Blossom', emoji:'🍊', ppg:37, desc:'Bright citrus floral notes' },
    { name:'Buckwheat',      emoji:'🌾', ppg:36, desc:'Dark, rich, molasses-like' },
    { name:'Acacia',         emoji:'🌿', ppg:38, desc:'Very light; lets yeast shine' },
    { name:'Manuka',         emoji:'✨', ppg:37, desc:'Earthy, medicinal premium' },
    { name:'Raw Unfiltered', emoji:'🍯', ppg:36, desc:'Most complex; wild yeast present' },
    { name:'Tupelo',         emoji:'🌳', ppg:37, desc:'Buttery; resists crystallizing' },
    { name:'Linden',         emoji:'🌳', ppg:37, desc:'Minty, balsamic — classic European' },
    { name:'Blackberry',     emoji:'🫐', ppg:37, desc:'Dark fruity undertones' },
  ],
  yeasts: [
    { name:'Lalvin 71B',               att:0.75, tol:14, note:'Fruity, soft; beginner-friendly' },
    { name:'Lalvin EC-1118',           att:0.95, tol:18, note:'The Hulk — dry, up to 18% ABV' },
    { name:'Lalvin D47',               att:0.80, tol:14, note:'Floral; MUST stay below 65°F!' },
    { name:'Lalvin K1-V1116',          att:0.85, tol:18, note:'Clean, neutral; vigorous start' },
    { name:'Red Star Cote des Blancs', att:0.78, tol:13, note:'Fruity, low-foam; sweet melomels' },
    { name:'Red Star Premier Blanc',   att:0.88, tol:16, note:'Versatile; handles high sugar' },
    { name:'Wyeast 3184 Sweet Mead',   att:0.70, tol:11, note:'Low attenuation; retains sweetness' },
    { name:'Mangrove Jack M05',        att:0.82, tol:18, note:'Dry Mead specific; enhances honey' },
  ],
  meadTypes: ['Traditional','Melomel','Metheglin','Cyser','Pyment','Capsicumel','Bochet','Braggot','Acerglyn','Tej','Chouchen'],
  emojis:    ['⚔️','🍯','🌸','✨','🍇','🍒','🍑','🌟','🌺','🫐','🍋','🔥','🐝','🏔️','🌊','⚓','🐉'],
  tosna: [
    { id:'t0',  icon:'⚗️', label:'Day 0 — Pitch',      sub:'First Fermaid-O + pitch rehydrated yeast' },
    { id:'t24', icon:'💨', label:'Day 1 — 24 Hours',   sub:'Degas vigorously, add Fermaid-O' },
    { id:'t48', icon:'💨', label:'Day 2 — 48 Hours',   sub:'Degas again, third Fermaid-O dose' },
    { id:'t13', icon:'⅓',  label:'1/3 Sugar Break',    sub:'Final dose when ~33% sugars consumed' },
  ],
  compendium: [
    { id:'history', emoji:'📜', title:'History & Mythology', entries:[
      { emoji:'🏺', title:'7000 BCE — The Oldest Drink', body:'Mead predates agriculture and pottery. Chemical residue in Neolithic clay jars in Jiahu, Northern China dates to 7000 BCE — humanity\'s oldest confirmed alcoholic beverage, predating wine and beer by millennia.' },
      { emoji:'⚡', title:'Ambrosia — Nectar of the Gods', body:'In Greek mythology, mead was Ambrosia, believed to fall from the heavens as dew collected by bees from divine flowers. The gods of Olympus drank it to maintain immortality. Its name shares roots with Sanskrit "amrita" — the elixir of immortality.' },
      { emoji:'💍', title:'The Honeymoon Origin', body:'The word "honeymoon" originates from the medieval Northern European tradition of gifting newlyweds a full lunar cycle (28 days) of mead. The honey-wine ensured fertility, warded off evil spirits, and guaranteed a sweet first month. Documented as early as the 5th century.' },
      { emoji:'⚔️', title:'Viking Mead of Poetry', body:'Norse mythology describes the Mead of Poetry, brewed by dwarves from the blood of Kvasir — a being so wise he could answer any question. Mixed with honey, whoever drank it gained the gift of eloquence and supreme wisdom. Odin himself stole it in the form of an eagle.' },
      { emoji:'🐐', title:'Heidrun & Valhalla', body:'The Norse goat Heidrun stands atop Valhalla eating from the world tree Yggdrasil. From her udders flows an inexhaustible river of mead, filling the great cauldron daily for the Einherjar — fallen warriors awaiting Ragnarok.' },
      { emoji:'⛪', title:'Medieval Monastery Industry', body:'In medieval Europe, mead production was largely monastic. Monks kept enormous apiaries for beeswax candles — mead was the profitable byproduct. Many monasteries maintained detailed brewing records back to the 6th century.' },
      { emoji:'📿', title:'The Vedic Soma Connection', body:'Ancient Rigveda texts (1700–1100 BCE) describe Soma, a divine drink often interpreted as honey-based. Similar honey-wine traditions appear across Indo-European cultures — suggesting a common Proto-Indo-European origin for fermented honey culture.' },
      { emoji:'🌍', title:'Ethiopian Tej', body:'Tej, the Ethiopian honey wine made with Gesho shrub as bittering agent, has been continuously brewed for over 3,000 years. It remains one of the most widely consumed traditional alcoholic beverages globally, central to Ethiopian ceremonial culture.' },
      { emoji:'🏴‍☠️', title:'Viking Maritime Brewing', body:'Archaeological finds from Viking longships confirm mead vessels were standard provisions. Analyses of residue in Viking drinking horns found honey, bog myrtle, yarrow, and cranberry — complex botanical meads were brewed across Scandinavia by 800 CE.' },
    ]},
    { id:'science', emoji:'🔬', title:'Science & Chemistry', entries:[
      { emoji:'🫙', title:'The Must', body:'The "must" is the technical term for unfermented honey-water before yeast is introduced. From Latin "mustum" (fresh/young). Honey must starts at 22–30° Brix. The must is complete when honey is fully dissolved and nutrients are added.' },
      { emoji:'🧬', title:'Fermentation Chemistry', body:'Yeast converts sugars: C₆H₁₂O₆ → 2C₂H₅OH + 2CO₂. ABV uses the advanced formula: (76.08 × (OG-FG) / (1.775-OG)) × (FG/0.794) — correcting for density changes at high alcohol levels. Simple formula (OG-FG)×131.25 underestimates above 10% ABV.' },
      { emoji:'⚗️', title:'Honey Composition & PPG', body:'Raw honey is ~79–80% carbohydrates (mostly fructose + glucose), 17–20% water, and <1% protein and vitamins. Fermentable yield is ~35–38 PPG. At 37 PPG, 1 lb in 1 gallon raises OG by ~0.037. Darker honeys trend lower (36 PPG); light varieties (clover, acacia) reach 38 PPG.' },
      { emoji:'🦠', title:'Yeast Nutrition & Nitrogen', body:'Unlike grape must or grain wort, honey critically lacks Yeast Assimilable Nitrogen (YAN), vitamins (especially thiamine B1), and trace minerals. Without supplementation, honey fermentations produce H₂S (rotten egg), ethyl acetate (nail polish), and stuck fermentations.' },
      { emoji:'🧪', title:'pH Management', body:'Honey is naturally acidic at ~3.5–4.0 pH from gluconic, acetic, and formic acids. Fermentation can push pH lower. Optimal range: 3.5–4.0. Below pH 3.0, yeast enzymatic activity stalls completely. Fix: potassium bicarbonate ½ tsp per 5 gal; retest after 24 hours.' },
      { emoji:'💧', title:'Hygroscopy & Water Activity', body:'Pure honey has very low water activity (aw ~0.60), hostile to all microorganisms — hence why honey never spoils. Adding water raises aw above 0.90, enabling yeast activity. Fermentable must requires dilution to 18–25% sugar concentration (~1.080–1.130 OG).' },
      { emoji:'🔢', title:'The 1/3 Sugar Break', body:'The critical nutrient timing: when ~33% of fermentable sugars are consumed, typically Days 3–6. Calculate it: OG 1.100 = 100 pts. 1/3 break = 33 pts consumed = hydrometer reads ~1.067. This is the most important Fermaid-O addition window in TOSNA.' },
      { emoji:'🛡️', title:'Antimicrobial Properties', body:'Honey\'s antimicrobial nature comes from: (1) High osmolarity, (2) Low pH ~3.9, (3) Hydrogen peroxide from glucose oxidase enzyme, (4) Defensin-1 peptide added by bees. All these effects dissolve once honey is diluted with water to make must.' },
      { emoji:'✨', title:'Clarification Science', body:'Bentonite (montmorillonite clay) carries negative charge, binding positively-charged proteins. Sparkolloid carries positive charge, attracting negatively-charged yeast. Kieselsol-Chitosan duo: Kieselsol first, then Chitosan 24 hours later — fastest clearing method, most meads clear in 1–2 weeks.' },
      { emoji:'🌡️', title:'Temperature & Ester Production', body:'Fermentation temperature controls ester (flavor compound) production. Higher temps = more fruity esters but also more fusel alcohols. D47 above 65°F produces harsh isoamyl alcohol at unacceptable levels. Most wine yeasts perform best at 60–72°F. Cold fermentation (55–60°F) produces clean, neutral character.' },
    ]},
    { id:'styles', emoji:'🍶', title:'Mead Styles', entries:[
      { emoji:'🍯', title:'Traditional', body:'Only honey, water, yeast, and nutrients. The purest expression — flavor is entirely the honey varietal and yeast. Judged at the highest standard in competition because there is nowhere to hide flaws. Age 12–24+ months for best results.' },
      { emoji:'🍓', title:'Melomel — Fruit Mead', body:'Any mead made with fruit. Freeze fresh fruit first to rupture cell walls for better extraction. Add in secondary after primary completes. Typical: 1–3 lb/gal light presence, 3–6 lb/gal bold. Account for fruit sugars raising effective OG.' },
      { emoji:'🍎', title:'Cyser — Apple Mead', body:'Mead fermented with apple juice — mead meets cider. Apple contributes malic acid and fruity esters. Replace some or all water with fresh-pressed juice. A 50/50 split with 2–3 lb honey per gallon makes an excellent 8–10% ABV cyser.' },
      { emoji:'🍇', title:'Pyment — Grape Mead', body:'Mead with grapes or grape juice — mead meets wine. Ancient Greeks called it "oenomel." Use 100% grape juice replacing all water, with 1–2 lb honey per gallon. Pairs wonderfully with oak aging. Can age 2–5+ years like fine wine.' },
      { emoji:'🌿', title:'Metheglin — Spiced Mead', body:'Mead with herbs or spices. Medieval records document metheglin with rosemary, thyme, and hops. Always add spices in secondary using muslin bags. Taste every 2–3 days — over-spicing is irreversible.' },
      { emoji:'🔥', title:'Bochet — Caramelized Honey Mead', body:'Honey caramelized or "burnt" before fermentation. Heat honey alone to 250–350°F while stirring. The Maillard reaction creates toasted marshmallow, chocolate, and toffee compounds that survive fermentation. Longer cooking = darker and more complex.' },
      { emoji:'🍺', title:'Braggot — Mead-Beer Hybrid', body:'Fermented with both honey and malted grains, with optional hops. Historical records place braggot in 13th century Wales and England. Use pale malt (1–2 lb/gal) plus 1–2 lb honey per gallon. Hops provide balance and preservation.' },
      { emoji:'🌶️', title:'Capsicumel — Chili Mead', body:'Mead with chili peppers. Capsaicin is alcohol-soluble — extracts efficiently. The interplay of honey sweetness and chili heat is uniquely complex. Add fresh or dried peppers in secondary for 3–14 days depending on desired heat.' },
      { emoji:'🍁', title:'Acerglyn — Maple Mead', body:'Honey plus maple syrup. Grade B (dark/robust) maple adds the most character. Replace 25–50% of honey weight with maple. The maple character softens during fermentation then returns as earthy caramel in the finish.' },
      { emoji:'🌍', title:'Tej — Ethiopian Honey Wine', body:'Made with honey and Gesho shrub (bittering agent). Ferments 5–10 days with wild yeast, consumed young and semi-turbid. Slightly sweet, tart, earthy, and effervescent. Consumed at virtually all Ethiopian ceremonial occasions.' },
      { emoji:'🇫🇷', title:'Chouchen — Breton Mead', body:'Regionally-protected mead from Brittany, France (IGP). Made with Breton buckwheat honey and wild yeast. Darker and more complex than light floral meads. The cultural equivalent of wine to Brittany — served at all traditional Breton festivals.' },
    ]},
    { id:'technique', emoji:'🏆', title:'Brewing Technique', entries:[
      { emoji:'📅', title:'TOSNA — Staggered Nutrients', body:'Tailored Organic Staggered Nutrient Addition (TOSNA 2.0). Use Fermaid-O exclusively: 0.5g per liter × 4 steps. Add at pitch, 24hr, 48hr, and 1/3 sugar break. Never add more than 1g/L per step to avoid nitrogen toxicity. Always degas before adding nutrients.' },
      { emoji:'🌀', title:'Degassing & Aeration', body:'First 48 hours: whip or stir vigorously to introduce O₂ (yeast lipid synthesis) and release CO₂ (causes yeast stress). After 48 hours, STOP introducing oxygen — it becomes an enemy to finished mead. Continue degassing (without aeration) for the first 5–7 days.' },
      { emoji:'🚢', title:'Racking & Lees Management', body:'Transfer mead off sediment (lees) when heavy lees reach ~½ inch, typically 2–4 weeks in. Fine lees can add complexity. Heavy lees left too long cause autolysis (yeast self-digestion): rubbery, meaty off-flavors. Use a sanitized auto-siphon to minimize oxygen exposure.' },
      { emoji:'❄️', title:'Cold Crashing', body:'Drop temperature to 34–38°F for 1–2 weeks after fermentation. Cold causes yeast and particulates to flocculate and sink, leaving brilliantly clear mead above a compact cake. After cold crashing, rack off and optionally use fining agents for final polishing.' },
      { emoji:'🍯', title:'Stabilization & Back-Sweetening', body:'Add K-meta (¼ tsp/5gal) to stun yeast, then K-sorbate (½ tsp/5gal) to prevent reproduction. Wait 24 hours, then add honey to taste. Without stabilization, added honey re-ferments in the bottle — causing explosive bottle failure.' },
      { emoji:'🥃', title:'Oak Aging', body:'Oak adds vanilla, caramel, toast, and tannin complexity. Use medium-toast American or French oak cubes (1 oz/5 gal, 2–6 weeks). Taste weekly — remove when you like the character. Oak contact is not reversible. Pyments and traditional meads benefit most.' },
      { emoji:'📦', title:'Bottling', body:'Still mead: stabilize first, then wine bottles with corks. Sparkling: do NOT stabilize — add ¾ cup corn sugar per 5 gal, bottle in pressure-rated bottles. Never use wine bottles for sparkling mead — they will shatter. Champagne bottles rated for higher pressure work well.' },
      { emoji:'🧫', title:'Yeast Rehydration', body:'Sprinkle dry yeast into 104°F water (10x yeast volume). Wait 15 minutes without stirring. Acclimate slowly by adding small amounts of must over 30 minutes — temperature shock kills cells. Pitch rate: 1 packet per 1–5 gallons for typical OG; 2 packets for 1.120+ OG.' },
    ]},
    { id:'equipment', emoji:'⚗️', title:'Equipment & Ingredients', entries:[
      { emoji:'🫙', title:'Fermenter — Carboy vs Bucket', body:'Glass carboys (3–6 gal): impermeable to oxygen, easy to observe, gold standard for aging. Food-grade HDPE buckets: easier to clean, better for primary, but absorb odors over time. Always inspect glass for cracks around neck and base. Wide-mouth buckets simplify cleaning.' },
      { emoji:'🔒', title:'Airlock & Bung', body:'One-way valve — CO₂ escapes, outside air cannot enter. Fill with Star San solution (not water) so if fermenter cools and creates negative pressure, sanitizer (not water) is drawn back in. Three-piece airlocks are easier to clean than S-curve types.' },
      { emoji:'📏', title:'Hydrometer & Refractometer', body:'Hydrometers: measure SG in 15–20mL samples with wine thief. Refractometers: 2-drop sample for Brix — but become inaccurate in the presence of alcohol and need correction formula during fermentation. Always use hydrometer for FG readings.' },
      { emoji:'🧴', title:'Star San — Sanitization', body:'"Don\'t fear the foam" — 1 oz per 5 gallons, no-rinse, completely harmless at proper dilution. Sanitize everything that touches your mead: auto-siphon, tubing, airlocks, wine thief, spoons. The leading cause of mead failures is inadequate sanitation.' },
      { emoji:'🦠', title:'Nutrients: Complete Guide', body:'Fermaid-O: organic nitrogen from inactivated yeast — preferred for TOSNA, no ammonia smell. Fermaid-K: inorganic + organic blend; use at half rates. DAP: pure inorganic nitrogen; only for early fermentation. GoFerm: add before pitching for yeast rehydration support.' },
      { emoji:'🌡️', title:'Temperature Control', body:'Single biggest upgrade for most home mead makers. Options: spare fridge with Inkbird controller ($30), chest freezer fermentation chamber, or aquarium heater in water bath around carboy. Even a sleeping bag wrapped around the carboy reduces temperature swings significantly.' },
      { emoji:'🍾', title:'Bottling Equipment', body:'Still mead: wine bottles (750mL) with double-lever floor corker + natural corks. Sparkling: 22oz glass beer bottles with crown caps, or pressure-rated PET. Never bottle sparkling in wine bottles — CO₂ pressure will shatter them. Champagne bottles are rated for carbonation pressure.' },
    ]},
    { id:'troubleshoot', emoji:'🛠️', title:'Troubleshooting', entries:[
      { emoji:'💨', title:'Rotten Egg (H₂S) Smell', body:'Hydrogen sulfide from stressed yeast: caused by nitrogen deficiency (most common), temperature stress, or zinc deficiency. Fix: degas vigorously to drive off H₂S gas, then add Fermaid-O. Brief copper contact (clean pipe stirred in) binds H₂S as copper sulfide. Splash rack if persistent.' },
      { emoji:'🚫', title:'Stuck Fermentation', body:'Stops before target FG. Causes: pH below 3.0, temperature too cold, OG above 1.150 (osmotic stress), nutrient deficiency, or exceeded yeast tolerance. Fix: adjust pH to 3.7–4.0 with K-bicarb, warm to 65–70°F, add GoFerm + new yeast packet, acclimate slowly. EC-1118 restarts most stuck fermentations.' },
      { emoji:'🧊', title:'Mead Won\'t Clear', body:'Causes: pectin haze from fruit (use pectic enzyme), protein haze, yeast haze. Solutions: cold crash 34°F for 2+ weeks; use Kieselsol followed 24 hours later by Chitosan — complementary charges attract, pulling particles out. Bentonite at fermentation start prevents most protein haze.' },
      { emoji:'🍋', title:'Too Tart or Too Sweet', body:'Over-tart: potassium bicarbonate (½ tsp/5gal, test, repeat) raises pH and reduces acidity. Sweetening also masks tartness. Too tart/flat: add tartaric or malic acid (½ tsp/5gal). Too sweet: ferment longer if yeast allows. Too dry: back-sweeten after stabilization.' },
      { emoji:'🍌', title:'Banana / Solvent Off-Flavors', body:'Banana (isoamyl acetate): fermented too warm, usually above 72°F. Mellows with 6–12 months of aging. Solvent (ethyl acetate): wild yeast contamination or stressed fermentation — improve sanitation. Nail polish (acetaldehyde): fermentation stopped prematurely; allow complete fermentation.' },
      { emoji:'💥', title:'Bottle Bombs — Prevention', body:'CO₂ from re-fermentation can shatter glass. Prevention: (1) Stable FG across 3+ readings over 14+ days. (2) FG at or below target FG. (3) If back-sweetening, ALWAYS stabilize with K-meta + K-sorbate first, wait 48 hours. (4) Store first batch carefully and monitor closely.' },
      { emoji:'🤢', title:'Vinegar / Acetic Off-Flavor', body:'Acetic acid (vinegar) from Acetobacter bacteria when alcohol contacts oxygen. Almost always a sanitation failure or oxygen exposure during racking. Established vinegar contamination cannot be reversed — batch is usually unsalvageable. Prevention: sanitize everything, minimize headspace.' },
    ]}
  ],
  glossary: [
    { term:'Must',           def:'Unfermented honey-water mixture before yeast is added.' },
    { term:'OG',             def:'Original Gravity — density of must before fermentation.' },
    { term:'FG',             def:'Final Gravity — density when fermentation is complete.' },
    { term:'ABV',            def:'Alcohol By Volume — ethanol percentage in finished mead.' },
    { term:'PPG',            def:'Points Per Pound Per Gallon — sugar yield per ingredient unit.' },
    { term:'YAN',            def:'Yeast Assimilable Nitrogen — nitrogen usable by yeast cells.' },
    { term:'TOSNA',          def:'Tailored Organic Staggered Nutrient Addition — gold-standard protocol.' },
    { term:'Attenuation',    def:'Percentage of sugars consumed by yeast during fermentation.' },
    { term:'Lees',           def:'Sediment of dead yeast and particulates from fermentation.' },
    { term:'Racking',        def:'Transferring mead to a new vessel, leaving lees behind.' },
    { term:'Fining',         def:'Using clarifying agents (bentonite, chitosan) to remove haze.' },
    { term:'Back-sweetening',def:'Adding honey after stabilization to increase sweetness.' },
    { term:'Stabilization',  def:'K-meta + K-sorbate treatment to stop re-fermentation.' },
    { term:'Cold Crash',     def:'Chilling near freezing to drop yeast and sediment rapidly.' },
    { term:'Autolysis',      def:'Yeast self-digestion producing rubbery off-flavors.' },
    { term:'Fusel Alcohols', def:'Higher alcohols from warm fermentation; harsh, headachy.' },
    { term:'Ester',          def:'Fruity flavor compounds produced by yeast fermentation.' },
    { term:'H₂S',            def:'Hydrogen sulfide — rotten egg smell from nutrient deficiency.' },
    { term:'Bochet',         def:'Mead with caramelized/burned honey for toasty flavors.' },
    { term:'Melomel',        def:'Mead with fruit additions.' },
    { term:'Metheglin',      def:'Mead with herb or spice additions.' },
    { term:'Cyser',          def:'Mead fermented with apple juice.' },
    { term:'Pyment',         def:'Mead fermented with grapes or grape juice.' },
    { term:'Braggot',        def:'Mead brewed with hops and malted grain.' },
  ]
};

const AI_SYSTEM = `You are Skáld, an AI Viking mead master with deep scientific and historical brewing knowledge. Speak with warmth and expertise; occasional Norse flair is welcome but never overdone.

Your expertise covers: fermentation chemistry (C₆H₁₂O₆→2C₂H₅OH+2CO₂), advanced ABV formula (76.08*(OG-FG)/(1.775-OG))*(FG/0.794), honey PPG (~37 avg), TOSNA nutrient protocols, yeast strains and tolerances, pH management (3.5–4.0 ideal), water activity, clarification agents, stabilization (K-meta + K-sorbate), ester and fusel production, and all mead styles (Traditional, Melomel, Metheglin, Cyser, Pyment, Bochet, Braggot, Capsicumel, Acerglyn, Tej, Chouchen).

When designing recipes:
1. If not provided, ask about target ABV, batch size, flavor preferences, and experience level.
2. Provide a COMPLETE recipe: honey type + amount, target OG, yeast strain, expected FG, estimated ABV (advanced formula), water volume in liters, TOSNA schedule, fruit/spice suggestions with timing.
3. Explain the science behind your choices.
4. Include pitfalls and pro tips.
5. Suggest aging and serving recommendations.

Format with **bold** for ingredients, *italic* for technical terms. Always show calculated OG, FG, and ABV.`;

// ═══════════════════════════════════════════════════════════════════════
//  DOM helpers
// ═══════════════════════════════════════════════════════════════════════

// Safe createElement with event listeners
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) {
    const { cls, style, onClick, onChange, onKeydown, onInput, ...rest } = props;
    if (cls)       e.className = cls;
    if (style)     e.style.cssText = style;
    if (onClick)   e.addEventListener('click', onClick);
    if (onChange)  e.addEventListener('change', onChange);
    if (onKeydown) e.addEventListener('keydown', onKeydown);
    if (onInput)   e.addEventListener('input', onInput);
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && v !== null) e.setAttribute(k, v);
    }
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null) continue;
    if (k instanceof Node) e.appendChild(k);
    else e.appendChild(document.createTextNode(String(k)));
  }
  return e;
}

// Safe innerHTML helper — wraps in div first to ensure element
function mkHTML(str) {
  const wrap = document.createElement('div');
  wrap.innerHTML = str.trim();
  return wrap;
}

// Append all children of a mkHTML wrapper to a target
function appendHTML(target, str) {
  const wrap = mkHTML(str);
  while (wrap.firstChild) target.appendChild(wrap.firstChild);
}

function card(children_or_style, maybe_children) {
  const c = document.createElement('div');
  c.className = 'card';
  if (typeof children_or_style === 'string') c.style.cssText = children_or_style;
  const kids = maybe_children || (Array.isArray(children_or_style) ? children_or_style : []);
  kids.forEach(k => k && c.appendChild(k));
  return c;
}

function badge(val, lbl, cls='') {
  return mkHTML(`<div class="stat-badge ${cls}"><span class="stat-val">${val}</span><span class="stat-lbl">${lbl}</span></div>`).firstChild;
}

function infoBox(msg, cls='info-gold') {
  return mkHTML(`<div class="info-box ${cls}">${msg}</div>`).firstChild;
}

function sLbl(txt) {
  return mkHTML(`<div class="section-label">${txt}</div>`).firstChild;
}

// ═══════════════════════════════════════════════════════════════════════
//  TAB: MY BREWS
// ═══════════════════════════════════════════════════════════════════════

function renderBrewsTab() {
  const root = el('div');
  if (State.selectedBrew !== null) { root.appendChild(renderBrewDetail(State.selectedBrew)); return root; }

  // Header row
  const hdr = el('div', { cls:'flex-between mb-2' });
  const titleBlock = el('div');
  appendHTML(titleBlock, '<h2 class="page-title">⚓ My Fleet</h2><p class="page-subtitle">Track your mead armada, Viking.</p>');
  hdr.appendChild(titleBlock);
  hdr.appendChild(el('button', { cls:'btn btn-primary', onClick(){ State.selectedBrew='new'; renderApp(); } }, '⚔️ New Batch'));
  root.appendChild(hdr);

  if (!State.brews.length) {
    appendHTML(root, '<div class="empty-state"><div class="empty-icon">🍯</div><p>No brews yet.<br>Begin your mead legend.</p></div>');
    return root;
  }

  const grid = el('div', { cls:'grid-auto' });
  State.brews.forEach((brew, idx) => {
    const abv  = Sci.abv(brew.ogReading, brew.currentGravity);
    const prog = Math.min(100, Math.max(0, Math.round(((brew.ogReading - brew.currentGravity) / (brew.ogReading - brew.targetFG)) * 100)));
    const days = Sci.daysSince(brew.startDate);
    const stab = Sci.stabStatus(brew);
    const rack = brew.status === 'Fermenting' && days > 30;

    const c = el('div', { cls:'brew-card', onClick(){ State.selectedBrew=idx; renderApp(); } });

    // Top row
    const top = el('div', { style:'display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px' });
    top.appendChild(el('div', { cls:'brew-emoji' }, brew.emoji));
    const topRight = el('div', { style:'display:flex;flex-direction:column;align-items:flex-end;gap:5px' });
    appendHTML(topRight, `<span class="status-badge status-${brew.status.toLowerCase()}">${brew.status}</span><span class="small text-dim">Day ${days}</span>`);
    top.appendChild(topRight);
    c.appendChild(top);

    appendHTML(c, `<div class="brew-name">${brew.name}</div><div class="brew-meta">${brew.type} &middot; ${brew.honey}</div>`);

    if (rack) c.appendChild(infoBox(`🍷 Time to rack! Day ${days} — heavy lees need racking.`, 'info-amber'));

    const sgRow = el('div', { cls:'grid-stat', style:'margin:8px 0' });
    sgRow.appendChild(badge(`${abv}%`, 'Est. ABV', 'amber'));
    sgRow.appendChild(badge(brew.currentGravity.toFixed(3), 'Current SG'));
    sgRow.appendChild(badge(`${prog}%`, 'Progress', 'sea'));
    c.appendChild(sgRow);

    appendHTML(c, `<div class="progress-track" style="margin-bottom:8px"><div class="progress-fill" style="width:${prog}%"></div></div>`);
    appendHTML(c, `<span class="status-badge ${stab.cls}" style="font-size:0.65rem">${stab.label}</span>`);
    grid.appendChild(c);
  });

  root.appendChild(grid);
  return root;
}

// ── Brew Detail ────────────────────────────────────────────────────────
function renderBrewDetail(idx) {
  if (idx === 'new') return renderNewBrewForm();

  const brew  = State.brews[idx];
  const root  = el('div');
  const days  = Sci.daysSince(brew.startDate);
  const stab  = Sci.stabStatus(brew);
  const abvNow  = Sci.abv(brew.ogReading, brew.currentGravity);
  const abvProj = Sci.abv(brew.ogReading, brew.targetFG);
  const prog  = Math.min(100, Math.max(0, Math.round(((brew.ogReading-brew.currentGravity)/(brew.ogReading-brew.targetFG))*100)));
  const wL    = Sci.waterL(brew.lbsHoney, brew.gallons);
  const tg    = Sci.tosnaG(brew.gallons);

  const btnRow = el('div', { cls:'flex-row', style:'margin-bottom:14px' });
  btnRow.appendChild(el('button',{cls:'btn btn-ghost btn-sm', onClick(){State.selectedBrew=null;renderApp();}},'← Back to Fleet'));
  btnRow.appendChild(el('button',{cls:'btn btn-secondary btn-sm', onClick(){doPrint(brew);}}, '🖨️ Print Recipe'));
  root.appendChild(btnRow);

  if (brew.status==='Fermenting' && days>30) {
    appendHTML(root,`<div class="rack-banner"><div class="rack-banner-icon">🍷</div><div class="rack-banner-text"><strong>Time to Rack, Viking!</strong><span> Day ${days} — heavy lees settled. Transfer to prevent autolysis.</span></div></div>`);
  }

  // Main card
  const mc = el('div',{cls:'card',style:'margin-bottom:14px'});
  const mcTop = el('div',{style:'display:flex;align-items:center;gap:14px;margin-bottom:14px'});
  appendHTML(mcTop,`<span style="font-size:3rem">${brew.emoji}</span>`);
  const mcMid = el('div',{style:'flex:1'});
  appendHTML(mcMid,`<div style="font-family:Cinzel,serif;font-size:1.3rem;color:var(--text-bright)">${brew.name}</div><div class="small text-dim italic">${brew.type} &middot; ${brew.honey} &middot; Day ${days}</div>`);
  mcTop.appendChild(mcMid);
  appendHTML(mcTop,`<span class="status-badge ${stab.cls}">${stab.label}</span>`);
  mc.appendChild(mcTop);

  const statRow = el('div',{cls:'grid-stat',style:'margin-bottom:12px'});
  [[brew.ogReading.toFixed(3),'OG','gold'],[brew.currentGravity.toFixed(3),'Current SG','amber'],
   [brew.targetFG.toFixed(3),'Target FG',''],[`${abvNow}%`,'ABV Now','amber'],
   [`${abvProj}%`,'Proj. ABV','sea'],[String(days),'Days','iron']
  ].forEach(([v,l,c])=>statRow.appendChild(badge(v,l,c)));
  mc.appendChild(statRow);

  appendHTML(mc,`<div style="margin-bottom:10px"><div class="flex-between small text-dim" style="margin-bottom:4px"><span>Fermentation Progress</span><span>${prog}%</span></div><div class="progress-track"><div class="progress-fill" style="width:${prog}%"></div></div></div>`);

  const datesRow = el('div',{cls:'flex-row gap-sm',style:'margin-top:8px'});
  datesRow.appendChild(infoBox(`📅 Est. Bottle: <strong>${Sci.addMonths(brew.startDate,3)}</strong>`,'info-sea'));
  datesRow.appendChild(infoBox(`🏆 Peak Drinking: <strong>${Sci.addMonths(brew.startDate,6)}+</strong>`,'info-gold'));
  mc.appendChild(datesRow);
  if (brew.notes) mc.appendChild(infoBox(`📝 ${brew.notes}`,'info-gold'));
  root.appendChild(mc);

  // Recipe + Health grid
  const g2 = el('div',{cls:'grid-2',style:'margin-bottom:14px'});

  const rc = el('div',{cls:'card'});
  appendHTML(rc,'<div class="card-title">Recipe Details</div>');
  appendHTML(rc,`<div style="font-size:.88rem;line-height:2">
    <div>🍯 <strong>${brew.honey}</strong> — ${brew.lbsHoney} lbs</div>
    <div>💧 Water: <strong style="color:var(--sea-light)">${wL.toFixed(1)} L</strong> (${Sci.waterGal(brew.lbsHoney,brew.gallons).toFixed(2)} gal)</div>
    <div>🫧 Batch: ${brew.gallons} gal</div>
    <div>🦠 Yeast: ${brew.yeast}</div>
    ${brew.fruits.length?`<div>🍓 ${brew.fruits.join(', ')}</div>`:''}
    ${brew.spices.length?`<div>🌿 ${brew.spices.join(', ')}</div>`:''}
    <div class="italic text-dim">${Sci.style(brew.currentGravity)}</div>
  </div>`);
  g2.appendChild(rc);

  // Health card
  const hc = el('div',{cls:'card'});
  appendHTML(hc,'<div class="card-title">Batch Health 🌡️</div>');

  const phWrap = el('div',{style:'margin-bottom:10px'});
  phWrap.appendChild(sLbl('Current pH'));
  const phIn = el('input',{type:'number',cls:'form-input',value:brew.ph||'',placeholder:'e.g. 3.7',step:'0.1',min:'2',max:'7'});
  phWrap.appendChild(phIn);
  const phAdv = el('div');
  const updPh=()=>{ phAdv.innerHTML=''; const a=Sci.phAdvice(phIn.value); if(a) phAdv.appendChild(infoBox(a.msg,a.cls)); };
  phIn.addEventListener('input',updPh); updPh();
  phWrap.appendChild(phAdv);
  hc.appendChild(phWrap);

  const tpWrap = el('div',{style:'margin-bottom:10px'});
  tpWrap.appendChild(sLbl('Temperature (°F)'));
  const tpIn = el('input',{type:'number',cls:'form-input',value:brew.temp||'',placeholder:'e.g. 68',step:'1',min:'40',max:'100'});
  tpWrap.appendChild(tpIn);
  const tpAdv = el('div');
  const updTp=()=>{ tpAdv.innerHTML=''; const a=Sci.tempAdvice(tpIn.value,brew.yeast); if(a) tpAdv.appendChild(infoBox(a.msg,a.cls)); };
  tpIn.addEventListener('input',updTp); updTp();
  tpWrap.appendChild(tpAdv);
  hc.appendChild(tpWrap);

  hc.appendChild(el('button',{cls:'btn btn-secondary btn-sm btn-full',onClick(){
    brew.ph=phIn.value; brew.temp=tpIn.value; State.persist();
    const b=hc.querySelector('.save-health-btn'); if(b){b.textContent='✓ Saved!';setTimeout(()=>b.textContent='💾 Save',1500);}
  }},el('span',{cls:'save-health-btn'},'💾 Save Health')));
  g2.appendChild(hc);
  root.appendChild(g2);

  // TOSNA
  const tc = el('div',{cls:'card',style:'margin-bottom:14px'});
  appendHTML(tc,`<div class="card-title">TOSNA Tracker 🧬</div><div class="small text-dim italic" style="margin-bottom:10px">~${tg}g Fermaid-O per step · Click to check off</div>`);
  if (!brew.tosnaChecked) brew.tosnaChecked={t0:false,t24:false,t48:false,t13:false};
  DATA.tosna.forEach(step=>{
    const done = !!brew.tosnaChecked[step.id];
    const ti = el('div',{cls:`tosna-item${done?' done':''}`,onClick(){
      brew.tosnaChecked[step.id]=!brew.tosnaChecked[step.id];
      State.persist(); renderApp();
    }});
    appendHTML(ti,`<div class="tosna-check">${done?'✓':''}</div><div><div class="tosna-label">${step.icon} ${step.label}</div><div class="tosna-sub">${step.sub}</div></div>`);
    tc.appendChild(ti);
  });
  tc.appendChild(infoBox('💡 After stable FG: K-meta (¼ tsp/5gal) + K-sorbate (½ tsp/5gal). Wait 24hr before back-sweetening.','info-amber'));
  root.appendChild(tc);

  // Gravity log
  const gc = el('div',{cls:'card'});
  appendHTML(gc,'<div class="card-title">Gravity Log 📊</div>');
  const logRow = el('div',{cls:'flex-row',style:'margin-bottom:12px'});
  const gIn = el('input',{type:'number',cls:'form-input',placeholder:'e.g. 1.045',step:'0.001',min:'0.990',max:'1.200',style:'flex:1'});
  const nIn = el('input',{type:'text',cls:'form-input',placeholder:'Note (optional)',style:'flex:2'});
  const logBtn = el('button',{cls:'btn btn-primary btn-sm',onClick(){
    const g=parseFloat(gIn.value);
    if(!g||g<0.99||g>1.2) return;
    if(!brew.readings) brew.readings=[];
    brew.readings.push({date:new Date().toLocaleDateString(),gravity:g,note:nIn.value});
    brew.currentGravity=g; State.persist();
    gIn.value=''; nIn.value=''; renderApp();
  }},'⚓ Log');
  logRow.appendChild(gIn); logRow.appendChild(nIn); logRow.appendChild(logBtn);
  gc.appendChild(logRow);

  if (!brew.readings||!brew.readings.length) {
    appendHTML(gc,'<div class="text-dim italic small" style="text-align:center;padding:12px">No readings yet — log your first gravity reading!</div>');
  } else {
    const logDiv = el('div');
    brew.readings.forEach((r,i)=>{
      const prev = i>0 && Math.abs(brew.readings[i-1].gravity - r.gravity)<=0.001;
      const row = el('div',{cls:'reading-row'});
      appendHTML(row,`<span class="reading-date">${r.date}</span><span class="reading-grav">${r.gravity.toFixed(3)}</span><span class="reading-abv">${Sci.abv(brew.ogReading,r.gravity)}% ABV</span>${prev?'<span class="reading-stable">📌 Stable</span>':''}${r.note?`<span class="reading-note">${r.note}</span>`:''}`);
      logDiv.appendChild(row);
    });
    gc.appendChild(logDiv);
  }
  root.appendChild(gc);
  return root;
}

// ── New Brew Form ──────────────────────────────────────────────────────
function renderNewBrewForm() {
  const form = {
    name:'', type:'Traditional', emoji:'🍯', status:'Planning',
    honey:'Wildflower', lbsHoney:15, gallons:5, yeast:'Lalvin 71B',
    fruits:[], spices:[], ogReading:1.100, currentGravity:1.100, targetFG:1.010,
    startDate:new Date().toISOString().split('T')[0], notes:'',
    readings:[], ph:'', temp:'', tosnaChecked:{t0:false,t24:false,t48:false,t13:false}
  };
  const root = el('div');
  root.appendChild(el('button',{cls:'btn btn-ghost btn-sm',style:'margin-bottom:14px',onClick(){State.selectedBrew=null;renderApp();}},'← Cancel'));
  appendHTML(root,'<h2 class="page-title" style="margin-bottom:16px">⚔️ New Batch</h2>');

  function mkSel(lbl, key, opts, isNum=false) {
    const g=el('div',{cls:'form-group'}); g.appendChild(sLbl(lbl));
    const s=el('select',{cls:'form-select'});
    opts.forEach(o=>{
      const ov=typeof o==='object'?o.value:o, ol=typeof o==='object'?o.label:o;
      const op=el('option',{value:ov},ol);
      if(ov==form[key]) op.selected=true;
      s.appendChild(op);
    });
    s.addEventListener('change',e=>{
      form[key]=isNum?(parseFloat(e.target.value)||0):e.target.value;
      if(key==='yeast'){const y=DATA.yeasts.find(y=>y.name===e.target.value);if(y)form.targetFG=parseFloat(Sci.fg(form.ogReading,y.att).toFixed(3));}
      if(['lbsHoney','gallons','ogReading'].includes(key)) updateHints();
    });
    g.appendChild(s); return g;
  }
  function mkInp(lbl,key,type='text',extra={}) {
    const g=el('div',{cls:'form-group'}); g.appendChild(sLbl(lbl));
    const i=el('input',{type,cls:'form-input',value:form[key],...extra});
    i.addEventListener('input',e=>{
      form[key]=type==='number'?(parseFloat(e.target.value)||0):e.target.value;
      if(['lbsHoney','gallons','ogReading'].includes(key)) updateHints();
    });
    g.appendChild(i); return g;
  }

  // Basics card
  const bc=el('div',{cls:'card',style:'margin-bottom:14px'}); appendHTML(bc,'<div class="card-title">Basics</div>');
  const bg=el('div',{cls:'grid-2'});
  bg.appendChild(mkInp('Brew Name','name'));
  bg.appendChild(mkSel('Type','type',DATA.meadTypes));
  bg.appendChild(mkSel('Emoji','emoji',DATA.emojis));
  bg.appendChild(mkInp('Start Date','startDate','date'));
  bg.appendChild(mkSel('Status','status',['Planning','Fermenting','Conditioning','Bottled']));
  bc.appendChild(bg); root.appendChild(bc);

  // Honey card
  const hnc=el('div',{cls:'card',style:'margin-bottom:14px'}); appendHTML(hnc,'<div class="card-title">Honey & Batch</div>');
  const hng=el('div',{cls:'grid-2'});
  hng.appendChild(mkSel('Honey Type','honey',DATA.honeys.map(h=>h.name)));
  hng.appendChild(mkInp('Honey Amount (lbs)','lbsHoney','number',{step:'0.5',min:'1',max:'50'}));
  hng.appendChild(mkInp('Batch Volume (gal)','gallons','number',{step:'0.5',min:'0.5',max:'20'}));
  hng.appendChild(mkInp('Starting Gravity (OG)','ogReading','number',{step:'0.001',min:'1.000',max:'1.200'}));
  hnc.appendChild(hng);
  const hints=el('div',{cls:'flex-row',style:'margin-top:10px;gap:8px'});
  const updateHints=()=>{
    hints.innerHTML='';
    const og=Sci.og(form.lbsHoney,form.gallons);
    const wL=Sci.waterL(form.lbsHoney,form.gallons);
    hints.appendChild(infoBox(`🍯 Est. OG: <strong>${og.toFixed(3)}</strong>`,'info-gold'));
    hints.appendChild(infoBox(`💧 Add water: <strong>${wL.toFixed(1)} L (${Sci.waterGal(form.lbsHoney,form.gallons).toFixed(2)} gal)</strong>`,'info-sea'));
  };
  updateHints(); hnc.appendChild(hints); root.appendChild(hnc);

  // Yeast
  const yc=el('div',{cls:'card',style:'margin-bottom:14px'}); appendHTML(yc,'<div class="card-title">Yeast</div>');
  const yg=el('div',{cls:'grid-2'});
  yg.appendChild(mkSel('Yeast Strain','yeast',DATA.yeasts.map(y=>y.name)));
  yg.appendChild(mkInp('Target FG','targetFG','number',{step:'0.001',min:'0.990',max:'1.100'}));
  yc.appendChild(yg); root.appendChild(yc);

  // Fruits
  const frc=el('div',{cls:'card',style:'margin-bottom:14px'}); appendHTML(frc,'<div class="card-title">Fruits 🍓</div>');
  const frpg=el('div',{cls:'pill-group'});
  DATA.fruits.forEach(f=>{
    const p=el('div',{cls:'pill',onClick(){
      const i=form.fruits.indexOf(f.name);
      if(i>=0){form.fruits.splice(i,1);p.classList.remove('active');}else{form.fruits.push(f.name);p.classList.add('active');}
    }},f.emoji,' ',f.name);
    frpg.appendChild(p);
  });
  frc.appendChild(frpg); root.appendChild(frc);

  // Spices
  const spc=el('div',{cls:'card',style:'margin-bottom:14px'}); appendHTML(spc,'<div class="card-title">Spices & Herbs 🌿</div>');
  const sppg=el('div',{cls:'pill-group'});
  DATA.spices.forEach(s=>{
    const p=el('div',{cls:'pill',onClick(){
      const i=form.spices.indexOf(s.name);
      if(i>=0){form.spices.splice(i,1);p.classList.remove('active-amber');}else{form.spices.push(s.name);p.classList.add('active-amber');}
    }},s.emoji,' ',s.name);
    sppg.appendChild(p);
  });
  spc.appendChild(sppg); root.appendChild(spc);

  // Notes
  const nc=el('div',{cls:'card',style:'margin-bottom:14px'}); appendHTML(nc,'<div class="card-title">Notes 📜</div>');
  const ta=el('textarea',{cls:'form-textarea',placeholder:'Goals, inspirations, battle plans...'});
  ta.addEventListener('input',e=>form.notes=e.target.value);
  nc.appendChild(ta); root.appendChild(nc);

  root.appendChild(el('button',{cls:'btn btn-primary btn-lg btn-full',onClick(){
    if(!form.name.trim()){alert('Give your brew a name, Viking!');return;}
    State.brews.unshift({...form,id:Date.now()});
    State.selectedBrew=null; State.persist(); renderApp();
  }},'⚔️ Log This Brew!'));
  return root;
}

// ═══════════════════════════════════════════════════════════════════════
//  TAB: RECIPE BUILDER
// ═══════════════════════════════════════════════════════════════════════

function renderRecipeTab() {
  const s={gallons:5,targetOG:1.100,honeyType:'Wildflower',yeast:'Lalvin 71B',fruits:[],spices:[],fruitAmt:{},tosna:{t0:false,t24:false,t48:false,t13:false}};
  const root=el('div');
  appendHTML(root,'<h2 class="page-title">⚗️ Recipe Builder</h2><p class="page-subtitle">Design your next legendary brew.</p>');

  // Controls
  const cc=el('div',{cls:'card',style:'margin-bottom:14px'}); appendHTML(cc,'<div class="card-title">Batch Goals</div>');
  const cg=el('div',{cls:'grid-2 mb-2'});

  function rcSel(lbl,key,opts,isNum=false){
    const g=el('div',{cls:'form-group'}); g.appendChild(sLbl(lbl));
    const sel=el('select',{cls:'form-select'});
    opts.forEach(o=>{
      const ov=typeof o==='object'?o.value:o, ol=typeof o==='object'?o.label:o;
      const op=el('option',{value:String(ov)},ol);
      if(String(ov)==String(s[key])) op.selected=true;
      sel.appendChild(op);
    });
    sel.addEventListener('change',e=>{ s[key]=isNum?(parseFloat(e.target.value)||0):e.target.value; updateStats(); });
    g.appendChild(sel); return g;
  }
  function rcInp(lbl,key,extra={}){
    const g=el('div',{cls:'form-group'}); g.appendChild(sLbl(lbl));
    const i=el('input',{type:'number',cls:'form-input',value:s[key],...extra});
    i.addEventListener('input',e=>{ s[key]=parseFloat(e.target.value)||0; updateStats(); });
    g.appendChild(i); return g;
  }

  cg.appendChild(rcInp('Batch Size (gal)','gallons',{step:'0.5',min:'0.5',max:'20'}));
  cg.appendChild(rcSel('Target OG','targetOG',[
    {value:1.060,label:'1.060 — Light (~6%)'},{value:1.080,label:'1.080 — Session (~8%)'},
    {value:1.100,label:'1.100 — Standard (~10%)'},{value:1.120,label:'1.120 — Strong (~12%)'},
    {value:1.150,label:'1.150 — Very Strong (~15%)'},{value:1.180,label:'1.180 — Sack Mead (~18%)'}
  ],true));
  cg.appendChild(rcSel('Honey Type','honeyType',DATA.honeys.map(h=>h.name)));
  cg.appendChild(rcSel('Yeast Strain','yeast',DATA.yeasts.map(y=>y.name)));
  cc.appendChild(cg); root.appendChild(cc);

  const statsArea=el('div');
  const updateStats=()=>{
    statsArea.innerHTML='';
    const hn=Sci.honeyFor(s.targetOG,s.gallons);
    const yd=DATA.yeasts.find(y=>y.name===s.yeast);
    const fg=yd?Sci.fg(s.targetOG,yd.att):1.010;
    const abv=Sci.abv(s.targetOG,fg);
    const wL=Sci.waterL(hn,s.gallons);
    const tg=Sci.tosnaG(s.gallons);
    const sg=el('div',{cls:'grid-2',style:'margin-bottom:14px'});

    const rcrd=el('div',{cls:'card'}); appendHTML(rcrd,'<div class="card-title">Recipe Stats 📊</div>');
    const stRow=el('div',{cls:'grid-stat',style:'margin-bottom:10px'});
    [[s.targetOG.toFixed(3),'Target OG','gold'],[fg.toFixed(3),'Est. FG',''],[`${abv}%`,'Est. ABV','amber'],[Sci.style(fg),'Style','sea']].forEach(([v,l,c])=>stRow.appendChild(badge(v,l,c)));
    rcrd.appendChild(stRow);
    appendHTML(rcrd,`<div style="font-size:.88rem;line-height:2.1"><div>🍯 <strong>${hn.toFixed(2)} lbs</strong> ${s.honeyType}</div><div>💧 <strong style="color:var(--sea-light)">${wL.toFixed(1)} L (${(wL/3.785).toFixed(2)} gal)</strong> warm water</div><div>🦠 <strong>${s.yeast}</strong></div>${yd?`<div class="small text-dim italic">${yd.note} · ${yd.tol}% ABV tol.</div>`:''}</div>`);
    if(yd&&yd.name.includes('D47')) rcrd.appendChild(infoBox('⚠️ D47: Must stay below 65°F or produces harsh fusel alcohols!','info-red'));
    sg.appendChild(rcrd);

    // TOSNA in recipe tab
    const tcard=el('div',{cls:'card'}); appendHTML(tcard,`<div class="card-title">TOSNA Tracker 🧬</div><div class="small text-dim italic" style="margin-bottom:10px">~${tg}g Fermaid-O per step</div>`);
    DATA.tosna.forEach(step=>{
      const done=!!s.tosna[step.id];
      const ti=el('div',{cls:`tosna-item${done?' done':''}`,onClick(){s.tosna[step.id]=!s.tosna[step.id];updateStats();}});
      appendHTML(ti,`<div class="tosna-check">${done?'✓':''}</div><div><div class="tosna-label">${step.icon} ${step.label}</div><div class="tosna-sub">${step.sub}</div></div>`);
      tcard.appendChild(ti);
    });
    sg.appendChild(tcard);
    statsArea.appendChild(sg);
  };
  updateStats(); root.appendChild(statsArea);

  // Fruits
  const frc=el('div',{cls:'card',style:'margin-bottom:14px'}); appendHTML(frc,'<div class="card-title">Fruits 🍓</div>');
  const frpg=el('div',{cls:'pill-group',style:'margin-bottom:10px'});
  const frAmtDiv=el('div');
  DATA.fruits.forEach(f=>{
    const p=el('div',{cls:'pill',onClick(){
      const i=s.fruits.indexOf(f.name);
      if(i>=0){s.fruits.splice(i,1);delete s.fruitAmt[f.name];p.classList.remove('active');}
      else{s.fruits.push(f.name);s.fruitAmt[f.name]=1;p.classList.add('active');}
      renderFrAmts();
    }},f.emoji,' ',f.name);
    frpg.appendChild(p);
  });
  const renderFrAmts=()=>{
    frAmtDiv.innerHTML='';
    s.fruits.forEach(fn=>{
      const fo=DATA.fruits.find(x=>x.name===fn);
      const row=el('div',{style:'display:flex;align-items:center;gap:10px;background:rgba(0,0,0,0.3);border-radius:6px;padding:7px 12px;margin-bottom:5px'});
      appendHTML(row,`${fo.emoji} <span style="flex:1;font-family:Cinzel,serif;font-size:.85rem">${fn}</span>`);
      const amtIn=el('input',{type:'number',value:String(s.fruitAmt[fn]||1),min:'0.5',max:'20',step:'0.5',style:'width:58px;background:rgba(0,0,0,0.4);border:1px solid var(--border);border-radius:5px;padding:3px 7px;color:var(--text-bright);font-size:.85rem'});
      amtIn.addEventListener('input',e=>s.fruitAmt[fn]=parseFloat(e.target.value)||1);
      row.appendChild(amtIn);
      appendHTML(row,`<span class="small text-dim">lbs</span><span class="small text-amber">+${(fo.sgBoost*(s.fruitAmt[fn]||1)/s.gallons*0.001).toFixed(3)} SG</span>`);
      frAmtDiv.appendChild(row);
    });
  };
  frc.appendChild(frpg); frc.appendChild(frAmtDiv); root.appendChild(frc);

  // Spices
  const spc=el('div',{cls:'card',style:'margin-bottom:14px'}); appendHTML(spc,'<div class="card-title">Spices & Herbs 🌿</div>');
  const sppg=el('div',{cls:'pill-group',style:'margin-bottom:8px'});
  const spTips=el('div');
  DATA.spices.forEach(sp=>{
    const p=el('div',{cls:'pill',onClick(){
      const i=s.spices.indexOf(sp.name);
      if(i>=0){s.spices.splice(i,1);p.classList.remove('active-amber');}else{s.spices.push(sp.name);p.classList.add('active-amber');}
      spTips.innerHTML='';
      s.spices.forEach(sn=>{const sp2=DATA.spices.find(x=>x.name===sn);if(sp2?.tip) spTips.appendChild(infoBox(`${sp2.emoji} <strong>${sn}</strong>: ${sp2.tip}`,'info-gold'));});
    }},sp.emoji,' ',sp.name);
    sppg.appendChild(p);
  });
  spc.appendChild(sppg); spc.appendChild(spTips); root.appendChild(spc);
  return root;
}

// ═══════════════════════════════════════════════════════════════════════
//  TAB: CALCULATOR
// ═══════════════════════════════════════════════════════════════════════

function renderCalcTab() {
  const root=el('div');
  appendHTML(root,'<h2 class="page-title">✦ Calculator</h2><p class="page-subtitle">The science of the sacred brew.</p>');

  // ABV
  let og=1.100, fg=1.010;
  const abvCard=el('div',{cls:'card',style:'margin-bottom:14px'}); appendHTML(abvCard,'<div class="card-title">ABV Calculator</div>');
  const abvGrid=el('div',{cls:'grid-2'});
  const ogIn=el('input',{type:'number',cls:'form-input',value:'1.100',step:'0.001',min:'1.000',max:'1.200'});
  const fgIn=el('input',{type:'number',cls:'form-input',value:'1.010',step:'0.001',min:'0.990',max:'1.200'});
  const abvRes=el('div');
  const updABV=()=>{
    og=parseFloat(ogIn.value)||1.100; fg=parseFloat(fgIn.value)||1.010;
    const adv=Sci.abv(og,fg), sim=Sci.abvSimple(og,fg);
    abvRes.innerHTML='';
    const sr=el('div',{cls:'grid-stat',style:'margin-top:10px'});
    sr.appendChild(badge(`${adv}%`,'ABV (Advanced)','amber'));
    sr.appendChild(badge(`${sim}%`,'ABV (Simple)','iron'));
    sr.appendChild(badge(Sci.style(fg),'Style','sea'));
    sr.appendChild(badge(`${Math.round(((og-fg)/(og-1))*100)}%`,'Attenuation',''));
    abvRes.appendChild(sr);
    const diff=Math.abs(parseFloat(adv)-parseFloat(sim));
    if(diff>0.3) abvRes.appendChild(infoBox(`🔬 Advanced formula is ${diff.toFixed(1)}% higher than simple formula at this gravity — significant for high-ABV meads.`,'info-sea'));
  };
  ogIn.addEventListener('input',updABV); fgIn.addEventListener('input',updABV);
  const ogG=el('div',{cls:'form-group'}); ogG.appendChild(sLbl('Original Gravity (OG)')); ogG.appendChild(ogIn);
  const fgG=el('div',{cls:'form-group'}); fgG.appendChild(sLbl('Final Gravity (FG)')); fgG.appendChild(fgIn);
  abvGrid.appendChild(ogG); abvGrid.appendChild(fgG);
  abvCard.appendChild(abvGrid); updABV(); abvCard.appendChild(abvRes); root.appendChild(abvCard);

  // Honey → Water
  let lbs=15, gal=5;
  const hwCard=el('div',{cls:'card',style:'margin-bottom:14px'}); appendHTML(hwCard,'<div class="card-title">Honey → Water Ratio</div>');
  const hwGrid=el('div',{cls:'grid-2'});
  const lbsIn=el('input',{type:'number',cls:'form-input',value:'15',step:'0.5',min:'0',max:'50'});
  const galIn=el('input',{type:'number',cls:'form-input',value:'5',step:'0.5',min:'0.5',max:'20'});
  const hwRes=el('div');
  const updHW=()=>{
    lbs=parseFloat(lbsIn.value)||0; gal=parseFloat(galIn.value)||1;
    const og2=Sci.og(lbs,gal), wL=Sci.waterL(lbs,gal);
    hwRes.innerHTML='';
    const sr=el('div',{cls:'grid-stat',style:'margin-top:10px'});
    sr.appendChild(badge(og2.toFixed(3),'Est. OG','gold'));
    sr.appendChild(badge(`${wL.toFixed(1)} L`,'Add Water','sea'));
    sr.appendChild(badge(`${(lbs/gal).toFixed(2)} lb`,'lb/gal','amber'));
    sr.appendChild(badge(Sci.style(og2),'Style',''));
    hwRes.appendChild(sr);
    hwRes.appendChild(infoBox(`💧 For ${gal} gal with ${lbs} lbs honey: add <strong>${wL.toFixed(1)} L (${(wL/3.785).toFixed(2)} gal)</strong> warm water. Honey volume = ~${(lbs*0.339).toFixed(1)} L.`,'info-sea'));
  };
  lbsIn.addEventListener('input',updHW); galIn.addEventListener('input',updHW);
  const lG=el('div',{cls:'form-group'}); lG.appendChild(sLbl('Honey (lbs)')); lG.appendChild(lbsIn);
  const gG=el('div',{cls:'form-group'}); gG.appendChild(sLbl('Target Batch (gal)')); gG.appendChild(galIn);
  hwGrid.appendChild(lG); hwGrid.appendChild(gG);
  hwCard.appendChild(hwGrid); updHW(); hwCard.appendChild(hwRes); root.appendChild(hwCard);

  // Batch reference
  const refCard=el('div',{cls:'card',style:'margin-bottom:14px'}); appendHTML(refCard,'<div class="card-title">Batch Reference 🍯</div>');
  const rg=el('div',{cls:'grid-3'});
  [[3,1],[3.5,1],[4,1],[12,5],[15,5],[18,5],[21,5],[24,5],[30,5]].forEach(([lb,g])=>{
    const og2=Sci.og(lb,g), wL=Sci.waterL(lb,g);
    appendHTML(rg,`<div class="honey-card"><div class="honey-name">${lb}lb/${g}gal</div><div class="honey-data" style="color:var(--amber-pale);font-weight:700">${og2.toFixed(3)}</div><div class="honey-data" style="color:var(--sea-light)">💧 ${wL.toFixed(1)} L</div><div class="honey-data">${Sci.style(og2)}</div></div>`);
  });
  refCard.appendChild(rg); root.appendChild(refCard);

  // Yeast chart
  const yCard=el('div',{cls:'card',style:'margin-bottom:14px'}); appendHTML(yCard,'<div class="card-title">Yeast Tolerance 🦠</div>');
  DATA.yeasts.forEach(y=>{
    const row=el('div',{style:'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)'});
    appendHTML(row,`<div style="min-width:190px;font-family:Cinzel,serif;font-size:.82rem;color:var(--gold-pale)">${y.name}</div><div style="flex:1;background:rgba(0,0,0,.4);border-radius:5px;overflow:hidden;height:9px;border:1px solid var(--border)"><div style="height:100%;width:${(y.tol/20)*100}%;background:linear-gradient(90deg,var(--amber),var(--gold))"></div></div><div style="min-width:42px;font-family:Cinzel,serif;color:var(--amber-pale);font-weight:700">${y.tol}%</div><div style="font-size:.75rem;color:var(--text-dim);font-style:italic">${y.note}</div>`);
    yCard.appendChild(row);
  });
  root.appendChild(yCard);

  // Honey varieties
  const hnCard=el('div',{cls:'card'}); appendHTML(hnCard,'<div class="card-title">Honey Varieties 🌸</div>');
  const hng=el('div',{cls:'grid-3'});
  DATA.honeys.forEach(h=>{
    appendHTML(hng,`<div class="honey-card"><div class="honey-emoji">${h.emoji}</div><div class="honey-name">${h.name}</div><div class="honey-data" style="color:var(--amber-pale)">${h.ppg} PPG</div><div class="honey-data">${h.desc}</div></div>`);
  });
  hnCard.appendChild(hng); root.appendChild(hnCard);
  return root;
}

// ═══════════════════════════════════════════════════════════════════════
//  TAB: AI COMPANION — Skáld
// ═══════════════════════════════════════════════════════════════════════

function renderAITab() {
  const root=el('div');
  appendHTML(root,'<h2 class="page-title">🐉 Skáld — AI Brew Master</h2><p class="page-subtitle">Norse spirit of brewing wisdom. Ask about recipes, science, history, troubleshooting.</p>');

  root.appendChild(infoBox('⚠️ Skáld requires a server-side API proxy to protect your Anthropic API key. See README.md for Cloudflare Worker or Vercel setup instructions. Direct browser calls to api.anthropic.com require a CORS proxy.','info-amber'));

  const CHIPS=['🍯 Design a sweet floral traditional mead','🍓 5-gallon raspberry melomel recipe','🔥 How to make bochet with burnt honey?','🦠 Explain TOSNA nutrients for beginners','💨 My mead smells like rotten eggs — help!','🍺 Design a Viking spiced metheglin','⚗️ High gravity sack mead guide','❄️ When should I cold crash and rack?','🍾 Carbonate mead without bottle bombs','📅 Fastest path to drinkable mead?'];

  const chips=el('div',{cls:'ai-prompt-chips'});
  CHIPS.forEach(c=>{
    chips.appendChild(el('div',{cls:'prompt-chip',onClick(){uIn.value=c;uIn.focus();}},c));
  });
  root.appendChild(chips);

  const chatBox=el('div',{id:'ai-chat-box'});
  State.chatHistory.forEach(m=>chatBox.appendChild(mkChatBubble(m.role,m.content)));
  if(!State.chatHistory.length){
    chatBox.appendChild(mkChatBubble('assistant','Hail, Viking! I am **Skáld**, keeper of ancient brewing wisdom and student of modern fermentation science.\n\nAsk me to design a mead recipe, explain the chemistry behind fermentation, troubleshoot your batch, or explore the history of mead from 7000 BCE to the Viking age. By Odin\'s mead horn — let us brew something worthy of Valhalla!'));
  }
  root.appendChild(chatBox);

  const inRow=el('div',{cls:'ai-input-row'});
  const uIn=el('input',{type:'text',cls:'form-input',placeholder:'Ask Skáld anything about mead...',id:'ai-user-input'});
  const sendBtn=el('button',{cls:'btn btn-primary'},'⚔️ Send');

  const doSend=async()=>{
    const txt=uIn.value.trim(); if(!txt) return;
    uIn.value='';
    State.chatHistory.push({role:'user',content:txt});
    chatBox.appendChild(mkChatBubble('user',txt));
    const typing=el('div',{cls:'chat-msg'});
    appendHTML(typing,'<div class="chat-avatar ai">🐉</div><div class="chat-bubble ai"><span class="chat-typing">Skáld is consulting the ancient runes...</span></div>');
    chatBox.appendChild(typing);
    chatBox.scrollTop=chatBox.scrollHeight;
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1500,system:AI_SYSTEM,messages:State.chatHistory.map(m=>({role:m.role,content:m.content}))})
      });
      typing.remove();
      if(!res.ok){const err=await res.json().catch(()=>({}));chatBox.appendChild(mkChatBubble('assistant',`⚠️ API Error ${res.status}: ${err.error?.message||'Configure your proxy. See README.'}`));}
      else{const d=await res.json();const reply=d.content?.[0]?.text||'The runes are silent.';State.chatHistory.push({role:'assistant',content:reply});chatBox.appendChild(mkChatBubble('assistant',reply));State.persist();}
    }catch(e){
      typing.remove();
      chatBox.appendChild(mkChatBubble('assistant',`⚠️ Cannot reach Skáld. A server-side proxy is required — see README.md for setup. (${e.message})`));
    }
    chatBox.scrollTop=chatBox.scrollHeight;
  };

  sendBtn.addEventListener('click',doSend);
  uIn.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend();}});
  inRow.appendChild(uIn); inRow.appendChild(sendBtn); root.appendChild(inRow);
  root.appendChild(el('button',{cls:'btn btn-ghost btn-sm',style:'margin-top:8px',onClick(){
    State.chatHistory=[]; State.persist(); chatBox.innerHTML='';
    chatBox.appendChild(mkChatBubble('assistant','The mead horn is refilled. What shall we brew, Viking?'));
  }},'🗑️ Clear'));
  return root;
}

function mkChatBubble(role,content){
  const isAI=role==='assistant';
  const formatted=content.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/\n/g,'<br>');
  const wrap=el('div',{cls:`chat-msg${isAI?'':' user'}`});
  appendHTML(wrap,`<div class="chat-avatar ${isAI?'ai':'user'}">${isAI?'🐉':'⚔️'}</div><div class="chat-bubble ${isAI?'ai':'user'}">${formatted}</div>`);
  return wrap;
}

// ═══════════════════════════════════════════════════════════════════════
//  TAB: COMPENDIUM
// ═══════════════════════════════════════════════════════════════════════

function renderCompendiumTab() {
  const root=el('div');
  appendHTML(root,'<h2 class="page-title">📜 Mead Master Compendium</h2><p class="page-subtitle">History · Science · Styles · Technique · Equipment · Troubleshooting</p>');

  let active=DATA.compendium[0].id;
  const nav=el('div',{cls:'chapter-nav'});
  const area=el('div');

  const renderCh=()=>{
    area.innerHTML='';
    const ch=DATA.compendium.find(c=>c.id===active);
    ch.entries.forEach(entry=>{
      const card2=el('div',{cls:'entry-card'});
      const hdr=el('div',{cls:'entry-header',onClick(){card2.classList.toggle('open');}});
      const lft=el('div',{style:'display:flex;align-items:center'});
      appendHTML(lft,`<div class="entry-icon-wrap">${entry.emoji}</div><span class="entry-title-text">${entry.title}</span>`);
      hdr.appendChild(lft); appendHTML(hdr,'<span class="entry-toggle">+</span>');
      card2.appendChild(hdr);
      const body=el('div',{cls:'entry-body'}); body.textContent=entry.body; card2.appendChild(body);
      area.appendChild(card2);
    });
    if(active==='technique'){
      const tc=el('div',{cls:'card',style:'margin-top:16px'}); appendHTML(tc,'<div class="card-title">Brewing Timeline</div>');
      const tl=el('div',{cls:'timeline'});
      [{p:'Day 0',a:'Mix must, pitch yeast, first TOSNA addition',c:'#F5C842'},{p:'Days 1–3',a:'Active fermentation, staggered nutrients, degas daily',c:'#E8821A'},{p:'Week 1–4',a:'Primary fermentation — gravity drops',c:'#FF7BAC'},{p:'~Day 30',a:'🍷 First rack off heavy lees',c:'#FF7BAC'},{p:'Week 4–8',a:'Secondary — add fruit/spices',c:'#C97BFF'},{p:'Month 2–3',a:'Conditioning — clarifies, flavors integrate',c:'#C97BFF'},{p:'Month 3+',a:'Cold crash → fine → stabilize → bottle',c:'#7BDFC4'},{p:'Month 6–12',a:'🏆 Peak drinking window',c:'#7BDFC4'}].forEach((t,i,arr)=>{
        const row=el('div',{cls:'timeline-row'});
        const lw=el('div',{cls:'timeline-line-wrap'});
        appendHTML(lw,`<div class="timeline-dot" style="background:${t.c};box-shadow:0 0 0 3px ${t.c}22"></div>${i<arr.length-1?`<div class="timeline-connector" style="background:linear-gradient(${t.c},${arr[i+1].c})"></div>`:''}`);
        row.appendChild(lw);
        const cont=el('div',{cls:'timeline-content'});
        appendHTML(cont,`<span class="timeline-phase" style="color:${t.c}">${t.p}</span><span class="timeline-action">${t.a}</span>`);
        row.appendChild(cont); tl.appendChild(row);
      });
      tc.appendChild(tl); area.appendChild(tc);
    }
  };

  DATA.compendium.forEach(ch=>{
    const btn=el('div',{cls:`chapter-btn${ch.id===active?' active':''}`,onClick(){
      active=ch.id;
      nav.querySelectorAll('.chapter-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); renderCh();
    }},ch.emoji,' ',ch.title);
    nav.appendChild(btn);
  });
  root.appendChild(nav); root.appendChild(area); renderCh();
  return root;
}

// ═══════════════════════════════════════════════════════════════════════
//  TAB: GLOSSARY
// ═══════════════════════════════════════════════════════════════════════

function renderGlossaryTab() {
  const root=el('div');
  appendHTML(root,'<h2 class="page-title">⚔️ Glossary & Reference</h2><p class="page-subtitle">The Viking brewer\'s lexicon.</p>');

  const gc=el('div',{cls:'card',style:'margin-bottom:14px'}); appendHTML(gc,'<div class="card-title">Brewing Glossary</div>');
  const gg=el('div',{cls:'gloss-grid'});
  DATA.glossary.forEach(g=>{ appendHTML(gg,`<div class="gloss-item"><div class="gloss-term">${g.term}</div><div class="gloss-def">${g.def}</div></div>`); });
  gc.appendChild(gg); root.appendChild(gc);

  const cc=el('div',{cls:'card',style:'margin-bottom:14px'}); appendHTML(cc,'<div class="card-title">Quick Conversions 🔢</div>');
  const cg=el('div',{cls:'gloss-grid'});
  [['1 lb honey','≈ 0.339 L volume'],['1 lb honey / 1 gal','≈ +0.037 OG (37 PPG)'],['1 gallon','= 3.785 liters'],['1 lb','= 453.6 grams'],['TOSNA rate','0.5g Fermaid-O / L / step'],['K-meta dose','¼ tsp / 5 gallons'],['K-sorbate dose','½ tsp / 5 gallons'],['Priming sugar','¾ cup corn sugar / 5 gal'],['1/3 break (OG 1.100)','≈ SG 1.067'],['pH ideal','3.5–4.0 during fermentation'],['Temp ideal','60–72°F most wine yeasts'],['Cold crash','34–38°F, 1–2 weeks'],['Oak cubes','1 oz / 5 gal, 2–6 weeks'],['Fruit (light)','1–3 lbs / gallon'],['Fruit (bold)','3–6 lbs / gallon'],['Bentonite','¼ tsp / gal at fermentation start']].forEach(([t,d])=>{
    appendHTML(cg,`<div class="gloss-item"><div class="gloss-term">${t}</div><div class="gloss-def">${d}</div></div>`);
  });
  cc.appendChild(cg); root.appendChild(cc);

  const sc=el('div',{cls:'card'}); appendHTML(sc,'<div class="card-title">Stabilization Checklist ✅</div>');
  [['1. Confirm stable FG','Identical readings over 3+ tests / 14+ days'],['2. Cold crash','34–38°F for 1–2 weeks to drop yeast'],['3. Add K-meta','¼ tsp / 5 gal — stuns yeast'],['4. Add K-sorbate','½ tsp / 5 gal — prevents reproduction'],['5. Wait 24–48 hours','Allow chemicals to react throughout'],['6. Back-sweeten','Add honey to taste — no re-ferment risk'],['7. Fine if needed','Kieselsol + Chitosan for final clarity'],['8. Bottle!','Pressure-rated bottles for sparkling; wine bottles for still']].forEach(([s2,d])=>{
    appendHTML(sc,`<div style="display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)"><span style="font-family:Cinzel,serif;color:var(--gold);min-width:150px;font-size:.82rem">${s2}</span><span style="font-size:.85rem;color:var(--text-mid)">${d}</span></div>`);
  });
  root.appendChild(sc);
  return root;
}

// ═══════════════════════════════════════════════════════════════════════
//  Print
// ═══════════════════════════════════════════════════════════════════════
function doPrint(brew){
  const yd=DATA.yeasts.find(y=>y.name===brew.yeast);
  const fg=yd?Sci.fg(brew.ogReading,yd.att).toFixed(3):brew.targetFG.toFixed(3);
  const abv=Sci.abv(brew.ogReading,parseFloat(fg));
  const wL=Sci.waterL(brew.lbsHoney,brew.gallons);
  const tg=Sci.tosnaG(brew.gallons);
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>${brew.name}</title><style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;color:#111;line-height:1.7}h1{font-size:2rem;border-bottom:3px solid #333;padding-bottom:8px}h2{font-size:1.05rem;margin-top:20px;border-left:4px solid #333;padding-left:10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.box{border:1px solid #ccc;padding:9px 12px;border-radius:4px}.lbl{font-size:.68rem;text-transform:uppercase;color:#666}.val{font-size:1.1rem;font-weight:bold}table{width:100%;border-collapse:collapse;margin:10px 0;font-size:.88rem}td,th{border:1px solid #ccc;padding:6px 10px}th{background:#f0f0f0;text-align:left}.foot{margin-top:28px;font-size:.75rem;color:#888;border-top:1px dashed #ccc;padding-top:10px}@media print{body{margin:15px}}</style></head><body>
  <h1>${brew.emoji} ${brew.name}</h1>
  <p><strong>Type:</strong> ${brew.type} | <strong>Started:</strong> ${brew.startDate} | <strong>Batch:</strong> ${brew.gallons} gal</p>
  <h2>Stats</h2><div class="grid"><div class="box"><div class="lbl">OG</div><div class="val">${brew.ogReading.toFixed(3)}</div></div><div class="box"><div class="lbl">Target FG</div><div class="val">${brew.targetFG.toFixed(3)}</div></div><div class="box"><div class="lbl">Est. ABV</div><div class="val">${abv}%</div></div><div class="box"><div class="lbl">Style</div><div class="val">${Sci.style(brew.targetFG)}</div></div></div>
  <h2>Ingredients</h2><table><tr><th>Ingredient</th><th>Amount</th><th>Notes</th></tr><tr><td>${brew.honey} Honey</td><td>${brew.lbsHoney} lbs</td><td>~37 PPG; dissolve in warm water</td></tr><tr><td>Water (~37°C)</td><td>${wL.toFixed(1)} L / ${(wL/3.785).toFixed(2)} gal</td><td>Filtered; do not boil</td></tr><tr><td>${brew.yeast}</td><td>1 packet</td><td>Rehydrate 104°F, 15 min, then acclimate</td></tr><tr><td>Fermaid-O</td><td>${tg}g × 4</td><td>TOSNA schedule below</td></tr>${brew.fruits.length?`<tr><td>${brew.fruits.join(', ')}</td><td>see recipe</td><td>Secondary; freeze fresh fruit first</td></tr>`:''}${brew.spices.length?`<tr><td>${brew.spices.join(', ')}</td><td>to taste</td><td>Muslin bag; taste every 2–3 days</td></tr>`:''}</table>
  <h2>TOSNA Nutrients</h2><table><tr><th>When</th><th>Action</th><th>Amount</th></tr><tr><td>Day 0</td><td>Mix must, add Fermaid-O, pitch yeast</td><td>${tg}g</td></tr><tr><td>Day 1 (24hr)</td><td>Degas, add Fermaid-O</td><td>${tg}g</td></tr><tr><td>Day 2 (48hr)</td><td>Degas, add Fermaid-O</td><td>${tg}g</td></tr><tr><td>1/3 Sugar Break</td><td>Final addition (~Day 4–7)</td><td>${tg}g</td></tr></table>
  <h2>Timeline</h2><table><tr><th>Phase</th><th>Est. Date</th></tr><tr><td>First Rack</td><td>~Day 30</td></tr><tr><td>Est. Bottle</td><td>${Sci.addMonths(brew.startDate,3)}</td></tr><tr><td>Peak Drinking</td><td>${Sci.addMonths(brew.startDate,6)}+</td></tr></table>
  ${brew.notes?`<h2>Notes</h2><p>${brew.notes}</p>`:''}
  <div class="foot">MeadCraft ⚓ Viking Brew Master | Brewer: __________________ | Vessel: __________________ | ${new Date().toLocaleDateString()}</div>
  </body></html>`);
  w.document.close(); w.print();
}

// ═══════════════════════════════════════════════════════════════════════
//  App Router
// ═══════════════════════════════════════════════════════════════════════
const TABS=[
  {id:'brews',      label:'Fleet',      icon:'⚓', render:renderBrewsTab},
  {id:'recipe',     label:'Recipe',     icon:'⚗️', render:renderRecipeTab},
  {id:'calculator', label:'Calculator', icon:'✦',  render:renderCalcTab},
  {id:'ai',         label:'Skáld AI',   icon:'🐉', render:renderAITab},
  {id:'compendium', label:'Compendium', icon:'📜', render:renderCompendiumTab},
  {id:'glossary',   label:'Glossary',   icon:'⚔️', render:renderGlossaryTab},
];

function renderApp(){
  try{
    const content=document.getElementById('app-content');
    content.innerHTML='';
    const tab=TABS.find(t=>t.id===State.activeTab)||TABS[0];
    content.appendChild(tab.render());
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===State.activeTab));
    window.scrollTo(0,0);
  }catch(err){
    console.error('renderApp error:',err);
    const content=document.getElementById('app-content');
    content.innerHTML=`<div class="card" style="margin-top:20px"><div class="card-title">⚠️ Render Error</div><p style="color:var(--text-mid)">${err.message}</p><button class="btn btn-primary" onclick="State.activeTab='brews';renderApp()">Return to Fleet</button></div>`;
  }
}

function buildNav(){
  const navInner=document.querySelector('.nav-inner');
  if(!navInner) return;
  TABS.forEach(tab=>{
    const btn=el('button',{cls:`nav-btn${tab.id===State.activeTab?' active':''}`,onClick(){State.activeTab=tab.id;State.selectedBrew=null;State.persist();renderApp();}});
    btn.dataset.tab=tab.id;
    appendHTML(btn,`<span class="nav-icon">${tab.icon}</span>${tab.label}`);
    navInner.appendChild(btn);
  });
}

// ── Install Banner ─────────────────────────────────────────────────────
let deferredPrompt=null;
function setupInstallBanner(){
  const banner=document.getElementById('install-banner');
  const iBtn=document.getElementById('install-btn');
  const dBtn=document.getElementById('banner-dismiss');
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;banner.classList.add('show');});
  iBtn?.addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;banner.classList.remove('show');});
  dBtn?.addEventListener('click',()=>banner.classList.remove('show'));
  window.addEventListener('appinstalled',()=>{banner.classList.remove('show');deferredPrompt=null;});
}

function registerSW(){
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('SW:',e));
}

// ── Boot ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  State.init();
  buildNav();
  renderApp();
  setupInstallBanner();
  registerSW();
});
