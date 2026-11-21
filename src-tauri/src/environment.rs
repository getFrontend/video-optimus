use crate::subprocess::hidden_console;
#[cfg(windows)]
use std::time::Duration;
#[cfg(windows)]
use tokio::{process::Command, time::timeout};

#[cfg(windows)]
const WINDOWS_ENVIRONMENT_QUERY: &str = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$ffmpeg = [Environment]::GetEnvironmentVariable('VIDEO_OPTIMUS_FFMPEG', 'User')
$ffprobe = [Environment]::GetEnvironmentVariable('VIDEO_OPTIMUS_FFPROBE', 'User')
$path = (@($machinePath, $userPath) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join ';'
$payload = @{
  path = [Environment]::ExpandEnvironmentVariables($path)
  ffmpeg = if ([string]::IsNullOrWhiteSpace($ffmpeg)) { $null } else { [Environment]::ExpandEnvironmentVariables($ffmpeg) }
  ffprobe = if ([string]::IsNullOrWhiteSpace($ffprobe)) { $null } else { [Environment]::ExpandEnvironmentVariables($ffprobe) }
}
[Console]::Out.Write((ConvertTo-Json -InputObject $payload -Compress))
"#;

pub async fn refresh_process_environment() {
    #[cfg(windows)]
    {
        let result = timeout(
            Duration::from_secs(3),
            hidden_console(Command::new("powershell.exe"))
                .args([
                    "-NoLogo",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    WINDOWS_ENVIRONMENT_QUERY,
                ])
                .kill_on_drop(true)
                .output(),
        )
        .await;
        let Ok(Ok(output)) = result else {
            return;
        };
        if !output.status.success() {
            return;
        }
        let Ok(environment) = serde_json::from_slice::<serde_json::Value>(&output.stdout) else {
            return;
        };
        if let Some(path) = environment["path"].as_str().filter(|path| !path.is_empty()) {
            std::env::set_var("PATH", path);
        }
        for (key, property) in [
            ("VIDEO_OPTIMUS_FFMPEG", "ffmpeg"),
            ("VIDEO_OPTIMUS_FFPROBE", "ffprobe"),
        ] {
            if let Some(path) = environment[property]
                .as_str()
                .filter(|path| !path.is_empty())
            {
                std::env::set_var(key, path);
            }
        }
    }
}
