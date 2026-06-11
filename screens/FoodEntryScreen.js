import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { analyzeFoodWithClaude, getClarifyingQuestions } from '../services/claudeApi';
import { saveFoodEntry, saveMealToLibrary, findSimilarMeals } from '../services/storage';
import { isUrl, fetchRecipeText } from '../services/urlFetcher';

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
  high: '#C62828', highBg: '#FFEBEE',
  med: '#BF360C', medBg: '#FFF3E0',
  low: '#1B5E20', lowBg: '#E8F5E9',
};

const RISK_BG = {
  High: '#FFEBEE', Hot: '#FFEBEE', Present: '#FFEBEE',
  Medium: '#FFF3E0', Mild: '#FFF3E0',
  Low: '#E8F5E9', None: '#E8F5E9', Absent: '#E8F5E9',
};
const RISK_COLOR = {
  High: C.high, Hot: C.high, Present: C.high,
  Medium: C.med, Mild: C.med,
  Low: C.low, None: C.low, Absent: C.low,
};

// Get color for numeric score (1-10)
function getNumericColor(score) {
  if (score <= 3) return { bg: '#E8F5E9', color: C.low };      // Green (Low)
  if (score <= 6) return { bg: '#FFF3E0', color: C.med };      // Orange (Medium)
  return { bg: '#FFEBEE', color: C.high };                     // Red (High)
}

const FIELD_LABELS = {
  fodmap: 'FODMAP',
  histamine: 'Histamine',
  fiber: 'Fiber',
  fructose: 'Fructose',
  lactose: 'Lactose',
  fat: 'Fat',
  spice: 'Spice',
  caffeine: 'Caffeine',
  alcohol: 'Alcohol',
  artificialSweeteners: 'Artificial Sweeteners',
  gluten: 'Gluten',
};

function StepDots({ step }) {
  const steps = ['input', 'clarifying', 'results'];
  const idx = steps.indexOf(step);
  return (
    <View style={styles.stepDots}>
      {steps.map((s, i) => (
        <View key={s} style={[styles.dot, i <= idx && styles.dotActive]} />
      ))}
    </View>
  );
}

