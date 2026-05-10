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
      versionCode: 8,
      permissions: ['android.permission.CAMERA','android.permission.READ_MEDIA_IMAGES','android.permission.READ_MEDIA_VIDEO','android.permission.VIBRATE'],
    },
    plugins: [
      'expo-router',
      ['expo-camera', { cameraPermission: 'O Visao360 usa a camera para escanear QR Codes.' }],
      ['expo-image-picker', { photosPermission: 'Galeria para evidencias.', cameraPermission: 'Camera para evidencias.' }],
      'expo-secure-store',
    ],
    experiments: { typedRoutes: true },
    extra: {
      apiUrl: 'https://3cdcab9b78e4e5.lhr.life/api/v1',
      eas: { projectId: 'e3471a0f-8723-4b5b-ac05-7bdaf00355ce' },
    },
  },
};
