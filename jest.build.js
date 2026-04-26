const { execSync } = require('child_process');

module.exports = async () => {
    execSync('npm run build');
};