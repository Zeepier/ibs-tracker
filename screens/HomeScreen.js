import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { loadMedications, getMedicationLogForDate, logMedicationEntry } from '../services/medications';

const C = {
  bg: '#F2F6F3',
  surface: '#FFFFFF',
  primary: '#2E7D32',
  blue: '#1565C0',
  text: '#1C1C1E',
  muted: '#9E9EAE',
};

export default function HomeScreen({ navigation }) {
  const [medications, setMedications] = useState([]);
  const [medLog, setMedLog] = useState([]);

  useEffect(() => {
    loadMeds();
    const unsubscribe = navigation.addListener('focus', loadMeds);
    return unsubscribe;
  }, [navigation]);

  const loadMeds = async () => {
    const meds = await loadMedications();
    const enabled = meds.filter(m => m.enabled);
    setMedications(enabled);

    const log = await getMedicationLogForDate(new Date());
    setMedLog(log);
  };

  const handleMedToggle = async (med) => {
    const loggedIds = medLog.map(e => e.medId);
    const taken = !loggedIds.includes(med.id);
    await logMedicationEntry(new Date(), med.id, taken);
    await loadMeds();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🌿</Text>
        <Text style={styles.title}>IBS Tracker</Text>
        <Text style={styles.subtitle}>Track foods & symptoms to find your triggers</Text>
      </View>

      <Text style={styles.sectionLabel}>LOG</Text>

      <TouchableOpacity style={[styles.card, styles.primaryCard]} onPress={() => navigation.navigate('FoodEntry')} activeOpacity={0.85}>
        <Text style={styles.cardIcon}>🍽️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Log Food</Text>
          <Text style={styles.cardSub}>Record a meal or recipe for analysis</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.card, styles.primaryCard]} onPress={() => navigation.navigate('Symptoms')} activeOpacity={0.85}>
        <Text style={styles.cardIcon}>📊</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Log Symptoms</Text>
          <Text style={styles.cardSub}>Rate pain, bloating, and energy levels</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      {medications.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>TODAY'S MEDICATIONS</Text>
          {medications.map(med => {
            const taken = medLog.some(e => e.medId === med.id);
            return (
              <TouchableOpacity
                key={med.id}
                style={[styles.medCard, taken && styles.medCardTaken]}
                onPress={() => handleMedToggle(med)}
                activeOpacity={0.75}
              >
                <Text style={styles.medCheckbox}>{taken ? '✓' : '○'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.medName, taken && styles.medNameTaken]}>{med.name}</Text>
                  <Text style={styles.medDosage}>{med.dosage}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </>
      )}

      <Text style={styles.sectionLabel}>REVIEW</Text>

      <TouchableOpacity style={[styles.card, styles.blueCard]} onPress={() => navigation.navigate('History')} activeOpacity={0.85}>
        <Text style={styles.cardIcon}>📋</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>History & Insights</Text>
          <Text style={styles.cardSub}>Browse entries, correlations & export data</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.card, styles.surfaceCard]} onPress={() => navigation.navigate('Medications')} activeOpacity={0.85}>
        <Text style={styles.cardIcon}>💊</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Medications</Text>
          <Text style={styles.cardSub}>Manage & track daily medications</Text>
        </View>
        <Text style={[styles.arrow, { color: C.muted }]}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.card, styles.surfaceCard]} onPress={() => navigation.navigate('Settings')} activeOpacity={0.85}>
        <Text style={styles.cardIcon}>⚙️</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Settings</Text>
          <Text style={styles.cardSub}>Configure daily reminders</Text>
        </View>
        <Text style={[styles.arrow, { color: C.muted }]}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 48 },
  header: { alignItems: 'center', paddingVertical: 36, marginBottom: 4 },
  headerIcon: { fontSize: 52, marginBottom: 10 },
  title: { fontSize: 30, fontWeight: '800', color: C.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: C.muted,
    letterSpacing: 1, marginBottom: 8, marginTop: 8,
  },
  card: {
    borderRadius: 16, padding: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  primaryCard: { backgroundColor: C.primary },
  blueCard: { backgroundColor: C.blue },
  surfaceCard: { backgroundColor: C.surface },
  cardIcon: { fontSize: 26 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#FFF', marginBottom: 2 },
  cardSub: { fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 17 },
  arrow: { fontSize: 26, color: 'rgba(255,255,255,0.5)', fontWeight: '300' },

  medCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#EBEBEF',
  },
  medCardTaken: {
    backgroundColor: '#E8F5E9',
    borderColor: '#2E7D32',
  },
  medCheckbox: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2E7D32',
    width: 24,
    textAlign: 'center',
  },
  medName: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
    marginBottom: 2,
  },
  medNameTaken: {
    color: '#2E7D32',
  },
  medDosage: {
    fontSize: 12,
    color: C.muted,
  },
});
