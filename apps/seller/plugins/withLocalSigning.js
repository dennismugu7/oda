// Local release signing (decision #107 device check; #113 local release builds). When
// ODA_LOCAL_SIGNING names a file outside the repo, a local release build signs with that private
// key instead of React Native's public debug key. The file is either a properties file
// (storeFile, storePassword, keyAlias, keyPassword) or an EAS `credentials.json` (as `eas
// credentials` downloads it; its keystorePath is relative to the file), so the Play upload key's
// passwords are read in place and never copied. Unset (EAS builds, everyday local builds):
// nothing changes. A config plugin, so it survives `expo prebuild --clean`; no path or password
// is ever written into the project.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// oda: local test signing';

const GRADLE = `
${MARKER} (plugins/withLocalSigning.js). Only when ODA_LOCAL_SIGNING is set.
def odaLocalSigning = System.getenv('ODA_LOCAL_SIGNING')
if (odaLocalSigning) {
    def odaFile = file(odaLocalSigning)
    def odaKey = [:]
    if (odaFile.name.endsWith('.json')) {
        def odaKeystore = new groovy.json.JsonSlurper().parse(odaFile).android.keystore
        odaKey = [
            storeFile: new File(odaFile.parentFile, odaKeystore.keystorePath),
            storePassword: odaKeystore.keystorePassword,
            keyAlias: odaKeystore.keyAlias,
            keyPassword: odaKeystore.keyPassword,
        ]
    } else {
        def odaProps = new Properties()
        odaFile.withInputStream { odaProps.load(it) }
        odaKey = [
            storeFile: file(odaProps['storeFile']),
            storePassword: odaProps['storePassword'],
            keyAlias: odaProps['keyAlias'],
            keyPassword: odaProps['keyPassword'],
        ]
    }
    android.signingConfigs.create('odaLocal') {
        storeFile odaKey.storeFile
        storePassword odaKey.storePassword
        keyAlias odaKey.keyAlias
        keyPassword odaKey.keyPassword
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
