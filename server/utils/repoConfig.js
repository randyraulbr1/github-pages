/** Configuración del repo GitHub para respaldos. */
function repoConfig() {
  return {
    repo: process.env.GITHUB_REPO || 'randyraulbr1/github-pages',
    branch: process.env.GITHUB_BRANCH || 'main',
    path: 'datos/mundo.json'
  };
}

module.exports = { repoConfig };
