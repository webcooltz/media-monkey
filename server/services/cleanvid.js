const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config');

function isEnabled() {
  return config.CLEANVID_ENABLED;
}

// Run cleanvid on an absolute input path. Stubbed unless CLEANVID_ENABLED=true and cleanvid is installed.
// cleanvid mutes/removes profanity using subtitles; requires python + `pip install cleanvid` + ffmpeg.
function clean(inputPath, { subtitlePath = null } = {}) {
  return new Promise(resolve => {
    if (!isEnabled()) {
      return resolve({
        stub: true,
        message: 'cleanvid disabled. Set CLEANVID_ENABLED=true in server/.env (needs python + `pip install cleanvid` + ffmpeg).',
      });
    }
    if (!fs.existsSync(inputPath)) {
      return resolve({ error: 'Input file not found' });
    }

    const dir = path.dirname(inputPath);
    const base = path.parse(inputPath).name;
    const outputPath = path.join(dir, `${base}_clean${path.extname(inputPath)}`);

    const args = ['-i', inputPath, '-o', outputPath];
    if (subtitlePath) args.push('-s', subtitlePath);

    const proc = spawn(config.CLEANVID_CMD, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', err => resolve({ error: `Failed to launch cleanvid: ${err.message}` }));
    proc.on('close', code => {
      if (code === 0) resolve({ success: true, outputPath });
      else resolve({ error: `cleanvid exited ${code}`, detail: stderr.slice(-500) });
    });
  });
}

module.exports = { clean, isEnabled };
