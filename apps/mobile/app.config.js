const { existsSync } = require('node:fs');
const { join } = require('node:path');

// Each deployment brings its own Firebase project, and building without one just means no pushes.
module.exports = ({ config }) => {
  if (!existsSync(join(__dirname, 'google-services.json'))) return config;
  return { ...config, android: { ...config.android, googleServicesFile: './google-services.json' } };
};
