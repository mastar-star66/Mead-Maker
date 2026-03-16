'use strict';
// ═══════════════════════════════════════════════════════════════════════
//  MeadCraft — Viking Brew Master  |  app.js
// ═══════════════════════════════════════════════════════════════════════

// ── localStorage helpers ───────────────────────────────────────────────
const LS = {
  key: 'meadcraft_v2',
  load() {
    try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; }
  },
  save(data) {
    try { localStorage.setItem(this.key, JSON.stringify(data)); } catch (e) { console.warn('LS save failed', e); }
  }
};

// ── App State ──────────────────────────────────────────────────────────
const State = {
  brews: [],
  selectedBrew: null,
  activeTab: 'brews',
  chatHistory: [],
  tosnaRecipe: { t0: false, t24: false, t48: false, t13: false },
  init() {
    const d = LS.load();
    this.brews = d.brews || DEMO_BREWS();
    this.chatHistory = d.chatHistory || [];
    this.activeTab = d.activeTab || 'brews';
  },
  persist() {
    LS.save({ brews: this.brews, chatHistory: this.chatHistory, activeTab: this.activeTab });
  }
};

// ── Demo Data ──────────────────────────────────────────────────────────
function DEMO_BREWS() {
  return [
    {
      id: Date.now() - 1000000,
      name: 'Valhalla Cherry', type: 'Melomel', status: 'Fermenting',
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
      id: Date.now() - 2000000,
      name: 'Golden Odin Mead', type: 'Traditional', status: 'Conditioning',
      emoji: '🍯', honey: 'Acacia', lbsHoney: 12, gallons: 5,
      yeast: 'Lalvin D47', fruits: [], spices: ['Vanilla'],
      ogReading: 1.090, currentGravity: 1.009, targetFG: 1.008,
      startDate: '2025-11-01', notes: 'Crystal clear. Awaiting Odin\'s blessing.',
      readings: [
        { date: '12/1/2025', gravity: 1.040, note: '' },
        { date: '1/5/2026', gravity: 1.009, note: '' },
        { date: '1/20/2026', gravity: 1.009, note: 'Stable — confirmed' }
      ],
      ph: '3.7', temp: '65',
      tosnaChecked: { t0: true, t24: true, t48: true, t13: true }
    }
  ];
}

// ── Science Engine ─────────────────────────────────────────────────────
const Science = {
  // Advanced ABV (corrected for high-gravity)
  abv(og, fg) {
    const abv = (76.08 * (og - fg) / (1.775 - og)) * (fg / 0.794);
    return Math.max(0, abv).toFixed(1);
  },
  abvSimple(og, fg) { return Math.max(0, (og - fg) * 131.25).toFixed(1); },

  // OG from honey (37 PPG average)
  og(lbs, gal) { return 1.0 + (lbs * 37) / (gal * 1000); },

  // FG from yeast attenuation
  fg(og, att) { return 1.0 + ((og - 1) * (1 - att)); },

  // Honey needed for target OG
  honeyFor(og, gal) { return ((og - 1) * 1000 * gal) / 37; },

  // Water to add: total volume minus honey volume (1 lb honey ≈ 0.339L)
  waterL(lbs, gal) { return Math.max(0, gal * 3.785 - lbs * 0.339); },
  waterGal(lbs, gal) { return this.waterL(lbs, gal) / 3.785; },

  // Gravity style
  style(fg) {
    if (fg < 1.006) return 'Bone Dry';
    if (fg < 1.012) return 'Dry';
    if (fg < 1.020) return 'Semi-Dry';
    if (fg < 1.035) return 'Semi-Sweet';
    if (fg < 1.060) return 'Sweet';
    return 'Dessert Sweet';
  },

  // Days since date string
  daysSince(d) {
    if (!d) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(d)) / 86400000));
  },

  // Add months to date string
  addMonths(d, m) {
    if (!d) return '—';
    const dt = new Date(d); dt.setMonth(dt.getMonth() + m);
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  // Stabilization status
  stabStatus(brew) {
    const r = brew.readings || [];
    const yeast = DATA.yeasts.find(y => y.name === brew.yeast);
    const curAbv = parseFloat(this.abv(brew.ogReading, brew.currentGravity));
    const tol = yeast ? yeast.tolerance : 14;
    const nearTarget = Math.abs(brew.currentGravity - brew.targetFG) <= 0.002;
    const stable = r.length >= 2 && Math.abs(r[r.length-1].gravity - r[r.length-2].gravity) <= 0.001;

    if (nearTarget && stable)  return { cls: 'status-safe',  label: '✅ Safe to Stabilize' };
    if (!nearTarget && curAbv < tol) return { cls: 'status-risk', label: '⚠️ Re-fermentation Risk' };
    if (nearTarget && !stable) return { cls: 'status-wait',  label: '⏳ Confirm 2 Readings' };
    return { cls: 'status-fermenting', label: '🍯 Fermenting' };
  },

  // TOSNA Fermaid-O per addition in grams
  tosnaGrams(gal) { return (gal * 3.785 * 0.5).toFixed(1); },

  // pH advisory
  phAdvice(ph) {
    const v = parseFloat(ph);
    if (!ph) return null;
    if (v < 3.0) return { cls: 'info-red', msg: '⚠️ Critical: pH below 3.0 — yeast will stall. Add potassium bicarbonate immediately.' };
    if (v < 3.4) return { cls: 'info-amber', msg: '⚠️ pH low (3.0–3.4). Borderline — monitor closely. Consider K-bicarb.' };
    if (v > 4.5) return { cls: 'info-amber', msg: '🔶 pH elevated. May slow fermentation. Usually fine for mead.' };
    return { cls: 'info-green', msg: `✅ pH ${v.toFixed(1)} is in the ideal 3.5–4.0 range for healthy fermentation.` };
  },

  // Temp advisory
  tempAdvice(t, yeastName) {
    const v = parseFloat(t);
    if (!t) return null;
    const isD47 = yeastName && yeastName.includes('D47');
    if (isD47 && v > 65) return { cls: 'info-red', msg: `⚠️ D47 above 65°F (${v}°F detected) — will produce harsh fusel alcohols. Cool down urgently!` };
    if (v > 78) return { cls: 'info-red', msg: `⚠️ ${v}°F is too warm. Risk of fusel alcohols and yeast stress.` };
    if (v < 58) return { cls: 'info-amber', msg: `⚠️ ${v}°F is cold. Fermentation may stall below 60°F for most strains.` };
    return { cls: 'info-green', msg: `✅ ${v}°F is within optimal fermentation range (60–75°F).` };
  }
};

