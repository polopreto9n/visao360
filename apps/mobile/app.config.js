module.exports = {
  expo: {
    name: 'Visao360',
    slug: 'visao360',
    owner: 'ronaldoxvs-organization',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    scheme: 'visao360',
    newArchEnabled: false,
    icon: './assets/icon.png',
    splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#2563eb' },
    ios: { supportsTablet: true, bundleIdentifier: 'com.visao360.app' },
    android: {
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#2563eb' },
      package: 'com.visao360.app',
      versionCode: 4,
      permissions: ['android.permission.CAMERA','android.permission.READ_MEDIA_IMAGES','android.permission.READ_MEDIA_VIDEO','android.permission.VIBRATE'],
    },
    plugins: [
      'expo-router',
      ['expo-camera', { cameraPermission: 'O Visao360 usa a camera para escanear QR Codes.' }],
      ['expo-image-picker', { photosPermission: 'O Visao360 acessa sua galeria.', cameraPermission: 'O Visao360 usa a camera.' }],
      'expo-secure-store',
    ],
    experiments: { typedRoutes: true },
    extra: {
      apiUrl: 'https://d204ab95f49ddb.lhr.life/api/v1',
      eas: { projectId: 'e3471a0f-8723-4b5b-ac05-7bdaf00355ce' },
    },
  },
};
