import { spawn } from 'child_process';
import fs from 'fs/promises';

export async function runExifTool(imagePath: string): Promise<string> {
  await fs.access(imagePath);

  return new Promise((resolve, reject) => {
    const proc = spawn('exiftool', ['-json', '-n', imagePath], { windowsHide: true });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);

    proc.on('close', (code) => {
      if (code !== 0) {
        const message = stderr.trim() || `exiftool exited with code ${code}`;
        reject(new Error(message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function getExifJson(imagePath: string): Promise<any> {
  const output = await runExifTool(imagePath);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error('Could not parse exiftool output as JSON');
  }
}

export async function getBatchExifJson(folderPath: string): Promise<any[]> {
  await fs.access(folderPath);

  return new Promise((resolve, reject) => {
    const proc = spawn('exiftool', ['-json', '-filename', '-Rating', folderPath], { windowsHide: true });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);

    proc.on('close', (code) => {
      if (code !== 0) {
        const message = stderr.trim() || `exiftool exited with code ${code}`;
        reject(new Error(message));
        return;
      }
      try {
        const data = JSON.parse(stdout.trim());
        resolve(Array.isArray(data) ? data : [data]);
      } catch {
        reject(new Error('Could not parse exiftool output as JSON'));
      }
    });
  });
}