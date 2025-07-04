const { defineConfig } = require('tsdown/config');
require('dotenv').config();

module.exports = defineConfig({
  entry: 'src/index.ts',
  outdir: 'dist',
  format: 'cjs',
  platform: 'node',
  define: {
    'process.env.OAUTH_CLIENT_ID': JSON.stringify(process.env.OAUTH_CLIENT_ID),
    'process.env.OAUTH_CLIENT_SECRET': JSON.stringify(process.env.OAUTH_CLIENT_SECRET),
  },
});