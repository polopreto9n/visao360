// app.config.js — substitui app.json, permite lógica dinâmica
// A URL da API é injetada aqui e fica disponível via expo-constants em runtime

const IS_PROD = process.env.APP_ENV === 'production';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (IS_PROD
    ? 'https://api.visao360.com.br/api/v1'
    : 'http://192.168.0.190:3001/api/v1'); // IP padrão de desenvolvimento

module.exports = {
  expo: {
    name: 'Visão360',
    slug: 'visao360',
    owner: 'ronaldoxvs-organization',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    scheme: 'visao360',
    newArchEnabled: false,
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#2563eb',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.visao360.app',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#2563eb',
      },
      package: 'com.visao360.app',
      versionCode: 2,
      permissions: [
        'android.permission.CAMERA',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.VIBRATE',
      ],
    },
    plugins: [
      'expo-router',
      [
        'expo-camera',
        {
          cameraPermission:
            'O Visão360 usa a câmera para escanear QR Codes e registrar evidências fotográficas.',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'O Visão360 acessa sua galeria para enviar fotos de evidências.',
          cameraPermission: 'O Visão360 usa a câmera para registrar evidências fotográficas.',
        },
      ],
      'expo-secure-store',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      // ← acessível via Constants.expoConfig.extra.apiUrl
      apiUrl: API_URL,
      eas: {
        projectId: 'e3471a0f-8723-4b5b-ac05-7bdaf00355ce',
      },
    },
  },
};