// ── Static Data ────────────────────────────────────────────────────────
const DATA = {
  fruits: [
    { name: 'Raspberry',    emoji: '🍓', sgBoost: 1.5 },
    { name: 'Blackberry',   emoji: '🫐', sgBoost: 1.8 },
    { name: 'Blueberry',    emoji: '🫐', sgBoost: 1.6 },
    { name: 'Strawberry',   emoji: '🍓', sgBoost: 1.2 },
    { name: 'Cherry',       emoji: '🍒', sgBoost: 2.0 },
    { name: 'Peach',        emoji: '🍑', sgBoost: 1.4 },
    { name: 'Mango',        emoji: '🥭', sgBoost: 2.2 },
    { name: 'Pineapple',    emoji: '🍍', sgBoost: 2.5 },
    { name: 'Apple',        emoji: '🍎', sgBoost: 1.3 },
    { name: 'Lemon',        emoji: '🍋', sgBoost: 0.5 },
    { name: 'Orange',       emoji: '🍊', sgBoost: 1.8 },
    { name: 'Grape',        emoji: '🍇', sgBoost: 2.0 },
    { name: 'Watermelon',   emoji: '🍉', sgBoost: 1.0 },
    { name: 'Pomegranate',  emoji: '🍎', sgBoost: 2.3 },
    { name: 'Passion Fruit',emoji: '🌺', sgBoost: 2.8 },
    { name: 'Cranberry',    emoji: '🍒', sgBoost: 1.1 },
    { name: 'Apricot',      emoji: '🍑', sgBoost: 1.6 },
    { name: 'Fig',          emoji: '🫐', sgBoost: 2.4 },
  ],
  spices: [
    { name: 'Cinnamon',    emoji: '🌿', tip: '1–2 sticks, 1–2 weeks max in secondary' },
    { name: 'Vanilla',     emoji: '🌼', tip: '1–2 beans split lengthwise per 5 gal' },
    { name: 'Clove',       emoji: '🌿', tip: 'Very potent — 2–4 whole cloves only, taste daily' },
    { name: 'Ginger',      emoji: '🫚', tip: '1–2oz fresh sliced or 0.5oz dried' },
    { name: 'Cardamom',    emoji: '🌿', tip: '6–10 crushed pods per 5 gal' },
    { name: 'Nutmeg',      emoji: '🌰', tip: '¼–½ tsp fresh grated; overpowers fast' },
    { name: 'Star Anise',  emoji: '⭐', tip: '2–4 pods; pairs well with citrus' },
    { name: 'Lavender',    emoji: '💜', tip: '2–4 tbsp dried flowers; very floral' },
    { name: 'Rose Hip',    emoji: '🌹', tip: 'Adds hibiscus-like tartness + Vitamin C' },
    { name: 'Hibiscus',    emoji: '🌺', tip: 'Brilliant crimson color + tart flavor' },
    { name: 'Chamomile',   emoji: '🌼', tip: 'Calming apple-honey notes; 2–4 tbsp' },
    { name: 'Elderflower', emoji: '🌸', tip: 'Delicate floral — add for 3–5 days only' },
    { name: 'Hops',        emoji: '🌾', tip: '0.5–1oz pellets for Braggot; bitterness + aroma' },
    { name: 'Mint',        emoji: '🍃', tip: 'Fresh only; 3–5 days max; very intense' },
    { name: 'Lemongrass',  emoji: '🌿', tip: '2 stalks bruised; 1 week in secondary' },
    { name: 'Black Pepper', emoji: '⚫', tip: '10–15 cracked peppercorns; warming spice' },
    { name: 'Allspice',    emoji: '🌿', tip: '5–8 berries cracked; classic holiday spice' },
  ],
  honeys: [
    { name: 'Wildflower',    emoji: '🌸', ppg: 37, desc: 'Complex, varied floral profile; regional terroir' },
    { name: 'Clover',        emoji: '🍀', ppg: 38, desc: 'Classic, clean, neutral honey character' },
    { name: 'Orange Blossom',emoji: '🍊', ppg: 37, desc: 'Bright citrus floral notes; popular for melomels' },
    { name: 'Buckwheat',     emoji: '🌾', ppg: 36, desc: 'Rich, dark, molasses-like; pairs with bochet' },
    { name: 'Acacia',        emoji: '🌿', ppg: 38, desc: 'Very light, delicate; lets yeast shine' },
    { name: 'Manuka',        emoji: '✨', ppg: 37, desc: 'Earthy, medicinal; antimicrobial premium' },
    { name: 'Raw Unfiltered',emoji: '🍯', ppg: 36, desc: 'Pollen, wax, wild yeast — most complex' },
    { name: 'Tupelo',        emoji: '🌳', ppg: 37, desc: 'Buttery, greenish tint; resists crystallizing' },
    { name: 'Linden',        emoji: '🌳', ppg: 37, desc: 'Minty, balsamic — classic European mead honey' },
    { name: 'Blackberry',    emoji: '🫐', ppg: 37, desc: 'Dark fruity undertones; brilliant with melomels' },
  ],
  yeasts: [
    { name: 'Lalvin 71B',              att: 0.75, tol: 14, note: 'Fruity, soft; metabolizes malic acid; beginner-friendly' },
    { name: 'Lalvin EC-1118',          att: 0.95, tol: 18, note: 'The Hulk — dry, neutral, up to 18% ABV; very aggressive' },
    { name: 'Lalvin D47',              att: 0.80, tol: 14, note: 'Floral, honey-forward; MUST stay below 65°F' },
    { name: 'Lalvin K1-V1116',         att: 0.85, tol: 18, note: 'Clean, neutral; vigorous starter; fruit-forward' },
    { name: 'Red Star Côte des Blancs', att: 0.78, tol: 13, note: 'Fruity, low-foam; excellent for sweet melomels' },
    { name: 'Red Star Premier Blanc',  att: 0.88, tol: 16, note: 'Versatile, clean; handles high sugar well' },
    { name: 'Wyeast 3184 Sweet Mead',  att: 0.70, tol: 11, note: 'Low attenuation — retains natural sweetness' },
    { name: 'WLP720 Sweet Mead',       att: 0.72, tol: 15, note: 'White Labs liquid yeast; fruity, stone fruit esters' },
    { name: 'Mangrove Jack M05',       att: 0.82, tol: 18, note: 'Dry Mead specific; clean, enhances honey character' },
  ],
  meadTypes: ['Traditional', 'Melomel', 'Metheglin', 'Cyser', 'Pyment', 'Capsicumel', 'Bochet', 'Braggot', 'Acerglyn', 'Tej', 'Chouchen'],
  emojis: ['⚔️','🍯','🌸','✨','🍇','🍒','🍑','🌟','🌺','🫐','🍋','🔥','🐝','🏔️','🌊','⚓','🐉'],

  tosnaSteps: [
    { id: 't0',  icon: '⚗️', label: 'Day 0 — Pitch',       sub: 'First Fermaid-O + pitch rehydrated yeast' },
    { id: 't24', icon: '💨', label: 'Day 1 — 24 Hours',    sub: 'Degas vigorously, add Fermaid-O' },
    { id: 't48', icon: '💨', label: 'Day 2 — 48 Hours',    sub: 'Degas again, third Fermaid-O dose' },
    { id: 't13', icon: '⅓',  label: '1/3 Sugar Break',     sub: 'Final dose when ~33% sugars consumed' },
  ],

  compendium: [
    {
      id: 'history', emoji: '📜', title: 'History & Mythology',
      entries: [
        { emoji: '🏺', title: '7000 BCE — The Oldest Drink', body: 'Mead predates agriculture and pottery. Chemical residue found in Neolithic clay jars in Jiahu, Northern China dates to 7000 BCE — making it humanity\'s oldest confirmed alcoholic beverage, predating wine and beer by millennia.' },
        { emoji: '⚡', title: 'Ambrosia — Nectar of the Gods', body: 'In ancient Greek mythology, mead was Ambrosia, believed to fall from the heavens as dew collected by bees from divine flowers. The gods of Olympus drank it to maintain their immortality. Its name shares a root with the Sanskrit "amrita" — the elixir of immortality.' },
        { emoji: '💍', title: 'The Honeymoon Origin', body: 'The word "honeymoon" originates from the medieval Northern European tradition of gifting newlywed couples a full lunar cycle\'s worth (28 days) of mead. The honey-wine was believed to ensure fertility, ward off evil spirits, and guarantee a "sweet" first month of marriage. The tradition is documented as early as the 5th century.' },
        { emoji: '⚔️', title: 'The Viking Mead of Poetry', body: 'Norse mythology describes the Mead of Poetry (Skáldskapmál), brewed by dwarves from the blood of Kvasir — a being so wise he could answer any question. Mixed with honey, the brew granted whoever drank it the gift of eloquence, poetry, and supreme wisdom. Odin himself stole it in the form of an eagle.' },
        { emoji: '🐐', title: 'Heidrun & Valhalla', body: 'The Norse goat Heidrun stands atop Valhalla eating leaves from the world tree Yggdrasil. From her udders flows an inexhaustible river of mead, filling the great cauldron Oðrerir daily to slake the thirst of the Einherjar — fallen warriors awaiting Ragnarök.' },
        { emoji: '⛪', title: 'Medieval Monastery Industry', body: 'In medieval Europe, mead production was largely a monastic industry. Monks kept enormous apiaries primarily to produce beeswax for church candles — mead was the profitable byproduct of the surplus honey. Many monasteries maintained detailed brewing records dating back to the 6th century.' },
        { emoji: '📿', title: 'The Vedic Soma', body: 'Ancient Indian Rigveda texts (1700–1100 BCE) describe Soma, a divine ceremonial drink often interpreted as honey-based. Similar honey-wine traditions appear across Indo-European cultures — Vedic, Greek, Norse, Celtic, and Slavic — suggesting a common Proto-Indo-European origin for fermented honey culture.' },
        { emoji: '🌍', title: 'African & Ethiopian Tej', body: 'Tej, the Ethiopian honey wine made with Gesho shrub as a bittering agent, has been continuously brewed for over 3,000 years. It remains one of the most widely consumed traditional alcoholic beverages in the world today, central to Ethiopian ceremonial culture.' },
        { emoji: '🏴‍☠️', title: 'Viking Maritime Brewing', body: 'Archaeological finds from Viking longships and settlements confirm mead vessels were standard ship provisions. Analyses of residue in Viking-era drinking horns found traces of honey, bog myrtle, yarrow, and cranberry — suggesting complex botanical meads were being brewed across Scandinavia by 800 CE.' },
      ]
    },
    {
      id: 'science', emoji: '🔬', title: 'Science & Chemistry',
      entries: [
        { emoji: '🫙', title: 'The Must', body: 'The "must" is the technical term for the unfermented mixture of honey and water before yeast is introduced. The word comes from the Latin "mustum" (fresh/young). Honey must typically starts at 22–30° Brix (sugar percentage). The must is complete when honey is fully dissolved and nutrients are added.' },
        { emoji: '🧬', title: 'Fermentation Chemistry', body: 'Yeast (Saccharomyces cerevisiae) converts fermentable sugars via glycolysis and alcoholic fermentation: C₆H₁₂O₆ → 2C₂H₅OH + 2CO₂. One mole of glucose yields 2 moles each of ethanol and carbon dioxide. ABV is calculated precisely using the advanced formula: ABV = (76.08 × (OG-FG) / (1.775-OG)) × (FG/0.794), which corrects for density changes at high alcohol levels.' },
        { emoji: '⚗️', title: 'Honey Composition & PPG', body: 'Raw honey is approximately 79–80% carbohydrates (mostly fructose and glucose), 17–20% water, and <1% protein, vitamins, and minerals. Its fermentable sugar yield is measured in Points Per Pound Per Gallon (PPG): most honeys yield 35–38 PPG. At 37 PPG, 1 lb in 1 gallon raises OG by ~0.037. Darker honeys (buckwheat) tend toward 35–36 PPG; lighter varieties (clover, acacia) reach 37–38.' },
        { emoji: '🦠', title: 'Yeast Nutrition & Nitrogen', body: 'Unlike grape must or grain wort, honey is critically deficient in Yeast Assimilable Nitrogen (YAN), vitamins (especially B1/thiamine), and trace minerals. Without supplementation, honey fermentations commonly produce hydrogen sulfide (H₂S — rotten egg odor), ethyl acetate (nail polish solvent), and stuck fermentations. Modern protocols use organic nitrogen sources (Fermaid-O) and inorganic DAP in staggered additions.' },
        { emoji: '🧪', title: 'pH Management', body: 'Honey is naturally acidic at ~3.5–4.0 pH due to gluconic acid, acetic acid, and formic acid. During fermentation, CO₂ production and amino acid metabolism can push pH lower. Optimal yeast activity requires pH 3.5–4.0. Below pH 3.0, yeast enzymatic activity stalls. Potassium bicarbonate (K₂CO₃) raises pH — add ½ tsp per 5 gallons at a time; re-test after 24 hours.' },
        { emoji: '💧', title: 'Hygroscopy & Water Activity', body: 'Pure honey has extremely low water activity (aw ~0.60), making it hostile to virtually all microorganisms — hence why honey never spoils. Adding water raises aw above 0.90, enabling yeast and bacterial activity. Fermentable mead must requires dilution to 18–25% sugar concentration (roughly 1.080–1.130 OG). At >30% sugar, osmotic pressure kills most yeast strains.' },
        { emoji: '🔢', title: 'The 1/3 Sugar Break Rule', body: 'The most critical nutrient timing in mead: the "1/3 sugar break" occurs when approximately 33% of fermentable sugars are consumed, typically Days 3–6 depending on pitch rate and temperature. Calculate it: OG 1.100 → 100 gravity points. 1/3 break = 100/3 ≈ 33 points consumed → hydrometer reads ~1.067. This is the final and most important Fermaid-O addition window.' },
        { emoji: '🛡️', title: 'Antimicrobial Properties of Honey', body: 'Honey\'s antimicrobial nature comes from four mechanisms: (1) High osmolarity — water activity too low for microbes, (2) Low pH ~3.9, (3) Hydrogen peroxide production via glucose oxidase enzyme, (4) Bee-added peptide defensin-1. Interestingly, Manuka honey produces methylglyoxal (MGO), a potent antimicrobial not found in other honeys. All these factors dissolve once honey is diluted with water.' },
        { emoji: '✨', title: 'Clarification Science', body: 'Mead clarity depends on removing yeast, proteins, and polyphenols. Bentonite (montmorillonite clay) carries a negative charge, binding positively-charged proteins — added to must before fermentation. Sparkolloid (diatomaceous earth + polysaccharides) carries positive charge, attracting negatively-charged yeast cells. The "Kieselsol-Chitosan" two-part system (K-C) is fastest: Kieselsol first, then Chitosan 24 hours later, clearing most meads in 1–2 weeks.' },
        { emoji: '🌡️', title: 'Temperature & Ester Production', body: 'Fermentation temperature directly controls ester (flavor compound) production. Higher temps = more esters = more "banana/fruity" character, but also more fusel alcohols (harsh, headache-causing). D47 is notorious: above 65°F it produces 2-methyl-1-butanol and isoamyl alcohol at unacceptable levels. Most wine yeasts perform best at 60–72°F. Cold fermentation (55–60°F) produces very clean, neutral mead.' },
      ]
    },
    {
      id: 'styles', emoji: '🍶', title: 'Mead Styles',
      entries: [
        { emoji: '🍯', title: 'Traditional (Show Mead)', body: 'Only honey, water, yeast, and nutrients. The purest expression — flavor is entirely determined by honey varietal and yeast strain. Judged at the highest standard in homebrew competitions because there is nowhere to hide flaws. Aging for 12–24+ months transforms harsh new mead into something transcendent.' },
        { emoji: '🍓', title: 'Melomel — Fruit Mead', body: 'Any mead made with fruit additions. Subdivided: Cyser (apple), Pyment (grape), and generic fruit melomel. Fruit is typically added in secondary after primary fermentation completes and must is stabilized. Freeze fresh fruit first to rupture cell walls for better juice extraction. Typical additions: 1–3 lb/gal light, 3–6 lb/gal bold. Account for fruit sugars raising effective OG.' },
        { emoji: '🍎', title: 'Cyser — Apple Mead', body: 'Mead fermented with apple juice — the crossroads of mead and cider. Apple juice contributes natural acidity, malic acid, and fruity esters. Replace some or all water with fresh-pressed or commercial apple juice. A 50/50 split (apple juice + water) with 2–3 lb honey per gallon produces an excellent sessionable cyser around 8–10% ABV. Age 6–12 months for best results.' },
        { emoji: '🍇', title: 'Pyment — Grape Mead', body: 'Mead fermented with grapes or grape juice — mead meets wine. Ancient Greeks called it "oenomel." Use 100% grape juice replacing all water, with 1–2 lb honey per gallon to boost gravity and sweetness. Any grape variety works. Pairs wonderfully with extended oak aging on American or French oak cubes. Can age 2–5+ years like fine wine.' },
        { emoji: '🌿', title: 'Metheglin — Spiced Mead', body: 'Mead with herbs or spices. Among the oldest documented styles — medieval records describe metheglin with rosemary, thyme, and hops. Modern interpretations use cinnamon, vanilla, ginger, cardamom, lavender, and countless combinations. Always add spices in secondary using muslin bags for easy removal. Taste every 2–3 days — extraction is fast and over-spicing is irreversible.' },
        { emoji: '🔥', title: 'Bochet — Caramelized Honey Mead', body: 'Made with honey that has been caramelized or "burnt" in a pot before fermentation. Heat honey alone (without water) to 250–350°F while stirring, until it reaches desired color — light caramel, dark toffee, or nearly black. The Maillard reaction creates compounds that survive fermentation: toasted marshmallow, chocolate, caramel, toffee notes. The longer you cook, the darker and more complex.' },
        { emoji: '🍺', title: 'Braggot — Mead-Beer Hybrid', body: 'The bridge between mead and beer: fermented with both honey and malted grains, with optional hops. Historical records place braggot in Wales and England dating to the 13th century. Use a base of pale malt (1–2 lbs per gallon) plus 1–2 lb honey per gallon. Hops provide balance and preservation. All-grain or extract brewing methods both work. A fascinating middle ground of two ancient traditions.' },
        { emoji: '🌶️', title: 'Capsicumel — Chili Mead', body: 'Mead flavored with chili peppers. Capsaicin (the compound responsible for heat) is alcohol-soluble, meaning it extracts efficiently into mead. The interplay of honey sweetness and chili heat creates a warming, complex beverage unlike anything else. Use fresh or dried peppers — jalapeño, habanero, ghost pepper, or ancho. Add in secondary for 3–14 days depending on desired heat level.' },
        { emoji: '🍁', title: 'Acerglyn — Maple Mead', body: 'A hybrid using both honey and maple syrup. Maple contributes fermentable sugars (sucrose), organic acids, amino acids, and complex phenolics. Grade B (dark/robust) maple adds the most character. Replace 25–50% of honey weight with maple syrup. The maple character softens during fermentation but returns as an earthy, caramel-maple presence in the finish. Particularly excellent with vanilla or spiced versions.' },
        { emoji: '🌍', title: 'Tej — Ethiopian Honey Wine', body: 'The world\'s most widely consumed traditional mead. Made with honey and Gesho (Rhamnus prinoides) — a bittering shrub native to East Africa that functions similarly to hops in beer. Gesho adds bitterness, earthy-herbal flavor, and acts as a preservative. Traditional Tej ferments 5–10 days with wild yeast and is consumed young and semi-turbid. The taste is slightly sweet, tart, earthy, and effervescent.' },
        { emoji: '🇫🇷', title: 'Chouchen — Breton Mead', body: 'A regionally-protected mead from Brittany, France (IGP designation). Traditionally made with Breton buckwheat honey and wild yeast cultures. The flavor is darker and more complex than light floral meads — buckwheat\'s earthy, molasses character dominates. Modern chouchen is also made with wild berries from the Breton coast. It is the cultural equivalent of wine to Brittany — served at all traditional Breton festivals.' },
      ]
    },
    {
      id: 'technique', emoji: '🏆', title: 'Technique & Science',
      entries: [
        { emoji: '📅', title: 'TOSNA — Staggered Nutrients', body: 'Tailored Organic Staggered Nutrient Addition (TOSNA 2.0) by Sergio Moutela is the gold-standard mead nutrition protocol. Use Fermaid-O (organic nitrogen) exclusively. Calculate total addition: 0.5g per liter of must per step × 4 steps. Add at: pitch, 24hrs, 48hrs, and 1/3 sugar break. For Fermaid-O, never add more than 1g/L per step to avoid nitrogen toxicity. Degassing before each addition reduces explosive foaming.' },
        { emoji: '🌀', title: 'Degassing & Aeration Protocol', body: 'During the first 48 hours, actively aerate the must by whipping, stirring with a drill mixer, or using a wine whip. Oxygen at this stage supports yeast lipid synthesis, essential for healthy cell membranes. After 48 hours, STOP introducing oxygen — it becomes an enemy. CO₂ must be actively degassed throughout early fermentation to prevent yeast stress. Swirl or stir (without introducing air) for the first 5–7 days.' },
        { emoji: '🚢', title: 'Racking & Lees Management', body: 'Racking means transferring mead to a clean vessel, leaving sediment (lees) behind. Rack when heavy lees (primary sediment) reach ~½ inch — typically 2–4 weeks into fermentation. Fine lees (smaller particles) can contact the mead longer and add complexity. Autolysis (yeast self-digestion) produces rubbery, meaty off-flavors if yeast sits on heavy lees too long. Rack with a sanitized auto-siphon to minimize oxygen exposure.' },
        { emoji: '❄️', title: 'Cold Crashing & Clarification', body: 'Cold crashing drops fermentation temperature to 34–38°F for 1–2 weeks. Cold causes yeast and particulates to flocculate (clump together) and sink to the bottom through gravity. The result: brilliantly clear mead above a compact yeast cake. After cold crashing, rack off the yeast cake and optionally use fining agents (Bentonite, Kieselsol-Chitosan) for final polishing. Most meads achieve competition clarity within 2–4 weeks of cold crashing.' },
        { emoji: '🍯', title: 'Stabilization & Back-Sweetening', body: 'Before back-sweetening, fermentation must be completely stopped. Add potassium metabisulfite (K-meta, ¼ tsp / 5 gal) to produce SO₂ which stuns yeast, then potassium sorbate (½ tsp / 5 gal) which prevents yeast reproduction. Wait 24 hours, then add honey to taste. Without proper stabilization, added honey re-ferments in the bottle, producing carbonation and potentially explosive bottle failure. Never skip this step when back-sweetening!' },
        { emoji: '🥃', title: 'Oak Aging & Complexity', body: 'Oak aging adds vanilla, caramel, toasty, and tannin complexity to mead. Use American or French oak cubes or spirals (not chips — too fast). Medium toast oak at 1oz per 5 gallons for 2–6 weeks. Taste every week — once you like the oak character, rack off immediately. Oak contact is not reversible. Pyments and traditional meads benefit most; light fruit melomels can be overwhelmed by oak.' },
        { emoji: '📦', title: 'Bottling & Carbonation', body: 'Still mead: stabilize first, then bottle in wine bottles with corks. For bottle-conditioned sparkling mead: do NOT stabilize — add priming sugar (¾ cup corn sugar per 5 gal) and bottle in pressure-rated bottles (beer bottles or champagne bottles). Carbonate at room temp for 2–3 weeks, then cold store to arrest fermentation. Force carbonation: transfer to a keg, cold-crash, then carbonate at 30 PSI for 24 hours.' },
        { emoji: '🧫', title: 'Yeast Rehydration & Pitch Rate', body: 'Dry yeast must be properly rehydrated before pitching. Sprinkle into 104°F (40°C) water at 10x the yeast volume. Wait 15 minutes without stirring. Gently acclimate to must temperature by adding small amounts of must to the slurry over 30 minutes — temperature shock kills yeast cells. Pitch rate: 1 packet (5g) per 1–5 gallons for typical OG. High gravity (1.120+): use 2 packets or make a starter.' },
        { emoji: '📊', title: 'Reading a Hydrometer Correctly', body: 'A hydrometer measures liquid density vs. pure water (1.000). Float it in a graduated cylinder filled with your sample. Read the number at the bottom of the meniscus (the curved surface of liquid). Most hydrometers are calibrated for 60°F — apply a temperature correction (add 0.001 per 10°F above 60°F). Take readings in a clean sample cylinder, not directly in the fermenter. Rinse between readings to avoid cross-contamination.' },
      ]
    },
    {
      id: 'equipment', emoji: '⚗️', title: 'Equipment & Ingredients',
      entries: [
        { emoji: '🫙', title: 'Primary Fermenter', body: 'Glass carboys (3–6 gallon) are the gold standard for mead: impermeable to oxygen, easy to observe, and do not scratch. Food-grade HDPE plastic buckets (6.5 gallon) work well for primary but absorb odors over time and develop micro-scratches that harbor bacteria. Wide-mouth buckets are easier to clean. Always inspect glass for cracks before use — especially around the neck and base.' },
        { emoji: '🔒', title: 'Airlock & Bung', body: 'The airlock creates a one-way valve: CO₂ produced by fermentation pushes out through water or sanitizer solution, while outside air cannot enter. Three-piece airlocks are easier to clean than S-shaped airlocks. Fill with Star San solution, not water — if the fermenter cools and creates negative pressure, you want sanitizer, not water, to be drawn back in. Replace the bung if it doesn\'t fit snugly.' },
        { emoji: '📏', title: 'Hydrometer & Refractometer', body: 'Hydrometers measure specific gravity in 15–20mL samples taken with a wine thief. Refractometers measure sugar concentration (Brix) with a 2-drop sample — but refractometers become inaccurate in the presence of alcohol and require a correction formula during active fermentation. Use a hydrometer for FG readings. Keep both clean and store hydrometers horizontally to prevent warping.' },
        { emoji: '🧴', title: 'Star San & Sanitization', body: 'One-step no-rinse sanitizer. Mix 1 oz (30mL) per 5 gallons of water. "Don\'t fear the foam" — the foam is harmless and will not affect flavor at proper dilution. Spray everything that contacts your mead: auto-siphon, tubing, airlocks, bungs, wine thiefs, spoons, even your hands. Sanitize first, then sanitize again. The leading cause of mead failures is inadequate sanitation. Star San has a 200:1 dilution ratio — it goes a long way.' },
        { emoji: '🔧', title: 'Auto-Siphon & Tubing', body: 'An auto-siphon allows racking with one hand and minimal oxygen exposure. Choose 1/2" diameter for 5-gallon batches. Sanitize the entire assembly including inside the tubing. Use a hose clamp or pinch clamp to stop and start flow without letting air back in. Store tubing loosely coiled — tight coiling causes permanent kinks. Replace silicone tubing annually or when it becomes cloudy or stiff.' },
        { emoji: '🦠', title: 'Nutrients: Complete Guide', body: 'Fermaid-O: organic nitrogen from inactivated yeast. Preferred for TOSNA — no off-flavors, no ammonia smell. Fermaid-K: inorganic + organic nitrogen blend; use at reduced rates (half of Fermaid-O). DAP (Diammonium Phosphate): pure inorganic nitrogen; use only for very early fermentation. Vitamin B1 (thiamine): prevents H₂S production. GoFerm: yeast rehydration nutrient — add before pitching. Energizer blends vary by brand.' },
        { emoji: '🌡️', title: 'Temperature Control', body: 'Temperature control is the single biggest upgrade most home mead makers can make. Options: a spare refrigerator with an Inkbird temperature controller (set to your target with a 1°F differential), a fermentation chamber built from a chest freezer, or an aquarium heater in a water bath surrounding your carboy. Even cheap insulation (a sleeping bag wrapped around the carboy) reduces temperature swings significantly.' },
        { emoji: '🍾', title: 'Bottling Equipment', body: 'Wine bottles (750mL, 375mL) with natural cork for still mead — use a double-lever floor corker for the cleanest seal. Wax seal for presentation meads. For sparkling/carbonated: 22oz glass beer bottles with crown caps (bottle capper) or pressure-rated PET bottles. Never bottle sparkling mead in regular wine bottles — the CO₂ pressure will shatter them. Champagne bottles are rated for higher pressure and work well.' },
      ]
    },
    {
      id: 'troubleshoot', emoji: '🛠️', title: 'Troubleshooting',
      entries: [
        { emoji: '💨', title: 'Rotten Egg / H₂S Smell', body: 'The most common mead problem: hydrogen sulfide (H₂S) produced by stressed yeast. Causes: insufficient nitrogen (most common), temperature stress, zinc deficiency, and certain yeast strains. Fix: degas vigorously by stirring to drive off H₂S gas, then add appropriate nutrients. Copper contact (a clean copper pipe stirred briefly) can help by binding H₂S as copper sulfide. If persistent, add FermaidO + splash rack.' },
        { emoji: '🚫', title: 'Stuck Fermentation', body: 'Fermentation stops before reaching target FG. Causes: pH too low (below 3.0), temperature too cold, excessive sugar (osmotic stress, OG > 1.150), nutrient deficiency, or yeast intolerance to alcohol level. Diagnosis: check pH first, then temperature. Fix: adjust pH to 3.7–4.0 with K-bicarb, warm to 65–70°F, add Go-Ferm + new yeast packet rehydrated and acclimated. EC-1118 can restart most stuck fermentations.' },
        { emoji: '🧊', title: 'Mead Won\'t Clear', body: 'Causes: pectin haze (from fruit — use pectic enzyme), protein haze, yeast haze (needs more time/cold). Solutions: cold crash at 34°F for 2+ weeks. Use Kieselsol (negative charge) followed 24 hours later by Chitosan (positive charge) — the complementary charges attract each other, pulling particles out of suspension. Bentonite added at fermentation start prevents most protein haze. Sparkolloid works for stubborn yeast haze.' },
        { emoji: '🍋', title: 'Too Tart or Too Sweet', body: 'Over-tart: add potassium bicarbonate (½ tsp/5gal, test, repeat) to raise pH and reduce perceived acidity. Also try sweetening — sweetness masks tartness. Under-tart/flat: add tartaric or malic acid (½ tsp/5gal increments). Too sweet: let it ferment longer if yeast tolerance allows, or pitch EC-1118 to consume more sugar. Too dry: back-sweeten after stabilization with honey.' },
        { emoji: '🍌', title: 'Banana / Solvent Off-Flavors', body: 'Banana (isoamyl acetate): fermented too warm, usually above 72–75°F. Time and temperature management help — most isoamyl acetate mellows with 6–12 months of aging. Solvent/paint thinner (ethyl acetate): indicates wild yeast contamination or stressed fermentation. Improve sanitation. Nail polish: acetaldehyde — usually from fermentation that was stopped prematurely. Allow complete fermentation and add SO₂.' },
        { emoji: '💥', title: 'Bottle Bombs Prevention', body: 'Re-fermentation in the bottle creates CO₂ pressure that can shatter glass and cause serious injury. Prevention: (1) Confirm FG is stable across 3+ consecutive readings over 14+ days. (2) Ensure FG is at or below target FG for your yeast. (3) If back-sweetening, ALWAYS stabilize with K-meta + K-sorbate first, then wait 24–48 hours before adding honey and bottling. (4) For still mead, store bottles at cellar temperature and monitor the first batch carefully.' },
        { emoji: '🤢', title: 'Vinegar / Acetic Off-Flavor', body: 'Acetic acid (vinegar) is produced by Acetobacter bacteria when alcohol is exposed to oxygen. This is almost always a sanitation failure or oxygen exposure during racking. Once vinegar contamination is established, it cannot be reversed — the batch is usually unsalvageable. Prevention is absolute: sanitize everything, minimize headspace, rack carefully to avoid splashing, and purge vessels with CO₂ or argon if possible.' },
        { emoji: '🐛', title: 'Fruit Flies & Contamination', body: 'Fruit flies carry wild yeast (Brettanomyces/Dekkera) and acetobacter on their bodies. A single fruit fly getting into your fermenter can infect the entire batch. Always use a functioning airlock with liquid, seal all openings with airlocks or foil during initial aerobic phase, and keep your brewing area clean. Dispose of all spent fruit promptly. Fruit fly traps near your fermentation area are cheap insurance.' },
      ]
    }
  ],

  glossary: [
    { term: 'Must', def: 'Unfermented honey-water mixture before yeast is added.' },
    { term: 'OG', def: 'Original Gravity — specific gravity of must before fermentation begins.' },
    { term: 'FG', def: 'Final Gravity — specific gravity when fermentation is complete.' },
    { term: 'ABV', def: 'Alcohol By Volume — percentage of ethanol in the finished mead.' },
    { term: 'PPG', def: 'Points Per Pound Per Gallon — sugar yield of an ingredient per unit.' },
    { term: 'YAN', def: 'Yeast Assimilable Nitrogen — nitrogen compounds usable by yeast.' },
    { term: 'TOSNA', def: 'Tailored Organic Staggered Nutrient Addition — the gold-standard nutrient protocol.' },
    { term: 'Attenuation', def: 'Percentage of sugars consumed by yeast during fermentation.' },
    { term: 'Lees', def: 'Sediment of dead yeast cells and particulates that settle during fermentation.' },
    { term: 'Racking', def: 'Transferring mead from one vessel to another, leaving lees behind.' },
    { term: 'Clarification', def: 'Process of removing particles to achieve clear, bright mead.' },
    { term: 'Fining', def: 'Using clarifying agents (bentonite, chitosan) to remove haze.' },
    { term: 'Back-sweetening', def: 'Adding honey after stabilization to increase residual sweetness.' },
    { term: 'Stabilization', def: 'Adding K-meta + K-sorbate to stop re-fermentation before bottling.' },
    { term: 'Cold Crash', def: 'Chilling mead near freezing to rapidly drop yeast and sediment.' },
    { term: 'Autolysis', def: 'Yeast self-digestion producing rubbery off-flavors — avoid by racking on time.' },
    { term: 'Fusel Alcohols', def: 'Higher alcohols produced at warm temperatures; cause harsh, headachy character.' },
    { term: 'Ester', def: 'Fruity flavor compounds produced by yeast during fermentation.' },
    { term: 'H₂S', def: 'Hydrogen sulfide — rotten egg smell from nutrient-deficient fermentation.' },
    { term: 'Bochet', def: 'Mead made with caramelized/burned honey for toasty, complex flavors.' },
    { term: 'Melomel', def: 'Mead made with fruit additions.' },
    { term: 'Pyment', def: 'Mead fermented with grapes or grape juice.' },
    { term: 'Cyser', def: 'Mead fermented with apple juice.' },
    { term: 'Metheglin', def: 'Mead with herb or spice additions.' },
  ]
};

