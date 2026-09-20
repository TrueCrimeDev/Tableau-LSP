const fs = require('fs/promises');
const path = require('path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const destination = path.join(root, '.vscode-dev', 'examples');
  // Keep edits made during a debug session; delete .vscode-dev to reset the demo.
  await fs.cp(path.join(root, 'examples'), destination, { recursive: true, force: false, errorOnExist: false });
  console.log('Synthetic demo ready in .vscode-dev/examples.');
})().catch(error => { console.error(error); process.exitCode = 1; });
