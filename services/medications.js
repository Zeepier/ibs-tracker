import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncBackup } from './storage';

const MEDICATIONS_KEY = 'medications';
const MEDICATION_LOG_KEY = 'medicationLog';

export async function loadMedications() {
  const stored = await AsyncStorage.getItem(MEDICATIONS_KEY);
  return stored ? JSON.parse(stored) : [];
}

export async function saveMedications(medications) {
  await AsyncStorage.setItem(MEDICATIONS_KEY, JSON.stringify(medications));
  syncBackup();
}

export async function addMedication(name, dosage) {
  const meds = await loadMedications();
  const med = {
    id: 'med_' + Date.now(),
    name,
    dosage,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  meds.push(med);
  await saveMedications(meds);
  return med;
}

export async function updateMedication(id, changes) {
  const meds = await loadMedications();
  const idx = meds.findIndex(m => m.id === id);
  if (idx >= 0) {
    meds[idx] = { ...meds[idx], ...changes };
    await saveMedications(meds);
  }
}

export async function removeMedication(id) {
  const meds = await loadMedications();
  await saveMedications(meds.filter(m => m.id !== id));
}

export async function logMedicationEntry(date, medId, taken) {
  const log = JSON.parse(await AsyncStorage.getItem(MEDICATION_LOG_KEY) || '[]');
  const dateStr = date.toISOString().split('T')[0];

  // Remove existing entry for this med on this date
  const filtered = log.filter(e => !(e.date === dateStr && e.medId === medId));

  // Add new entry if taken=true
  if (taken) {
    filtered.push({
      date: dateStr,
      medId,
      takenAt: new Date().toISOString(),
    });
  }

  await AsyncStorage.setItem(MEDICATION_LOG_KEY, JSON.stringify(filtered));
  syncBackup();
}

export async function getMedicationLogForDate(date) {
  const log = JSON.parse(await AsyncStorage.getItem(MEDICATION_LOG_KEY) || '[]');
  const dateStr = date.toISOString().split('T')[0];
  return log.filter(e => e.date === dateStr);
}

export async function getMedicationHistory(days = 30) {
  const log = JSON.parse(await AsyncStorage.getItem(MEDICATION_LOG_KEY) || '[]');
  const meds = await loadMedications();
  const medMap = Object.fromEntries(meds.map(m => [m.id, m]));

  const history = {};
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    history[dateStr] = log
      .filter(e => e.date === dateStr)
      .map(e => medMap[e.medId])
      .filter(Boolean);
  }
  return history;
}
