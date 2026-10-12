// Local test signing (decision #107 device check). When ODA_LOCAL_SIGNING names a properties file
// outside the repo (storeFile, storePassword, keyAlias, keyPassword), a local release build signs
// with that private key instead of React Native's public debug key. Unset (EAS builds, everyday
// local builds): nothing changes. A config plugin, so it survives `expo prebuild --clean`; no
// path or password is ever written into the project.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// oda: local test signing';

const GRADLE = `
${MARKER} (plugins/withLocalSigning.js). Only when ODA_LOCAL_SIGNING is set.
def odaLocalSigning = System.getenv('ODA_LOCAL_SIGNING')
if (odaLocalSigning) {
    def odaProps = new Properties()
    file(odaLocalSigning).withInputStream { odaProps.load(it) }
    android.signingConfigs.create('odaLocal') {
        storeFile file(odaProps['storeFile'])
        storePassword odaProps['storePassword']
        keyAlias odaProps['keyAlias']
        keyPassword odaProps['keyPassword']
    }
    android.buildTypes.release.signingConfig android.signingConfigs.odaLocal
}
`;

module.exports = function withLocalSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes(MARKER)) mod.modResults.contents += GRADLE;
    return mod;
  });
};
