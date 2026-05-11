# BossBoard Mobile App - Setup Guide

## Quick Start (Development)

### 1. Install Dependencies

```bash
cd /home/marc/projects/trademate-nz/apps/mobile
npm install
```

### 2. Generate App Icons (Optional)

```bash
# Install canvas package for asset generation
npm install canvas --save-dev

# Generate placeholder icons
npm run generate:assets
```

Or use your own icons - place them in `assets/`:
- `icon.png` (1024x1024)
- `adaptive-icon.png` (1024x1024)
- `splash.png` (1284x2778)
- `favicon.png` (48x48)

### 3. Start the API (in separate terminal)

```bash
cd /home/marc/projects/trademate-nz
docker-compose up -d
```

Verify API is running: http://192.168.50.128:29000/health

### 4. Start the Mobile App

```bash
cd /home/marc/projects/trademate-nz/apps/mobile
npx expo start
```

### 5. Run on Your Phone

**Option A: Expo Go (Easiest)**
1. Download "Expo Go" from App Store / Play Store
2. Scan the QR code shown in terminal
3. App loads on your phone

**Option B: iOS Simulator (Mac only)**
```bash
npx expo start --ios
```

**Option C: Android Emulator**
```bash
npx expo start --android
```

---

## Build for Testing (Beta Users)

### Prerequisites

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo account (create one at expo.dev if needed)
eas login
```

### Build Development APK (Android)

```bash
# Build APK for testing
eas build --profile development --platform android

# Download APK and share with testers
```

### Build for TestFlight (iOS)

Requires Apple Developer Account ($99/year)

```bash
# Configure iOS credentials
eas credentials --platform ios

# Build for TestFlight
eas build --profile preview --platform ios

# Submit to TestFlight
eas submit --platform ios
```

### Build for Internal Testing (Android)

Requires Google Play Console ($25 one-time)

```bash
# Build for internal track
eas build --profile preview --platform android

# Submit to Google Play internal testing
eas submit --platform android
```

---

## Build for Production (App Stores)

### iOS App Store

1. **Apple Developer Account Setup**
   - Enroll at https://developer.apple.com
   - Create App ID: `nz.instilligent.bossboard`
   - Create App in App Store Connect

2. **Update eas.json**
   Edit `eas.json` and update the submit.production.ios section:
   ```json
   "ios": {
     "appleId": "your-email@example.com",
     "ascAppId": "123456789",
     "appleTeamId": "ABCD1234"
   }
   ```

3. **Build & Submit**
   ```bash
   eas build --profile production --platform ios
   eas submit --platform ios
   ```

### Google Play Store

1. **Google Play Console Setup**
   - Create account at https://play.google.com/console
   - Create new app
   - Set up internal testing track

2. **Create Service Account**
   - In Google Cloud Console, create service account
   - Download JSON key
   - Save as `google-service-account.json` in mobile folder
   - Grant access in Play Console

3. **Build & Submit**
   ```bash
   eas build --profile production --platform android
   eas submit --platform android
   ```

---

## Configuration

### API URL

The app connects to your API. Configure in:

**Development** (eas.json):
```json
"env": {
  "EXPO_PUBLIC_API_URL": "http://192.168.50.128:29000"
}
```

**Production** (eas.json):
```json
"env": {
  "EXPO_PUBLIC_API_URL": "https://api.your-domain.co.nz"
}
```

### App Identity

Update in `app.json`:
- `name` - Display name
- `slug` - URL-safe name
- `ios.bundleIdentifier` - iOS bundle ID
- `android.package` - Android package name

---

## Project Structure

```
apps/mobile/
├── app/                    # Screens (expo-router)
│   ├── _layout.tsx         # Root layout
│   ├── (auth)/             # Auth screens
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/             # Tab screens
│   │   ├── index.tsx       # Home
│   │   ├── swms.tsx        # SWMS list
│   │   ├── certifications.tsx
│   │   └── profile.tsx
│   └── swms/               # SWMS detail screens
│       ├── generate.tsx
│       └── [id].tsx
├── src/
│   ├── contexts/           # React contexts
│   │   └── AuthContext.tsx
│   └── services/           # Business logic
│       ├── api.ts          # API client
│       └── offline.ts      # SQLite storage
├── assets/                 # Icons & images
├── scripts/                # Build scripts
├── app.json                # Expo config
├── eas.json                # EAS Build config
├── package.json
└── tsconfig.json
```

---

## Troubleshooting

### "Network request failed"
- Check API is running: `curl http://192.168.50.128:29000/health`
- Ensure phone is on same WiFi as server
- Try using your computer's local IP instead

### "Unable to resolve module"
```bash
# Clear cache and reinstall
rm -rf node_modules
npm install
npx expo start -c
```

### iOS Simulator Issues (Mac)
```bash
# Reset simulator
xcrun simctl erase all
npx expo start --ios
```

### Android Emulator Issues
```bash
# Clear Android cache
cd android && ./gradlew clean
npx expo start --android
```

---

## Next Steps

1. **Test locally** with Expo Go
2. **Generate assets** (icons, screenshots)
3. **Build preview** APK for beta testers
4. **Gather feedback** from 50 users
5. **Submit to stores** after validation

## Support

- Documentation: See `CLAUDE.md` in project root
- Issues: Create in GitHub repository
