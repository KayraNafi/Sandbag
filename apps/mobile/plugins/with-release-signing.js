const { withAppBuildGradle } = require('expo/config-plugins');

// Signs release builds with your own key when SANDBAG_KEYSTORE is set.
// Android refuses updates signed with a different key, so losing it strands every install.
module.exports = (config) => withAppBuildGradle(config, (mod) => {
  let gradle = mod.modResults.contents;
  if (gradle.includes('SANDBAG_KEYSTORE')) return mod;
  gradle = gradle.replace(/signingConfigs \{/, `signingConfigs {
        release {
            if (System.getenv('SANDBAG_KEYSTORE')) {
                storeFile file(System.getenv('SANDBAG_KEYSTORE'))
                storePassword System.getenv('SANDBAG_KEYSTORE_PASSWORD')
                keyAlias 'sandbag'
                keyPassword System.getenv('SANDBAG_KEYSTORE_PASSWORD')
            }
        }`);
  gradle = gradle.replace(/(release \{[^}]*?)signingConfig signingConfigs\.debug/s, "$1signingConfig System.getenv('SANDBAG_KEYSTORE') ? signingConfigs.release : signingConfigs.debug");
  mod.modResults.contents = gradle;
  return mod;
});
