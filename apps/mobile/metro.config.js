const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
// Raiz do monorepo (2 níveis acima de apps/mobile)
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Permite ao Metro ver arquivos fora do projectRoot (node_modules do workspace)
config.watchFolders = [workspaceRoot];

// Prioridade de resolução: local primeiro, depois raiz do workspace
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
