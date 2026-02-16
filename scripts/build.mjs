import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const DIST_DIR = resolve(ROOT, "dist");
const FILES_TO_COPY = ["index.html", "style.css", "src"];

function resetDist() {
  if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true, force: true });
  }
  mkdirSync(DIST_DIR, { recursive: true });
}

function copyProjectFiles() {
  for (const file of FILES_TO_COPY) {
    cpSync(resolve(ROOT, file), resolve(DIST_DIR, file), { recursive: true });
  }
}

resetDist();
copyProjectFiles();
