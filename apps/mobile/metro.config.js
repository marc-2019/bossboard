const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Monorepo: ensure all packages resolve from this workspace
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// Resolve modules from the mobile app first, then root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// NOTE: No extraNodeModules force-resolution. With react/react-dom aligned to
// the Expo SDK 54 pins (19.1.0) across the workspace, npm hoists a single copy
// of each and Metro's default resolution finds it. The previous force-block
// pinned react to a nested 19.2.4 copy while react-dom resolved to the root
// 19.1.0 copy (and pointed react-native at a non-existent nested path), which
// crashed the app on first render. See commit fb740e5 for the regression.

module.exports = config;