// ── AI Companion System Prompt ─────────────────────────────────────────
const AI_SYSTEM_PROMPT = `You are Skáld, the AI Mead Master — a wise Viking brewing companion with deep scientific and historical knowledge of mead. You speak with warmth, expertise, and occasional Viking flair (but never overdone). 

Your knowledge includes:
SCIENCE: Fermentation chemistry (C₆H₁₂O₆ → 2C₂H₅OH + 2CO₂), PPG calculations (~37 for honey), advanced ABV formula (76.08*(OG-FG)/(1.775-OG))*(FG/0.794), TOSNA nutrient protocols, yeast attenuation and tolerance, pH management (3.5-4.0 ideal), water activity and hygroscopy, clarification agents, stabilization chemistry (K-meta + K-sorbate), ester production, fusel alcohol formation, hydrogen sulfide causes and remedies.

MEAD STYLES: Traditional, Melomel (fruit), Metheglin (spices), Cyser (apple), Pyment (grape), Bochet (burnt honey), Braggot (hops+grain), Capsicumel (chili), Acerglyn (maple+honey), Tej (Ethiopian, Gesho), Chouchen (Breton).

HONEY VARIETIES: Wildflower (~37 PPG), Clover (~38 PPG), Orange Blossom (~37 PPG), Buckwheat (~36 PPG), Acacia (~38 PPG), Manuka (~37 PPG), Tupelo, Linden, and many more. Each contributes unique flavor compounds.

YEAST STRAINS: Lalvin 71B (fruity, 14% tol), EC-1118 (neutral, 18% tol), D47 (floral, MUST stay below 65°F), K1-V1116 (vigorous, 18% tol), Sweet Mead strains, WLP720, Mangrove Jack M05.

HISTORY: 7000 BCE China, Greek Ambrosia, Viking Mead of Poetry (Kvasir's blood), Heidrun goat in Valhalla, medieval monasteries, Vedic Soma, Ethiopian Tej traditions, Viking maritime brewing.

When designing recipes:
1. Ask about their flavor preferences, experience level, target ABV, batch size, and available equipment if not provided
2. Provide a COMPLETE recipe with: honey type + amount, target OG, yeast strain, expected FG, estimated ABV (using advanced formula), water amount, TOSNA nutrient schedule, fruit/spice suggestions with timing
3. Explain the science behind your choices
4. Include potential pitfalls and pro tips
5. Suggest aging and serving recommendations

Format recipes clearly using **bold** for ingredient names and *italic* for technical terms. Always show calculated OG, FG, and ABV.

Use occasional Viking/Norse references naturally: "By Odin's mead horn", "worthy of Valhalla", "the Norns themselves could not have blended better" — but keep it tasteful and not overdone.`;

