import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { saveSymptomEntry, loadSymptomMetrics } from '../services/storage';

const C = {
  bg: '#F2F6F3',
  surface: '#FFFFFF',
  primary: '#2E7D32',
  primaryLight: '#E8F5E9',
  text: '#1C1C1E',
  sub: '#5C5C6E',
  muted: '#9E9EAE',
  divider: '#EBEBEF',
  high: '#C62828', highBg: '#FFEBEE',
  med: '#BF360C', medBg: '#FFF3E0',
  low: '#1B5E20', lowBg: '#E8F5E9',
};

function scaleColor(value, inverted = false) {
  if (!value) return { bg: '#F5F5F5', text: C.muted, border: 'transparent' };
  const bad = inverted ? value <= 2 : value >= 4;
  const warn = value === 3;
  if (bad)  return { bg: C.highBg, text: C.high, border: C.high };
  if (warn) return { bg: C.medBg,  text: C.med,  border: C.med  };
  return      { bg: C.lowBg,  text: C.low,  border: C.low  };
}

function ScaleInput({ metric, value, onChange }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{metric.label}</Text>
      {metric.hint ? <Text style={styles.cardHint}>{metric.hint}</Text> : null}
      <View style={styles.scaleRow}>
        {[1, 2, 3, 4, 5].map(i => {
          const selected = value === i;
          const { bg, text, border } = scaleColor(selected ? i : 0, metric.inverted);
          return (
            <TouchableOpacity
              key={i}
              style={[styles.scaleBtn, selected && { backgroundColor: bg, borderColor: border }]}
              onPress={() => onChange(i)}
              activeOpacity={0.75}
            >
              <Text style={[styles.scaleBtnText, selected && { color: text, fontWeight: '700' }]}>{i}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function ChoiceInput({ metric, value, onChange }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{metric.label}</Text>
      {metric.hint ? <Text style={styles.cardHint}>{metric.hint}</Text> : null}
      <View style={styles.choiceRow}>
        {(metric.options || []).map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.choiceBtn, value === opt && styles.choiceBtnSelected]}
            onPress={() => onChange(opt)}
            activeOpacity={0.75}
          >
            <Text style={[styles.choiceBtnText, value === opt && styles.choiceBtnTextSelected]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function TextMetricInput({ metric, value, onChange }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{metric.label}</Text>
      <TextInput
        style={styles.notesInput}
        multiline
        placeholder="Anything else to note..."
        placeholderTextColor={C.muted}
        value={value}
        onChangeText={onChange}
      />
    </View>
  );
}

export default function SymptomScreen({ navigation }) {
  const [metrics, setMetrics] = useState([]);
  const [values, setValues] = useState({});

  useEffect(() => {
    loadSymptomMetrics().then(loaded => {
      setMetrics(loaded);
      const init = {};
      loaded.forEach(m => {
        if (m.type === 'scale')  init[m.id] = 0;
        else                     init[m.id] = '';
      });
      setValues(init);
    });
  }, []);

  const setValue = (id, val) => setValues(prev => ({ ...prev, [id]: val }));

  const submit = async () => {
    const entry = { timestamp: new Date().toISOString() };
    metrics.filter(m => m.enabled).forEach(m => {
      const v = values[m.id];
      if (m.type === 'scale'  && v > 0)    entry[m.id] = v;
      if (m.type === 'choice' && v !== '')  entry[m.id] = v;
      if (m.type === 'text'   && v !== '')  entry[m.id] = v;
    });
    await saveSymptomEntry(entry);
    Alert.alert('Saved!', 'Symptom entry logged');
    navigation.goBack();
  };

  const enabled = metrics.filter(m => m.enabled);

  if (!enabled.length) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: C.muted, fontSize: 15 }}>No metrics enabled. Configure them in Settings.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {enabled.map(metric => {
        if (metric.type === 'scale') return (
          <ScaleInput key={metric.id} metric={metric} value={values[metric.id] || 0} onChange={v => setValue(metric.id, v)} />
        );
        if (metric.type === 'choice') return (
          <ChoiceInput key={metric.id} metric={metric} value={values[metric.id] || ''} onChange={v => setValue(metric.id, v)} />
        );
        if (metric.type === 'text') return (
          <TextMetricInput key={metric.id} metric={metric} value={values[metric.id] || ''} onChange={v => setValue(metric.id, v)} />
        );
        return null;
      })}
      <TouchableOpacity style={styles.submitBtn} onPress={submit} activeOpacity={0.85}>
        <Text style={styles.submitBtnText}>Save Symptoms</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  cardLabel: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  cardHint: { fontSize: 12, color: C.muted, marginBottom: 12 },
  scaleRow: { flexDirection: 'row', gap: 8 },
  scaleBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#F5F5F5', borderWidth: 1.5, borderColor: 'transparent',
  },
  scaleBtnText: { fontSize: 16, color: C.sub },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceBtn: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#F5F5F5', borderWidth: 1.5, borderColor: 'transparent',
    minWidth: 48, alignItems: 'center',
  },
  choiceBtnSelected: { backgroundColor: C.primaryLight, borderColor: C.primary },
  choiceBtnText: { fontSize: 14, color: C.sub },
  choiceBtnTextSelected: { color: C.primary, fontWeight: '700' },
  notesInput: {
    minHeight: 80, fontSize: 14, color: C.text,
    textAlignVertical: 'top', paddingTop: 4,
  },
  submitBtn: {
    backgroundColor: C.primary, borderRadius: 14,
    padding: 16, alignItems: 'center', marginTop: 6,
  },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});
