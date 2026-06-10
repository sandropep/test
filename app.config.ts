import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'ShelfChecker',
  slug: 'ShelfChecker2',
  scheme: 'shelfchecker',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.shelfchecker.app',
  },
  android: {
    package: 'com.shelfchecker.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
  },
  web: {
    favicon: './assets/favicon.png',
    output: 'static',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    'expo-font',
    '@react-native-community/datetimepicker',
  ],
  extra: {
    eas: {
      projectId: 'ac52ffba-e4b6-474e-b5c7-06f8f343ac65',
    },
  },
});
