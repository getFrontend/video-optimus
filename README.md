# Video Optimus

A local Windows application for analyzing and sequentially compressing videos. The interface uses React + TypeScript, the desktop shell and queue processor use Tauri 2 + Rust, and encoding is performed by FFmpeg as a separate process.

## Development

Requirements: Node.js 20+, Rust stable with the `x86_64-pc-windows-msvc` target, Microsoft C++ Build Tools with the Windows SDK, and the WebView2 Runtime.

```powershell
npm install
npm run tauri dev
```

To run only the frontend, use `npm run dev`. The browser displays an interface preview; system dialogs and video processing are available only in the desktop application.

## FFmpeg

FFmpeg is not bundled with Video Optimus, which keeps the installer small. If FFmpeg is already installed, make sure both `ffmpeg.exe` and `ffprobe.exe` are available in `PATH`, then return to Video Optimus; it rechecks when its window regains focus.

The simplest installation is through Windows Package Manager. Run this in PowerShell:

```powershell
winget install ffmpeg
```

WinGet manages the download and extraction, then registers the commands in `PATH`; you do not need to find the package folder yourself. When installation finishes, return to Video Optimus. If the app was already open, it rechecks FFmpeg when its window regains focus. To verify the commands in a new PowerShell window, run `where.exe ffmpeg` and `where.exe ffprobe`.

If WinGet is unavailable, use the manual setup:

1. Open the [FFmpeg download page](https://ffmpeg.org/download.html), follow the Windows builds link to gyan.dev, and download `ffmpeg-release-full.7z`.
2. Extract it to a permanent folder (use [7-Zip](https://www.7-zip.org/) if Windows cannot open `.7z`). In its `bin` subfolder, FFmpeg and FFprobe are the only executables Video Optimus needs; `ffplay.exe` is optional.
3. Add the full path to that `bin` folder to your user `Path` environment variable in Windows.
4. Restart Video Optimus. The System panel should show that FFmpeg is connected.

Do not download the `.tar.xz` source archive or the `full-shared` build. For a manual setup without changing `PATH`, set `VIDEO_OPTIMUS_FFMPEG` and `VIDEO_OPTIMUS_FFPROBE` to the full paths of the two executables.

At startup, the application reads FFmpeg's encoder list and performs a brief real QSV test. If the hardware test fails, jobs use an available CPU encoder; if QSV fails during processing, the job is retried on the CPU. Original files are never overwritten.

The application detects available encoders at runtime, so the selected FFmpeg build determines which CPU codecs are available. FFmpeg binaries are not included in the repository or application installer.

## Implemented

- File dialogs, folder import with nested directories, and drag and drop.
- Container and stream analysis with FFprobe.
- A local queue with persistence, recovery of interrupted jobs, reordering, skipping, cancellation, retry, and cleanup.
- Sequential processing with actual FFmpeg progress, speed, and estimated time remaining.
- H.264, HEVC, and AV1 using detected QSV/CPU encoders, with separate quality values for each codec family.
- MP4 export to a temporary file, with duration, resolution, FPS, audio, and subtitle checks before publishing the result.
- Automatic unique `_optimized` filenames; source files remain unchanged.
- Local settings for mode, quality, and export folder.

## Current Limitations

This is a working foundation for Phases 1–2, not a completion of the full specification. Codec settings have not yet been calibrated against a test set. Smart currently selects from available encoders by priority rather than by full scene-complexity analysis. HDR jobs are intentionally stopped because HDR preservation cannot be guaranteed. Custom mode, target file size, preview, VMAF/SSIM, an on-demand hardware test, and detailed system information are not yet implemented.

The release `.exe` has been built, but the MSI/NSIS installers and actual encoding have not been tested because FFmpeg/FFprobe are unavailable in the development environment. A release still requires testing on Windows 11 with properly licensed FFmpeg binaries and the test videos from the specification.

## Build

After making FFmpeg available on the build machine through `PATH` or the environment variables above, and configuring the Windows C++ Build Tools:

```powershell
npm run tauri build
```

The configuration creates NSIS and MSI bundles. FFmpeg is not copied into either installer.

## Checks

```powershell
npm run build
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --lib
```
