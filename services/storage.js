import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { analyzeFoodWithClaude } from './claudeApi';

// ── Cloud backup ──────────────────────────────────────────────────────────────

async function getUserId() {
  let id = await AsyncStorage.getItem('userId');
  if (!id) {
    id = 'user_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    await AsyncStorage.setItem('userId', id);
  }
  return id;
}

const BACKUP_URL = Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? null  // skip backup in local dev
  : '/backup';

export async function syncBackup() {
  if (!BACKUP_URL) return;
  try {
    const userId = await getUserId();
    const food = JSON.parse(await AsyncStorage.getItem('foodEntries') || '[]');
    const symptoms = JSON.parse(await AsyncStorage.getItem('symptomEntries') || '[]');
    const metrics = await AsyncStorage.getItem('symptomMetrics');
    const reminders = await AsyncStorage.getItem('reminders');
    const medications = await AsyncStorage.getItem('medications');
    const medicationLog = await AsyncStorage.getItem('medicationLog');
    await fetch(BACKUP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, data: { food, symptoms, metrics, reminders, medications, medicationLog } }),
    });
  } catch (err) {
    console.warn('Backup failed:', err.message);
  }
}

// ── Migration: Convert old High/Med/Low FODMAP/Histamine to numeric 1-10 ────

export async function migrateToNumericScores() {
  try {
    const food = JSON.parse(await AsyncStorage.getItem('foodEntries') || '[]');
    let updated = false;

    for (const entry of food) {
      if (!entry.analysis) continue;

      // Convert old categorical scores to numeric if needed
      if (typeof entry.analysis.fodmap === 'string') {
        entry.analysis.fodmap = convertOldScoreToNumeric(entry.analysis.fodmap);
        updated = true;
      }
      if (typeof entry.analysis.histamine === 'string') {
        entry.analysis.histamine = convertOldScoreToNumeric(entry.analysis.histamine);
        updated = true;
      }
    }

    if (updated) {
      await AsyncStorage.setItem('foodEntries', JSON.stringify(food));
      syncBackup();
      return { success: true, converted: food.length };
    }
    return { success: true, converted: 0 };
  } catch (err) {
    console.error('Migration failed:', err);
    return { success: false, error: err.message };
  }
}

function convertOldScoreToNumeric(oldScore) {
  // Convert High/Medium/Low to numeric 1-10
  const map = {
    'Low': 2,
    'Medium': 5,
    'High': 8,
  };
  return map[oldScore] || 5;
}

// ── Re-analyse all existing food entries for granular scores ──────────────────
// Re-runs each stored description through Claude to replace bucketed migration
// scores (2/5/8) with true 1-10 granularity. Runs several requests at once via a
// small concurrency pool (kept modest to stay under API rate limits).
// Calls onProgress(done, total, failed).
export async function reanalyzeAllFood(onProgress, concurrency = 4) {
  const food = JSON.parse(await AsyncStorage.getItem('foodEntries') || '[]');
  const total = food.length;
  let done = 0;
  let failed = 0;

  // Only entries with a usable description need an API call; the rest count done.
  const queue = food
    .map((entry, i) => ({ entry, i }))
    .filter(({ entry }) => entry.description && entry.description.trim());
  done = total - queue.length;
  if (onProgress) onProgress(done, total, failed);

  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const { entry } = queue[cursor++];
      try {
        const fresh = await analyzeFoodWithClaude(entry.description);
        entry.analysis = { ...entry.analysis, ...fresh };
      } catch (err) {
        failed++;
        console.warn(`Re-analysis failed for "${entry.description}":`, err.message);
      }
      done++;
      if (onProgress) onProgress(done, total, failed);
      // Save incrementally so progress survives an interruption
      await AsyncStorage.setItem('foodEntries', JSON.stringify(food));
    }
  };

  const pool = Array.from({ length: Math.min(concurrency, queue.length) }, worker);
  await Promise.all(pool);

  await AsyncStorage.setItem('foodEntries', JSON.stringify(food));
  syncBackup();
  return { total, failed };
}

