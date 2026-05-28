import React from 'react';
import { Platform } from 'react-native';

// Register push notification service worker for PWA
if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/push-sw.js').catch(err => console.warn('SW registration failed:', err));
}
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from './screens/HomeScreen';
import FoodEntryScreen from './screens/FoodEntryScreen';
import SymptomScreen from './screens/SymptomScreen';
import HistoryScreen from './screens/HistoryScreen';
import SettingsScreen from './screens/SettingsScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: '#2E7D32' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '700', fontSize: 17 },
          headerBackTitleVisible: false,
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'IBS Tracker' }} />
        <Stack.Screen name="FoodEntry" component={FoodEntryScreen} options={{ title: 'Log Food' }} />
        <Stack.Screen name="Symptoms" component={SymptomScreen} options={{ title: 'Log Symptoms' }} />
        <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'History & Export' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
