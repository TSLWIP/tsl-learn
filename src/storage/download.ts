import { exportBackup } from './backup.ts';
import type { Repo } from './repo.ts';

/** Builds the backup file and hands it to the browser as a download. Returns the file name. */
export async function downloadBackup(repo: Repo): Promise<string> {
  const blob = new Blob([JSON.stringify(await exportBackup(repo))], { type: 'application/json' });
  const name = `tsl-learn-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return name;
}
