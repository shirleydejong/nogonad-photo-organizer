import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Opens the Windows native "Open with" dialog for a given file path
 * Uses: rundll32.exe shell32.dll,OpenAs_RunDLL "file_path"
 */
export async function openWithDialog(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use execFile with shell option to properly handle spaces and special characters
    execFile(
      'rundll32.exe',
      ['shell32.dll,OpenAs_RunDLL', filePath],
      { shell: true },
      (error) => {
        if (error) {
          reject(new Error(`Failed to open "Open with" dialog: ${error.message}`));
        } else {
          resolve();
        }
      }
    );
  });
}

