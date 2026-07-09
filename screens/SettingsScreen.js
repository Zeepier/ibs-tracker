import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch, TextInput } from 'react-native';
import { requestPermissions, loadReminders, saveReminders } from '../services/notifications';
import { requestPushPermission, isPushSubscribed, sendTestPush } from '../services/pushNotifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { loadSymptomMetrics, saveSymptomMetrics, DEFAULT_METRICS, reanalyzeAllFood } from '../services/storage';
import { APP_VERSION } from '../constants/version';

const C = {
  bg: '#F2F6F3',
  surface: '#FFFFFF',
  primary: '#2E7D32',
  primaryLight: '#E8F5E9',
  blue: '#1565C0',
  blueLight: '#E3F2FD',
  text: '#1C1C1E',
  sub: '#5C5C6E',
  muted: '#9E9EAE',
  divider: '#EBEBEF',
  danger: '#C62828',
};

// ── Reminders ─────────────────────────────────────────────────────────────────
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];
function formatTime(h, m) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function ReminderCard({ reminder, onChange, onDelete }) {
  const [editing, setEditing] = useState(false);
  const update = changes => onChange({ ...reminder, ...changes });
  const isSymptom = reminder.type === 'symptom';

  const toggleEnabled = async value => {
    if (value) {
      let granted = false;
      if (Platform.OS === 'web') {
        const result = await requestPushPermission();
        granted = result.granted;
        if (!granted) {
          Alert.alert('Permission required', result.error || 'Could not enable push notifications.');
          return;
        }
      } else {
        granted = await requestPermissions();
        if (!granted) {
          Alert.alert('Permission required', 'Please allow notifications in your device settings.');
          return;
        }
      }
    }
    update({ enabled: value });
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <View style={[styles.typeTag, isSymptom ? styles.tagSymptom : styles.tagFood]}>
            <Text style={[styles.typeTagText, isSymptom ? styles.tagSymptomText : styles.tagFoodText]}>
              {isSymptom ? 'Symptoms' : 'Food'}
            </Text>
          </View>
          <TextInput
            style={styles.labelInput}
            value={reminder.label}
            onChangeText={v => update({ label: v })}
            placeholder="Label"
            placeholderTextColor={C.muted}
          />
        </View>
        <Switch
          value={reminder.enabled}
          onValueChange={toggleEnabled}
          trackColor={{ false: '#DDD', true: C.primary }}
          thumbColor={reminder.enabled ? '#FFF' : '#F5F5F5'}
        />
      </View>

      <TouchableOpacity onPress={() => setEditing(!editing)} style={styles.timeRow} activeOpacity={0.7}>
        <Text style={styles.timeText}>{formatTime(reminder.hour, reminder.minute)}</Text>
        <Text style={styles.timeHint}>{editing ? 'tap to collapse' : 'tap to change'}</Text>
      </TouchableOpacity>

      {editing && (
        <View style={styles.pickerSection}>
          <Text style={styles.pickerLabel}>Hour</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {HOURS.map(h => (
              <TouchableOpacity
                key={h}
                style={[styles.pickerItem, reminder.hour === h && styles.pickerItemSelected]}
                onPress={() => update({ hour: h })}
              >
                <Text style={[styles.pickerText, reminder.hour === h && styles.pickerTextSelected]}>
                  {String(h).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.pickerLabel}>Minute</Text>
          <View style={styles.minuteRow}>
            {MINUTES.map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.pickerItem, reminder.minute === m && styles.pickerItemSelected]}
                onPress={() => update({ minute: m })}
              >
                <Text style={[styles.pickerText, reminder.minute === m && styles.pickerTextSelected]}>
                  {String(m).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <TouchableOpacity onPress={onDelete} style={styles.deleteRow}>
        <Text style={styles.deleteText}>Remove reminder</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Symptom metrics ───────────────────────────────────────────────────────────
function MetricRow({ metric, onChange, onDelete }) {
  return (
    <View style={styles.metricRow}>
      <Switch
        value={metric.enabled}
        onValueChange={v => onChange({ ...metric, enabled: v })}
        trackColor={{ false: '#DDD', true: C.primary }}
        thumbColor={metric.enabled ? '#FFF' : '#F5F5F5'}
      />
      {metric.builtIn ? (
        <View style={{ flex: 1 }}>
          <Text style={styles.metricLabel}>{metric.label}</Text>
          {metric.hint ? <Text style={styles.metricHint}>{metric.hint}</Text> : null}
        </View>
      ) : (
        <TextInput
          style={styles.metricLabelInput}
          value={metric.label}
          onChangeText={v => onChange({ ...metric, label: v })}
          placeholder="Metric name"
          placeholderTextColor={C.muted}
        />
      )}
      {!metric.builtIn && (
        <TouchableOpacity
          onPress={onDelete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.metricDelete}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const [reminders, setReminders] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [addingMetric, setAddingMetric] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeProgress, setReanalyzeProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    loadReminders().then(setReminders);
    loadSymptomMetrics().then(setMetrics);
  }, []);

  // Reminders
  const updateReminders = async updated => {
    setReminders(updated);
    await saveReminders(updated);
    if (Platform.OS === 'web') {
      const userId = await AsyncStorage.getItem('userId');
      if (userId) {
        try {
          await fetch('/save-reminders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, reminders: updated, tzOffset: new Date().getTimezoneOffset() }),
          });
        } catch (err) {
          console.warn('Failed to sync reminders to server:', err);
        }
      }
    }
  };
  const updateOneReminder = (i, changes) =>
    updateReminders(reminders.map((r, j) => j === i ? { ...r, ...changes } : r));
  const addFoodReminder = () =>
    updateReminders([...reminders, {
      id: `food_${Date.now()}`, type: 'food', label: 'Food reminder',
      hour: 12, minute: 0, enabled: false,
    }]);
  const addSymptomReminder = () =>
    updateReminders([...reminders, {
      id: `symptom_${Date.now()}`, type: 'symptom', label: 'Symptom check',
      hour: 20, minute: 0, enabled: false,
    }]);

  // Metrics
  const updateMetrics = async updated => {
    setMetrics(updated);
    await saveSymptomMetrics(updated);
  };
  const updateOneMetric = (i, changes) =>
    updateMetrics(metrics.map((m, j) => j === i ? { ...m, ...changes } : m));
  const deleteMetric = i =>
    updateMetrics(metrics.filter((_, j) => j !== i));
  const confirmAddMetric = () => {
    if (!newLabel.trim()) return;
    updateMetrics([...metrics, {
      id: `custom_${Date.now()}`,
      label: newLabel.trim(),
      hint: '1 = low  ·  5 = high',
      type: 'scale',
      inverted: false,
      options: null,
      enabled: true,
      builtIn: false,
    }]);
    setNewLabel('');
    setAddingMetric(false);
  };
  const resetMetrics = () => {
    Alert.alert('Reset metrics', 'Restore all default symptom metrics?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => updateMetrics(DEFAULT_METRICS) },
    ]);
  };

  const runReanalysis = async () => {
    setReanalyzing(true);
    setReanalyzeProgress({ done: 0, total: 0 });
    try {
      const { total, failed } = await reanalyzeAllFood((done, total) => {
        setReanalyzeProgress({ done, total });
      });
      const msg = failed > 0
        ? `Updated ${total - failed} of ${total} entries. ${failed} could not be analysed and kept their previous scores.`
        : `All ${total} entries updated with fresh 1-10 scores.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Re-analysis complete', msg);
    } catch (err) {
      if (Platform.OS === 'web') window.alert('Re-analysis failed: ' + err.message);
      else Alert.alert('Re-analysis failed', err.message);
    }
    setReanalyzing(false);
  };

  const confirmReanalysis = () => {
    const message = 'Re-analyse all meals?\n\nThis re-runs every saved meal through the AI to replace the rough migrated scores with precise 1-10 ratings. It uses one API call per meal and may take a minute. Your descriptions are unchanged.';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) runReanalysis();
    } else {
      Alert.alert('Re-analyse all meals?', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Re-analyse', onPress: runReanalysis },
      ]);
    }
  };

  const testNotification = async () => {
    // Ensure a live subscription exists (idempotent) — repairs reminders that
    // were toggled on in older builds before the subscription flow worked.
    const perm = await requestPushPermission();
    if (!perm.granted) {
      const msg = perm.error === 'User denied permission'
        ? 'Notifications are blocked for this site. Allow them in your browser settings, then try again.'
        : (perm.error || 'Could not enable notifications on this device.');
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Not enabled', msg);
      return;
    }
    const res = await sendTestPush();
    const msg = res && res.ok
      ? 'Test sent — you should see a notification shortly.'
      : 'Subscription registered, but the server could not send. Check the console for details.';
    if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Test notification', msg);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Reminders section ── */}
      <Text style={styles.sectionTitle}>Daily Reminders</Text>
      <Text style={styles.sectionHint}>
        Symptom reminders ask you to rate your symptoms. Food reminders prompt you to log what you ate.
      </Text>

      {reminders.map((r, i) => (
        <ReminderCard
          key={r.id}
          reminder={r}
          onChange={changes => updateOneReminder(i, changes)}
          onDelete={() => updateReminders(reminders.filter((_, j) => j !== i))}
        />
      ))}

      <TouchableOpacity style={styles.addButton} onPress={addSymptomReminder} activeOpacity={0.8}>
        <Text style={styles.addButtonText}>+ Add symptom reminder</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.addButton, { marginTop: 8 }]} onPress={addFoodReminder} activeOpacity={0.8}>
        <Text style={styles.addButtonText}>+ Add food reminder</Text>
      </TouchableOpacity>


      {/* ── Metrics section ── */}
      <View style={styles.divider} />
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>Symptom Metrics</Text>
        <TouchableOpacity onPress={resetMetrics}>
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.sectionHint}>
        Choose which metrics to track when logging symptoms. Add custom 1–5 scale metrics below.
      </Text>

      <View style={styles.card}>
        {metrics.map((m, i) => (
          <View key={m.id}>
            <MetricRow
              metric={m}
              onChange={changes => updateOneMetric(i, changes)}
              onDelete={() => deleteMetric(i)}
            />
            {i < metrics.length - 1 && <View style={styles.rowDivider} />}
          </View>
        ))}
      </View>

      {addingMetric ? (
        <View style={styles.addMetricForm}>
          <TextInput
            style={styles.addMetricInput}
            placeholder="Metric name (e.g. Nausea)"
            placeholderTextColor={C.muted}
            value={newLabel}
            onChangeText={setNewLabel}
            autoFocus
          />
          <View style={styles.addMetricActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setAddingMetric(false); setNewLabel(''); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmBtn, !newLabel.trim() && styles.confirmBtnDisabled]} onPress={confirmAddMetric} disabled={!newLabel.trim()}>
              <Text style={styles.confirmBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={[styles.addButton, { borderColor: C.primary }]} onPress={() => setAddingMetric(true)} activeOpacity={0.8}>
          <Text style={[styles.addButtonText, { color: C.primary }]}>+ Add custom metric</Text>
        </TouchableOpacity>
      )}

      {/* ── Data section ── */}
      <View style={styles.divider} />
      <Text style={styles.sectionTitle}>Data</Text>
      <Text style={styles.sectionHint}>
        Re-analyse all saved meals to upgrade older entries from rough scores to precise 1-10 FODMAP &amp; histamine ratings.
      </Text>

      <TouchableOpacity
        style={[styles.reanalyzeBtn, reanalyzing && styles.reanalyzeBtnDisabled]}
        onPress={confirmReanalysis}
        disabled={reanalyzing}
        activeOpacity={0.85}
      >
        <Text style={styles.reanalyzeBtnText}>
          {reanalyzing
            ? `Re-analysing… ${reanalyzeProgress.done}/${reanalyzeProgress.total}`
            : 'Re-analyse all meals'}
        </Text>
      </TouchableOpacity>

      {Platform.OS === 'web' && (
        <TouchableOpacity
          style={[styles.addButton, { borderColor: C.blue, marginTop: 10 }]}
          onPress={testNotification}
          activeOpacity={0.85}
        >
          <Text style={[styles.addButtonText, { color: C.blue }]}>Send test notification</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.versionText}>Version {APP_VERSION}</Text>

    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  reanalyzeBtn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  reanalyzeBtnDisabled: { opacity: 0.6 },
  reanalyzeBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  versionText: { textAlign: 'center', color: C.muted, fontSize: 12, marginTop: 24 },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  sectionHint: { fontSize: 13, color: C.muted, lineHeight: 19, marginBottom: 14 },
  divider: { height: 1, backgroundColor: C.divider, marginVertical: 24 },
  resetText: { fontSize: 13, color: C.blue, fontWeight: '600' },

  // Reminder card
  card: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  typeTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tagSymptom: { backgroundColor: C.primaryLight },
  tagFood: { backgroundColor: C.blueLight },
  typeTagText: { fontSize: 11, fontWeight: '700' },
  tagSymptomText: { color: C.primary },
  tagFoodText: { color: C.blue },
  labelInput: { fontSize: 15, fontWeight: '600', color: C.text, flex: 1 },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  timeText: { fontSize: 38, fontWeight: '800', color: C.primary, letterSpacing: -1 },
  timeHint: { fontSize: 12, color: C.muted },
  pickerSection: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.divider },
  pickerLabel: { fontSize: 11, fontWeight: '700', color: C.muted, letterSpacing: 0.8, marginBottom: 8, marginTop: 10 },
  minuteRow: { flexDirection: 'row', gap: 8 },
  pickerItem: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#F5F5F5', marginRight: 6, borderWidth: 1.5, borderColor: 'transparent',
  },
  pickerItemSelected: { backgroundColor: C.primaryLight, borderColor: C.primary },
  pickerText: { fontSize: 16, color: C.sub },
  pickerTextSelected: { color: C.primary, fontWeight: '700' },
  deleteRow: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.divider, alignItems: 'flex-end' },
  deleteText: { fontSize: 13, color: C.danger, fontWeight: '600' },

  // Metric rows
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  metricLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  metricHint: { fontSize: 11, color: C.muted, marginTop: 1 },
  metricLabelInput: { flex: 1, fontSize: 14, fontWeight: '600', color: C.text, borderBottomWidth: 1, borderBottomColor: C.divider, paddingVertical: 2 },
  metricDelete: { fontSize: 15, color: C.muted, fontWeight: '600', paddingHorizontal: 4 },
  rowDivider: { height: 1, backgroundColor: C.divider, marginVertical: 8 },

  // Add metric form
  addMetricForm: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  addMetricInput: {
    fontSize: 15, color: C.text, borderBottomWidth: 1.5,
    borderBottomColor: C.primary, paddingVertical: 8, marginBottom: 14,
  },
  addMetricActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, padding: 12, borderRadius: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: C.divider,
  },
  cancelBtnText: { color: C.sub, fontWeight: '600' },
  confirmBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: C.primary },
  confirmBtnDisabled: { backgroundColor: '#A5D6A7' },
  confirmBtnText: { color: '#FFF', fontWeight: '700' },

  // Add reminder button
  addButton: {
    backgroundColor: C.surface, borderRadius: 14, padding: 16, alignItems: 'center',
    borderWidth: 2, borderColor: C.blue, borderStyle: 'dashed',
  },
  addButtonText: { fontSize: 15, color: C.blue, fontWeight: '700' },
});
