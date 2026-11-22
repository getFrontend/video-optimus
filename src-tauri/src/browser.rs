use crate::subprocess::hidden_console;
use std::process::Stdio;

/// Opens `url` in the user's default browser.
///
/// Windows ShellExecute (and therefore `explorer.exe <url>`) hands links to
/// Store apps registered as website handlers ("Apps for websites"), e.g. the
/// LinkedIn app hijacks `linkedin.com` URLs. To guarantee a browser tab, the
/// default browser executable is resolved from the registry and launched
/// directly, with the shell association kept only as a fallback.
pub async fn open_in_default_browser(url: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        if let Ok(()) = default_browser_process(url).await {
            return Ok(());
        }
    }

    shell_open(url).await
}

/// ShellExecute-based fallback that follows the OS URL association.
async fn shell_open(url: &str) -> Result<(), String> {
    let program = if cfg!(target_os = "windows") {
        "explorer.exe"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };

    hidden_console(tokio::process::Command::new(program))
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Не вдалося відкрити браузер: {error}"))
}

#[cfg(windows)]
const HTTPS_CHOICE: &str =
    r"HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice";
#[cfg(windows)]
const HTTP_CHOICE: &str =
    r"HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice";

#[cfg(windows)]
async fn default_browser_process(url: &str) -> Result<(), String> {
    let mut prog_id = registry_value(HTTPS_CHOICE, Some("ProgId")).await;
    if prog_id.is_none() {
        prog_id = registry_value(HTTP_CHOICE, Some("ProgId")).await;
    }
    let prog_id = prog_id.ok_or("Не вдалося визначити браузер за замовчуванням.")?;

    let command_line = registry_value(&format!(r"HKCR\{prog_id}\shell\open\command"), None)
        .await
        .ok_or("Не вдалося визначити команду браузера за замовчуванням.")?;

    let (executable, arguments) = parse_browser_command(&command_line, url)
        .ok_or("Не вдалося розібрати команду браузера.")?;

    hidden_console(tokio::process::Command::new(executable))
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Не вдалося відкрити браузер: {error}"))
}

/// Reads a single string value from the registry through `reg.exe` to avoid an
/// extra dependency. Returns `None` when the key or value is missing.
#[cfg(windows)]
async fn registry_value(key: &str, name: Option<&str>) -> Option<String> {
    let mut command = tokio::process::Command::new("reg.exe");
    command.arg("query").arg(key);
    match name {
        Some(name) => command.arg("/v").arg(name),
        None => command.arg("/ve"),
    };

    let output = hidden_console(command).output().await.ok()?;
    if !output.status.success() {
        return None;
    }

    parse_registry_value(&String::from_utf8_lossy(&output.stdout))
}

/// Extracts the data portion of the first `REG_SZ` line printed by `reg query`.
#[cfg(windows)]
fn parse_registry_value(output: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let (_, data) = line.split_once("REG_SZ")?;
        let data = data.trim();
        (!data.is_empty()).then(|| data.to_string())
    })
}

/// Splits a shell `open` command into an executable and arguments, replacing the
/// `%1` placeholder with `url`.
#[cfg(windows)]
fn parse_browser_command(command_line: &str, url: &str) -> Option<(String, Vec<String>)> {
    let command_line = command_line.trim();
    let (executable, rest) = if let Some(quoted) = command_line.strip_prefix('"') {
        let end = quoted.find('"')?;
        (&quoted[..end], &quoted[end + 1..])
    } else {
        let end = command_line.find(' ').unwrap_or(command_line.len());
        (&command_line[..end], &command_line[end..])
    };

    let mut substituted = false;
    let mut arguments = rest
        .split_whitespace()
        .map(|token| {
            let token = if token.contains("%1") {
                substituted = true;
                token.replace("%1", url)
            } else {
                token.to_string()
            };
            token.trim_matches('"').to_string()
        })
        .collect::<Vec<_>>();

    if !substituted {
        arguments.push(url.to_string());
    }

    Some((executable.to_string(), arguments))
}