// ═══════════════════════════════════════════════════════════════════════
//  DOM Rendering Functions
// ═══════════════════════════════════════════════════════════════════════

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'cls') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

function html(str) {
  const d = document.createElement('div');
  d.innerHTML = str;
  return d.firstElementChild;
}

// ── Stat Badge ─────────────────────────────────────────────────────────
function statBadge(val, lbl, cls = '') {
  return html(`<div class="stat-badge ${cls}"><span class="stat-val">${val}</span><span class="stat-lbl">${lbl}</span></div>`);
}

// ── Section Label ──────────────────────────────────────────────────────
function sectionLabel(text) {
  return html(`<div class="section-label">${text}</div>`);
}

// ── Info Box ───────────────────────────────────────────────────────────
function infoBox(msg, cls = 'info-gold') {
  return html(`<div class="info-box ${cls}">${msg}</div>`);
}

// ═══════════════════════════════════════════════════════════════════════
//  TAB: MY BREWS
// ═══════════════════════════════════════════════════════════════════════

function renderBrewsTab() {
  const el = document.createElement('div');

  if (State.selectedBrew !== null) {
    el.appendChild(renderBrewDetail(State.selectedBrew));
    return el;
  }

  const header = html(`<div class="flex-between mb-2">
    <div><h2 class="page-title">⚓ My Brews</h2>
    <p class="page-subtitle">Track your mead fleet, Viking.</p></div>
  </div>`);

  const newBtn = h('button', { cls: 'btn btn-primary', onClick: () => { State.selectedBrew = 'new'; renderApp(); } }, '⚔️ New Batch');
  header.appendChild(newBtn);
  el.appendChild(header);

  if (State.brews.length === 0) {
    el.appendChild(html(`<div class="empty-state"><div class="empty-icon">🍯</div><p>No brews yet, Viking.<br>Begin your mead legend.</p></div>`));
    return el;
  }

  const grid = h('div', { cls: 'grid-auto' });
  State.brews.forEach((brew, idx) => {
    const abv = Science.abv(brew.ogReading, brew.currentGravity);
    const progress = Math.min(100, Math.max(0, Math.round(((brew.ogReading - brew.currentGravity) / (brew.ogReading - brew.targetFG)) * 100)));
    const days = Science.daysSince(brew.startDate);
    const stab = Science.stabStatus(brew);
    const showRack = brew.status === 'Fermenting' && days > 30;

    const card = html(`<div class="brew-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="brew-emoji">${brew.emoji}</div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
          <span class="status-badge status-${brew.status.toLowerCase()}">${brew.status}</span>
          <span class="small text-dim">Day ${days}</span>
        </div>
      </div>
      <div class="brew-name">${brew.name}</div>
      <div class="brew-meta">${brew.type} · ${brew.honey} honey</div>
      ${showRack ? '<div class="info-box info-amber" style="margin-bottom:8px;font-size:0.8rem">🍷 Time to rack! (${days} days)</div>' : ''}
      <div class="grid-stat" style="margin-bottom:10px">
        <div class="stat-badge amber"><span class="stat-val">${abv}%</span><span class="stat-lbl">Est. ABV</span></div>
        <div class="stat-badge"><span class="stat-val">${brew.currentGravity.toFixed(3)}</span><span class="stat-lbl">Current SG</span></div>
        <div class="stat-badge sea"><span class="stat-val">${progress}%</span><span class="stat-lbl">Progress</span></div>
      </div>
      <div class="progress-track" style="margin-bottom:10px"><div class="progress-fill" style="width:${progress}%"></div></div>
      <span class="status-badge ${stab.cls}" style="font-size:0.65rem">${stab.label}</span>
    </div>`);

    card.querySelector('.info-amber')?.querySelector('[data-days]');
    if (showRack) card.querySelector('.info-amber').textContent = `🍷 Time to rack! (${days} days since start)`;

    card.addEventListener('click', () => { State.selectedBrew = idx; renderApp(); });
    grid.appendChild(card);
  });

  el.appendChild(grid);
  return el;
}