export async function restoreFromBackup() {
  if (!BACKUP_URL) return false;
  try {
    const userId = await getUserId();
    const res = await fetch(`${BACKUP_URL}/${userId}`);
    const json = await res.json();
    if (!json.found) return false;
    const { food, symptoms, metrics, reminders, medications, medicationLog } = json.data;
    if (food?.length)     await AsyncStorage.setItem('foodEntries', JSON.stringify(food));
    if (symptoms?.length) await AsyncStorage.setItem('symptomEntries', JSON.stringify(symptoms));
    if (metrics)          await AsyncStorage.setItem('symptomMetrics', metrics);
    if (reminders)        await AsyncStorage.setItem('reminders', reminders);
    if (medications)      await AsyncStorage.setItem('medications', medications);
    if (medicationLog)    await AsyncStorage.setItem('medicationLog', medicationLog);
    return true;
  } catch (err) {
    console.warn('Restore failed:', err.message);
    return false;
  }
}

// ── Symptom metrics config ────────────────────────────────────────────────────
export const DEFAULT_METRICS = [
  { id: 'pain',      label: 'Pain / Discomfort',  hint: '1 = none  ·  5 = severe',      type: 'scale',  inverted: false, options: null, enabled: true, builtIn: true },
  { id: 'bloating',  label: 'Bloating / Gas',      hint: '1 = none  ·  5 = severe',      type: 'scale',  inverted: false, options: null, enabled: true, builtIn: true },
  { id: 'energy',    label: 'Energy Level',         hint: '1 = exhausted  ·  5 = great',  type: 'scale',  inverted: true,  options: null, enabled: true, builtIn: true },
  { id: 'wellbeing', label: 'Overall Wellbeing',    hint: '1 = poor  ·  5 = great',       type: 'scale',  inverted: true,  options: null, enabled: true, builtIn: true },
  { id: 'bowelType', label: 'Bowel Movement',       hint: 'Bristol stool scale (1=hard lumps, 7=watery)', type: 'choice', inverted: false, options: ['1','2','3','4','5','6','7','None'], enabled: true, builtIn: true },
  { id: 'notes',     label: 'Additional Notes',     hint: null,                            type: 'text',   inverted: false, options: null, enabled: true, builtIn: true },
];

export async function loadSymptomMetrics() {
  const stored = await AsyncStorage.getItem('symptomMetrics');
  return stored ? JSON.parse(stored) : DEFAULT_METRICS;
}

export async function saveSymptomMetrics(metrics) {
  await AsyncStorage.setItem('symptomMetrics', JSON.stringify(metrics));
}

export async function saveFoodEntry(entry) {
  const existing = JSON.parse(await AsyncStorage.getItem('foodEntries') || '[]');
  existing.push(entry);
  await AsyncStorage.setItem('foodEntries', JSON.stringify(existing));
  syncBackup();
}

export async function saveSymptomEntry(entry) {
  const existing = JSON.parse(await AsyncStorage.getItem('symptomEntries') || '[]');
  existing.push(entry);
  await AsyncStorage.setItem('symptomEntries', JSON.stringify(existing));
  syncBackup();
}

export async function getAllEntries() {
  const food = JSON.parse(await AsyncStorage.getItem('foodEntries') || '[]');
  const symptoms = JSON.parse(await AsyncStorage.getItem('symptomEntries') || '[]');
  return { food, symptoms };
}

export async function deleteFoodEntry(timestamp) {
  const existing = JSON.parse(await AsyncStorage.getItem('foodEntries') || '[]');
  await AsyncStorage.setItem('foodEntries', JSON.stringify(existing.filter(e => e.timestamp !== timestamp)));
}

export async function deleteSymptomEntry(timestamp) {
  const existing = JSON.parse(await AsyncStorage.getItem('symptomEntries') || '[]');
  await AsyncStorage.setItem('symptomEntries', JSON.stringify(existing.filter(e => e.timestamp !== timestamp)));
}

