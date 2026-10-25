// Job Intelligence file persistence (Node only).
// The store itself is storage-agnostic (core/store.js); this adapter gives it a JSON file with
// atomic writes (temp file + rename), serialised saves and a rolling backup.
//
// The data directory MUST stay outside anything served statically. Default: <project>/.data/jobintel
// (a dot-directory, which express.static ignores, and server.js additionally answers 404 for /.data).
// Override with JOBINTEL_DATA_DIR. Note: on hosts with an ephemeral disk (e.g. Cloud Run) point
// JOBINTEL_DATA_DIR at a mounted persistent volume or data will not survive a restart.
import fs from 'fs';
import path from 'path';

const FILE_NAME = 'job_intelligence.json';
const BACKUP_EVERY_MS = 5 * 60 * 1000;

export function createFilePersistence({ dir, logger = console } = {}) {
  if (!dir) throw new Error('createFilePersistence: dir is required');
  const file = path.join(dir, FILE_NAME);
  let chain = Promise.resolve();
  let lastBackupAt = 0;

  async function load() {
    try {
      const raw = await fs.promises.readFile(file, 'utf-8');
      try {
        return JSON.parse(raw);
      } catch (parseErr) {
        // Never silently overwrite unreadable data: keep a copy next to it, then start from the seed.
        const keep = `${file}.corrupt-${Date.now()}`;
        await fs.promises.copyFile(file, keep).catch(() => {});
        logger.error('[jobintel] data file is not valid JSON; copy kept at', path.basename(keep));
        return null;
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') return null;
      throw err;
    }
  }

  function save(state) {
    chain = chain.then(async () => {
      await fs.promises.mkdir(dir, { recursive: true });
      const tmp = `${file}.tmp-${process.pid}`;
      await fs.promises.writeFile(tmp, JSON.stringify(state), 'utf-8');
      const now = Date.now();
      if (now - lastBackupAt > BACKUP_EVERY_MS) {
        await fs.promises.copyFile(file, `${file}.bak`).catch(() => {});
        lastBackupAt = now;
      }
      await fs.promises.rename(tmp, file);
    }).catch((err) => {
      logger.error('[jobintel] persist failed', err && err.message);
    });
    return chain;
  }

  return { load, save, file };
}
