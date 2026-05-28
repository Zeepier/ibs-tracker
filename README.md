# 🥗 IBS Tracker

A React Native app for tracking IBS food triggers and symptoms using Claude AI for food analysis.

## Features

- 📸 **Log Food**: Take photos or describe meals. Claude AI analyzes nutritional content and common IBS triggers
- 📋 **Log Symptoms**: Track pain, bloating, energy, and bowel movements using scales
- 📊 **View History**: See all logged entries and export as CSV
- 🧠 **AI Analysis**: Claude automatically identifies potential IBS trigger foods

## Quick Start

### Prerequisites
- Node.js v16+
- Android phone with Expo Go app
- Claude API account (optional, for food analysis)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Add your Claude API key to `services/claudeApi.js`:
   ```javascript
   const CLAUDE_API_KEY = 'your-key-here';
   ```

3. Start the development server:
   ```bash
   npx expo start
   ```

4. Scan the QR code with Expo Go on your phone

## File Structure

```
ibs-tracker/
├── screens/
│   ├── HomeScreen.js         # Main navigation menu
│   ├── FoodEntryScreen.js    # Log food with photos
│   ├── SymptomScreen.js      # Log symptoms and ratings
│   └── HistoryScreen.js      # View and export data
├── services/
│   ├── claudeApi.js          # Claude API integration
│   └── storage.js            # Local data persistence
├── App.js                    # Navigation setup
└── package.json              # Dependencies
```

## How to Use

1. **Log Food**: Tap "Log Food", add a description or photo, tap Save. Claude analyzes it.
2. **Log Symptoms**: Rate pain, bloating, energy, and wellbeing. Add notes if needed.
3. **Export Data**: In History, tap "Export as CSV" to share your data with your doctor.

## API Key Setup

Get a free Claude API key:
1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up and add a payment method
3. Create an API key in Settings
4. Paste it into `services/claudeApi.js`

## Development

- **Hot Reload**: Press `r` in terminal to reload
- **Logs**: Press `j` to open debugger
- **Menu**: Press `m` to show dev menu on phone

## Building APK

```bash
npm run android
```

## Environment Variables

Create a `.env` file (if using a config system):
```
CLAUDE_API_KEY=your-key-here
```

## Troubleshooting

- **"Can't connect"**: Ensure phone and computer are on same WiFi, or press `s` for tunnel mode
- **"Module not found"**: Run `npm install` again
- **Red error screen**: Check error message and ensure all files are saved

## Future Enhancements

- Push notifications for reminder to log
- Pattern analysis (which foods cause symptoms)
- Doctor's note integration
- Better data visualization
- Cloud backup

## License

Personal use only. Do not share with API key included.
