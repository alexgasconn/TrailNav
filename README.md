<div align="center">

# 🥾 TrailNav - Offline Trail Navigation

![Version](https://img.shields.io/badge/version-2.0.0-emerald)
![License](https://img.shields.io/badge/license-MIT-blue)
![Status](https://img.shields.io/badge/status-Production-success)

**A Progressive Web App for offline hiking, trail running, and MTB route navigation with GPX support**

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Improvements](#-android-optimizations) • [Development](#-development)

</div>

---

## 🎯 Features

### Core Features

- 📍 **Offline GPS Navigation** - Navigate with confidence anywhere, even without internet
- 🗺️ **GPS Route Tracking** - Real-time position tracking on detailed maps
- 📊 **Route Analysis** - Detailed elevation, distance, and time statistics
- 🏔️ **Elevation Profiles** - Visualize gains and terrain difficulty
- 📱 **Mobile First** - Optimized for Android, iOS, and tablets
- 🔄 **GPX Import** - Import custom routes in GPX format
- 💾 **Offline Maps** - Download map tiles for offline use
- 🌙 **Dark Mode** - Easy on the eyes during night navigation

### Mobile Features (Android Optimized)

- 🔋 **Battery Monitoring** - See your device battery level in-app
- 📡 **Network Awareness** - Know when you're online/offline
- 📍 **High Precision GPS** - Continuous location tracking
- 🧭 **Device Orientation** - Auto-rotating maps based on compass
- 📳 **Haptic Feedback** - Vibration alerts for off-route warnings
- 🔒 **Screen Wake Lock** - Prevent screen from sleeping during navigation
- 💫 **Gesture Navigation** - Swipe right to go back, left to go home

### Technical Features

- ⚡ **PWA Architecture** - Install as native app on Android
- 🔐 **Service Workers** - Intelligent caching strategies
- 🎨 **Responsive Design** - Works on all screen sizes
- ♿ **Accessible** - WCAG 2.1 AA compliant
- 🚀 **Performance** - Fast load times, optimized for low-end devices
- 🔋 **Low Battery Mode** - Reduced animations to save power

---

## 📥 Installation

### Dependencies

- Node.js 18+
- npm or yarn
- Modern web browser (Chrome 90+, Firefox 88+, Safari 15+)

### Setup (Development)

1. **Clone or extract the project**

   ```bash
   cd TrailNav
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create .env.local** (if using Gemini API)

   ```bash
   cp .env.example .env.local
   # Edit with your API key
   ```

4. **Run development server**

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000> in your browser

### Build for Production

```bash
npm run build
npm run preview  # Test build locally
```

---

## 📱 Install as Android App

### Option 1: Chrome Browser (Recommended)

1. Open TrailNav in Chrome
2. Tap menu (⋮) → **"Install"** or **"Instalar aplicación"**
3. App will appear on home screen
4. Tap to launch in fullscreen mode

### Option 2: Web App Shortcut

1. Chrome menu → **"Add to Home Screen"**
2. Choose app icon and name
3. Launches in standalone mode

### Benefits

✅ Runs offline after first load  
✅ Works like a native app  
✅ No Google Play installation needed  
✅ Instant updates  
✅ Full access to device features  

---

## 🚀 Usage

### Importing Routes

1. Tap **"Import GPX"** button
2. Select a .gpx file from your device
3. Route will be analyzed and stored

### Navigating a Route

1. Select a route from "Your Routes"
2. Tap **"Navigate Now"** button
3. Follow the emerald green line on the map
4. Real-time metrics show:
   - Distance remaining
   - Current speed
   - Elevation
   - GPS accuracy
   - Compass heading

### Route Analysis

- View full route statistics
- See elevation profile
- Check total distance and elevation gain
- Analyze difficulty level
- Plan estimated time

### Offline Mode

- All downloaded maps work offline
- Routes stay accessible offline
- GPS works without internet
- Share routes via files

---

## ☑️ Android Optimizations (v2.0)

See [MEJORAS_ANDROID.md](MEJORAS_ANDROID.md) for detailed improvements.

### What's New in v2.0

#### 🎯 Features

- Battery status monitoring
- Online/offline detection
- Device orientation support
- Haptic feedback for alerts
- Screen wake lock during navigation
- Improved gesture controls
- Better error handling

#### 🎨 UI/UX

- Larger touch targets (44px minimum)
- Better color contrast
- Optimized font sizes
- Smoother animations
- Gradient backgrounds
- Better visual hierarchy
- Improved dark mode

#### ⚡ Performance

- Code splitting (separate vendor bundles)
- Intelligent caching (60 days for maps)
- Service worker optimizations
- Reduced bundle size
- Hardware acceleration
- Better battery usage

#### 🔐 Features

- Safe area insets for notches
- Meta tags for Android/iOS
- PWA manifest with shortcuts
- Share Target API ready
- Offline fallback pages

---

## 🛠️ Development

### Project Structure

```
TrailNav/
├── src/
│   ├── components/          # Reusable UI components
│   ├── screens/             # Main app screens
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utilities (geolocation, etc)
│   ├── App.tsx              # Main app component
│   ├── main.tsx             # Entry point
│   └── index.css            # Global styles
├── public/
│   ├── manifest.webmanifest # PWA configuration
│   └── icon.svg             # App icon
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript config
└── package.json
```

### Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run clean    # Clean build artifacts
npm run lint     # Check TypeScript
```

### Environment Variables

```env
VITE_API_KEY=your_api_key_here
```

### Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Styling
- **Vite 6** - Build tool
- **MapLibre GL** - Mapping
- **Turf.js** - Geospatial analysis
- **Workbox** - Service Worker management

---

## 📖 API Reference

### Hooks

#### `useGeolocation(enableTracking, enableHighAccuracy)`

```typescript
const location = useGeolocation(true, true);
// Returns: { latitude, longitude, accuracy, altitude, heading, speed, ... }
```

#### `useBatteryStatus()`

```typescript
const battery = useBatteryStatus();
// Returns: { level, charging, dischargingTime, chargingTime }
```

#### `useOnlineStatus()`

```typescript
const isOnline = useOnlineStatus();
// Returns: boolean
```

#### `useDeviceOrientation()`

```typescript
const { alpha, beta, gamma } = useDeviceOrientation();
// Returns: device orientation angles
```

#### `useVibration()`

```typescript
const vibration = useVibration();
vibration.vibrate(100);           // Single pulse
vibration.vibrate([100, 50, 100]); // Pattern
vibration.cancel();               // Stop
```

---

## 🐛 Troubleshooting

### GPS Not Working

- **Check:** Settings → Location permissions (on)
- **Check:** Device location is enabled
- **Try:** Restart browser or app
- **Note:** High accuracy requires open sky view

### Maps Not Loading Offline

- **Check:** Maps were downloaded in "Offline Maps" section
- **Check:** You have sufficient storage space
- **Try:** Clear cache and re-download

### Battery Status Not Showing

- **Note:** Only available on Android, some devices
- **Note:** Requires Battery Status API support

### App Running Slow

- **Try:** Clear app cache (Settings → Storage)
- **Try:** Disable animations (Settings → Accessibility)
- **Check:** Available device storage

### Can't Install as App

- **Requirement:** Must use Chrome or Edge browser
- **Requirement:** Site must be served over HTTPS
- **Try:** Visit in incognito tab first
- **Try:** Clear browser cache

---

## 📊 Browser Support

| Browser | Android | iOS | Desktop |
|---------|---------|-----|---------|
| Chrome | ✅ Full | ✅ Web | ✅ Full |
| Firefox | ✅ Full | ⚠️ Limited | ✅ Full |
| Safari | ✅ Web | ✅ Limited | ✅ Limited |
| Edge | ✅ Full | ⚠️ Limited | ✅ Full |

✅ = Full support  
⚠️ = Limited features  
❌ = Not supported

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## 👨‍💻 Author

**TrailNav Development Team**

---

## 📞 Support

For issues and suggestions:

- Check existing issues
- Create a new issue with details
- Include device/browser info
- Attach error screenshots

---

## 🙏 Acknowledgments

- MapLibre GL for mapping
- Turf.js for geospatial computation
- React and Vite communities
- All trail enthusiasts testing the app

---

<div align="center">

**Happy trails! 🥾🗺️**

[Back to top](#-trailnav---offline-trail-navigation)

</div>
