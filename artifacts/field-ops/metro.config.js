const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Exclude @sentry/node tmp build dirs that Metro tries to watch but don't exist
config.resolver = config.resolver ?? {};
config.resolver.blockList = [
  /node_modules\/.pnpm\/@sentry\+node[^/]*\/node_modules\/@sentry\/node_tmp.*/,
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
];

module.exports = config;