// ── Brew Detail ────────────────────────────────────────────────────────
function renderBrewDetail(idx) {
  if (idx === 'new') return renderNewBrewForm();

  const brew = State.brews[idx];
  const el = document.createElement('div');
  const days = Science.daysSince(brew.startDate);
  const stab = Science.stabStatus(brew);
  const abvNow = Science.abv(brew.ogReading, brew.currentGravity);
  const abvProj = Science.abv(brew.ogReading, brew.targetFG);
  const progress = Math.min(100, Math.max(0, Math.round(((brew.ogReading - brew.currentGravity) / (brew.ogReading - brew.targetFG)) * 100)));
  const waterL = Science.waterL(brew.lbsHoney, brew.gallons);
  const tosnaG = Science.tosnaGrams(brew.gallons);

  const backBtn = h('button', { cls: 'btn btn-ghost btn-sm', style: 'margin-bottom:16px', onClick: () => { State.selectedBrew = null; renderApp(); } }, '← Back to Fleet');
  const printBtn = h('button', { cls: 'btn btn-secondary btn-sm', style: 'margin-bottom:16px;margin-left:8px', onClick: () => doPrint(brew) }, '🖨️ Print Recipe Card');
  el.appendChild(h('div', { cls: 'flex-row' }, backBtn, printBtn));

  // Rack banner
  if (brew.status === 'Fermenting' && days > 30) {
    el.appendChild(html(`<div class="rack-banner">
      <div class="rack-banner-icon">🍷</div>
      <div class="rack-banner-text">
        <strong>Time to Rack, Viking!</strong>
        <span>${days} days since brew day. Heavy lees have settled — transfer to a clean vessel to prevent autolysis off-flavors.</span>
      </div>
    </div>`));
  }

  // Main stats card
  const statsCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  statsCard.appendChild(html(`<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
    <span style="font-size:3rem">${brew.emoji}</span>
    <div style="flex:1">
      <div style="font-family:'Cinzel',serif;font-size:1.3rem;color:var(--text-bright)">${brew.name}</div>
      <div class="small text-dim italic">${brew.type} · ${brew.honey} honey · Started ${brew.startDate} · Day ${days}</div>
    </div>
    <span class="status-badge ${stab.cls}">${stab.label}</span>
  </div>`));

  const statRow = h('div', { cls: 'grid-stat', style: 'margin-bottom:12px' });
  [
    [brew.ogReading.toFixed(3), 'OG', 'gold'],
    [brew.currentGravity.toFixed(3), 'Current SG', 'amber'],
    [brew.targetFG.toFixed(3), 'Target FG', ''],
    [`${abvNow}%`, 'ABV Now', 'amber'],
    [`${abvProj}%`, 'ABV Projected', 'sea'],
    [days, 'Days Active', 'iron'],
  ].forEach(([v, l, c]) => statRow.appendChild(statBadge(v, l, c)));
  statsCard.appendChild(statRow);

  statsCard.appendChild(html(`<div style="margin-bottom:10px">
    <div class="flex-between small text-dim" style="margin-bottom:4px"><span>Fermentation Progress</span><span>${progress}%</span></div>
    <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
  </div>`));

  statsCard.appendChild(html(`<div class="flex-row gap-sm">
    <div class="info-box info-sea" style="flex:1">📅 Est. Bottle Date: <strong>${Science.addMonths(brew.startDate, 3)}</strong></div>
    <div class="info-box info-gold" style="flex:1">🏆 Peak Drinking: <strong>${Science.addMonths(brew.startDate, 6)}+</strong></div>
  </div>`));

  if (brew.notes) statsCard.appendChild(infoBox(`📝 ${brew.notes}`, 'info-gold'));
  el.appendChild(statsCard);

  // Grid: recipe + health
  const grid2 = h('div', { cls: 'grid-2', style: 'margin-bottom:14px' });

  const recipeCard = h('div', { cls: 'card' });
  recipeCard.appendChild(html(`<div class="card-title">Recipe Details</div>`));
  recipeCard.appendChild(html(`<div style="font-size:0.88rem;line-height:2">
    <div>🍯 <strong>${brew.honey}</strong> honey — ${brew.lbsHoney} lbs</div>
    <div>💧 Water: <strong style="color:var(--sea-light)">${waterL.toFixed(1)} L</strong> (${Science.waterGal(brew.lbsHoney, brew.gallons).toFixed(2)} gal)</div>
    <div>🫧 Batch: ${brew.gallons} gallons</div>
    <div>🦠 Yeast: ${brew.yeast}</div>
    ${brew.fruits.length ? `<div>🍓 Fruits: ${brew.fruits.join(', ')}</div>` : ''}
    ${brew.spices.length ? `<div>🌿 Spices: ${brew.spices.join(', ')}</div>` : ''}
    <div class="italic text-dim" style="margin-top:4px">${Science.style(brew.currentGravity)} mead</div>
  </div>`));
  grid2.appendChild(recipeCard);

  // Health card
  const healthCard = h('div', { cls: 'card' });
  healthCard.appendChild(html(`<div class="card-title">Batch Health 🌡️</div>`));

  const phInput = h('input', { type: 'number', cls: 'form-input', value: brew.ph || '', placeholder: 'e.g. 3.7', step: '0.1', min: '2', max: '7', style: 'margin-bottom:8px' });
  const tempInput = h('input', { type: 'number', cls: 'form-input', value: brew.temp || '', placeholder: 'e.g. 68°F', step: '1', min: '40', max: '100' });

  healthCard.appendChild(sectionLabel('Current pH'));
  healthCard.appendChild(phInput);

  const phAdv = document.createElement('div');
  const updatePhAdv = () => {
    const a = Science.phAdvice(phInput.value);
    phAdv.innerHTML = '';
    if (a) phAdv.appendChild(infoBox(a.msg, a.cls));
  };
  phInput.addEventListener('input', updatePhAdv);
  updatePhAdv();
  healthCard.appendChild(phAdv);

  healthCard.appendChild(sectionLabel('Temperature (°F)'));
  healthCard.appendChild(tempInput);

  const tempAdv = document.createElement('div');
  const updateTempAdv = () => {
    const a = Science.tempAdvice(tempInput.value, brew.yeast);
    tempAdv.innerHTML = '';
    if (a) tempAdv.appendChild(infoBox(a.msg, a.cls));
  };
  tempInput.addEventListener('input', updateTempAdv);
  updateTempAdv();
  healthCard.appendChild(tempAdv);

  const saveHealthBtn = h('button', { cls: 'btn btn-secondary btn-sm btn-full', style: 'margin-top:10px',
    onClick: () => {
      brew.ph = phInput.value; brew.temp = tempInput.value;
      State.persist();
      saveHealthBtn.textContent = '✓ Saved';
      setTimeout(() => saveHealthBtn.textContent = '💾 Save Health Data', 1500);
    }
  }, '💾 Save Health Data');
  healthCard.appendChild(saveHealthBtn);
  grid2.appendChild(healthCard);
  el.appendChild(grid2);

  // TOSNA tracker
  const tosnaCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  tosnaCard.appendChild(html(`<div class="card-title">TOSNA Nutrient Tracker 🧬</div>`));
  tosnaCard.appendChild(html(`<div class="small text-dim italic" style="margin-bottom:10px">~${tosnaG}g Fermaid-O per addition · Click to check off</div>`));
  if (!brew.tosnaChecked) brew.tosnaChecked = { t0: false, t24: false, t48: false, t13: false };
  DATA.tosnaSteps.forEach(step => {
    const done = brew.tosnaChecked[step.id];
    const item = html(`<div class="tosna-item ${done ? 'done' : ''}">
      <div class="tosna-check">${done ? '✓' : ''}</div>
      <div>
        <div class="tosna-label">${step.icon} ${step.label}</div>
        <div class="tosna-sub">${step.sub}</div>
      </div>
    </div>`);
    item.addEventListener('click', () => {
      brew.tosnaChecked[step.id] = !brew.tosnaChecked[step.id];
      State.persist();
      const subEl = item.querySelector('.tosna-item');
      // Re-render TOSNA card only
      renderApp();
    });
    tosnaCard.appendChild(item);
  });
  tosnaCard.appendChild(infoBox('💡 After fermentation is stable: add K-meta (¼ tsp/5gal) + K-sorbate (½ tsp/5gal). Wait 24hrs before back-sweetening.', 'info-amber'));
  el.appendChild(tosnaCard);

  // Gravity log
  const gravCard = h('div', { cls: 'card' });
  gravCard.appendChild(html(`<div class="card-title">Gravity Log 📊</div>`));

  const gravInput = h('input', { type: 'number', cls: 'form-input', placeholder: 'e.g. 1.045', step: '0.001', min: '0.990', max: '1.200', style: 'flex:1' });
  const noteInput = h('input', { type: 'text', cls: 'form-input', placeholder: 'Note (optional)', style: 'flex:2' });
  const logBtn = h('button', { cls: 'btn btn-primary btn-sm',
    onClick: () => {
      const g = parseFloat(gravInput.value);
      if (!g || g < 0.99 || g > 1.2) return;
      if (!brew.readings) brew.readings = [];
      brew.readings.push({ date: new Date().toLocaleDateString(), gravity: g, note: noteInput.value });
      brew.currentGravity = g;
      State.persist();
      gravInput.value = ''; noteInput.value = '';
      renderApp();
    }
  }, '⚓ Log');
  gravCard.appendChild(h('div', { cls: 'flex-row', style: 'margin-bottom:12px' }, gravInput, noteInput, logBtn));

  if (!brew.readings || brew.readings.length === 0) {
    gravCard.appendChild(html(`<div class="text-dim italic small" style="text-align:center;padding:12px">No readings yet — log your first gravity!</div>`));
  } else {
    const logDiv = h('div');
    brew.readings.forEach((r, i) => {
      const prevSame = i > 0 && Math.abs(brew.readings[i-1].gravity - r.gravity) <= 0.001;
      const row = html(`<div class="reading-row">
        <span class="reading-date">${r.date}</span>
        <span class="reading-grav">${r.gravity.toFixed(3)}</span>
        <span class="reading-abv">${Science.abv(brew.ogReading, r.gravity)}% ABV</span>
        ${prevSame ? '<span class="reading-stable">📌 Stable</span>' : ''}
        ${r.note ? `<span class="reading-note">${r.note}</span>` : ''}
      </div>`);
      logDiv.appendChild(row);
    });
    gravCard.appendChild(logDiv);
  }
  el.appendChild(gravCard);
  return el;
}

// ── New Brew Form ──────────────────────────────────────────────────────
function renderNewBrewForm() {
  const form = {
    name: '', type: 'Traditional', emoji: '🍯', status: 'Planning',
    honey: 'Wildflower', lbsHoney: 15, gallons: 5,
    yeast: 'Lalvin 71B', fruits: [], spices: [],
    ogReading: 1.100, currentGravity: 1.100, targetFG: 1.010,
    startDate: new Date().toISOString().split('T')[0], notes: '',
    readings: [], ph: '', temp: '',
    tosnaChecked: { t0: false, t24: false, t48: false, t13: false }
  };

  const el = document.createElement('div');
  el.appendChild(h('button', { cls: 'btn btn-ghost btn-sm', style: 'margin-bottom:16px', onClick: () => { State.selectedBrew = null; renderApp(); } }, '← Cancel'));
  el.appendChild(html(`<h2 class="page-title" style="margin-bottom:20px">⚔️ New Batch</h2>`));

  function field(label, key, type = 'text', extra = {}) {
    const grp = h('div', { cls: 'form-group' });
    grp.appendChild(html(`<label class="form-label">${label}</label>`));
    if (type === 'select') {
      const sel = h('select', { cls: 'form-select' });
      (extra.options || []).forEach(o => {
        const opt = h('option', { value: o.value || o }, typeof o === 'object' ? o.label : o);
        if ((o.value || o) === form[key]) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', e => {
        form[key] = isNaN(e.target.value) ? e.target.value : parseFloat(e.target.value) || e.target.value;
        if (key === 'yeast') {
          const y = DATA.yeasts.find(y => y.name === e.target.value);
          if (y) form.targetFG = parseFloat(Science.fg(form.ogReading, y.att).toFixed(3));
          rerenderCalcPanel();
        }
        if (['lbsHoney', 'gallons', 'ogReading'].includes(key)) rerenderCalcPanel();
      });
      grp.appendChild(sel);
    } else {
      const inp = h('input', { type, cls: 'form-input', value: form[key], placeholder: extra.ph || '', step: extra.step || '', min: extra.min || '', max: extra.max || '' });
      inp.addEventListener('input', e => {
        form[key] = type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
        if (['lbsHoney', 'gallons', 'ogReading'].includes(key)) rerenderCalcPanel();
      });
      grp.appendChild(inp);
    }
    return grp;
  }

  // Basics
  const basicsCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  basicsCard.appendChild(html(`<div class="card-title">Basics</div>`));
  const basicsGrid = h('div', { cls: 'grid-2' });
  basicsGrid.appendChild(field('Brew Name', 'name'));
  basicsGrid.appendChild(field('Type', 'type', 'select', { options: DATA.meadTypes }));
  basicsGrid.appendChild(field('Emoji', 'emoji', 'select', { options: DATA.emojis }));
  basicsGrid.appendChild(field('Start Date', 'startDate', 'date'));
  basicsGrid.appendChild(field('Status', 'status', 'select', { options: ['Planning', 'Fermenting', 'Conditioning', 'Bottled'] }));
  basicsCard.appendChild(basicsGrid);
  el.appendChild(basicsCard);

  // Honey & Batch
  const honeyCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  honeyCard.appendChild(html(`<div class="card-title">Honey & Batch</div>`));
  const honeyGrid = h('div', { cls: 'grid-2' });
  honeyGrid.appendChild(field('Honey Type', 'honey', 'select', { options: DATA.honeys.map(h => h.name) }));
  honeyGrid.appendChild(field('Honey Amount (lbs)', 'lbsHoney', 'number', { step: '0.5', min: '1', max: '50' }));
  honeyGrid.appendChild(field('Batch Volume (gal)', 'gallons', 'number', { step: '0.5', min: '0.5', max: '20' }));
  honeyGrid.appendChild(field('Starting Gravity (OG)', 'ogReading', 'number', { step: '0.001', min: '1.000', max: '1.200' }));
  honeyCard.appendChild(honeyGrid);

  const calcPanel = document.createElement('div');
  const rerenderCalcPanel = () => {
    calcPanel.innerHTML = '';
    const estOG = Science.og(form.lbsHoney, form.gallons);
    const wL = Science.waterL(form.lbsHoney, form.gallons);
    calcPanel.appendChild(html(`<div class="flex-row" style="margin-top:10px;gap:8px">
      <div class="info-box info-gold" style="flex:1">🍯 Est. OG from ${form.lbsHoney}lb / ${form.gallons}gal: <strong>${estOG.toFixed(3)}</strong></div>
      <div class="info-box info-sea" style="flex:1">💧 Water to add: <strong>${wL.toFixed(1)} L</strong> (${Science.waterGal(form.lbsHoney, form.gallons).toFixed(2)} gal)</div>
    </div>`));
  };
  rerenderCalcPanel();
  honeyCard.appendChild(calcPanel);
  el.appendChild(honeyCard);

  // Yeast
  const yeastCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  yeastCard.appendChild(html(`<div class="card-title">Yeast Selection</div>`));
  const yeastGrid = h('div', { cls: 'grid-2' });
  yeastGrid.appendChild(field('Yeast Strain', 'yeast', 'select', { options: DATA.yeasts.map(y => y.name) }));
  yeastGrid.appendChild(field('Target FG', 'targetFG', 'number', { step: '0.001', min: '0.990', max: '1.100' }));
  yeastCard.appendChild(yeastGrid);
  yeastCard.appendChild(infoBox(`🦠 ${DATA.yeasts[0].note}`, 'info-gold'));
  el.appendChild(yeastCard);

  // Fruits
  const fruitCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  fruitCard.appendChild(html(`<div class="card-title">Fruits 🍓</div>`));
  const fruitPills = h('div', { cls: 'pill-group' });
  DATA.fruits.forEach(fr => {
    const pill = html(`<div class="pill">${fr.emoji} ${fr.name}</div>`);
    pill.addEventListener('click', () => {
      const i = form.fruits.indexOf(fr.name);
      if (i >= 0) { form.fruits.splice(i, 1); pill.classList.remove('active'); }
      else { form.fruits.push(fr.name); pill.classList.add('active'); }
    });
    fruitPills.appendChild(pill);
  });
  fruitCard.appendChild(fruitPills);
  el.appendChild(fruitCard);

  // Spices
  const spiceCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  spiceCard.appendChild(html(`<div class="card-title">Spices & Herbs 🌿</div>`));
  const spicePills = h('div', { cls: 'pill-group' });
  DATA.spices.forEach(sp => {
    const pill = html(`<div class="pill">${sp.emoji} ${sp.name}</div>`);
    pill.addEventListener('click', () => {
      const i = form.spices.indexOf(sp.name);
      if (i >= 0) { form.spices.splice(i, 1); pill.classList.remove('active-amber'); }
      else { form.spices.push(sp.name); pill.classList.add('active-amber'); }
    });
    spicePills.appendChild(pill);
  });
  spiceCard.appendChild(spicePills);
  el.appendChild(spiceCard);

  // Notes
  const notesCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  notesCard.appendChild(html(`<div class="card-title">Notes & Battle Plans 📜</div>`));
  const ta = h('textarea', { cls: 'form-textarea', placeholder: 'Goals, inspirations, plans...' });
  ta.addEventListener('input', e => form.notes = e.target.value);
  notesCard.appendChild(ta);
  el.appendChild(notesCard);

  const saveBtn = h('button', { cls: 'btn btn-primary btn-lg btn-full',
    onClick: () => {
      if (!form.name.trim()) { alert('Give your brew a name, Viking!'); return; }
      State.brews.unshift({ ...form, id: Date.now() });
      State.selectedBrew = null;
      State.persist();
      renderApp();
    }
  }, '⚔️ Log This Brew!');
  el.appendChild(saveBtn);
  return el;
}

