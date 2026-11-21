import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriConfig = JSON.parse(
  await readFile(path.join(projectRoot, "src-tauri", "tauri.conf.json"), "utf8"),
);
const version = tauriConfig.version;
const executablePath = path.join(projectRoot, "src-tauri", "target", "release", "video-optimus.exe");
const releaseRoot = path.join(projectRoot, ".video-optimus_releases");
await mkdir(releaseRoot, { recursive: true });
const destination = path.join(releaseRoot, `Video Optimus_v${version}.exe`);

await copyFile(executablePath, destination);
console.log(`Saved ${path.relative(projectRoot, destination)}`);
