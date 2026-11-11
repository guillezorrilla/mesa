// Metro with Uniwind, which compiles Tailwind classes to React Native styles at build time.
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

module.exports = withUniwindConfig(getDefaultConfig(__dirname), {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