// ═══════════════════════════════════════════════════════════════════════
//  TAB: RECIPE BUILDER
// ═══════════════════════════════════════════════════════════════════════

function renderRecipeTab() {
  const s = {
    gallons: 5, targetOG: 1.100, honeyType: 'Wildflower', yeast: 'Lalvin 71B',
    fruits: [], spices: [], fruitAmt: {}, tosna: { t0: false, t24: false, t48: false, t13: false }
  };
  const el = document.createElement('div');
  el.appendChild(html(`<h2 class="page-title">⚗️ Recipe Builder</h2><p class="page-subtitle">Design your next legendary brew.</p>`));

  // Controls
  const ctrlCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  ctrlCard.appendChild(html(`<div class="card-title">Batch Goals</div>`));
  const ctrlGrid = h('div', { cls: 'grid-2 mb-2' });

  function mkInput(lbl, key, type = 'number', extra = {}) {
    const g = h('div', { cls: 'form-group' });
    g.appendChild(html(`<label class="form-label">${lbl}</label>`));
    if (type === 'select') {
      const sel = h('select', { cls: 'form-select' });
      (extra.opts || []).forEach(o => {
        const opt = h('option', { value: o.value !== undefined ? o.value : o }, o.label || o);
        if ((o.value !== undefined ? o.value : o) == s[key]) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', e => { s[key] = isNaN(e.target.value) ? e.target.value : parseFloat(e.target.value) || e.target.value; updateStats(); });
      g.appendChild(sel);
    } else {
      const inp = h('input', { type, cls: 'form-input', value: s[key], step: extra.step || '', min: extra.min || '', max: extra.max || '' });
      inp.addEventListener('input', e => { s[key] = parseFloat(e.target.value) || 0; updateStats(); });
      g.appendChild(inp);
    }
    return g;
  }

  ctrlGrid.appendChild(mkInput('Batch Size (gal)', 'gallons', 'number', { step: '0.5', min: '0.5', max: '20' }));
  ctrlGrid.appendChild(mkInput('Target OG', 'targetOG', 'select', {
    opts: [
      { value: 1.060, label: '1.060 — Light (~6% ABV)' }, { value: 1.080, label: '1.080 — Session (~8%)' },
      { value: 1.100, label: '1.100 — Standard (~10%)' }, { value: 1.120, label: '1.120 — Strong (~12%)' },
      { value: 1.150, label: '1.150 — Very Strong (~15%)' }, { value: 1.180, label: '1.180 — Sack Mead (~18%)' },
    ]
  }));
  ctrlGrid.appendChild(mkInput('Honey Type', 'honeyType', 'select', { opts: DATA.honeys.map(h => h.name) }));
  ctrlGrid.appendChild(mkInput('Yeast Strain', 'yeast', 'select', { opts: DATA.yeasts.map(y => y.name) }));
  ctrlCard.appendChild(ctrlGrid);
  el.appendChild(ctrlCard);

  // Stats + water panel
  const statsPanel = document.createElement('div');
  const tosnaPanel = document.createElement('div');
  const updateStats = () => {
    const hn = Science.honeyFor(s.targetOG, s.gallons);
    const yd = DATA.yeasts.find(y => y.name === s.yeast);
    const fg = yd ? Science.fg(s.targetOG, yd.att) : 1.010;
    const abv = Science.abv(s.targetOG, fg);
    const wL = Science.waterL(hn, s.gallons);
    const tg = Science.tosnaGrams(s.gallons);

    statsPanel.innerHTML = '';
    const sg = h('div', { cls: 'grid-2', style: 'margin-bottom:14px' });

    const recipeCard = h('div', { cls: 'card' });
    recipeCard.appendChild(html(`<div class="card-title">Recipe Stats 📊</div>`));
    const stRow = h('div', { cls: 'grid-stat', style: 'margin-bottom:12px' });
    [
      [s.targetOG.toFixed(3), 'Target OG', 'gold'],
      [fg.toFixed(3), 'Est. FG', ''],
      [`${abv}%`, 'Est. ABV', 'amber'],
      [Science.style(fg), 'Style', 'sea'],
    ].forEach(([v, l, c]) => stRow.appendChild(statBadge(v, l, c)));
    recipeCard.appendChild(stRow);
    recipeCard.appendChild(html(`<div style="font-size:0.88rem;line-height:2.1">
      <div>🍯 <strong>${hn.toFixed(2)} lbs</strong> ${s.honeyType} honey</div>
      <div>💧 <strong style="color:var(--sea-light)">${wL.toFixed(1)} L (${(wL/3.785).toFixed(2)} gal)</strong> warm water ~37°C</div>
      <div>🦠 <strong>${s.yeast}</strong></div>
      ${yd ? `<div class="small text-dim italic">${yd.note} · Tolerance ${yd.tol}% ABV</div>` : ''}
    </div>`));
    if (yd && yd.name.includes('D47')) recipeCard.appendChild(infoBox('⚠️ D47 Warning: Must ferment below 65°F or produces harsh fusel alcohols!', 'info-red'));
    sg.appendChild(recipeCard);

    // TOSNA
    const tosnaCard = h('div', { cls: 'card' });
    tosnaCard.appendChild(html(`<div class="card-title">TOSNA Tracker 🧬</div>`));
    tosnaCard.appendChild(html(`<div class="small text-dim italic" style="margin-bottom:10px">~${tg}g Fermaid-O per step</div>`));
    DATA.tosnaSteps.forEach(step => {
      const done = s.tosna[step.id];
      const item = html(`<div class="tosna-item ${done ? 'done' : ''}">
        <div class="tosna-check">${done ? '✓' : ''}</div>
        <div><div class="tosna-label">${step.icon} ${step.label}</div><div class="tosna-sub">${step.sub}</div></div>
      </div>`);
      item.addEventListener('click', () => { s.tosna[step.id] = !s.tosna[step.id]; updateStats(); });
      tosnaCard.appendChild(item);
    });
    sg.appendChild(tosnaCard);
    statsPanel.appendChild(sg);
  };
  updateStats();
  el.appendChild(statsPanel);

  // Fruits
  const fruitCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  fruitCard.appendChild(html(`<div class="card-title">Fruits 🍓</div>`));
  const fruitPills = h('div', { cls: 'pill-group', style: 'margin-bottom:10px' });
  const fruitAmtDiv = document.createElement('div');
  DATA.fruits.forEach(fr => {
    const pill = html(`<div class="pill">${fr.emoji} ${fr.name}</div>`);
    pill.addEventListener('click', () => {
      const i = s.fruits.indexOf(fr.name);
      if (i >= 0) {
        s.fruits.splice(i, 1); delete s.fruitAmt[fr.name]; pill.classList.remove('active');
      } else {
        s.fruits.push(fr.name); s.fruitAmt[fr.name] = 1; pill.classList.add('active');
      }
      renderFruitAmts();
    });
    fruitPills.appendChild(pill);
  });
  fruitCard.appendChild(fruitPills);
  const renderFruitAmts = () => {
    fruitAmtDiv.innerHTML = '';
    s.fruits.forEach(fname => {
      const fo = DATA.fruits.find(x => x.name === fname);
      const row = html(`<div class="flex-row" style="background:rgba(0,0,0,0.3);border-radius:6px;padding:8px 12px;margin-bottom:6px">
        <span style="font-size:1.1rem">${fo.emoji}</span>
        <span style="flex:1;font-family:'Cinzel',serif;font-size:0.85rem">${fname}</span>
        <input type="number" value="${s.fruitAmt[fname]||1}" min="0.5" max="20" step="0.5" style="width:60px;background:rgba(0,0,0,0.4);border:1px solid var(--border);border-radius:5px;padding:3px 7px;color:var(--text-bright);font-size:0.85rem" />
        <span class="small text-dim">lbs</span>
        <span class="small text-amber">+${(fo.sgBoost * (s.fruitAmt[fname]||1) / s.gallons * 0.001).toFixed(3)} SG</span>
      </div>`);
      row.querySelector('input').addEventListener('input', e => s.fruitAmt[fname] = parseFloat(e.target.value)||1);
      fruitAmtDiv.appendChild(row);
    });
  };
  fruitCard.appendChild(fruitAmtDiv);
  el.appendChild(fruitCard);

  // Spices
  const spiceCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  spiceCard.appendChild(html(`<div class="card-title">Spices & Herbs 🌿</div>`));
  const spicePills = h('div', { cls: 'pill-group', style: 'margin-bottom:8px' });
  DATA.spices.forEach(sp => {
    const pill = html(`<div class="pill">${sp.emoji} ${sp.name}</div>`);
    pill.addEventListener('click', () => {
      const i = s.spices.indexOf(sp.name);
      if (i >= 0) { s.spices.splice(i, 1); pill.classList.remove('active-amber'); }
      else { s.spices.push(sp.name); pill.classList.add('active-amber'); }
      renderSpiceTips();
    });
    spicePills.appendChild(pill);
  });
  spiceCard.appendChild(spicePills);
  const spiceTipDiv = document.createElement('div');
  const renderSpiceTips = () => {
    spiceTipDiv.innerHTML = '';
    s.spices.forEach(sname => {
      const sp = DATA.spices.find(x => x.name === sname);
      if (sp?.tip) spiceTipDiv.appendChild(infoBox(`${sp.emoji} <strong>${sp.name}</strong>: ${sp.tip}`, 'info-gold'));
    });
  };
  spiceCard.appendChild(spiceTipDiv);
  el.appendChild(spiceCard);

  el.appendChild(statsPanel);
  return el;
}

// ═══════════════════════════════════════════════════════════════════════
//  TAB: CALCULATOR
// ═══════════════════════════════════════════════════════════════════════

function renderCalcTab() {
  const el = document.createElement('div');
  el.appendChild(html(`<h2 class="page-title">✦ Calculator</h2><p class="page-subtitle">The science of the sacred brew.</p>`));

  // ABV Calculator
  let og = 1.100, fg = 1.010;
  const abvCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  abvCard.appendChild(html(`<div class="card-title">ABV Calculator</div>`));
  const abvGrid = h('div', { cls: 'grid-2' });

  const ogInp = h('input', { type: 'number', cls: 'form-input', value: og, step: '0.001', min: '1.000', max: '1.200' });
  const fgInp = h('input', { type: 'number', cls: 'form-input', value: fg, step: '0.001', min: '0.990', max: '1.200' });

  const abvResult = document.createElement('div');
  const updateABV = () => {
    og = parseFloat(ogInp.value) || 1.100;
    fg = parseFloat(fgInp.value) || 1.010;
    const adv = Science.abv(og, fg);
    const simple = Science.abvSimple(og, fg);
    abvResult.innerHTML = '';
    const sg = h('div', { cls: 'grid-stat mt-2' });
    [
      [adv + '%', 'ABV (Advanced)', 'amber'],
      [simple + '%', 'ABV (Simple)', 'iron'],
      [Science.style(fg), 'Style', 'sea'],
      [`${Math.round(((og-fg)/(og-1))*100)}%`, 'Attenuation', ''],
    ].forEach(([v, l, c]) => sg.appendChild(statBadge(v, l, c)));
    abvResult.appendChild(sg);
    const diff = Math.abs(parseFloat(adv) - parseFloat(simple));
    if (diff > 0.3) abvResult.appendChild(infoBox(`🔬 Advanced formula corrects for ${diff.toFixed(1)}% underestimation vs. simple formula at this gravity. Significant for high-gravity meads.`, 'info-sea'));
  };
  ogInp.addEventListener('input', updateABV);
  fgInp.addEventListener('input', updateABV);

  const ogGrp = h('div', { cls: 'form-group' }, html(`<label class="form-label">Original Gravity (OG)</label>`), ogInp);
  const fgGrp = h('div', { cls: 'form-group' }, html(`<label class="form-label">Final Gravity (FG)</label>`), fgInp);
  abvGrid.appendChild(ogGrp); abvGrid.appendChild(fgGrp);
  abvCard.appendChild(abvGrid);
  updateABV();
  abvCard.appendChild(abvResult);
  el.appendChild(abvCard);

  // Honey → Water Ratio
  let lbs = 15, gal = 5;
  const hwCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  hwCard.appendChild(html(`<div class="card-title">Honey → Water Ratio</div>`));
  const hwGrid = h('div', { cls: 'grid-2' });
  const lbsInp = h('input', { type: 'number', cls: 'form-input', value: lbs, step: '0.5', min: '0', max: '50' });
  const galInp = h('input', { type: 'number', cls: 'form-input', value: gal, step: '0.5', min: '0.5', max: '20' });
  const hwResult = document.createElement('div');
  const updateHW = () => {
    lbs = parseFloat(lbsInp.value) || 0;
    gal = parseFloat(galInp.value) || 1;
    const estOG = Science.og(lbs, gal);
    const wL = Science.waterL(lbs, gal);
    hwResult.innerHTML = '';
    const sg = h('div', { cls: 'grid-stat mt-2' });
    [
      [estOG.toFixed(3), 'Est. OG', 'gold'],
      [`${wL.toFixed(1)} L`, 'Add Water', 'sea'],
      [`${(lbs/gal).toFixed(2)} lb`, 'Honey/Gal', 'amber'],
      [Science.style(estOG), 'Style', ''],
    ].forEach(([v, l, c]) => sg.appendChild(statBadge(v, l, c)));
    hwResult.appendChild(sg);
    hwResult.appendChild(infoBox(`💧 For ${gal} gal batch with ${lbs} lbs honey: add <strong>${wL.toFixed(1)} L</strong> (${(wL/3.785).toFixed(2)} gal) warm water (~37°C / 99°F). Honey occupies ~${(lbs*0.339).toFixed(1)} L of volume.`, 'info-sea'));
  };
  lbsInp.addEventListener('input', updateHW);
  galInp.addEventListener('input', updateHW);
  hwGrid.appendChild(h('div', { cls: 'form-group' }, html(`<label class="form-label">Honey (lbs)</label>`), lbsInp));
  hwGrid.appendChild(h('div', { cls: 'form-group' }, html(`<label class="form-label">Target Batch (gal)</label>`), galInp));
  hwCard.appendChild(hwGrid);
  updateHW();
  hwCard.appendChild(hwResult);
  el.appendChild(hwCard);

  // Batch Reference
  const refCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  refCard.appendChild(html(`<div class="card-title">Batch Reference Chart 🍯</div>`));
  const refGrid = h('div', { cls: 'grid-3' });
  [
    [3, 1], [3.5, 1], [4, 1], [12, 5], [15, 5], [18, 5], [21, 5], [24, 5], [30, 5]
  ].forEach(([lb, g]) => {
    const estOG = Science.og(lb, g); const wL = Science.waterL(lb, g);
    refGrid.appendChild(html(`<div class="honey-card">
      <div class="honey-name">${lb}lb / ${g}gal</div>
      <div class="honey-data" style="color:var(--amber-pale);font-weight:700;font-size:0.9rem">${estOG.toFixed(3)}</div>
      <div class="honey-data" style="color:var(--sea-light)">💧 ${wL.toFixed(1)} L water</div>
      <div class="honey-data">${Science.style(estOG)}</div>
    </div>`));
  });
  refCard.appendChild(refGrid);
  el.appendChild(refCard);

  // Yeast chart
  const yeastCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  yeastCard.appendChild(html(`<div class="card-title">Yeast Tolerance Chart 🦠</div>`));
  DATA.yeasts.forEach(y => {
    const row = html(`<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="min-width:200px;font-family:'Cinzel',serif;font-size:0.82rem;color:var(--gold-pale)">${y.name}</div>
      <div style="flex:1;background:rgba(0,0,0,0.4);border-radius:6px;overflow:hidden;height:9px;border:1px solid var(--border)">
        <div style="height:100%;width:${(y.tol/20)*100}%;background:linear-gradient(90deg,var(--amber),var(--gold))"></div>
      </div>
      <div style="min-width:45px;font-family:'Cinzel',serif;color:var(--amber-pale);font-weight:700">${y.tol}%</div>
      <div style="min-width:140px;font-size:0.75rem;color:var(--text-dim);font-style:italic">${y.note}</div>
    </div>`));
    yeastCard.appendChild(row);
  });
  el.appendChild(yeastCard);

  // Honey varieties
  const honeyCard = h('div', { cls: 'card' });
  honeyCard.appendChild(html(`<div class="card-title">Honey Varieties 🌸</div>`));
  const honeyGrid = h('div', { cls: 'grid-3' });
  DATA.honeys.forEach(hn => {
    honeyGrid.appendChild(html(`<div class="honey-card">
      <div class="honey-emoji">${hn.emoji}</div>
      <div class="honey-name">${hn.name}</div>
      <div class="honey-data" style="color:var(--amber-pale)">${hn.ppg} PPG</div>
      <div class="honey-data">${hn.desc}</div>
    </div>`));
  });
  honeyCard.appendChild(honeyGrid);
  el.appendChild(honeyCard);

  return el;
}

// ═══════════════════════════════════════════════════════════════════════
//  TAB: AI COMPANION
// ═══════════════════════════════════════════════════════════════════════

function renderAITab() {
  const el = document.createElement('div');
  el.appendChild(html(`<h2 class="page-title">🐉 Skáld — AI Brew Master</h2>
    <p class="page-subtitle">The Norse spirit of brewing wisdom. Ask anything about mead science, history, or recipe design.</p>`));

  const infoCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  infoCard.appendChild(infoBox('⚠️ To use Skáld, deploy MeadCraft with an Anthropic API key configured in your server. See the README for setup. In the browser directly, the AI companion will not be accessible without a proxy.', 'info-amber'));
  el.appendChild(infoCard);

  const promptChips = [
    '🍯 Design me a sweet floral traditional mead',
    '🍓 Create a 5-gallon raspberry melomel recipe',
    '🔥 How do I make a bochet with burnt honey?',
    '🦠 Explain TOSNA nutrients for beginners',
    '📅 What\'s the fastest path to drinkable mead?',
    '💨 My mead smells like rotten eggs — help!',
    '🍺 Design a Viking-inspired spiced metheglin',
    '⚗️ High gravity sack mead — guide me through it',
    '❄️ When should I cold crash and rack?',
    '🍾 How do I carbonate mead without bottle bombs?',
  ];

  const chips = h('div', { cls: 'ai-prompt-chips' });
  promptChips.forEach(c => {
    const chip = html(`<div class="prompt-chip">${c}</div>`);
    chip.addEventListener('click', () => { userInput.value = c; userInput.focus(); });
    chips.appendChild(chip);
  });
  el.appendChild(chips);

  const chatBox = h('div', { id: 'ai-chat-box' });

  // Restore chat history
  State.chatHistory.forEach(m => {
    chatBox.appendChild(renderChatMsg(m.role, m.content));
  });

  if (State.chatHistory.length === 0) {
    chatBox.appendChild(renderChatMsg('assistant', `Hail, Viking! I am **Skáld**, keeper of ancient brewing wisdom and student of modern fermentation science.\n\nAsk me to design a mead recipe, explain the science behind fermentation, troubleshoot your batch, or dive deep into any aspect of the mead-making art. By Odin's ravens — let us brew something worthy of Valhalla!`));
  }

  el.appendChild(chatBox);

  const inputRow = h('div', { cls: 'ai-input-row' });
  const userInput = h('input', { type: 'text', cls: 'form-input', placeholder: 'Ask Skáld anything about mead...', id: 'ai-user-input' });

  const sendBtn = h('button', { cls: 'btn btn-primary' }, '⚔️ Send');

  const sendMsg = async () => {
    const text = userInput.value.trim();
    if (!text) return;
    userInput.value = '';

    State.chatHistory.push({ role: 'user', content: text });
    chatBox.appendChild(renderChatMsg('user', text));

    const typing = html(`<div class="chat-msg"><div class="chat-avatar ai">🐉</div><div class="chat-bubble ai"><span class="chat-typing">Skáld is consulting the ancient runes...</span></div></div>`);
    chatBox.appendChild(typing);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: AI_SYSTEM_PROMPT,
          messages: State.chatHistory.map(m => ({ role: m.role, content: m.content }))
        })
      });

      typing.remove();

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.error?.message || `API error ${res.status}. Ensure your API key is configured.`;
        chatBox.appendChild(renderChatMsg('assistant', `⚠️ ${msg}`));
        return;
      }

      const data = await res.json();
      const reply = data.content?.[0]?.text || 'The runes are silent. Try again.';
      State.chatHistory.push({ role: 'assistant', content: reply });
      chatBox.appendChild(renderChatMsg('assistant', reply));
      State.persist();
    } catch (e) {
      typing.remove();
      chatBox.appendChild(renderChatMsg('assistant', `⚠️ Could not reach Skáld. This feature requires a server-side API proxy. See the README for deployment instructions. Error: ${e.message}`));
    }

    chatBox.scrollTop = chatBox.scrollHeight;
  };

  sendBtn.addEventListener('click', sendMsg);
  userInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });

  inputRow.appendChild(userInput);
  inputRow.appendChild(sendBtn);
  el.appendChild(inputRow);

  const clearBtn = h('button', { cls: 'btn btn-ghost btn-sm', style: 'margin-top:8px',
    onClick: () => {
      State.chatHistory = []; State.persist();
      chatBox.innerHTML = '';
      chatBox.appendChild(renderChatMsg('assistant', `Hail again! The mead horn is refilled. What shall we brew?`));
    }
  }, '🗑️ Clear Conversation');
  el.appendChild(clearBtn);

  return el;
}

