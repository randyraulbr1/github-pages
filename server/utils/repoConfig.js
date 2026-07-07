/** Configuración del repo GitHub para respaldos. */
function repoConfig() {
  return {
    repo: process.env.GITHUB_REPO || 'randyraulbr1/github-pages',
    branch: process.env.GITHUB_BRANCH || 'claude/web-rpg-gps-game-n3ybow',
    path: 'datos/mundo.json'
  };
}

module.exports = { repoConfig };
