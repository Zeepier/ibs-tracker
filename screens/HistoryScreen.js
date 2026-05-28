import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getAllEntries, deleteFoodEntry, deleteSymptomEntry } from '../services/storage';

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#F2F6F3',
  surface: '#FFFFFF',
  primary: '#2E7D32',
  primaryMid: '#4CAF50',
  primaryLight: '#E8F5E9',
  blue: '#1565C0',
  blueLight: '#E3F2FD',
  text: '#1C1C1E',
  sub: '#5C5C6E',
  muted: '#9E9EAE',
  divider: '#EBEBEF',
  high: '#C62828', highBg: '#FFEBEE',
  med: '#BF360C', medBg: '#FFF3E0',
  low: '#1B5E20', lowBg: '#E8F5E9',
};

const TABS = ['By Day', 'By Week', 'Insights'];

// ── Date helpers ──────────────────────────────────────────────────────────────
function toDateKey(ts) { return new Date(ts).toISOString().slice(0, 10); }
function addDays(dateKey, n) {
  const d = new Date(dateKey); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function getWeekKey(dateKey) {
  const d = new Date(dateKey), day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().slice(0, 10);
}
function formatDate(dateKey) {
  return new Date(dateKey).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function formatWeek(weekKey) {
  const s = new Date(weekKey), e = new Date(weekKey);
  e.setDate(e.getDate() + 6);
  return `${s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ── Data grouping ─────────────────────────────────────────────────────────────
function groupData(food, symptoms) {
  const byDay = {};
  food.forEach(e => {
    const day = toDateKey(e.timestamp);
    if (!byDay[day]) byDay[day] = { food: [], symptoms: [] };
    byDay[day].food.push(e);
  });
  symptoms.forEach(e => {
    const prev = addDays(toDateKey(e.timestamp), -1);
    if (!byDay[prev]) byDay[prev] = { food: [], symptoms: [] };
    byDay[prev].symptoms.push(e);
  });
  return Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0]));
}

function groupByWeek(dayGroups) {
  const byWeek = {};
  dayGroups.forEach(([dateKey, data]) => {
    const wk = getWeekKey(dateKey);
    if (!byWeek[wk]) byWeek[wk] = [];
    byWeek[wk].push([dateKey, data]);
  });
  return Object.entries(byWeek).sort((a, b) => b[0].localeCompare(a[0]));
}

function avgSymptoms(symptoms) {
  if (!symptoms.length) return null;
  const avg = k => {
    const vals = symptoms.map(e => e[k]).filter(v => typeof v === 'number' && v > 0);
    return vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : null;
  };
  return { pain: avg('pain'), bloating: avg('bloating'), energy: avg('energy'), wellbeing: avg('wellbeing') };
}

// Fields to skip when rendering dynamic symptom chips
const SYMPTOM_SKIP = new Set(['timestamp', 'notes', 'bowelType']);
const SYMPTOM_INVERTED = new Set(['energy', 'wellbeing']);
function formatMetricLabel(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

// ── Risk helpers ──────────────────────────────────────────────────────────────
const RISK_RANK = { High: 3, Hot: 3, Medium: 2, Mild: 2, Low: 1, None: 0, Absent: 0 };
const RISK_COLOR = { High: C.high, Hot: C.high, Medium: C.med, Mild: C.med, Low: C.low, None: C.low, Absent: C.low };
const RISK_BG = { High: C.highBg, Hot: C.highBg, Medium: C.medBg, Mild: C.medBg, Low: C.lowBg, None: C.lowBg, Absent: C.lowBg };

function RiskChip({ label, value }) {
  if (!value || value === 'Low' || value === 'None' || value === 'Absent') return null;
  return (
    <View style={[styles.chip, { backgroundColor: RISK_BG[value] || '#EEE' }]}>
      <Text style={[styles.chipText, { color: RISK_COLOR[value] || C.sub }]}>{label} · {value}</Text>
    </View>
  );
}

function ScoreChip({ label, value, inverted = false }) {
  const v = parseFloat(value);
  if (isNaN(v)) return (
    <View style={[styles.chip, { backgroundColor: '#F5F5F5' }]}>
      <Text style={[styles.chipText, { color: C.muted }]}>{label} —</Text>
    </View>
  );
  const bad = inverted ? v <= 2 : v >= 4;
  const warn = v === 3;
  const bg = bad ? C.highBg : warn ? C.medBg : C.lowBg;
  const color = bad ? C.high : warn ? C.med : C.low;
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color }]}>{label} {value}</Text>
    </View>
  );
}

function AnalysisTags({ analysis }) {
  if (!analysis) return null;
  const chips = [
    <RiskChip key="f" label="FODMAP" value={analysis.fodmap} />,
    <RiskChip key="h" label="Histamine" value={analysis.histamine} />,
    <RiskChip key="fat" label="Fat" value={analysis.fat} />,
    <RiskChip key="fb" label="Fiber" value={analysis.fiber} />,
  ].filter(Boolean);
  if (!chips.length) return null;
  return <View style={styles.chipRow}>{chips}</View>;
}

// ── Delete confirm ────────────────────────────────────────────────────────────
function confirmDelete(label, onConfirm) {
  Alert.alert('Remove entry', `Remove this ${label}?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onConfirm },
  ]);
}

