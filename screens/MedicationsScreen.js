import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch, TextInput } from 'react-native';
import { loadMedications, saveMedications, addMedication, updateMedication, removeMedication } from '../services/medications';

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

export default function MedicationsScreen({ navigation }) {
  const [medications, setMedications] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDosage, setFormDosage] = useState('');

  useEffect(() => {
    loadMeds();
    const unsubscribe = navigation.addListener('focus', loadMeds);
    return unsubscribe;
  }, [navigation]);

  const loadMeds = async () => {
    const meds = await loadMedications();
    setMedications(meds);
  };

  const handleAdd = async () => {
    if (!formName.trim()) {
      Alert.alert('Name required');
      return;
    }
    await addMedication(formName, formDosage || '—');
    setFormName('');
    setFormDosage('');
    setShowForm(false);
    await loadMeds();
  };

  const handleToggle = async (id, enabled) => {
    await updateMedication(id, { enabled: !enabled });
    await loadMeds();
  };

  const handleRemove = (id) => {
    Alert.alert('Remove medication?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeMedication(id);
          await loadMeds();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {medications.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No medications yet</Text>
          <Text style={styles.emptySubtext}>Add your medications to track daily intake</Text>
        </View>
      ) : (
        <View>
          <Text style={styles.sectionLabel}>Active Medications</Text>
          {medications.map(med => (
            <View key={med.id} style={styles.medCard}>
              <View style={styles.medHeader}>
                <View style={styles.medInfo}>
                  <Text style={styles.medName}>{med.name}</Text>
                  <Text style={styles.medDosage}>{med.dosage}</Text>
                </View>
                <Switch
                  value={med.enabled}
                  onValueChange={() => handleToggle(med.id, med.enabled)}
                  trackColor={{ false: C.divider, true: C.primaryLight }}
                  thumbColor={med.enabled ? C.primary : C.muted}
                />
              </View>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => handleRemove(med.id)}
                activeOpacity={0.6}
              >
                <Text style={styles.removeBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {showForm ? (
        <View style={styles.formCard}>
          <Text style={styles.formLabel}>Medication Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Omeprazole"
            placeholderTextColor={C.muted}
            value={formName}
            onChangeText={setFormName}
          />
          <Text style={styles.formLabel}>Dosage (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 20mg once daily"
            placeholderTextColor={C.muted}
            value={formDosage}
            onChangeText={setFormDosage}
          />
          <View style={styles.formActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setShowForm(false);
                setFormName('');
                setFormDosage('');
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={handleAdd}
              activeOpacity={0.75}
            >
              <Text style={styles.addBtnText}>Add Medication</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.addNewBtn}
          onPress={() => setShowForm(true)}
          activeOpacity={0.75}
        >
          <Text style={styles.addNewBtnText}>+ Add Medication</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 32 },

  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 17, fontWeight: '700', color: C.text },
  emptySubtext: { fontSize: 13, color: C.sub, marginTop: 6 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.muted, letterSpacing: 0.8, marginBottom: 12, textTransform: 'uppercase' },

  medCard: { backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.divider },
  medHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  medInfo: { flex: 1 },
  medName: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 4 },
  medDosage: { fontSize: 13, color: C.sub },
  removeBtn: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#FFEBEE' },
  removeBtnText: { fontSize: 12, fontWeight: '600', color: C.danger },

  formCard: { backgroundColor: C.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.divider, marginBottom: 16 },
  formLabel: { fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 8, marginTop: 12 },
  formLabel_first: { marginTop: 0 },
  input: {
    borderWidth: 1,
    borderColor: C.divider,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: C.text,
    backgroundColor: C.bg,
  },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: C.bg, borderWidth: 1, borderColor: C.divider },
  cancelBtnText: { textAlign: 'center', fontSize: 14, fontWeight: '600', color: C.sub },
  addBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: C.primary },
  addBtnText: { textAlign: 'center', fontSize: 14, fontWeight: '600', color: '#FFF' },

  addNewBtn: { paddingVertical: 14, borderRadius: 10, backgroundColor: C.primaryLight, borderWidth: 1.5, borderColor: C.primary },
  addNewBtnText: { textAlign: 'center', fontSize: 15, fontWeight: '700', color: C.primary },
});