function renderChatMsg(role, content) {
  const isAI = role === 'assistant';
  // Simple markdown-ish parsing: **bold**, *italic*, newlines
  const formatted = content
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
  return html(`<div class="chat-msg ${isAI ? '' : 'user'}">
    <div class="chat-avatar ${isAI ? 'ai' : 'user'}">${isAI ? '🐉' : '⚔️'}</div>
    <div class="chat-bubble ${isAI ? 'ai' : 'user'}">${formatted}</div>
  </div>`);
}

// ═══════════════════════════════════════════════════════════════════════
//  TAB: COMPENDIUM
// ═══════════════════════════════════════════════════════════════════════

function renderCompendiumTab() {
  const el = document.createElement('div');
  el.appendChild(html(`<h2 class="page-title">📜 The Mead Master Compendium</h2>
    <p class="page-subtitle">History · Science · Styles · Technique · Equipment · Troubleshooting</p>`));

  let activeChapter = DATA.compendium[0].id;
  let openEntry = null;

  const chapNav = h('div', { cls: 'chapter-nav' });
  const contentArea = document.createElement('div');

  const renderChapter = () => {
    contentArea.innerHTML = '';
    openEntry = null;
    const ch = DATA.compendium.find(c => c.id === activeChapter);
    ch.entries.forEach((entry, idx) => {
      const card = html(`<div class="entry-card">
        <div class="entry-header">
          <div style="display:flex;align-items:center">
            <div class="entry-icon-wrap">${entry.emoji}</div>
            <span class="entry-title-text">${entry.title}</span>
          </div>
          <span class="entry-toggle">+</span>
        </div>
        <div class="entry-body">${entry.body}</div>
      </div>`);
      card.querySelector('.entry-header').addEventListener('click', () => {
        const isOpen = card.classList.contains('open');
        contentArea.querySelectorAll('.entry-card').forEach(c => c.classList.remove('open'));
        if (!isOpen) card.classList.add('open');
      });
      contentArea.appendChild(card);
    });

    // Timeline only on history
    if (activeChapter === 'history') {
      contentArea.appendChild(html(`<div class="rune-divider">ᚱᚢᚾᛖ</div>`));
    }
    if (activeChapter === 'technique') {
      const timeCard = h('div', { cls: 'card', style: 'margin-top:16px' });
      timeCard.appendChild(html(`<div class="card-title">Brewing Timeline</div>`));
      const timeline = h('div', { cls: 'timeline' });
      const phases = [
        { p: 'Day 0', a: 'Mix must, pitch yeast, first TOSNA addition', c: '#F5C842' },
        { p: 'Days 1–3', a: 'Active fermentation, staggered nutrients, degas daily', c: '#E8821A' },
        { p: 'Week 1–4', a: 'Primary fermentation — gravity drops rapidly', c: '#FF7BAC' },
        { p: '~Day 30', a: '🍷 First rack off heavy lees', c: '#FF7BAC' },
        { p: 'Week 4–8', a: 'Secondary — add fruit/spices, condition', c: '#C97BFF' },
        { p: 'Month 2–3', a: 'Conditioning — mead clarifies, flavors integrate', c: '#C97BFF' },
        { p: 'Month 3+', a: 'Cold crash → fine → stabilize → bottle', c: '#7BDFC4' },
        { p: 'Month 6–12', a: '🏆 Peak drinking window', c: '#7BDFC4' },
      ];
      phases.forEach((t, i) => {
        const row = html(`<div class="timeline-row">
          <div class="timeline-line-wrap">
            <div class="timeline-dot" style="background:${t.c};box-shadow:0 0 0 3px ${t.c}22"></div>
            ${i < phases.length-1 ? `<div class="timeline-connector" style="background:linear-gradient(${t.c},${phases[i+1].c})"></div>` : ''}
          </div>
          <div class="timeline-content">
            <span class="timeline-phase" style="color:${t.c}">${t.p}</span>
            <span class="timeline-action">${t.a}</span>
          </div>
        </div>`);
        timeline.appendChild(row);
      });
      timeCard.appendChild(timeline);
      contentArea.appendChild(timeCard);
    }
  };

  DATA.compendium.forEach(ch => {
    const btn = html(`<div class="chapter-btn ${ch.id === activeChapter ? 'active' : ''}">${ch.emoji} ${ch.title}</div>`);
    btn.addEventListener('click', () => {
      activeChapter = ch.id;
      chapNav.querySelectorAll('.chapter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderChapter();
    });
    chapNav.appendChild(btn);
  });

  el.appendChild(chapNav);
  el.appendChild(contentArea);
  renderChapter();
  return el;
}

// ═══════════════════════════════════════════════════════════════════════
//  TAB: GLOSSARY & REFERENCE
// ═══════════════════════════════════════════════════════════════════════

function renderGlossaryTab() {
  const el = document.createElement('div');
  el.appendChild(html(`<h2 class="page-title">⚓ Glossary & Reference</h2>
    <p class="page-subtitle">The Viking brewer's lexicon.</p>`));

  const glossCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  glossCard.appendChild(html(`<div class="card-title">Brewing Glossary</div>`));
  const glossGrid = h('div', { cls: 'gloss-grid' });
  DATA.glossary.forEach(g => {
    glossGrid.appendChild(html(`<div class="gloss-item">
      <div class="gloss-term">${g.term}</div>
      <div class="gloss-def">${g.def}</div>
    </div>`));
  });
  glossCard.appendChild(glossGrid);
  el.appendChild(glossCard);

  // Quick conversion reference
  const convCard = h('div', { cls: 'card', style: 'margin-bottom:14px' });
  convCard.appendChild(html(`<div class="card-title">Quick Conversions 🔢</div>`));
  const convGrid = h('div', { cls: 'gloss-grid' });
  [
    ['1 lb honey', '≈ 0.339 L volume'],
    ['1 lb honey in 1 gal', '≈ +0.037 OG'],
    ['1 gallon', '= 3.785 liters'],
    ['1 lb', '= 453.6 grams'],
    ['37 PPG', 'avg honey yield (gravity pts/lb/gal)'],
    ['TOSNA rate', '0.5g Fermaid-O per liter per step'],
    ['K-meta dose', '¼ tsp per 5 gallons to stabilize'],
    ['K-sorbate dose', '½ tsp per 5 gallons'],
    ['Priming sugar', '¾ cup corn sugar per 5 gal (sparkling)'],
    ['OG 1.100 = 100pts', '1/3 break ≈ OG minus 33pts = 1.067'],
    ['pH ideal', '3.5–4.0 for active fermentation'],
    ['Temp ideal', '60–72°F for most wine yeasts'],
    ['Cold crash', '34–38°F for 1–2 weeks'],
    ['Oak cubes', '1 oz per 5 gal, 2–6 weeks'],
    ['Fruit (light)', '1–3 lbs per gallon'],
    ['Fruit (bold)', '3–6 lbs per gallon'],
  ].forEach(([t, d]) => {
    convGrid.appendChild(html(`<div class="gloss-item"><div class="gloss-term">${t}</div><div class="gloss-def">${d}</div></div>`));
  });
  convCard.appendChild(convGrid);
  el.appendChild(convCard);

  // Stabilization guide
  const stabCard = h('div', { cls: 'card' });
  stabCard.appendChild(html(`<div class="card-title">Stabilization & Bottling Checklist ✅</div>`));
  [
    ['1. Confirm stable FG', 'Identical hydrometer readings across 3+ consecutive tests over 14+ days'],
    ['2. Cold crash', 'Chill to 34–38°F for 1–2 weeks to drop yeast'],
    ['3. Add K-meta', '¼ tsp potassium metabisulfite per 5 gal — stuns yeast'],
    ['4. Add K-sorbate', '½ tsp potassium sorbate per 5 gal — prevents reproduction'],
    ['5. Wait 24–48 hours', 'Allow chemicals to fully react throughout the mead'],
    ['6. Back-sweeten', 'Add honey to taste — no re-fermentation risk now'],
    ['7. Fine if needed', 'Kieselsol + Chitosan duo for final clarity'],
    ['8. Bottle!', 'Use pressure-rated bottles if carbonating; wine bottles for still'],
  ].forEach(([step, desc]) => {
    stabCard.appendChild(html(`<div style="display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)">
      <span style="font-family:'Cinzel',serif;color:var(--gold);min-width:160px;font-size:0.82rem">${step}</span>
      <span style="font-size:0.85rem;color:var(--text-mid)">${desc}</span>
    </div>`));
  });
  el.appendChild(stabCard);
  return el;
}

// ═══════════════════════════════════════════════════════════════════════
//  Print Recipe
// ═══════════════════════════════════════════════════════════════════════

function doPrint(brew) {
  const yd = DATA.yeasts.find(y => y.name === brew.yeast);
  const fg = yd ? Science.fg(brew.ogReading, yd.att) : brew.targetFG;
  const abv = Science.abv(brew.ogReading, fg);
  const wL = Science.waterL(brew.lbsHoney, brew.gallons);
  const tg = Science.tosnaGrams(brew.gallons);
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>${brew.name} — MeadCraft Recipe</title>
  <style>
    body{font-family:Georgia,serif;max-width:700px;margin:40px auto;color:#111;line-height:1.7}
    h1{font-size:2rem;border-bottom:3px solid #333;padding-bottom:8px;margin-bottom:16px}
    h2{font-size:1.05rem;margin-top:22px;border-left:4px solid #333;padding-left:10px;font-family:Georgia,serif}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}
    .box{border:1px solid #ccc;padding:9px 12px;border-radius:4px}
    .lbl{font-size:0.68rem;text-transform:uppercase;letter-spacing:.08em;color:#666}
    .val{font-size:1.1rem;font-weight:bold;margin-top:2px}
    table{width:100%;border-collapse:collapse;margin:10px 0;font-size:.88rem}
    td,th{border:1px solid #ccc;padding:6px 10px}th{background:#f0f0f0;font-weight:bold;text-align:left}
    .footer{margin-top:30px;font-size:.75rem;color:#888;border-top:1px dashed #ccc;padding-top:10px}
    @media print{body{margin:15px}}
  </style></head><body>
  <h1>${brew.emoji} ${brew.name}</h1>
  <p><strong>Type:</strong> ${brew.type} &nbsp;|&nbsp; <strong>Started:</strong> ${brew.startDate} &nbsp;|&nbsp; <strong>Batch:</strong> ${brew.gallons} gal</p>
  <h2>📊 Target Stats</h2>
  <div class="grid">
    <div class="box"><div class="lbl">OG</div><div class="val">${brew.ogReading.toFixed(3)}</div></div>
    <div class="box"><div class="lbl">Target FG</div><div class="val">${brew.targetFG.toFixed(3)}</div></div>
    <div class="box"><div class="lbl">Est. ABV (Advanced)</div><div class="val">${abv}%</div></div>
    <div class="box"><div class="lbl">Style</div><div class="val">${Science.style(brew.targetFG)}</div></div>
  </div>
  <h2>🍯 Ingredients</h2>
  <table><tr><th>Ingredient</th><th>Amount</th><th>Notes</th></tr>
  <tr><td>${brew.honey} Honey</td><td>${brew.lbsHoney} lbs</td><td>~37 PPG; dissolve in warm water</td></tr>
  <tr><td>Water (warm ~37°C)</td><td>${wL.toFixed(1)} L (${(wL/3.785).toFixed(2)} gal)</td><td>Filtered or spring; do not boil</td></tr>
  <tr><td>Yeast: ${brew.yeast}</td><td>1 packet (5g)</td><td>Rehydrate in 104°F water 15 min before pitching</td></tr>
  <tr><td>Fermaid-O</td><td>${tg}g × 4 steps</td><td>TOSNA schedule — see below</td></tr>
  <tr><td>Star San</td><td>1 oz / 5 gal water</td><td>No-rinse sanitizer — everything that touches must</td></tr>
  ${brew.fruits.length ? `<tr><td>Fruit: ${brew.fruits.join(', ')}</td><td>Varies</td><td>Add in secondary; freeze fresh fruit first</td></tr>` : ''}
  ${brew.spices.length ? `<tr><td>Spices: ${brew.spices.join(', ')}</td><td>To taste</td><td>Muslin bag in secondary; taste every 2–3 days</td></tr>` : ''}
  </table>
  <h2>🧬 TOSNA Nutrient Schedule</h2>
  <table><tr><th>Timing</th><th>Action</th><th>Fermaid-O</th></tr>
  <tr><td>Day 0 (Pitch)</td><td>Mix must, add Fermaid-O, pitch rehydrated yeast</td><td>${tg}g</td></tr>
  <tr><td>Day 1 (24hr)</td><td>Degas vigorously, add Fermaid-O</td><td>${tg}g</td></tr>
  <tr><td>Day 2 (48hr)</td><td>Degas again, third addition</td><td>${tg}g</td></tr>
  <tr><td>1/3 Sugar Break (~Day 4–7)</td><td>Final addition at 33% sugar consumed</td><td>${tg}g</td></tr>
  </table>
  <h2>📅 Timeline</h2>
  <table><tr><th>Phase</th><th>Duration</th><th>Action</th></tr>
  <tr><td>Primary Fermentation</td><td>2–6 weeks</td><td>Monitor gravity every 5–7 days</td></tr>
  <tr><td>First Rack</td><td>~Day 30</td><td>Move off heavy lees; add fruit/spices if desired</td></tr>
  <tr><td>Conditioning</td><td>1–3 months</td><td>Patience — flavors integrate</td></tr>
  <tr><td>Cold Crash</td><td>1–2 weeks</td><td>Refrigerate at 34–38°F to clarify</td></tr>
  <tr><td>Est. Bottle Date</td><td>${Science.addMonths(brew.startDate, 3)}</td><td>Stabilize → fine → back-sweeten → bottle</td></tr>
  <tr><td>Peak Drinking</td><td>${Science.addMonths(brew.startDate, 6)}+</td><td>Patience makes better mead!</td></tr>
  </table>
  ${brew.notes ? `<h2>📝 Notes</h2><p>${brew.notes}</p>` : ''}
  <div class="footer">Generated by MeadCraft ⚓ Viking Brew Master &nbsp;|&nbsp; Brewer: _________________ &nbsp;|&nbsp; Vessel: _________________ &nbsp;|&nbsp; Printed: ${new Date().toLocaleDateString()}</div>
  </body></html>`);
  win.document.close(); win.print();
}

// ═══════════════════════════════════════════════════════════════════════
//  App Shell & Router
// ═══════════════════════════════════════════════════════════════════════

const TABS = [
  { id: 'brews',      label: 'Fleet',        icon: '⚓', render: renderBrewsTab },
  { id: 'recipe',     label: 'Recipe',       icon: '⚗️', render: renderRecipeTab },
  { id: 'calculator', label: 'Calculator',   icon: '✦',  render: renderCalcTab },
  { id: 'ai',         label: 'Skáld AI',     icon: '🐉', render: renderAITab },
  { id: 'compendium', label: 'Compendium',   icon: '📜', render: renderCompendiumTab },
  { id: 'glossary',   label: 'Glossary',     icon: '⚔️', render: renderGlossaryTab },
];

function renderApp() {
  const content = document.getElementById('app-content');
  content.innerHTML = '';

  const tab = TABS.find(t => t.id === State.activeTab) || TABS[0];
  const panel = tab.render();
  content.appendChild(panel);

  // Update nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === State.activeTab);
  });

  // Scroll to top
  window.scrollTo(0, 0);
}

function buildNav() {
  const navInner = document.querySelector('.nav-inner');
  if (!navInner) return;
  TABS.forEach(tab => {
    const btn = html(`<button class="nav-btn ${tab.id === State.activeTab ? 'active' : ''}" data-tab="${tab.id}">
      <span class="nav-icon">${tab.icon}</span>${tab.label}
    </button>`);
    btn.addEventListener('click', () => {
      State.activeTab = tab.id;
      State.selectedBrew = null;
      State.persist();
      renderApp();
    });
    navInner.appendChild(btn);
  });
}

// ── Install Banner ─────────────────────────────────────────────────────
let deferredPrompt = null;
function setupInstallBanner() {
  const banner = document.getElementById('install-banner');
  const installBtn = document.getElementById('install-btn');
  const dismissBtn = document.getElementById('banner-dismiss');

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    banner.classList.add('show');
  });

  installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    banner.classList.remove('show');
  });

  dismissBtn?.addEventListener('click', () => {
    banner.classList.remove('show');
    // Will show again next visit since no localStorage flag
  });

  window.addEventListener('appinstalled', () => {
    banner.classList.remove('show');
    deferredPrompt = null;
  });
}

// ── Service Worker ─────────────────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW reg failed:', err));
  }
}

// ── Boot ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  State.init();
  buildNav();
  renderApp();
  setupInstallBanner();
  registerSW();
});