// ── DayCard ───────────────────────────────────────────────────────────────────
function DayCard({ dateKey, food, symptoms, onDeleteFood, onDeleteSymptom }) {
  const [expanded, setExpanded] = useState(false);
  const avg = avgSymptoms(symptoms);

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={() => setExpanded(x => !x)} activeOpacity={0.7}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardDate}>{formatDate(dateKey)}</Text>
            <View style={styles.chipRow}>
              {food.length > 0 && (
                <View style={[styles.chip, { backgroundColor: C.blueLight }]}>
                  <Text style={[styles.chipText, { color: C.blue }]}>{food.length} meal{food.length > 1 ? 's' : ''}</Text>
                </View>
              )}
              {symptoms.length > 0 && (
                <View style={[styles.chip, { backgroundColor: C.primaryLight }]}>
                  <Text style={[styles.chipText, { color: C.primary }]}>{symptoms.length} symptom{symptoms.length > 1 ? 's' : ''}</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>

        {avg && (
          <View style={styles.chipRow}>
            <ScoreChip label="Pain" value={avg.pain} />
            <ScoreChip label="Bloating" value={avg.bloating} />
            <ScoreChip label="Energy" value={avg.energy} inverted />
          </View>
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.expandedSection}>
          {food.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>FOOD</Text>
              {food.map((e, i) => (
                <View key={i} style={styles.entryRow}>
                  <View style={[styles.entryAccent, { backgroundColor: C.blue }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryTime}>{formatTime(e.timestamp)}</Text>
                    <Text style={styles.entryDesc}>{e.description}</Text>
                    <AnalysisTags analysis={e.analysis} />
                  </View>
                  <TouchableOpacity
                    onPress={() => confirmDelete('food entry', () => onDeleteFood(e.timestamp))}
                    style={styles.deleteBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {symptoms.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: C.primary, marginTop: food.length ? 14 : 0 }]}>
                NEXT-DAY SYMPTOMS
              </Text>
              {symptoms.map((e, i) => (
                <View key={i} style={styles.entryRow}>
                  <View style={[styles.entryAccent, { backgroundColor: C.primaryMid }]} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.chipRow}>
                      {Object.entries(e)
                        .filter(([k, v]) => !SYMPTOM_SKIP.has(k) && typeof v === 'number' && v >= 1 && v <= 5)
                        .map(([k, v]) => (
                          <ScoreChip key={k} label={formatMetricLabel(k)} value={String(v)} inverted={SYMPTOM_INVERTED.has(k)} />
                        ))}
                    </View>
                    {e.bowelType && e.bowelType !== 'None' && (
                      <Text style={styles.entryTime}>Bristol type {e.bowelType}</Text>
                    )}
                    {e.notes ? <Text style={styles.noteText}>{e.notes}</Text> : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => confirmDelete('symptom log', () => onDeleteSymptom(e.timestamp))}
                    style={styles.deleteBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ── WeekSummary ───────────────────────────────────────────────────────────────
function WeekSummary({ weekKey, days, onDeleteFood, onDeleteSymptom }) {
  const [expanded, setExpanded] = useState(false);
  const allFood = days.flatMap(([, d]) => d.food);
  const allSymptoms = days.flatMap(([, d]) => d.symptoms);
  const avg = avgSymptoms(allSymptoms);

  return (
    <View style={[styles.card, styles.weekCard]}>
      <TouchableOpacity onPress={() => setExpanded(x => !x)} activeOpacity={0.7}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardDate}>{formatWeek(weekKey)}</Text>
            <Text style={styles.weekStats}>{allFood.length} meals · {allSymptoms.length} symptom logs</Text>
          </View>
          <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
        {avg && (
          <View style={styles.chipRow}>
            <ScoreChip label="Avg pain" value={avg.pain} />
            <ScoreChip label="Avg bloating" value={avg.bloating} />
            <ScoreChip label="Avg energy" value={avg.energy} inverted />
          </View>
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={{ marginTop: 12 }}>
          {days.map(([dateKey, data]) => (
            <DayCard
              key={dateKey}
              dateKey={dateKey}
              food={data.food}
              symptoms={data.symptoms}
              onDeleteFood={onDeleteFood}
              onDeleteSymptom={onDeleteSymptom}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Insights helpers ──────────────────────────────────────────────────────────
function computeCorrelations(dayGroups) {
  const buckets = { High: [], Medium: [], Low: [] };
  dayGroups.forEach(([, { food, symptoms }]) => {
    if (!symptoms.length) return;
    const maxRank = Math.max(0, ...food.map(e => RISK_RANK[e.analysis?.fodmap] || 0));
    const bucket = maxRank >= 3 ? 'High' : maxRank >= 2 ? 'Medium' : 'Low';
    symptoms.forEach(s => buckets[bucket].push(s));
  });
  return buckets;
}

function getPotentialTriggers(dayGroups) {
  const out = [];
  dayGroups.forEach(([dateKey, { food, symptoms }]) => {
    if (!symptoms.length || !food.length) return;
    const avgPain = symptoms.reduce((s, e) => s + (e.pain || 0), 0) / symptoms.length;
    if (avgPain >= 3) food.forEach(e => out.push({ entry: e, avgPain: avgPain.toFixed(1), dateKey }));
  });
  return out.sort((a, b) => b.avgPain - a.avgPain).slice(0, 8);
}

function InsightsTab({ dayGroups }) {
  const hasPairs = dayGroups.some(([, d]) => d.food.length && d.symptoms.length);

  if (!hasPairs) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyIcon}>📊</Text>
        <Text style={styles.emptyTitle}>Not enough data yet</Text>
        <Text style={styles.emptyHint}>
          Log food and symptoms on consecutive days to see correlations here.
        </Text>
      </View>
    );
  }

  const buckets = computeCorrelations(dayGroups);
  const triggers = getPotentialTriggers(dayGroups);
  const avg = (arr, key) =>
    arr.length ? (arr.reduce((s, e) => s + (e[key] || 0), 0) / arr.length).toFixed(1) : '—';

  const levels = [
    { key: 'High', color: C.high, bg: C.highBg },
    { key: 'Medium', color: C.med, bg: C.medBg },
    { key: 'Low', color: C.low, bg: C.lowBg },
  ];

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.insightTitle}>FODMAP → Symptom Correlation</Text>
        <Text style={styles.insightSub}>Next-day symptom averages grouped by that day's FODMAP risk</Text>
        {levels.map(({ key, color, bg }) => {
          const syms = buckets[key];
          if (!syms.length) return null;
          return (
            <View key={key} style={[styles.corrRow, { backgroundColor: bg }]}>
              <Text style={[styles.corrLabel, { color }]}>{key} FODMAP days ({syms.length})</Text>
              <View style={styles.chipRow}>
                <ScoreChip label="Pain" value={avg(syms, 'pain')} />
                <ScoreChip label="Bloating" value={avg(syms, 'bloating')} />
                <ScoreChip label="Energy" value={avg(syms, 'energy')} inverted />
              </View>
            </View>
          );
        })}
      </View>

      {triggers.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.insightTitle}>Potential Triggers</Text>
          <Text style={styles.insightSub}>Meals eaten before days with pain ≥ 3/5</Text>
          {triggers.map((t, i) => (
            <View key={i} style={[styles.triggerRow, i === triggers.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.triggerBullet}>
                <Text style={styles.triggerPain}>{t.avgPain}</Text>
                <Text style={styles.triggerPainLabel}>pain</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryDesc} numberOfLines={2}>{t.entry.description}</Text>
                <Text style={styles.entryTime}>{formatDate(t.dateKey)}</Text>
                <AnalysisTags analysis={t.entry.analysis} />
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────
function buildCSV(dayGroups) {
  const rows = ['Date,Meal Description,FODMAP,Histamine,Fiber,Fat,Gluten,Next-Day Pain,Next-Day Bloating,Next-Day Energy,Next-Day Wellbeing,Notes'];
  dayGroups.forEach(([dateKey, { food, symptoms }]) => {
    const sym = symptoms[0] || {};
    food.forEach(e => {
      const a = e.analysis || {};
      rows.push([
        dateKey,
        `"${(e.description || '').replace(/"/g, '""')}"`,
        a.fodmap || '', a.histamine || '', a.fiber || '', a.fat || '', a.gluten || '',
        sym.pain || '', sym.bloating || '', sym.energy || '', sym.wellbeing || '',
        `"${(sym.notes || '').replace(/"/g, '""')}"`,
      ].join(','));
    });
    if (!food.length && symptoms.length) {
      symptoms.forEach(s => rows.push([
        dateKey, '', '', '', '', '', '',
        s.pain || '', s.bloating || '', s.energy || '', s.wellbeing || '',
        `"${(s.notes || '').replace(/"/g, '""')}"`,
      ].join(',')));
    }
  });
  return rows.join('\n');
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyIcon}>📋</Text>
      <Text style={styles.emptyTitle}>No entries yet</Text>
      <Text style={styles.emptyHint}>Start logging food and symptoms to see them here.</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function HistoryScreen() {
  const [tab, setTab] = useState('By Day');
  const [dayGroups, setDayGroups] = useState([]);

  const reload = useCallback(() => {
    getAllEntries().then(({ food, symptoms }) => setDayGroups(groupData(food, symptoms)));
  }, []);

  useFocusEffect(reload);

  const weekGroups = groupByWeek(dayGroups);

  const handleDeleteFood = async (timestamp) => {
    await deleteFoodEntry(timestamp);
    reload();
  };
  const handleDeleteSymptom = async (timestamp) => {
    await deleteSymptomEntry(timestamp);
    reload();
  };

  const exportCSV = async () => {
    await Share.share({ message: buildCSV(dayGroups), title: 'IBS Tracker Export' });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.tabContainer}>
        <View style={styles.tabBar}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tabItem, tab === t && styles.tabItemActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {tab === 'By Day' && (
          dayGroups.length === 0 ? <EmptyState /> :
          dayGroups.map(([dk, { food, symptoms }]) => (
            <DayCard
              key={dk}
              dateKey={dk}
              food={food}
              symptoms={symptoms}
              onDeleteFood={handleDeleteFood}
              onDeleteSymptom={handleDeleteSymptom}
            />
          ))
        )}

        {tab === 'By Week' && (
          weekGroups.length === 0 ? <EmptyState /> :
          weekGroups.map(([wk, days]) => (
            <WeekSummary
              key={wk}
              weekKey={wk}
              days={days}
              onDeleteFood={handleDeleteFood}
              onDeleteSymptom={handleDeleteSymptom}
            />
          ))
        )}

        {tab === 'Insights' && <InsightsTab dayGroups={dayGroups} />}

        <TouchableOpacity style={styles.exportBtn} onPress={exportCSV}>
          <Text style={styles.exportBtnText}>Export as CSV</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  tabContainer: {
    backgroundColor: C.surface,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: C.divider,
  },
  tabBar: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 10, padding: 3 },
  tabItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabItemActive: { backgroundColor: C.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: C.sub },
  tabTextActive: { color: '#FFF' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 36 },

  card: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07,
    shadowRadius: 4, elevation: 2,
  },
  weekCard: { borderLeftWidth: 3, borderLeftColor: C.primaryMid },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  cardDate: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 6 },
  weekStats: { fontSize: 12, color: C.muted, marginBottom: 4 },
  chevron: { fontSize: 10, color: C.muted, marginTop: 4, paddingLeft: 8 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  chipText: { fontSize: 11, fontWeight: '600' },

  expandedSection: {
    marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: C.divider,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.8,
    color: C.blue, marginBottom: 10,
  },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  entryAccent: { width: 3, minHeight: 32, borderRadius: 2, marginTop: 2 },
  entryTime: { fontSize: 11, color: C.muted, marginBottom: 2 },
  entryDesc: { fontSize: 13, color: C.text, lineHeight: 18 },
  noteText: { fontSize: 12, color: C.sub, fontStyle: 'italic', marginTop: 4 },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 14, color: C.muted, fontWeight: '600' },

  insightTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 4 },
  insightSub: { fontSize: 12, color: C.muted, marginBottom: 12 },
  corrRow: { borderRadius: 10, padding: 12, marginBottom: 8 },
  corrLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  triggerRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.divider,
  },
  triggerBullet: {
    backgroundColor: C.highBg, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 46,
  },
  triggerPain: { fontSize: 17, fontWeight: '800', color: C.high },
  triggerPainLabel: { fontSize: 9, color: C.high, fontWeight: '600', letterSpacing: 0.5 },

  emptyBox: { alignItems: 'center', paddingVertical: 56 },
  emptyIcon: { fontSize: 42, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.sub, marginBottom: 4 },
  emptyHint: { fontSize: 13, color: C.muted, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },

  exportBtn: {
    backgroundColor: C.primary, borderRadius: 12,
    padding: 15, alignItems: 'center', marginTop: 8,
  },
  exportBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
});
