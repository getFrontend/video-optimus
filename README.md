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
- H.264, HEVC, and AV1 using individually tested QSV encoders and detected CPU encoders, with encoder-specific options.
- Smart/Fast/Maximum encoder priorities and speed/compression presets.
- Target file size using bitrate control, two-pass x264/x265 where available, and a warning when the final size misses the 5% tolerance.
- Three short preview fragments with side-by-side playback and optional SSIM/PSNR when the FFmpeg filters are available.
- Automatic MKV output for jobs with subtitles or attachments; temporary outputs are validated before publishing.
- Additional checks for duration, resolution, frame rate, video/audio/subtitle stream counts, color metadata, rotation, and bit depth.
- Automatic unique `_optimized` filenames; source files remain unchanged.
- Local settings for mode, quality, target size, and export folder.
- Bulk retry/settings for selected queue items and local FFmpeg diagnostic logs.
- Runtime details for tested encoders, available SSIM/PSNR filters, and logical processor count.

## Current Limitations

This is still not a completion of the full specification. Codec profiles and the bitrate-based output-size estimate have not been calibrated against the required test set. Smart currently chooses by encoder priority rather than scene-complexity analysis. Target-size output is verified and warned about, but the 5% tolerance has not been validated on real videos. Preview and SSIM/PSNR code are implemented but have not been exercised with an installed FFmpeg build; VMAF and 100% zoom comparison are not implemented. Custom mode remains unavailable. HDR jobs are intentionally stopped because HDR preservation cannot be guaranteed. Detailed CPU/RAM/GPU reporting and user-facing language selection are also incomplete.

MSI and NSIS bundles build successfully, but installer execution and actual encoding still require verification with properly licensed FFmpeg/FFprobe binaries and the test videos from the specification. A release also needs a Windows 11/QSV run on the target Intel hardware.

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