// ── Meal library ──────────────────────────────────────────────────────────────
const MEAL_LIBRARY_KEY = 'mealLibrary';
const MAX_LIBRARY_SIZE = 50;

const STOPWORDS = new Set([
  'a','an','the','and','or','with','some','in','on','of','for','to',
  'my','i','had','ate','some','bit','just','also','little','lot',
]);

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter(t => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export async function loadMealLibrary() {
  const stored = await AsyncStorage.getItem(MEAL_LIBRARY_KEY);
  return stored ? JSON.parse(stored) : [];
}

export async function saveMealToLibrary({ description, analysis }) {
  const library = await loadMealLibrary();
  const keywords = tokenize(description);

  // If a very similar meal already exists, update it instead of adding a duplicate
  const existingIdx = library.findIndex(m => jaccardSimilarity(m.keywords, keywords) >= 0.7);
  if (existingIdx >= 0) {
    library[existingIdx] = {
      ...library[existingIdx],
      analysis,           // update to latest analysis
      lastUsed: Date.now(),
      useCount: (library[existingIdx].useCount || 1) + 1,
    };
  } else {
    library.unshift({
      id: Date.now(),
      description,
      keywords,
      analysis,
      savedAt: Date.now(),
      lastUsed: Date.now(),
      useCount: 1,
    });
  }

  // Cap size — evict entries with lowest (useCount × recency) score
  if (library.length > MAX_LIBRARY_SIZE) {
    const now = Date.now();
    library.sort((a, b) =>
      (b.useCount * (1 - (now - b.lastUsed) / 1e10)) -
      (a.useCount * (1 - (now - a.lastUsed) / 1e10))
    );
    library.splice(MAX_LIBRARY_SIZE);
  }

  await AsyncStorage.setItem(MEAL_LIBRARY_KEY, JSON.stringify(library));
}

// Two tokens "match" if they are identical OR one contains the other.
// This handles plurals, diminutives, and cross-language roots
// e.g. "tomato"/"tomatoes", "kip"/"kipfilet", "pasta"/"pasta's"
function tokensMatch(a, b) {
  return a === b || a.includes(b) || b.includes(a);
}

export async function findSimilarMeals(description) {
  if (!description) return [];
  const library = await loadMealLibrary();
  if (!library.length) return [];

  const inputTokens = tokenize(description);
  if (inputTokens.length < 1) return [];

  return library
    .map(meal => {
      // Count how many input tokens have at least one match in the saved meal
      let matched = 0;
      for (const it of inputTokens) {
        if (meal.keywords.some(mt => tokensMatch(it, mt))) matched++;
      }
      const ratio = matched / Math.max(inputTokens.length, meal.keywords.length);
      return { ...meal, matched, ratio };
    })
    .filter(m => m.matched >= 1)              // show on first matching word
    .sort((a, b) => b.matched - a.matched || b.ratio - a.ratio)
    .slice(0, 3);
}

export async function exportToCSV() {
  const { food, symptoms } = await getAllEntries();
  let csv = 'Timestamp,Type,Description,Fiber,Histamine,Fructose,Lactose,Fat,Spice,Caffeine,Alcohol,ArtSweetener,Gluten,Pain,Bloating,Energy,Wellbeing,Bowel,Notes\n';
  
  food.forEach(e => {
    const a = e.analysis || {};
    csv += `${e.timestamp},Food,"${e.description}",${a.fiber||''},${a.histamine||''},${a.fructose||''},${a.lactose||''},${a.fat||''},${a.spice||''},${a.caffeine||''},${a.alcohol||''},${a.artificialSweeteners||''},${a.gluten||''},,,,,,\n`;
  });
  symptoms.forEach(e => {
    csv += `${e.timestamp},Symptom,,,,,,,,,,,${e.pain},${e.bloating},${e.energy},${e.wellbeing},${e.bowelType},"${e.notes}"\n`;
  });
  return csv;
}
