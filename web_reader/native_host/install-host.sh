#!/bin/sh
set -eu

host_name='com.chrome_extension.web_reader_codex'
extension_id="${1:-}"
browser="${2:-chrome}"

if ! printf '%s' "$extension_id" | grep -Eq '^[a-p]{32}$'; then
  echo "用法: $0 <扩展ID> [chrome|chromium|edge|brave|all]" >&2
  exit 1
fi

case "$browser" in
  chrome|chromium|edge|brave|all) ;;
  *) echo "不支持的浏览器: $browser" >&2; exit 1 ;;
esac

node_path="$(command -v node || true)"
codex_path="$(command -v codex || true)"
if [ -z "$node_path" ]; then
  echo '找不到 node，请先安装 Node.js 18 或更高版本。' >&2
  exit 1
fi
if [ -z "$codex_path" ]; then
  echo '找不到 codex，请先安装 Codex CLI 并确认 codex --version 正常。' >&2
  exit 1
fi

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
source_path="$script_dir/native-host.js"
if [ ! -f "$source_path" ]; then
  echo "找不到 Native Host: $source_path" >&2
  exit 1
fi

platform="$(uname -s)"
case "$platform" in
  Darwin) install_root="$HOME/Library/Application Support/WebReaderCodexHost" ;;
  Linux) install_root="${XDG_DATA_HOME:-$HOME/.local/share}/web-reader-codex-host" ;;
  *) echo "当前脚本不支持 $platform；Windows 请运行 install-host.ps1。" >&2; exit 1 ;;
esac

mkdir -p "$install_root"
cp "$source_path" "$install_root/native-host.js"
chmod 700 "$install_root/native-host.js"

config_path="$install_root/host-config.json"
launcher_path="$install_root/web-reader-codex-host"
"$node_path" -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({codexPath:process.argv[2]},null,2),{mode:0o600})' "$config_path" "$codex_path"

escaped_node="$(printf '%s' "$node_path" | sed 's/[\\"$`]/\\&/g')"
escaped_host="$(printf '%s' "$install_root/native-host.js" | sed 's/[\\"$`]/\\&/g')"
printf '#!/bin/sh\nexec "%s" "%s"\n' "$escaped_node" "$escaped_host" > "$launcher_path"
chmod 700 "$launcher_path"

install_manifest() {
  manifest_dir="$1"
  mkdir -p "$manifest_dir"
  manifest_path="$manifest_dir/$host_name.json"
  "$node_path" -e 'const fs=require("fs");const manifest={name:process.argv[2],description:"Web Reader local Codex Native Messaging host",path:process.argv[3],type:"stdio",allowed_origins:[`chrome-extension://${process.argv[4]}/`]};fs.writeFileSync(process.argv[1],JSON.stringify(manifest,null,2),{mode:0o600})' "$manifest_path" "$host_name" "$launcher_path" "$extension_id"
  echo "已注册: $manifest_path"
}

install_for_browser() {
  target="$1"
  if [ "$platform" = 'Darwin' ]; then
    case "$target" in
      chrome) install_manifest "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" ;;
      chromium) install_manifest "$HOME/Library/Application Support/Chromium/NativeMessagingHosts" ;;
      edge) install_manifest "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts" ;;
      brave) install_manifest "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts" ;;
    esac
  else
    case "$target" in
      chrome) install_manifest "${XDG_CONFIG_HOME:-$HOME/.config}/google-chrome/NativeMessagingHosts" ;;
      chromium) install_manifest "${XDG_CONFIG_HOME:-$HOME/.config}/chromium/NativeMessagingHosts" ;;
      edge) install_manifest "${XDG_CONFIG_HOME:-$HOME/.config}/microsoft-edge/NativeMessagingHosts" ;;
      brave) install_manifest "${XDG_CONFIG_HOME:-$HOME/.config}/BraveSoftware/Brave-Browser/NativeMessagingHosts" ;;
    esac
  fi
}

if [ "$browser" = 'all' ]; then
  for target in chrome chromium edge brave; do install_for_browser "$target"; done
else
  install_for_browser "$browser"
fi

echo "Codex: $("$codex_path" --version)"
echo 'Web Reader Native Host 安装成功。请重新加载浏览器扩展并测试本地 Codex（Native）。'
