const { spawn } = require('child_process');
const path = require('path');

function startServer(scriptName) {
  const server = spawn('node', [scriptName], { 
    stdio: 'inherit',
    shell: true 
  });

  console.log(`Started ${scriptName}`);

  server.on('error', (err) => {
    console.error(`Error starting ${scriptName}:`, err);
  });

  server.on('close', (code) => {
    if (code !== 0) {
      console.log(`${scriptName} exited with code ${code}`);
    }
  });

  return server;
}

console.log('Starting backend servers...');
const server1 = startServer('server1.js');
const server2 = startServer('server2.js');

process.on('SIGINT', () => {
  console.log('Shutting down servers...');
  server1.kill('SIGTERM');
  server2.kill('SIGTERM');
  process.exit(0);
});
