const { withAndroidManifest } = require('@expo/config-plugins');

// Expo SDK 52 não tem um config-plugin que escreva
// android.usesCleartextTraffic no AndroidManifest — campo é ignorado.
// Sem isso o Android 9+ bloqueia HTTP puro (necessário para apontar
// o app pro IP da AWS sem certificado, ex: http://44.200.181.114:3001).
function withCleartextTraffic(config, { enabled }) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = enabled ? 'true' : 'false';
    }
    return config;
  });
}

module.exports = withCleartextTraffic;
