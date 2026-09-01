const pkg = require('./package.json');

module.exports = {
  ...pkg.build,
  forceCodeSigning: true,
  mac: {
    ...pkg.build.mac,
    hardenedRuntime: true,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.inherit.plist',
    notarize: true
  }
};
