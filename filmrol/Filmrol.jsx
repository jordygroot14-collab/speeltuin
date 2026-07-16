import { useState, useEffect, useRef, useMemo, memo } from "react";

// localStorage-polyfill met dezelfde interface als window.storage uit
// Claude-artifacts (get/set/delete/list), zodat Filmrol standalone op
// GitHub Pages werkt. Data staat per browser/toestel — geen sync tussen
// apparaten. Het "shared"-argument uit de oorspronkelijke calls wordt
// genegeerd; er is hier maar één gebruiker per browser.
const STORAGE_PREFIX = "filmrol:";
if (!window.storage) {
  window.storage = {
    async get(key) {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      if (raw === null) throw new Error("Key not found: " + key);
      return { key, value: raw, shared: false };
    },
    async set(key, value) {
      localStorage.setItem(STORAGE_PREFIX + key, value);
      return { key, value, shared: false };
    },
    async delete(key) {
      const existed = localStorage.getItem(STORAGE_PREFIX + key) !== null;
      localStorage.removeItem(STORAGE_PREFIX + key);
      return { key, deleted: existed, shared: false };
    },
    async list(prefix) {
      const full = STORAGE_PREFIX + (prefix || "");
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(full)) keys.push(k.slice(STORAGE_PREFIX.length));
      }
      return { keys, prefix: prefix || undefined, shared: false };
    },
  };
}
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Star, Plus, Film, Tv, Trash2, Upload, X, Search, Loader2, Check, AlertTriangle, Pencil, ChevronDown, ChevronRight, ChevronLeft, Download } from "lucide-react";

// Versienummer — wordt bij elke wijziging opgehoogd, zichtbaar in de app-header
// zodat duidelijk is welke build gepubliceerd is en welke je aan het testen bent.
const APP_VERSION = "v2.3 · 16 jul 2026";

const PLATFORMS = ["Netflix", "Disney+", "HBO Max", "Prime Video", "Videoland", "Apple TV+", "NPO Start", "Sky Showtime", "Bioscoop", "Anders"];

const REWATCH_OPTIONS = [
  { key: "jazeker", label: "Jazeker!", points: 10 },
  { key: "misschien", label: "Hmm misschien", points: 5 },
  { key: "nah", label: "Nah denk 't niet nee", points: 0 },
];

const EMOJI_OPTIONS = [
  { key: "hilarisch", emoji: "😂", label: "Hilarisch", points: 10 },
  { key: "saai", emoji: "😴", label: "Saai", points: 5 },
  { key: "mindblowing", emoji: "🤯", label: "Mindblowing", points: 20 },
  { key: "emotioneel", emoji: "😭", label: "Emotioneel", points: 10 },
  { key: "leuk", emoji: "😄", label: "Leuk", points: 10 },
  { key: "slecht", emoji: "☠️", label: "Slecht", points: 0 },
  { key: "halverwege", emoji: "🚪", label: "Halverwege uitgezet", points: -10 },
];

const INDEX_KEY = "kijkwijzer-index";
const showKey = (id) => `kijkwijzer-show:${id}`;
const PAGE_SIZE = 50;
const SEASONS_PER_PAGE = 5;

function uid() {
  return Date.now().toString() + Math.random().toString(36).slice(2, 7);
}

function StarRating({ value, onChange, size = 18 }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(n); }}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="transition-transform hover:scale-110"
        >
          <Star
            size={size}
            className={(hover || value) >= n ? "fill-amber-400 text-amber-400" : "text-neutral-600"}
          />
        </button>
      ))}
    </div>
  );
}

