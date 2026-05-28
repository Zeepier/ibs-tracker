import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

const C = {
  bg: '#F2F6F3',
  surface: '#FFFFFF',
  primary: '#2E7D32',
  blue: '#1565C0',
  text: '#1C1C1E',
  muted: '#9E9EAE',
};

export default function HomeScreen({ navigation }) {
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

      <Text style={styles.sectionLabel}>REVIEW</Text>

      <TouchableOpacity style={[styles.card, styles.blueCard]} onPress={() => navigation.navigate('History')} activeOpacity={0.85}>
        <Text style={styles.cardIcon}>📋</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>History & Insights</Text>
          <Text style={styles.cardSub}>Browse entries, correlations & export data</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
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
});
