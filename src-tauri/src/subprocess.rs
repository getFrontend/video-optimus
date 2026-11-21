use tokio::process::Command;

#[cfg(windows)]
pub fn hidden_console(mut command: Command) -> Command {
    use std::os::windows::process::CommandExt;

    command.as_std_mut().creation_flags(0x08000000);
    command
}

#[cfg(not(windows))]
pub fn hidden_console(command: Command) -> Command {
    command
}
