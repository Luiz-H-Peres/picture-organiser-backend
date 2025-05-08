const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let serverProcess;

const startServer = () => {
    if (serverProcess) {
        serverProcess.kill();
        console.log('🔄 Restarting server...');
    }

    serverProcess = spawn('node', ['server.js'], {
        stdio: 'inherit',
    });
};

const watchDir = (dir) => {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            watchDir(fullPath);
        } else if (file.endsWith('.js')) {
            fs.watchFile(fullPath, { interval: 500 }, () => {
                startServer();
            });
        }
    });
};

startServer();
watchDir(__dirname);
console.log('👀 Watching for file changes...');