function RewatchPicker({ value, onChange }) {
  return (
    <div className="flex flex-col gap-1.5">
      {REWATCH_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(value === opt.key ? null : opt.key)}
          className={`text-left px-3 py-2.5 rounded-lg text-sm border transition-colors ${
            value === opt.key
              ? "bg-amber-500 border-amber-500 text-neutral-950 font-medium"
              : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-600"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function EmojiPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {EMOJI_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          title={opt.label}
          onClick={() => onChange(value === opt.key ? null : opt.key)}
          className={`w-12 h-12 flex items-center justify-center rounded-lg text-2xl border transition-colors shrink-0 ${
            value === opt.key
              ? "bg-amber-500/20 border-amber-500"
              : "bg-neutral-800 border-neutral-700 hover:border-neutral-600"
          }`}
        >
          {opt.emoji}
        </button>
      ))}
    </div>
  );
}

function EpisodeGrid({ episodes, onToggle, onSetAll }) {
  return (
    <div>
      <div className="flex gap-1.5 flex-wrap mb-2">
        {episodes.map((ep, idx) => (
          <button
            key={idx}
            onClick={() => onToggle(idx)}
            title={`Aflevering ${ep.num}`}
            className={`w-7 h-7 rounded-md text-xs font-medium flex items-center justify-center transition-colors ${
              ep.watched ? "bg-amber-500 text-neutral-950" : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"
            }`}
          >
            {ep.num}
          </button>
        ))}
      </div>
      {onSetAll && (
        <div className="flex gap-3">
          <button onClick={() => onSetAll(true)} className="text-xs text-amber-400 hover:underline">Alles gezien</button>
          <button onClick={() => onSetAll(false)} className="text-xs text-neutral-500 hover:underline">Alles wissen</button>
        </div>
      )}
    </div>
  );
}

function SeasonPagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const maxVisible = 7;
  const pages = [];
  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }
  return (
    <div className="flex items-center justify-center gap-1 bg-neutral-900 border border-neutral-700 rounded-lg p-1">
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1} className="p-1.5 text-neutral-400 disabled:opacity-30 hover:text-neutral-200">
        <ChevronLeft size={16} />
      </button>
      {pages.map((p, idx) =>
        p === "…" ? (
          <span key={idx} className="px-1.5 text-neutral-500 text-sm">…</span>
        ) : (
          <button
            key={idx}
            onClick={() => onChange(p)}
            className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${p === page ? "bg-amber-500 text-neutral-950" : "text-neutral-400 hover:bg-neutral-700"}`}
          >
            {p}
          </button>
        )
      )}
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="p-1.5 text-neutral-400 disabled:opacity-30 hover:text-neutral-200">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function ItemRowBase({ item, isExpanded, isLoadingDetail, onToggleExpand, onToggleFilmWatched, onToggleSeasonEpisode, onSetAllSeasonEpisodes, onUpdateRating, onEdit, onRemove }) {
  const st = itemStats(item);
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
      <div className="px-3 py-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-neutral-800 text-amber-400 shrink-0">
            {item.type === "film" ? <Film size={16} /> : <Tv size={16} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-medium break-words">{item.title}</span>
              {item.year && <span className="text-xs text-neutral-500">{item.year}</span>}
              {item.type === "serie" && (item.seasonsCount || 1) > 1 && (
                <span className="text-xs text-neutral-500">{item.seasonsCount} seizoenen</span>
              )}
              {item.type === "serie" && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${st.watched >= st.total ? "bg-emerald-500/15 text-emerald-400" : st.watched > 0 ? "bg-amber-500/15 text-amber-400" : "bg-neutral-700 text-neutral-400"}`}>
                  {st.watched}/{st.total} afl.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500 mt-0.5">
              <span>{displayPlatform(item)}</span>
              {item.notes && <span className="truncate">· {item.notes}</span>}
            </div>
          </div>
          <span className="text-3xl leading-none shrink-0" title={ratingBadge(item).title}>
            {ratingBadge(item).icon}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end mt-2">
          {item.type === "serie" && (
            <button onClick={onToggleExpand} className="text-neutral-500 hover:text-neutral-200 p-1">
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
          {item.type === "film" && (
            <button
              onClick={onToggleFilmWatched}
              className={`text-xs px-2.5 py-1.5 rounded-md whitespace-nowrap ${item.watched === false ? "bg-neutral-700 text-neutral-300" : "bg-emerald-500/15 text-emerald-400"}`}
            >
              {item.watched === false ? "Nog kijken" : "Gezien"}
            </button>
          )}
          <StarRating value={item.rating} onChange={onUpdateRating} size={16} />
          <button onClick={onEdit} className="text-neutral-500 hover:text-amber-400 p-1"><Pencil size={16} /></button>
          <button onClick={onRemove} className="text-neutral-500 hover:text-red-400 p-1"><Trash2 size={16} /></button>
        </div>
      </div>
      {item.type === "serie" && isExpanded && (
        <div className="px-4 pb-3 pt-1 border-t border-neutral-800 bg-neutral-950/40 space-y-3">
          {isLoadingDetail || !Array.isArray(item.seasons) ? (
            <div className="flex items-center gap-2 text-xs text-neutral-500 py-2">
              <Loader2 size={14} className="animate-spin" /> Seizoenen laden...
            </div>
          ) : (
            item.seasons.map((season, sIdx) => {
              const sst = { watched: season.episodes.filter((e) => e.watched).length, total: season.episodes.length };
              return (
                <div key={sIdx} className={sIdx > 0 ? "pt-3 border-t border-neutral-800" : ""}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-neutral-200">Seizoen {season.num}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${sst.watched >= sst.total ? "bg-emerald-500/15 text-emerald-400" : sst.watched > 0 ? "bg-amber-500/15 text-amber-400" : "bg-neutral-700 text-neutral-400"}`}>
                      {sst.watched}/{sst.total} afl.
                    </span>
                  </div>
                  <EpisodeGrid
                    episodes={season.episodes}
                    onToggle={(epIdx) => onToggleSeasonEpisode(sIdx, epIdx)}
                    onSetAll={(val) => onSetAllSeasonEpisodes(sIdx, val)}
                  />
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

const ItemRow = memo(ItemRowBase, (prev, next) =>
  prev.item === next.item && prev.isExpanded === next.isExpanded && prev.isLoadingDetail === next.isLoadingDetail
);

function TypePickRow({ cand, onConfirm, onSkip }) {
  const [chosenType, setChosenType] = useState(null);
  return (
    <div className="bg-neutral-800/60 border border-neutral-700 rounded-lg px-3 py-2.5">
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{cand.title}</div>
          <div className="text-xs text-neutral-400 mt-0.5">Onduidelijk of dit een film of serie is.</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-neutral-900 border border-neutral-700 rounded-md p-1">
          {["film", "serie"].map((t) => (
            <button
              key={t}
              onClick={() => setChosenType(t)}
              className={`px-2 py-1 rounded text-xs capitalize ${chosenType === t ? "bg-amber-500 text-neutral-950 font-medium" : "text-neutral-400"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          disabled={!chosenType}
          onClick={() => onConfirm(chosenType)}
          className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-neutral-950 rounded-md text-xs font-medium"
        >
          <Check size={12} /> Toevoegen
        </button>
        <button onClick={onSkip} className="px-2.5 py-1 bg-neutral-700 hover:bg-neutral-600 rounded-md text-xs text-neutral-300">
          Overslaan
        </button>
      </div>
    </div>
  );
}

function displayPlatform(item) {
  if (item.platform === "Anders" && item.customPlatform) return item.customPlatform;
  return item.platform;
}

function normalizePunctuation(str) {
  return String(str || "")
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normKey(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchPlatform(raw) {
  const clean = String(raw || "").trim();
  if (!clean) return { platform: "Anders", customPlatform: "" };
  const match = PLATFORMS.find((p) => p.toLowerCase() === clean.toLowerCase());
  if (match) return { platform: match, customPlatform: "" };
  return { platform: "Anders", customPlatform: normalizePunctuation(clean) };
}

function serieStats(item) {
  const seasons = item.seasons || [];
  return seasons.reduce((acc, s) => {
    const eps = s.episodes || [];
    return { watched: acc.watched + eps.filter((e) => e.watched).length, total: acc.total + (eps.length || 1) };
  }, { watched: 0, total: 0 });
}

function itemStats(item) {
  if (item.type !== "serie") return { watched: item.watched === false ? 0 : 1, total: 1 };
  if (Array.isArray(item.seasons) && item.seasons.length) return serieStats(item);
  return { watched: item.episodesWatched || 0, total: item.episodesTotal || 1 };
}

function isToWatch(item) {
  const st = itemStats(item);
  return st.watched < st.total;
}

function getEmojiOption(key) {
  return EMOJI_OPTIONS.find((e) => e.key === key) || null;
}

function computeScore(item) {
  const starPoints = (item.rating || 0) * 10;
  const rewatchOpt = REWATCH_OPTIONS.find((r) => r.key === item.rewatch);
  const rewatchPoints = rewatchOpt ? rewatchOpt.points : 0;
  const emojiOpt = getEmojiOption(item.emoji);
  const emojiPoints = emojiOpt ? emojiOpt.points : 0;
  return starPoints + rewatchPoints + emojiPoints;
}

function ratingBadge(item) {
  const opt = getEmojiOption(item.emoji);
  if (opt) return { icon: opt.emoji, title: opt.label };
  if (isToWatch(item)) return { icon: "⌛", title: "Nog niet (helemaal) gekeken" };
  return { icon: "❓", title: "Nog geen beoordeling" };
}

function withSummary(item) {
  if (item.type !== "serie" || !Array.isArray(item.seasons)) return item;
  const st = serieStats(item);
  return { ...item, episodesWatched: st.watched, episodesTotal: st.total, seasonsCount: item.seasons.length };
}

function toIndexEntry(item) {
  const base = {
    id: item.id, title: item.title, type: item.type, platform: item.platform,
    customPlatform: item.customPlatform || "", rating: item.rating || 0,
    rewatch: item.rewatch || null, emoji: item.emoji || null,
    notes: item.notes || "", year: item.year || "", addedAt: item.addedAt,
  };
  if (item.type === "film") {
    base.watched = item.watched !== false;
  } else {
    if (Array.isArray(item.seasons)) {
      const st = serieStats(item);
      base.seasonsCount = item.seasons.length;
      base.episodesWatched = st.watched;
      base.episodesTotal = st.total;
    } else {
      base.seasonsCount = item.seasonsCount ?? 1;
      base.episodesWatched = item.episodesWatched ?? 0;
      base.episodesTotal = item.episodesTotal ?? 1;
    }
  }
  return base;
}

// Opslag-operaties kunnen sporadisch falen (rate limits, verbinding).
// Probeer daarom altijd een paar keer met oplopende wachttijd.
const RETRY_DELAYS = [400, 900, 1800];

// Een opslagcall die blijft hangen (geen fout, geen antwoord) mag de app
// nooit voor altijd laten laden — na dit aantal ms tellen we 'm als mislukt.
const STORAGE_TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Opslagverzoek duurde te lang")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function storageWithRetry(fn) {
  let lastErr;
  for (let i = 0; i <= RETRY_DELAYS.length; i++) {
    try {
      return await withTimeout(fn(), STORAGE_TIMEOUT_MS);
    } catch (e) {
      lastErr = e;
      if (i < RETRY_DELAYS.length) await new Promise((r) => setTimeout(r, RETRY_DELAYS[i]));
    }
  }
  throw lastErr;
}

// Register van serie-id's waarvoor een detailrecord in de opslag staat.
// Hiermee kunnen we "record bestaat niet" onderscheiden van "lezen mislukt".
const detailKeyRegistry = { loaded: false, ids: new Set() };

async function loadDetailKeyRegistry() {
  try {
    const res = await storageWithRetry(() => window.storage.list("kijkwijzer-show:", true));
    const keys = res && Array.isArray(res.keys) ? res.keys : [];
    keys.forEach((k) => detailKeyRegistry.ids.add(String(k).slice("kijkwijzer-show:".length)));
    detailKeyRegistry.loaded = true;
  } catch (e) {
    console.error("Kon register van detailrecords niet laden:", e);
    detailKeyRegistry.loaded = false;
  }
}

// Resultaat: seizoenen-array, of null als het record echt niet bestaat.
// Gooit een error als het record wél bestaat maar niet gelezen kan worden —
// zodat we nooit stilletjes echte data vervangen door een leeg skelet.
async function fetchShowSeasons(id) {
  if (detailKeyRegistry.loaded && !detailKeyRegistry.ids.has(id)) return null;
  try {
    const res = await storageWithRetry(() => window.storage.get(showKey(id), true));
    return res && res.value ? JSON.parse(res.value).seasons : null;
  } catch (e) {
    if (detailKeyRegistry.loaded && detailKeyRegistry.ids.has(id)) {
      throw new Error("Seizoenen laden mislukt");
    }
    return null;
  }
}

// Detailrecord kwijt? Bouw dan een skelet op basis van de indexsamenvatting
// (juiste aantal seizoenen) i.p.v. stilletjes terug te vallen op 1 seizoen.
function skeletonSeasonsFromSummary(item) {
  const count = Math.max(1, parseInt(item.seasonsCount, 10) || 1);
  return Array.from({ length: count }, (_, idx) => ({ num: idx + 1, episodes: [{ num: 1, watched: false }] }));
}

// Gooit een error als opslaan na alle pogingen mislukt — de aanroeper
// beslist hoe dat aan de gebruiker gemeld wordt. Nooit meer stil falen.
async function persistShowDetail(item) {
  if (item.type !== "serie" || !Array.isArray(item.seasons)) return;
  await storageWithRetry(() => window.storage.set(showKey(item.id), JSON.stringify({ seasons: item.seasons }), true));
  detailKeyRegistry.ids.add(item.id);
}

const PERSIST_BATCH_SIZE = 3;

async function persistTouchedShows(items, touchedShowIds, onProgress) {
  const ids = Array.from(touchedShowIds);
  let done = 0;
  const failedTitles = [];
  for (let i = 0; i < ids.length; i += PERSIST_BATCH_SIZE) {
    const batchIds = ids.slice(i, i + PERSIST_BATCH_SIZE);
    await Promise.all(batchIds.map(async (id) => {
      const item = items.find((it) => it.id === id);
      if (!item) return;
      try {
        await persistShowDetail(item);
      } catch (e) {
        console.error("Opslaan mislukt voor", item.title, e);
        failedTitles.push(item.title);
      }
    }));
    done += batchIds.length;
    if (onProgress) onProgress(done, ids.length);
  }
  return failedTitles;
}

async function persistItemsWithProgress(items, onProgress) {
  const seriesItems = items.filter((it) => it.type === "serie");
  let done = 0;
  const failedTitles = [];
  for (let i = 0; i < seriesItems.length; i += PERSIST_BATCH_SIZE) {
    const batch = seriesItems.slice(i, i + PERSIST_BATCH_SIZE);
    await Promise.all(batch.map(async (it) => {
      try {
        await persistShowDetail(it);
      } catch (e) {
        console.error("Opslaan mislukt voor", it.title, e);
        failedTitles.push(it.title);
      }
    }));
    done += batch.length;
    if (onProgress) onProgress(done, seriesItems.length);
  }
  return failedTitles;
}

function groupNetflixTitles(rawTitles, platform = "Netflix") {
  const groups = new Map();
  rawTitles.forEach((raw) => {
    const title = normalizePunctuation(raw);
    if (!title) return;
    const parts = title.split(":").map((p) => p.trim()).filter(Boolean);

    if (parts.length === 1) {
      const key = "film|" + normKey(parts[0]);
      if (!groups.has(key)) groups.set(key, { title: parts[0], type: "film", episodeCount: 0 });
      return;
    }

    const show = parts[0];
    const seasonPart = parts.slice(1).find((p) => /^(seizoen|season)\s*\d+/i.test(p));
    let seasonNum = null;
    if (seasonPart) seasonNum = parseInt((seasonPart.match(/\d+/) || [])[0], 10) || null;
    const key = "serie|" + normKey(show) + "|" + (seasonNum || 1);
    if (!groups.has(key)) groups.set(key, { title: show, type: "serie", seasonNum: seasonNum || 1, episodeCount: 0 });
    groups.get(key).episodeCount += 1;
  });

  return Array.from(groups.values()).map((g) => {
    const c = { title: g.title, type: g.type, platform, customPlatform: "", notes: "", year: "" };
    if (g.type === "serie") {
      c.seasonNum = g.seasonNum;
      c.episodesTotal = g.episodeCount;
      c.episodesWatched = g.episodeCount;
    } else {
      c.watched = true;
    }
    return c;
  });
}

function dedupeWithinBatch(candidates) {
  const deduped = [];
  candidates.forEach((c) => {
    const key = c.type === "serie" ? normKey(c.title) + "|" + (c.seasonNum || 1) : "film|" + normKey(c.title);
    const exists = deduped.find((d) => {
      const dkey = d.type === "serie" ? normKey(d.title) + "|" + (d.seasonNum || 1) : "film|" + normKey(d.title);
      return dkey === key;
    });
    if (!exists) deduped.push(c);
  });
  return deduped;
}

async function mergeCandidatesIntoItems(existingItems, candidates) {
  let items = [...existingItems];
  const touched = new Set();

  for (const c of candidates) {
    if (c.type === "film") {
      items = [{
        id: uid(), title: c.title, type: "film", platform: c.platform, customPlatform: c.customPlatform || "",
        rating: 0, notes: c.notes || "", year: c.year || "", addedAt: new Date().toISOString(),
        watched: c.watched !== false,
      }, ...items];
      continue;
    }

    const total = Math.max(1, c.episodesTotal || c.episodesWatched || 1);
    const watchedCount = Math.min(c.episodesWatched != null ? c.episodesWatched : total, total);
    const season = { num: c.seasonNum || 1, episodes: Array.from({ length: total }, (_, idx) => ({ num: idx + 1, watched: idx < watchedCount })) };

    const idx = items.findIndex((i) => i.type === "serie" && normKey(i.title) === normKey(c.title));
    if (idx !== -1) {
      const existing = items[idx];
      let seasons = Array.isArray(existing.seasons) ? existing.seasons : (await fetchShowSeasons(existing.id)) || skeletonSeasonsFromSummary(existing);
      seasons = [...seasons];
      const sIdx = seasons.findIndex((s) => s.num === season.num);
      if (sIdx !== -1) seasons[sIdx] = season; else seasons.push(season);
      seasons.sort((a, b) => a.num - b.num);
      const updated = withSummary({ ...existing, seasons });
      items[idx] = updated;
      touched.add(updated.id);
    } else {
      const newItem = withSummary({
        id: uid(), title: c.title, type: "serie", platform: c.platform, customPlatform: c.customPlatform || "",
        rating: 0, notes: c.notes || "", year: c.year || "", addedAt: new Date().toISOString(),
        seasons: [season],
      });
      items = [newItem, ...items];
      touched.add(newItem.id);
    }
  }
  return { items, touchedShowIds: touched };
}

function parseImportLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return null;
  let title = line, year = "", type = "film", platform = "Anders", customPlatform = "";

  if (line.includes(",")) {
    const cols = line.split(",").map((c) => c.trim()).filter(Boolean);
    if (cols.length > 1) {
      title = normalizePunctuation(cols[0]);
      for (const col of cols.slice(1)) {
        if (/^\d{4}$/.test(col)) year = col;
        else if (/\bserie(s)?\b/i.test(col)) type = "serie";
        else if (/\bfilm\b/i.test(col)) type = "film";
        else {
          const m = matchPlatform(col);
          platform = m.platform;
          customPlatform = m.customPlatform;
        }
      }
      return extractSeasonFromTitle({ title, type, platform, customPlatform, notes: "", year });
    }
  }

  const yearMatch = line.match(/\((\d{4})\)|\-\s*(\d{4})\s*$/);
  if (yearMatch) {
    year = yearMatch[1] || yearMatch[2] || "";
    title = line.replace(/\((\d{4})\)|\-\s*(\d{4})\s*$/, "").trim();
  }
  if (/\bserie(s)?\b/i.test(line) || /\bseizoen\b/i.test(line)) {
    type = "serie";
    title = title.replace(/\b-?\s*serie(s)?\b/i, "").trim();
  }
  title = normalizePunctuation(title.replace(/^[-•*]\s*/, ""));

  return extractSeasonFromTitle({ title, type, platform, customPlatform, notes: "", year });
}

function extractSeasonFromTitle(c) {
  if (c.type !== "serie") return c;
  const m = c.title.match(/-?\s*seizoen\s*(\d+)\s*$/i);
  if (m) {
    return { ...c, title: normalizePunctuation(c.title.replace(/-?\s*seizoen\s*\d+\s*$/i, "")), seasonNum: parseInt(m[1], 10) };
  }
  return c;
}

export default function Filmrol() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [expandedEpisodeIds, setExpandedEpisodeIds] = useState(new Set());
  const [loadingShowIds, setLoadingShowIds] = useState(new Set());

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [fileImportError, setFileImportError] = useState(null);
  const [importOutcome, setImportOutcome] = useState(null);
  const [importProcessing, setImportProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState(null);

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("score");
  const [selectedEmojiFilter, setSelectedEmojiFilter] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [form, setForm] = useState({
    title: "", type: "film", platform: "Netflix", customPlatform: "",
    rating: 0, rewatch: null, emoji: null, notes: "", year: "", watched: true,
    seasonsCount: 1, seasonEpisodeCounts: [1], allWatched: true,
  });
  const [formSeasonPage, setFormSeasonPage] = useState(1);
  const [editSeasonPage, setEditSeasonPage] = useState(1);
  const [editSeasonsCountInput, setEditSeasonsCountInput] = useState("");
  const [editEpisodeCountDrafts, setEditEpisodeCountDrafts] = useState({});
  const [dupBlock, setDupBlock] = useState(null);

  const indexSaveTimeoutRef = useRef(null);
  const skipNextIndexSaveRef = useRef(true);
  const showSaveTimeoutsRef = useRef({});
  const mainScrollRef = useRef(null);
  const savedScrollTopRef = useRef(0);

  function captureMainScroll() {
    if (mainScrollRef.current) savedScrollTopRef.current = mainScrollRef.current.scrollTop;
  }

  useEffect(() => {
    if (!editingId && !showForm && !showImport && mainScrollRef.current) {
      const el = mainScrollRef.current;
      const target = savedScrollTopRef.current;
      el.scrollTop = target;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (mainScrollRef.current) mainScrollRef.current.scrollTop = target;
        });
      });
    }
  }, [editingId, showForm, showImport]);

  const [viewportHeight, setViewportHeight] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));

  useEffect(() => {
    let raf = null;
    function updateHeight() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        setViewportHeight((prev) => (Math.abs(prev - h) < 2 ? prev : h));
      });
    }
    updateHeight();
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateHeight);
      window.visualViewport.addEventListener("scroll", updateHeight);
    }
    window.addEventListener("resize", updateHeight);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateHeight);
        window.visualViewport.removeEventListener("scroll", updateHeight);
      }
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover");

    const style = document.createElement("style");
    style.setAttribute("data-kijkwijzer-scroll-fix", "true");
    style.textContent = `html, body { height: 100% !important; margin: 0 !important; overflow: hidden !important; }`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [idxRes] = await Promise.all([
          storageWithRetry(() => window.storage.get(INDEX_KEY, true)).catch(() => null),
          loadDetailKeyRegistry(),
        ]);
        if (idxRes && idxRes.value) setItems(JSON.parse(idxRes.value));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (skipNextIndexSaveRef.current) {
      skipNextIndexSaveRef.current = false;
      return;
    }
    // Nooit stilzwijgend een lege lijst opslaan — dat kan een (nog) niet
    // geladen of losgekoppelde opslag zijn, geen bewuste keuze van de gebruiker.
    if (items.length === 0) return;
    setSaving(true);
    if (indexSaveTimeoutRef.current) clearTimeout(indexSaveTimeoutRef.current);
    indexSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await storageWithRetry(() => window.storage.set(INDEX_KEY, JSON.stringify(items.map(toIndexEntry)), true));
      } catch (e) {
        console.error("Opslaan mislukt:", e);
        alert("Let op: de lijst kon niet worden opgeslagen. Controleer je verbinding; je laatste wijziging is mogelijk niet bewaard.");
      } finally {
        setSaving(false);
      }
    }, 600);
    return () => clearTimeout(indexSaveTimeoutRef.current);
  }, [items]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, debouncedSearch, sortBy]);

  useEffect(() => {
    if (sortBy !== "emoji") setSelectedEmojiFilter(null);
  }, [sortBy]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  function updateItems(updater) {
    setItems((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }

  function scheduleShowSave(item) {
    if (item.type !== "serie" || !Array.isArray(item.seasons)) return;
    const id = item.id;
    if (showSaveTimeoutsRef.current[id]) clearTimeout(showSaveTimeoutsRef.current[id]);
    showSaveTimeoutsRef.current[id] = setTimeout(() => {
      persistShowDetail(item).catch((e) => {
        console.error(e);
        alert(`Let op: de afleveringen van "${item.title}" konden niet worden opgeslagen. Controleer je verbinding en vink nog eens.`);
      });
    }, 600);
  }

  async function exportBackup() {
    setExporting(true);
    const skippedTitles = [];
    try {
      const full = [];
      const BATCH_SIZE = 4;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        const resolved = await Promise.all(batch.map(async (it) => {
          if (it.type === "serie" && !Array.isArray(it.seasons)) {
            try {
              const seasons = (await fetchShowSeasons(it.id)) || skeletonSeasonsFromSummary(it);
              return { ...it, seasons };
            } catch (e) {
              console.error("Seizoenen laden mislukt voor export:", it.title, e);
              skippedTitles.push(it.title);
              return { ...it, seasons: skeletonSeasonsFromSummary(it) };
            }
          }
          return it;
        }));
        full.push(...resolved);
      }
      const payload = { exportedAt: new Date().toISOString(), items: full };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `filmrol-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (skippedTitles.length) {
        alert(`Back-up gedownload, maar bij ${skippedTitles.length} serie(s) konden de seizoenen niet worden opgehaald: ${skippedTitles.slice(0, 5).join(", ")}${skippedTitles.length > 5 ? "…" : ""}. Deze staan met een leeg seizoenskelet in de back-up. Probeer het zo nog eens voor een volledige export.`);
      }
    } catch (e) {
      console.error("Export mislukt:", e);
      alert("Export mislukt. Controleer je verbinding en probeer het opnieuw.");
    } finally {
      setExporting(false);
    }
  }

  function resetForm() {
    setForm({ title: "", type: "film", platform: "Netflix", customPlatform: "", rating: 0, rewatch: null, emoji: null, notes: "", year: "", watched: true, seasonsCount: 1, seasonEpisodeCounts: [1], allWatched: true });
    setFormSeasonPage(1);
  }

  function changeFormSeasonsCount(newCountRaw) {
    if (newCountRaw === "") {
      setForm((prev) => ({ ...prev, seasonsCount: "" }));
      return;
    }
    const count = Math.max(1, parseInt(newCountRaw, 10) || 1);
    setForm((prev) => {
      const counts = [...prev.seasonEpisodeCounts];
      while (counts.length < count) counts.push(1);
      counts.length = count;
      return { ...prev, seasonsCount: count, seasonEpisodeCounts: counts };
    });
    const totalPages = Math.ceil(count / SEASONS_PER_PAGE) || 1;
    setFormSeasonPage((p) => Math.min(p, totalPages));
  }

  function changeFormSeasonEpisodeCount(idx, val) {
    setForm((prev) => {
      const counts = [...prev.seasonEpisodeCounts];
      counts[idx] = val === "" ? "" : Math.max(1, parseInt(val, 10) || 1);
      return { ...prev, seasonEpisodeCounts: counts };
    });
  }

  async function addItem() {
    if (!form.title.trim()) return;
    const title = normalizePunctuation(form.title.trim());

    if (form.type === "film") {
      const exact = items.find((i) => i.type === "film" && normKey(i.title) === normKey(title));
      if (exact) { setDupBlock(exact.title); return; }
      const newItem = {
        id: uid(), title, type: "film", platform: form.platform,
        customPlatform: form.platform === "Anders" ? form.customPlatform.trim() : "",
        rating: form.rating, rewatch: form.rewatch || null, emoji: form.emoji || null,
        notes: form.notes.trim(), year: form.year.trim(),
        addedAt: new Date().toISOString(), watched: form.watched !== false,
      };
      setItems((prev) => [newItem, ...prev]);
      resetForm(); setDupBlock(null); setShowForm(false);
      return;
    }

    const seasonsCount = Math.max(1, parseInt(form.seasonsCount, 10) || 1);
    const newSeasons = Array.from({ length: seasonsCount }, (_, idx) => {
      const total = Math.max(1, parseInt(form.seasonEpisodeCounts[idx], 10) || 1);
      return { num: idx + 1, episodes: Array.from({ length: total }, (_, i) => ({ num: i + 1, watched: form.allWatched })) };
    });

    const exactShow = items.find((i) => i.type === "serie" && normKey(i.title) === normKey(title));
    if (exactShow) {
      let seasons;
      try {
        seasons = Array.isArray(exactShow.seasons) ? exactShow.seasons : (await fetchShowSeasons(exactShow.id)) || skeletonSeasonsFromSummary(exactShow);
      } catch (e) {
        alert(`"${exactShow.title}" bestaat al, maar de seizoenen konden nu niet worden geladen. Probeer het zo nog eens.`);
        return;
      }
      const allAlreadyPresent = newSeasons.every((ns) => seasons.some((s) => s.num === ns.num));
      if (allAlreadyPresent) { setDupBlock(exactShow.title); return; }

      const merged = [...seasons];
      newSeasons.forEach((ns) => {
        const idx = merged.findIndex((s) => s.num === ns.num);
        if (idx !== -1) merged[idx] = ns; else merged.push(ns);
      });
      merged.sort((a, b) => a.num - b.num);
      const updated = withSummary({ ...exactShow, seasons: merged, rewatch: form.rewatch || exactShow.rewatch || null, emoji: form.emoji || exactShow.emoji || null });
      setItems((prev) => prev.map((i) => (i.id === exactShow.id ? updated : i)));
      try {
        await persistShowDetail(updated);
      } catch (e) {
        alert(`Let op: de seizoenen van "${updated.title}" konden niet worden opgeslagen. Open de serie via bewerken en sla nog eens op.`);
      }
    } else {
      const newItem = withSummary({
        id: uid(), title, type: "serie", platform: form.platform,
        customPlatform: form.platform === "Anders" ? form.customPlatform.trim() : "",
        rating: form.rating, rewatch: form.rewatch || null, emoji: form.emoji || null,
        notes: form.notes.trim(), year: form.year.trim(),
        addedAt: new Date().toISOString(), seasons: newSeasons,
      });
      setItems((prev) => [newItem, ...prev]);
      try {
        await persistShowDetail(newItem);
      } catch (e) {
        alert(`Let op: de seizoenen van "${newItem.title}" konden niet worden opgeslagen. Open de serie via bewerken en sla nog eens op.`);
      }
    }

    resetForm(); setDupBlock(null); setShowForm(false);
  }

  function removeItem(id) {
    updateItems((prev) => prev.filter((i) => i.id !== id));
    detailKeyRegistry.ids.delete(id);
    window.storage.delete(showKey(id), true).catch(() => {});
  }

  function updateRating(id, rating) {
    updateItems((prev) => prev.map((i) => (i.id === id ? { ...i, rating } : i)));
  }

  function toggleFilmWatched(id) {
    updateItems((prev) => prev.map((i) => (i.id === id ? { ...i, watched: i.watched === false ? true : false } : i)));
  }

  async function toggleExpandedEpisode(item) {
    const id = item.id;
    const isOpening = !expandedEpisodeIds.has(id);
    setExpandedEpisodeIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    if (isOpening && item.type === "serie" && !Array.isArray(item.seasons)) {
      setLoadingShowIds((prev) => new Set(prev).add(id));
      try {
        const seasons = (await fetchShowSeasons(id)) || skeletonSeasonsFromSummary(item);
        updateItems((prev) => prev.map((i) => (i.id === id ? { ...i, seasons } : i)));
      } catch (e) {
        alert(`De seizoenen van "${item.title}" konden nu niet worden geladen. Probeer het zo nog eens.`);
        setExpandedEpisodeIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      } finally {
        setLoadingShowIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      }
    }
  }

  function toggleSeasonEpisode(itemId, seasonIdx, epIdx) {
    const current = items.find((i) => i.id === itemId);
    if (!current || !Array.isArray(current.seasons)) return;
    const seasons = current.seasons.map((s, sIdx) => sIdx !== seasonIdx ? s : { ...s, episodes: s.episodes.map((e, eIdx) => (eIdx === epIdx ? { ...e, watched: !e.watched } : e)) });
    const updated = withSummary({ ...current, seasons });
    updateItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
    scheduleShowSave(updated);
  }

  function setAllSeasonEpisodes(itemId, seasonIdx, val) {
    const current = items.find((i) => i.id === itemId);
    if (!current || !Array.isArray(current.seasons)) return;
    const seasons = current.seasons.map((s, sIdx) => sIdx !== seasonIdx ? s : { ...s, episodes: s.episodes.map((e) => ({ ...e, watched: val })) });
    const updated = withSummary({ ...current, seasons });
    updateItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
    scheduleShowSave(updated);
  }

  async function startEdit(item) {
    let seasons = item.seasons;
    if (item.type === "serie" && !Array.isArray(seasons)) {
      try {
        seasons = (await fetchShowSeasons(item.id)) || skeletonSeasonsFromSummary(item);
      } catch (e) {
        alert(`De seizoenen van "${item.title}" konden nu niet worden geladen. Probeer het zo nog eens — er is niets overschreven.`);
        return;
      }
      updateItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, seasons } : i)));
    }
    setEditingId(item.id);
    setEditSeasonPage(1);
    const initialSeasons = item.type === "serie"
      ? (seasons && seasons.length ? seasons : [{ num: 1, episodes: [{ num: 1, watched: false }] }]).map((s) => ({ num: s.num, episodes: s.episodes.map((e) => ({ ...e })) }))
      : [];
    setEditSeasonsCountInput(item.type === "serie" ? String(initialSeasons.length) : "");
    setEditForm({
      title: item.title,
      type: item.type,
      platform: item.platform,
      customPlatform: item.customPlatform || "",
      year: item.year || "",
      notes: item.notes || "",
      rewatch: item.rewatch || null,
      emoji: item.emoji || null,
      watched: item.watched !== false,
      seasons: initialSeasons,
    });
  }

  function changeEditSeasonsCount(newCountRaw) {
    if (newCountRaw === "") return;
    const count = Math.max(1, parseInt(newCountRaw, 10) || 1);
    setEditForm((prev) => {
      const seasons = [...prev.seasons];
      while (seasons.length < count) seasons.push({ num: seasons.length + 1, episodes: [{ num: 1, watched: false }] });
      seasons.length = count;
      return { ...prev, seasons: seasons.map((s, idx) => ({ ...s, num: idx + 1 })) };
    });
    const totalPages = Math.ceil(count / SEASONS_PER_PAGE) || 1;
    setEditSeasonPage((p) => Math.min(p, totalPages));
  }

  function changeEditSeasonEpisodeTotal(seasonIdx, newTotalRaw) {
    setEditEpisodeCountDrafts((prev) => ({ ...prev, [seasonIdx]: newTotalRaw }));
    if (newTotalRaw === "") return;
    const total = Math.max(1, parseInt(newTotalRaw, 10) || 1);
    setEditForm((prev) => {
      const seasons = prev.seasons.map((s, idx) => {
        if (idx !== seasonIdx) return s;
        const current = s.episodes;
        let episodes;
        if (total > current.length) {
          episodes = [...current, ...Array.from({ length: total - current.length }, (_, i) => ({ num: current.length + i + 1, watched: false }))];
        } else {
          episodes = current.slice(0, total);
        }
        episodes = episodes.map((e, i) => ({ ...e, num: i + 1 }));
        return { ...s, episodes };
      });
      return { ...prev, seasons };
    });
  }

  function toggleEditSeasonEpisode(seasonIdx, epIdx) {
    setEditForm((prev) => ({ ...prev, seasons: prev.seasons.map((s, idx) => idx !== seasonIdx ? s : { ...s, episodes: s.episodes.map((e, i) => (i === epIdx ? { ...e, watched: !e.watched } : e)) }) }));
  }

  function setAllEditSeasonEpisodes(seasonIdx, val) {
    setEditForm((prev) => ({ ...prev, seasons: prev.seasons.map((s, idx) => idx !== seasonIdx ? s : { ...s, episodes: s.episodes.map((e) => ({ ...e, watched: val })) }) }));
  }

  async function saveEdit() {
    if (!editForm.title.trim()) return;
    const current = items.find((i) => i.id === editingId);
    if (!current) { setEditingId(null); setEditForm(null); return; }
    let base = {
      id: current.id,
      title: normalizePunctuation(editForm.title.trim()),
      type: editForm.type,
      platform: editForm.platform,
      customPlatform: editForm.platform === "Anders" ? editForm.customPlatform.trim() : "",
      rating: current.rating,
      rewatch: editForm.rewatch || null,
      emoji: editForm.emoji || null,
      notes: editForm.notes.trim(),
      year: editForm.year.trim(),
      addedAt: current.addedAt,
    };
    if (editForm.type === "serie") {
      base.seasons = editForm.seasons.length ? editForm.seasons : [{ num: 1, episodes: [{ num: 1, watched: false }] }];
      base = withSummary(base);
    } else {
      base.watched = editForm.watched !== false;
    }
    updateItems((prev) => prev.map((i) => (i.id === editingId ? base : i)));
    setEditingId(null);
    setEditForm(null);
    try {
      await persistShowDetail(base);
    } catch (e) {
      alert(`Let op: de seizoenen van "${base.title}" konden niet worden opgeslagen. Open de serie opnieuw via bewerken en sla nog eens op.`);
    }
  }

  async function processImportCandidates(candidates) {
    const needsType = candidates.filter((c) => !c.type);
    const typed = candidates.filter((c) => c.type);

    const duplicates = [];
    const toAdd = [];

    for (const c of typed) {
      if (c.type === "film") {
        const exact = items.find((i) => i.type === "film" && normKey(i.title) === normKey(c.title));
        if (exact) { duplicates.push(c); continue; }
        toAdd.push(c);
        continue;
      }
      const seasonNum = c.seasonNum || 1;
      const existingShow = items.find((i) => i.type === "serie" && normKey(i.title) === normKey(c.title));
      if (existingShow) {
        const seasons = Array.isArray(existingShow.seasons) ? existingShow.seasons : (await fetchShowSeasons(existingShow.id)) || skeletonSeasonsFromSummary(existingShow);
        const hasSeason = seasons.some((s) => s.num === seasonNum);
        if (hasSeason) { duplicates.push(c); continue; }
      }
      toAdd.push(c);
    }

    let addedCount = 0;
    if (toAdd.length) {
      const { items: next, touchedShowIds } = await mergeCandidatesIntoItems(items, toAdd);
      setItems(next);
      if (touchedShowIds.size) {
        setImportProgress({ done: 0, total: touchedShowIds.size });
        const failedTitles = await persistTouchedShows(next, touchedShowIds, (done, total) => setImportProgress({ done, total }));
        setImportProgress(null);
        if (failedTitles.length) {
          alert(`Let op: bij ${failedTitles.length} serie(s) konden de seizoenen niet worden opgeslagen: ${failedTitles.slice(0, 5).join(", ")}${failedTitles.length > 5 ? "…" : ""}. Open ze via bewerken en sla opnieuw op.`);
        }
      }
      addedCount = toAdd.length;
    }

    return { addedCount, duplicates, needsType };
  }

  async function handleImport() {
    const lines = importText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setImportProcessing(true);
    setImportProgress(null);
    try {
      const candidates = dedupeWithinBatch(lines.map(parseImportLine).filter(Boolean));
      const outcome = await processImportCandidates(candidates);
      setImportOutcome(outcome);
      setImportText("");
    } catch (err) {
      console.error(err);
      setFileImportError("Import mislukt: " + (err.message || String(err)));
    } finally {
      setImportProcessing(false);
    }
  }

  async function resolveNeedsType(idx, type) {
    const cand = { ...importOutcome.needsType[idx], type };
    let result;
    try {
      result = await processImportCandidates([cand]);
    } catch (err) {
      console.error(err);
      setFileImportError("Toevoegen mislukt: " + (err.message || String(err)));
      return;
    }
    setImportOutcome((prev) => ({
      addedCount: prev.addedCount + result.addedCount,
      duplicates: [...prev.duplicates, ...result.duplicates],
      needsType: prev.needsType.filter((_, i) => i !== idx),
    }));
  }

  function skipNeedsType(idx) {
    setImportOutcome((prev) => ({ ...prev, needsType: prev.needsType.filter((_, i) => i !== idx) }));
  }

  function closeImportModal() {
    setShowImport(false);
    setImportText("");
    setImportOutcome(null);
    setFileImportError(null);
    setImportProgress(null);
  }

  async function handleBackupUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileImportError(null);
    setImportProcessing(true);
    setImportProgress(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const backupItems = Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed) ? parsed : null;
      if (!backupItems) { setFileImportError("Kon geen geldige back-up herkennen in dit bestand."); return; }

      const duplicates = [];
      const toAdd = [];
      backupItems.forEach((b) => {
        if (!b || !b.title || !b.type) return;
        const exact = items.find((i) => i.type === b.type && normKey(i.title) === normKey(b.title));
        if (exact) { duplicates.push(b); return; }
        toAdd.push(b);
      });

      if (toAdd.length) {
        const newItems = toAdd.map((b) => {
          const base = {
            id: uid(), title: normalizePunctuation(b.title), type: b.type,
            platform: b.platform || "Anders", customPlatform: b.customPlatform || "",
            rating: b.rating || 0, notes: b.notes || "", year: b.year || "",
            addedAt: b.addedAt || new Date().toISOString(),
          };
          if (b.type === "film") {
            base.watched = b.watched !== false;
          } else {
            base.seasons = Array.isArray(b.seasons) && b.seasons.length ? b.seasons : [{ num: 1, episodes: [{ num: 1, watched: false }] }];
          }
          return withSummary(base);
        });
        setItems((prev) => [...newItems, ...prev]);
        const seriesCount = newItems.filter((it) => it.type === "serie").length;
        if (seriesCount) {
          setImportProgress({ done: 0, total: seriesCount });
          const failedTitles = await persistItemsWithProgress(newItems, (done, total) => setImportProgress({ done, total }));
          setImportProgress(null);
          if (failedTitles.length) {
            alert(`Let op: bij ${failedTitles.length} serie(s) konden de seizoenen niet worden opgeslagen: ${failedTitles.slice(0, 5).join(", ")}${failedTitles.length > 5 ? "…" : ""}. Open ze via bewerken en sla opnieuw op.`);
          }
        }
      }

      setImportOutcome({ addedCount: toAdd.length, duplicates, needsType: [] });
      e.target.value = "";
    } catch (err) {
      console.error(err);
      setFileImportError("Kon het back-upbestand niet lezen: " + (err.message || String(err)));
    } finally {
      setImportProcessing(false);
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileImportError(null);
    setImportProcessing(true);
    setImportProgress(null);
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      let rows = [];

      if (ext === "csv") {
        const text = await file.text();
        const parsed = Papa.parse(text, {
          header: true, skipEmptyLines: true, dynamicTyping: false,
          delimitersToGuess: [",", ";", "\t", "|"], transformHeader: (h) => h.trim(),
        });
        rows = parsed.data || [];
      } else if (ext === "xlsx" || ext === "xls") {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      } else {
        setFileImportError("Alleen .csv, .xlsx of .xls bestanden worden ondersteund.");
        return;
      }

      if (!rows.length) {
        setFileImportError("Geen rijen gevonden in het bestand.");
        return;
      }

      const headers = Object.keys(rows[0]).map((h) => h.trim());
      const titleKey = headers.find((h) => /titel|title|naam|name/i.test(h));
      const yearKey = headers.find((h) => /jaar|year/i.test(h));
      const platformKey = headers.find((h) => /platform/i.test(h));
      const typeKey = headers.find((h) => /film.?serie|type|soort/i.test(h));
      const seasonKey = headers.find((h) => /seizoen|season/i.test(h));
      const episodesKey = headers.find((h) => /afleveringen|episodes/i.test(h));

      let candidates;
      if (typeKey || platformKey) {
        candidates = rows
          .map((row) => {
            const title = titleKey ? String(row[titleKey] ?? "").trim() : String(Object.values(row)[0] ?? "").trim();
            if (!title) return null;
            const typeRaw = typeKey ? String(row[typeKey] || "").trim().toLowerCase() : "";
            let type = null;
            if (/^film/.test(typeRaw)) type = "film";
            else if (/^serie/.test(typeRaw)) type = "serie";
            const { platform, customPlatform } = matchPlatform(platformKey ? row[platformKey] : "");
            const c = {
              title: normalizePunctuation(title), type, platform, customPlatform, notes: "",
              year: yearKey ? String(row[yearKey] || "").trim() : "",
            };
            if (type === "serie") {
              if (seasonKey && row[seasonKey]) c.seasonNum = Number(row[seasonKey]) || 1;
              if (episodesKey && row[episodesKey]) { c.episodesTotal = Number(row[episodesKey]) || 1; c.episodesWatched = c.episodesTotal; }
            } else if (type === "film") {
              c.watched = true;
            }
            return c;
          })
          .filter(Boolean);
      } else {
        const rawTitles = rows.map((row) => (titleKey ? row[titleKey] : Object.values(row)[0]));
        candidates = groupNetflixTitles(rawTitles);
      }

      if (!candidates.length) {
        setFileImportError("Kon geen titels herkennen in het bestand.");
        return;
      }

      const deduped = dedupeWithinBatch(candidates);
      const outcome = await processImportCandidates(deduped);
      setImportOutcome(outcome);
      e.target.value = "";
    } catch (err) {
      console.error(err);
      setFileImportError("Kon het bestand niet lezen: " + (err.message || String(err)));
    } finally {
      setImportProcessing(false);
    }
  }

  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    let list = items
      .filter((i) => {
        if (filter === "all") return true;
        if (filter === "film") return i.type === "film";
        if (filter === "serie") return i.type === "serie";
        if (filter === "towatch") return isToWatch(i);
        return true;
      })
      .filter((i) => i.title.toLowerCase().includes(term));

    if (sortBy === "emoji" && selectedEmojiFilter) {
      list = list.filter((i) => i.emoji === selectedEmojiFilter);
    }

    return list.sort((a, b) => {
      if (sortBy === "recent") return new Date(b.addedAt) - new Date(a.addedAt);
      if (sortBy === "rating") return b.rating - a.rating;
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return computeScore(b) - computeScore(a);
    });
  }, [items, filter, debouncedSearch, sortBy, selectedEmojiFilter]);

  const emojiCounts = useMemo(() => {
    const counts = {};
    EMOJI_OPTIONS.forEach((o) => { counts[o.key] = 0; });
    items.forEach((i) => { if (i.emoji && counts[i.emoji] !== undefined) counts[i.emoji] += 1; });
    return counts;
  }, [items]);

  const visibleItems = filtered.slice(0, visibleCount);

  const stats = {
    total: items.length,
    films: items.filter((i) => i.type === "film").length,
    series: items.filter((i) => i.type === "serie").length,
    toWatch: items.filter(isToWatch).length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-neutral-400">
          <Loader2 className="animate-spin" size={20} />
          <span>Filmrol laden...</span>
        </div>
      </div>
    );
  }

  if (editingId && editForm) {
    const totalEditPages = Math.ceil(editForm.seasons.length / SEASONS_PER_PAGE) || 1;
    const editPageStart = (editSeasonPage - 1) * SEASONS_PER_PAGE;
    const editPageSeasons = editForm.seasons.slice(editPageStart, editPageStart + SEASONS_PER_PAGE);

    return (
      <div className="flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden" style={{ height: viewportHeight }}>
        <div className="shrink-0 border-b border-neutral-800 bg-neutral-900 px-4 py-4 flex items-center gap-3">
          <button onClick={() => { setEditingId(null); setEditForm(null); }} className="text-neutral-400 hover:text-neutral-200 p-1 -ml-1">
            <ChevronLeft size={22} />
          </button>
          <h2 className="text-lg font-semibold">Titel bewerken</h2>
        </div>
        <div className="flex-1 overflow-y-auto" ref={mainScrollRef}>
          <div className="max-w-md mx-auto px-4 py-5 space-y-3">
            <input
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              placeholder="Titel"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50"
              autoFocus
            />
            <div className="flex gap-2">
              <input
                value={editForm.year}
                onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                placeholder="Jaar (optioneel)"
                className="w-24 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50"
              />
              <select
                value={editForm.type}
                onChange={(e) => setEditForm({ ...editForm, type: e.target.value, seasons: e.target.value === "serie" ? (editForm.seasons.length ? editForm.seasons : [{ num: 1, episodes: [{ num: 1, watched: false }] }]) : editForm.seasons })}
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50"
              >
                <option value="film">Film</option>
                <option value="serie">Serie</option>
              </select>
            </div>
            <select
              value={editForm.platform}
              onChange={(e) => setEditForm({ ...editForm, platform: e.target.value })}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50"
            >
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {editForm.platform === "Anders" && (
              <input
                value={editForm.customPlatform}
                onChange={(e) => setEditForm({ ...editForm, customPlatform: e.target.value })}
                placeholder="Welk platform?"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50"
              />
            )}
            {editForm.type === "film" ? (
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input type="checkbox" checked={editForm.watched} onChange={(e) => setEditForm({ ...editForm, watched: e.target.checked })} className="accent-amber-500" />
                Al gezien
              </label>
            ) : (
              <div className="bg-neutral-800/60 border border-neutral-700 rounded-lg p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-neutral-400">Aantal seizoenen</label>
                  <input
                    type="number"
                    min={1}
                    value={editSeasonsCountInput}
                    onChange={(e) => changeEditSeasonsCount(e.target.value)}
                    onBlur={() => { if (!editSeasonsCountInput) { setEditSeasonsCountInput(String(editForm.seasons.length)); } }}
                    className="w-20 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div className="space-y-4">
                  {editPageSeasons.map((season, i) => {
                    const sIdx = editPageStart + i;
                    const sst = { watched: season.episodes.filter((e) => e.watched).length, total: season.episodes.length };
                    return (
                      <div key={sIdx} className={i > 0 ? "border-t border-neutral-700 pt-3" : ""}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium">Seizoen {season.num}</span>
                          <span className="text-xs text-neutral-500">{sst.watched}/{sst.total} afl.</span>
                          <input
                            type="number"
                            min={1}
                            value={editEpisodeCountDrafts[sIdx] !== undefined ? editEpisodeCountDrafts[sIdx] : season.episodes.length}
                            onChange={(e) => changeEditSeasonEpisodeTotal(sIdx, e.target.value)}
                            onBlur={() => setEditEpisodeCountDrafts((prev) => { const n = { ...prev }; delete n[sIdx]; return n; })}
                            className="w-16 ml-auto bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-amber-500/50"
                          />
                        </div>
                        <EpisodeGrid
                          episodes={season.episodes}
                          onToggle={(epIdx) => toggleEditSeasonEpisode(sIdx, epIdx)}
                          onSetAll={(val) => setAllEditSeasonEpisodes(sIdx, val)}
                        />
                      </div>
                    );
                  })}
                </div>
                <SeasonPagination page={editSeasonPage} totalPages={totalEditPages} onChange={setEditSeasonPage} />
              </div>
            )}
            <div className="bg-neutral-800/60 border border-neutral-700 rounded-lg p-3 space-y-4">
              <div>
                <label className="text-xs text-neutral-400 mb-1.5 block">Zou je 'm opnieuw kijken?</label>
                <RewatchPicker value={editForm.rewatch} onChange={(v) => setEditForm({ ...editForm, rewatch: v })} />
              </div>
              <div>
                <label className="text-xs text-neutral-400 mb-1.5 block">Hoe zou je 'm omschrijven?</label>
                <EmojiPicker value={editForm.emoji} onChange={(v) => setEditForm({ ...editForm, emoji: v })} />
              </div>
            </div>
            <textarea
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              placeholder="Notities (optioneel)"
              rows={2}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
        </div>
        <div className="shrink-0 border-t border-neutral-800 bg-neutral-900 px-4 py-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <button
            onClick={saveEdit}
            disabled={!editForm.title.trim()}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-neutral-950 rounded-lg py-3.5 font-bold text-sm transition-colors"
          >
            Opslaan
          </button>
        </div>
      </div>
    );
  }

  if (showForm) {
    const totalFormPages = Math.ceil(form.seasonsCount / SEASONS_PER_PAGE) || 1;
    const formPageStart = (formSeasonPage - 1) * SEASONS_PER_PAGE;
    const formPageSeasons = form.seasonEpisodeCounts.slice(formPageStart, formPageStart + SEASONS_PER_PAGE);

    return (
      <div className="flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden" style={{ height: viewportHeight }}>
        <div className="shrink-0 border-b border-neutral-800 bg-neutral-900 px-4 py-4 flex items-center gap-3">
          <button onClick={() => { setShowForm(false); setDupBlock(null); }} className="text-neutral-400 hover:text-neutral-200 p-1 -ml-1">
            <ChevronLeft size={22} />
          </button>
          <h2 className="text-lg font-semibold">Nieuwe titel toevoegen</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-md mx-auto px-4 py-5 space-y-3">
            <input
              value={form.title}
              onChange={(e) => { setForm({ ...form, title: e.target.value }); setDupBlock(null); }}
              placeholder="Titel"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50"
              autoFocus
            />
            <div className="flex gap-2">
              <input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="Jaar (optioneel)" className="w-24 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50" />
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50">
                <option value="film">Film</option>
                <option value="serie">Serie</option>
              </select>
            </div>
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50">
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {form.platform === "Anders" && (
              <input value={form.customPlatform} onChange={(e) => setForm({ ...form, customPlatform: e.target.value })} placeholder="Welk platform?" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50" />
            )}
            {form.type === "film" ? (
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input type="checkbox" checked={form.watched} onChange={(e) => setForm({ ...form, watched: e.target.checked })} className="accent-amber-500" />
                Al gezien
              </label>
            ) : (
              <div className="bg-neutral-800/60 border border-neutral-700 rounded-lg p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-neutral-400">Aantal seizoenen</label>
                  <input
                    type="number"
                    min={1}
                    value={form.seasonsCount}
                    onChange={(e) => changeFormSeasonsCount(e.target.value)}
                    onBlur={() => { if (form.seasonsCount === "") changeFormSeasonsCount(1); }}
                    className="w-20 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div className="space-y-2">
                  {formPageSeasons.map((count, i) => {
                    const idx = formPageStart + i;
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-xs text-neutral-400 w-20 shrink-0">Seizoen {idx + 1}</span>
                        <input
                          type="number"
                          min={1}
                          value={count}
                          onChange={(e) => changeFormSeasonEpisodeCount(idx, e.target.value)}
                          className="w-20 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-amber-500/50"
                        />
                        <span className="text-xs text-neutral-500">afleveringen</span>
                      </div>
                    );
                  })}
                </div>
                <SeasonPagination page={formSeasonPage} totalPages={totalFormPages} onChange={setFormSeasonPage} />
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input type="checkbox" checked={form.allWatched} onChange={(e) => setForm({ ...form, allWatched: e.target.checked })} className="accent-amber-500" />
                  Alle afleveringen al gezien
                </label>
              </div>
            )}
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Beoordeling</label>
              <StarRating value={form.rating} onChange={(r) => setForm({ ...form, rating: r })} size={22} />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1.5 block">Zou je 'm opnieuw kijken?</label>
              <RewatchPicker value={form.rewatch} onChange={(v) => setForm({ ...form, rewatch: v })} />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1.5 block">Hoe zou je 'm omschrijven?</label>
              <EmojiPicker value={form.emoji} onChange={(v) => setForm({ ...form, emoji: v })} />
            </div>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notities (optioneel)" rows={2} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50 resize-none" />
            {dupBlock && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5">
                <div className="flex items-start gap-2 text-xs text-red-300">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>Deze heb je al toegevoegd! "{dupBlock}" staat al in je lijst.</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 border-t border-neutral-800 bg-neutral-900 px-4 py-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <button
            onClick={addItem}
            disabled={!form.title.trim()}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-neutral-950 rounded-lg py-3.5 font-bold text-sm transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={18} /> Toevoegen
          </button>
        </div>
      </div>
    );
  }

  if (showImport) {
    return (
      <div className="flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden" style={{ height: viewportHeight }}>
        <div className="shrink-0 border-b border-neutral-800 bg-neutral-900 px-4 py-4 flex items-center gap-3">
          <button onClick={closeImportModal} className="text-neutral-400 hover:text-neutral-200 p-1 -ml-1">
            <ChevronLeft size={22} />
          </button>
          <h2 className="text-lg font-semibold">Lijst plakken</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-4 py-5">
            {!importOutcome ? (
              <div className="space-y-3">
                <p className="text-xs text-neutral-500">Eén titel per regel. Werkt met platte tekst ("Oppenheimer (2023)", "The Bear - Seizoen 2") én met CSV-regels ("Titel, 2023, Netflix, serie"). Titels die je al hebt worden automatisch overgeslagen.</p>
                <label className="flex items-center justify-center gap-2 w-full border border-dashed border-neutral-700 hover:border-amber-500/50 rounded-lg py-3 text-sm text-neutral-400 hover:text-neutral-200 cursor-pointer transition-colors">
                  <Upload size={16} />
                  Upload een .csv of .xlsx bestand
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                </label>
                <label className="flex items-center justify-center gap-2 w-full border border-dashed border-neutral-700 hover:border-amber-500/50 rounded-lg py-3 text-sm text-neutral-400 hover:text-neutral-200 cursor-pointer transition-colors">
                  <Download size={16} />
                  Herstel vanuit back-up (.json)
                  <input type="file" accept=".json" onChange={handleBackupUpload} className="hidden" />
                </label>
                {fileImportError && <p className="text-xs text-red-400">{fileImportError}</p>}
                <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"Bijv.\nOppenheimer (2023)\nThe Bear - Seizoen 2\nDune: Part Two, 2024, Bioscoop, film"} rows={8} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-amber-500/50 resize-none" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-neutral-800/50 rounded-lg p-3 text-sm">
                  {importOutcome.addedCount > 0 && <p className="text-neutral-200">{importOutcome.addedCount} titel(s) toegevoegd.</p>}
                  {importOutcome.duplicates.length > 0 && (
                    <p className="text-amber-400 mt-1">
                      {importOutcome.duplicates.length} overgeslagen (had je al): {importOutcome.duplicates.map((d) => d.title).join(", ")}
                    </p>
                  )}
                  {importOutcome.addedCount === 0 && importOutcome.duplicates.length === 0 && importOutcome.needsType.length === 0 && (
                    <p className="text-neutral-400">Niks gevonden om te verwerken.</p>
                  )}
                </div>
                {importOutcome.needsType.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-200 mb-2">Kies film of serie ({importOutcome.needsType.length})</h3>
                    <div className="space-y-2">
                      {importOutcome.needsType.map((c, i) => (
                        <TypePickRow key={i} cand={c} onConfirm={(type) => resolveNeedsType(i, type)} onSkip={() => skipNeedsType(i)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 border-t border-neutral-800 bg-neutral-900 px-4 py-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          {importProgress ? (
            <div className="space-y-1.5">
              <div className="h-2.5 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-200"
                  style={{ width: `${Math.round((importProgress.done / Math.max(1, importProgress.total)) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-neutral-400 text-center">
                {Math.round((importProgress.done / Math.max(1, importProgress.total)) * 100)}% verwerkt · {importProgress.done}/{importProgress.total} titels
              </p>
            </div>
          ) : !importOutcome ? (
            <button
              onClick={handleImport}
              disabled={!importText.trim() || importProcessing}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-neutral-950 rounded-lg py-3.5 font-bold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {importProcessing && <Loader2 size={16} className="animate-spin" />}
              {importProcessing ? "Verwerken..." : `${importText.split("\n").filter((l) => l.trim()).length || 0} titels verwerken`}
            </button>
          ) : (
            <button onClick={closeImportModal} className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-lg py-3.5 font-bold text-sm transition-colors">
              Klaar
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden" style={{ height: viewportHeight }}>
      <div className="shrink-0 border-b border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 min-w-0">
                <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent truncate">
                  Filmrol
                </h1>
                <span className="text-[10px] text-neutral-600 whitespace-nowrap shrink-0">{APP_VERSION}</span>
              </div>
              <p className="text-neutral-500 text-xs mt-0.5 truncate">
                {stats.total} titels · {stats.films} films · {stats.series} series · {stats.toWatch} nog te zien
                {saving && <span className="ml-1 text-amber-500">· opslaan...</span>}
              </p>
            </div>
            <button
              onClick={() => { captureMainScroll(); setShowForm(true); }}
              title="Titel toevoegen"
              className="flex items-center justify-center w-11 h-11 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-lg transition-colors shrink-0"
            >
              <Plus size={22} strokeWidth={2.5} />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { captureMainScroll(); setShowImport(true); }}
              className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-medium transition-colors"
            >
              <Upload size={14} /> Plak lijst
            </button>
            <button
              onClick={exportBackup}
              disabled={exporting || items.length === 0}
              title="Exporteer back-up"
              className="flex items-center justify-center w-9 h-9 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 rounded-lg transition-colors"
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" ref={mainScrollRef}>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek op titel..."
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-1 flex-wrap">
              {[
                { key: "all", label: "Alles" },
                { key: "film", label: "Films" },
                { key: "serie", label: "Series" },
                { key: "towatch", label: "Nog zien" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${filter === f.key ? "bg-amber-500 text-neutral-950 font-medium" : "text-neutral-400 hover:text-neutral-200"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50"
            >
              <option value="score" disabled hidden>Best beoordeeld</option>
              <option value="title">Alfabetisch</option>
              <option value="rating">Filmster(ren)</option>
              <option value="emoji">Emotji</option>
              <option value="recent">Meest recent</option>
            </select>
          </div>

          {sortBy === "emoji" && (
            <div className="flex flex-wrap gap-2 mb-4 bg-neutral-900 border border-neutral-800 rounded-lg p-3">
              {EMOJI_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSelectedEmojiFilter((prev) => (prev === opt.key ? null : opt.key))}
                  title={opt.label}
                  className={`relative w-12 h-12 flex items-center justify-center rounded-lg text-2xl border transition-colors ${
                    selectedEmojiFilter === opt.key ? "bg-amber-500/20 border-amber-500" : "bg-neutral-800 border-neutral-700 hover:border-neutral-600"
                  }`}
                >
                  {opt.emoji}
                  <span className="absolute -top-1.5 -right-1.5 bg-neutral-700 text-neutral-200 text-[10px] font-medium rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                    {emojiCounts[opt.key]}
                  </span>
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-neutral-500">
              <Film size={40} className="mx-auto mb-3 opacity-40" />
              {items.length === 0 ? (
                <div className="max-w-xs mx-auto space-y-3">
                  <p className="text-amber-400 font-medium text-sm">Lijst is leeg</p>
                  <p className="text-xs text-neutral-500">Als je eerder al titels had toegevoegd, is dit vermoedelijk niet je punt om opnieuw te beginnen — herstel eerst vanuit een back-up voordat je iets nieuws toevoegt.</p>
                  <label className="flex items-center justify-center gap-2 w-full border border-dashed border-amber-500/40 hover:border-amber-500/70 rounded-lg py-2.5 text-sm text-amber-400 hover:text-amber-300 cursor-pointer transition-colors">
                    <Download size={14} />
                    Herstel vanuit back-up (.json)
                    <input type="file" accept=".json" onChange={handleBackupUpload} className="hidden" />
                  </label>
                  <p className="text-[11px] text-neutral-600">Geen back-up? Begin dan met een titel of plak je lijst.</p>
                </div>
              ) : (
                <p>Geen resultaten gevonden.</p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {visibleItems.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    isExpanded={expandedEpisodeIds.has(item.id)}
                    isLoadingDetail={loadingShowIds.has(item.id)}
                    onToggleExpand={() => toggleExpandedEpisode(item)}
                    onToggleFilmWatched={() => toggleFilmWatched(item.id)}
                    onToggleSeasonEpisode={(seasonIdx, epIdx) => toggleSeasonEpisode(item.id, seasonIdx, epIdx)}
                    onSetAllSeasonEpisodes={(seasonIdx, val) => setAllSeasonEpisodes(item.id, seasonIdx, val)}
                    onUpdateRating={(r) => updateRating(item.id, r)}
                    onEdit={() => { captureMainScroll(); startEdit(item); }}
                    onRemove={() => removeItem(item.id)}
                  />
                ))}
              </div>
              {filtered.length > visibleCount && (
                <button
                  onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                  className="w-full mt-4 py-3 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-lg text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  Meer laden ({filtered.length - visibleCount} resterend)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
