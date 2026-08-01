#!/bin/sh
set -eu

host_name='com.chrome_extension.web_reader_codex'
platform="$(uname -s)"

if [ "$platform" = 'Darwin' ]; then
  install_root="$HOME/Library/Application Support/WebReaderCodexHost"
  manifest_dirs="
$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts
$HOME/Library/Application Support/Chromium/NativeMessagingHosts
$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts
$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
elif [ "$platform" = 'Linux' ]; then
  install_root="${XDG_DATA_HOME:-$HOME/.local/share}/web-reader-codex-host"
  config_root="${XDG_CONFIG_HOME:-$HOME/.config}"
  manifest_dirs="
$config_root/google-chrome/NativeMessagingHosts
$config_root/chromium/NativeMessagingHosts
$config_root/microsoft-edge/NativeMessagingHosts
$config_root/BraveSoftware/Brave-Browser/NativeMessagingHosts"
else
  echo 'Windows 请运行 uninstall-host.ps1。' >&2
  exit 1
fi

printf '%s\n' "$manifest_dirs" | while IFS= read -r directory; do
  [ -n "$directory" ] || continue
  manifest="$directory/$host_name.json"
  if [ -f "$manifest" ]; then rm -f -- "$manifest"; fi
done

case "$install_root" in
  "$HOME/Library/Application Support/WebReaderCodexHost"|"${XDG_DATA_HOME:-$HOME/.local/share}/web-reader-codex-host")
    if [ -d "$install_root" ]; then rm -rf -- "$install_root"; fi
    ;;
  *) echo "拒绝删除非预期目录: $install_root" >&2; exit 1 ;;
esac

echo 'Web Reader Native Host 已卸载。'
