#!/usr/bin/env bash
# Installs TUKE Helper for the current user.
set -euo pipefail

UUID="tuke-helper@kobi3455.github.io"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

info() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f "$SRC/metadata.json" ]] || die "Run this script from a checkout of the repository."
command -v gnome-shell >/dev/null || die "GNOME Shell is not installed."
command -v glib-compile-schemas >/dev/null || die "glib-compile-schemas is missing; install your distribution's GLib tools package."

# When the destination is this checkout itself (e.g. a symlink used for
# development) there is nothing to copy.
if [[ "$(readlink -f "$DEST")" != "$(readlink -f "$SRC")" ]]; then
    info "Installing the extension to $DEST"
    rm -rf "$DEST"
    mkdir -p "$DEST"
    cp -r "$SRC"/{extension.js,schedule.js,prefs.js,metadata.json,stylesheet.css,libs,schemas,LICENSE} "$DEST"/
else
    info "Extension folder already points at this checkout"
fi

glib-compile-schemas "$DEST/schemas"

# The running shell does not know a new extension until the next login, so
# `gnome-extensions enable` would fail here; add it to the enabled list instead.
enabled="$(gsettings get org.gnome.shell enabled-extensions)"
if [[ "$enabled" != *"'$UUID'"* ]]; then
    info "Enabling the extension"
    if [[ "$enabled" == *"[]" ]]; then
        enabled="['$UUID']"
    else
        enabled="${enabled%]}, '$UUID']"
    fi
    gsettings set org.gnome.shell enabled-extensions "$enabled"
fi

echo
info "Done. Log out and back in for the panel to appear next to Quick Settings."