export default function FoodEntryScreen({ navigation }) {
  const [description, setDescription] = useState('');
  const [step, setStep] = useState('input');
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [fetchedContent, setFetchedContent] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [expandedKey, setExpandedKey] = useState(null);
  const now = new Date();
  const [dayOffset, setDayOffset] = useState(0);
  const [hour, setHour] = useState(now.getHours());
  const [minute, setMinute] = useState(now.getMinutes());
  const debounceRef = useRef(null);

  const onDescriptionChange = text => {
    setDescription(text);
    setSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const matches = await findSimilarMeals(text);
      setSuggestions(matches);
    }, 300);
  };

  const useSavedMeal = meal => {
    setDescription(meal.description);
    setAnalysis(meal.analysis);
    setSuggestions([]);
    setStep('results');
  };

  const next = async () => {
    if (!description.trim()) { Alert.alert('Please describe what you ate'); return; }
    setLoadingQuestions(true);
    try {
      let content = description;
      if (isUrl(description)) content = await fetchRecipeText(description);
      setFetchedContent(content);
      const qs = await getClarifyingQuestions(content);
      setQuestions(qs);
      setAnswers({});
      setStep('clarifying');
    } catch (e) { Alert.alert('Error', e.message); }
    setLoadingQuestions(false);
  };

  const analyse = async () => {
    setLoading(true);
    setStep('results');
    try {
      let content = fetchedContent;
      const extras = questions.map((q, i) => answers[i] ? `${q.question}: ${answers[i]}` : null).filter(Boolean);
      if (extras.length) content += '\nAdditional details:\n' + extras.join('\n');
      const result = await analyzeFoodWithClaude(content);
      setAnalysis(result);
    } catch (e) { Alert.alert('Error', e.message); setStep('clarifying'); }
    setLoading(false);
  };

  const reset = () => {
    setAnalysis(null); setQuestions([]); setAnswers({});
    setFetchedContent(''); setSuggestions([]); setStep('input');
  };

  const save = async () => {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    d.setHours(hour, minute, 0, 0);
    await saveFoodEntry({ timestamp: d.toISOString(), description, analysis });
    await saveMealToLibrary({ description, analysis });
    Alert.alert('Saved!', 'Food entry logged successfully');
    navigation.goBack();
  };

  const allAnswered = questions.length === 0 || questions.every((_, i) => answers[i]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StepDots step={step} />

      {/* Description input */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>What did you eat?</Text>
        <TextInput
          style={[styles.input, step !== 'input' && styles.inputDisabled]}
          multiline
          placeholder="e.g. avocado toast with eggs, or paste a recipe URL"
          placeholderTextColor={C.muted}
          value={description}
          onChangeText={onDescriptionChange}
          editable={step === 'input'}
        />
      </View>

      {step === 'input' && suggestions.length > 0 && (
        <View style={styles.suggestionsCard}>
          <Text style={styles.suggestionsLabel}>🔄  Looks like a previous meal</Text>
          {suggestions.map(meal => (
            <TouchableOpacity
              key={meal.id}
              style={styles.suggestionRow}
              onPress={() => useSavedMeal(meal)}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestionText} numberOfLines={1}>{meal.description}</Text>
                <Text style={styles.suggestionMeta}>
                  used {meal.useCount}× · {meal.matched} word{meal.matched !== 1 ? 's' : ''} match
                </Text>
              </View>
              <View style={styles.useBadge}>
                <Text style={styles.useBadgeText}>Use</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {step === 'input' && (
        <TouchableOpacity style={styles.primaryBtn} onPress={next} disabled={loadingQuestions} activeOpacity={0.85}>
          {loadingQuestions ? (
            <View style={styles.btnRow}>
              <ActivityIndicator color="white" size="small" />
              <Text style={styles.primaryBtnText}>Checking...</Text>
            </View>
          ) : (
            <Text style={styles.primaryBtnText}>Next →</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Clarifying questions */}
      {(step === 'clarifying' || step === 'results') && questions.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>A few quick questions</Text>
          {questions.map((q, qi) => (
            <View key={qi} style={[styles.questionBlock, qi < questions.length - 1 && styles.questionDivider]}>
              <Text style={styles.questionText}>{q.question}</Text>
              <View style={styles.optionsRow}>
                {q.options.map(opt => {
                  const selected = answers[qi] === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.optionChip, selected && styles.optionChipSelected]}
                      onPress={() => step === 'clarifying' && setAnswers(p => ({ ...p, [qi]: opt }))}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}

      {step === 'clarifying' && (
        <TouchableOpacity
          style={[styles.primaryBtn, !allAnswered && styles.primaryBtnDisabled]}
          onPress={analyse}
          disabled={!allAnswered}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Analyse Food</Text>
        </TouchableOpacity>
      )}

      {/* Results */}
      {step === 'results' && (
        loading ? (
          <View style={[styles.card, styles.loadingCard]}>
            <ActivityIndicator color={C.blue} size="large" />
            <Text style={styles.loadingText}>Analysing your meal...</Text>
          </View>
        ) : analysis ? (
          <>
            {analysis.description && (
              <View style={[styles.card, { backgroundColor: C.blueLight }]}>
                <Text style={styles.summaryLabel}>IDENTIFIED MEAL</Text>
                <Text style={styles.summaryText}>{analysis.description}</Text>
              </View>
            )}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Analysis</Text>
              {Object.entries(FIELD_LABELS).map(([key, label]) => {
                const val = analysis[key];
                const reason = analysis[key + '_reason'];
                const isNumeric = key === 'fodmap' || key === 'histamine';
                let bg, color;

                if (isNumeric && typeof val === 'number') {
                  const numColor = getNumericColor(val);
                  bg = numColor.bg;
                  color = numColor.color;
                } else {
                  bg = RISK_BG[val];
                  color = RISK_COLOR[val];
                }

                const isExpanded = expandedKey === key;
                return (
                  <View key={key} style={styles.resultBlock}>
                    <View style={styles.resultRow}>
                      <Text style={styles.resultLabel}>{label}</Text>
                      {val || val === 0 ? (
                        <TouchableOpacity
                          onPress={() => setExpandedKey(isExpanded ? null : key)}
                          activeOpacity={0.75}
                          style={[styles.resultChip, { backgroundColor: bg || '#F5F5F5' }]}
                        >
                          <Text style={[styles.resultChipText, { color: color || C.sub }]}>
                            {isNumeric && typeof val === 'number' ? `${val}/10` : val} {reason ? (isExpanded ? '▲' : '▼') : ''}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.resultEmpty}>—</Text>
                      )}
                    </View>
                    {isExpanded && reason && (
                      <Text style={styles.reasonText}>{reason}</Text>
                    )}
                  </View>
                );
              })}
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>When did you eat this?</Text>
              <View style={styles.dayRow}>
                {[
                  { label: 'Today', off: 0 },
                  { label: 'Yesterday', off: 1 },
                  { label: '2 days ago', off: 2 },
                  { label: '3 days ago', off: 3 },
                ].map(d => (
                  <TouchableOpacity
                    key={d.off}
                    style={[styles.dayChip, dayOffset === d.off && styles.dayChipSelected]}
                    onPress={() => setDayOffset(d.off)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.dayChipText, dayOffset === d.off && styles.dayChipTextSelected]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.timePickerLabel}>Hour</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeScroll}>
                {Array.from({ length: 24 }, (_, h) => h).map(h => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.timeChip, hour === h && styles.timeChipSelected]}
                    onPress={() => setHour(h)}
                  >
                    <Text style={[styles.timeChipText, hour === h && styles.timeChipTextSelected]}>
                      {String(h).padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.timePickerLabel}>Minute</Text>
              <View style={styles.minuteRow}>
                {[0, 15, 30, 45].map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.timeChip, minute === m && styles.timeChipSelected]}
                    onPress={() => setMinute(m)}
                  >
                    <Text style={[styles.timeChipText, minute === m && styles.timeChipTextSelected]}>
                      {String(m).padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={reset} activeOpacity={0.85}>
                <Text style={styles.secondaryBtnText}>Re-analyse</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>Save Entry</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  stepDots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.muted },
  dotActive: { backgroundColor: C.primary, width: 24 },
  card: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  cardLabel: { fontSize: 13, fontWeight: '700', color: C.sub, letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' },
  input: { fontSize: 15, color: C.text, minHeight: 80, textAlignVertical: 'top', lineHeight: 22 },
  inputDisabled: { color: C.sub },
  primaryBtn: {
    backgroundColor: C.primary, borderRadius: 14,
    padding: 16, alignItems: 'center', marginBottom: 12,
  },
  primaryBtnDisabled: { backgroundColor: '#A5D6A7' },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  questionBlock: { paddingVertical: 12 },
  questionDivider: { borderBottomWidth: 1, borderBottomColor: C.divider },
  questionText: { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 10, lineHeight: 20 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F5F5F5', borderWidth: 1.5, borderColor: 'transparent',
  },
  optionChipSelected: { backgroundColor: C.primaryLight, borderColor: C.primary },
  optionChipText: { fontSize: 13, color: C.sub },
  optionChipTextSelected: { color: C.primary, fontWeight: '700' },
  loadingCard: { alignItems: 'center', paddingVertical: 36 },
  loadingText: { marginTop: 14, fontSize: 15, color: C.sub },
  summaryLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: C.blue, marginBottom: 6 },
  summaryText: { fontSize: 14, color: C.text, lineHeight: 21 },
  resultBlock: {
    borderBottomWidth: 1, borderBottomColor: C.divider,
  },
  resultRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10,
  },
  reasonText: {
    fontSize: 12, color: C.sub, lineHeight: 17,
    paddingBottom: 10, paddingHorizontal: 2, fontStyle: 'italic',
  },
  resultLabel: { fontSize: 14, color: C.sub },
  resultChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  resultChipText: { fontSize: 13, fontWeight: '600' },
  resultEmpty: { fontSize: 14, color: C.muted },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  secondaryBtn: {
    flex: 1, backgroundColor: C.surface, borderRadius: 14,
    padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: C.muted,
  },
  secondaryBtnText: { color: C.sub, fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 2, backgroundColor: C.primary, borderRadius: 14,
    padding: 16, alignItems: 'center',
  },

  // Date/time picker
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  dayChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F5F5F5', borderWidth: 1.5, borderColor: 'transparent',
  },
  dayChipSelected: { backgroundColor: C.primaryLight, borderColor: C.primary },
  dayChipText: { fontSize: 13, color: C.sub },
  dayChipTextSelected: { color: C.primary, fontWeight: '700' },
  timePickerLabel: { fontSize: 11, fontWeight: '700', color: C.muted, letterSpacing: 0.8, marginTop: 12, marginBottom: 8, textTransform: 'uppercase' },
  timeScroll: { flexDirection: 'row' },
  minuteRow: { flexDirection: 'row', gap: 8 },
  timeChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#F5F5F5', marginRight: 6, borderWidth: 1.5, borderColor: 'transparent',
  },
  timeChipSelected: { backgroundColor: C.primaryLight, borderColor: C.primary },
  timeChipText: { fontSize: 15, color: C.sub },
  timeChipTextSelected: { color: C.primary, fontWeight: '700' },

  // Meal suggestions
  suggestionsCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 14, marginBottom: 12,
    borderWidth: 1.5, borderColor: C.primary + '40',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  suggestionsLabel: { fontSize: 12, fontWeight: '700', color: C.primary, marginBottom: 10, letterSpacing: 0.3 },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.divider,
  },
  suggestionText: { fontSize: 14, fontWeight: '600', color: C.text },
  suggestionMeta: { fontSize: 11, color: C.muted, marginTop: 2 },
  useBadge: {
    backgroundColor: C.primaryLight, paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1.5, borderColor: C.primary,
  },
  useBadgeText: { fontSize: 12, fontWeight: '700', color: C.primary },
});
