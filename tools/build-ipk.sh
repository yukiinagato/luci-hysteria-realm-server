#!/usr/bin/env bash
# Build the two OpenWrt .ipk packages WITHOUT the OpenWrt SDK.
# Both packages are architecture-independent (Architecture: all) and depend on
# their requirements by name only, so a single build works on every CPU and on
# every modern OpenWrt release (23.05 / 24.10 / snapshot, …).
#
# Usage: tools/build-ipk.sh <version> <output-dir>
#   e.g. tools/build-ipk.sh 1.0.1-1 ./out
#
# Requires: bash, tar (GNU), gzip, python3.

set -euo pipefail

VERSION="${1:?version required, e.g. 1.0.1-1}"
OUT="${2:?output dir required}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mkdir -p "$OUT" && cd "$OUT" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

TAR() { tar --numeric-owner --owner=0 --group=0 --mtime=@0 -czf "$@"; }

# Assemble one .ipk from a prepared data tree + control fields.
# $1 = staging dir containing ./data and ./control
make_ipk() {
	local stage="$1" name="$2"
	local isize
	isize="$(du -sb "$stage/data" | cut -f1)"
	# Installed-Size goes into control (created by caller); append size now.
	echo "Installed-Size: $isize" >> "$stage/control/control"

	( cd "$stage/data" && TAR "$stage/data.tar.gz" ./ )
	( cd "$stage/control" && TAR "$stage/control.tar.gz" ./ )
	echo "2.0" > "$stage/debian-binary"

	# OpenWrt .ipk = a gzip-compressed tar of the three members (NOT a Debian
	# ar archive). opkg expects this outer format; member order matters.
	rm -f "$OUT/$name"
	( cd "$stage" && TAR "$OUT/$name" ./debian-binary ./control.tar.gz ./data.tar.gz )
	echo "built $OUT/$name (installed-size ${isize}B)"
}

# ---------------------------------------------------------------------------
# Package 1: hysteria-realm-server (runtime: init + uci + updater)
# ---------------------------------------------------------------------------
P1="$WORK/p1"
mkdir -p "$P1/control" "$P1/data/etc/config" "$P1/data/etc/init.d" "$P1/data/usr/libexec"

install -m0644 "$ROOT/hysteria-realm-server/files/hysteria-realm-server.config" \
	"$P1/data/etc/config/hysteria-realm-server"
install -m0755 "$ROOT/hysteria-realm-server/files/hysteria-realm-server.init" \
	"$P1/data/etc/init.d/hysteria-realm-server"
install -m0755 "$ROOT/hysteria-realm-server/files/hysteria-realm-server.update" \
	"$P1/data/usr/libexec/hysteria-realm-server-update"

cat > "$P1/control/control" <<EOF
Package: hysteria-realm-server
Version: $VERSION
Depends: ca-bundle, openssl-util
Source: hysteria-realm-server
Section: net
Architecture: all
Maintainer: yukiinagato
Description: Hysteria 2 Realms rendezvous server (runtime). Fetches the official
 prebuilt core binary matching the router CPU and runs it under procd.
EOF

echo "/etc/config/hysteria-realm-server" > "$P1/control/conffiles"

cat > "$P1/control/postinst" <<'EOF'
#!/bin/sh
[ -n "$IPKG_INSTROOT" ] || /etc/init.d/hysteria-realm-server enable 2>/dev/null
exit 0
EOF
cat > "$P1/control/prerm" <<'EOF'
#!/bin/sh
[ -n "$IPKG_INSTROOT" ] || {
	/etc/init.d/hysteria-realm-server stop 2>/dev/null
	/etc/init.d/hysteria-realm-server disable 2>/dev/null
}
exit 0
EOF
chmod 0755 "$P1/control/postinst" "$P1/control/prerm"

make_ipk "$P1" "hysteria-realm-server_${VERSION}_all.ipk"

# ---------------------------------------------------------------------------
# Package 2: luci-app-hysteria-realm-server (LuCI UI + rpcd + zh-cn translation)
# ---------------------------------------------------------------------------
P2="$WORK/p2"
APP="$ROOT/luci-app-hysteria-realm-server"
mkdir -p "$P2/control" \
	"$P2/data/www/luci-static/resources/view/hysteria-realm-server" \
	"$P2/data/usr/share/luci/menu.d" \
	"$P2/data/usr/share/rpcd/acl.d" \
	"$P2/data/usr/libexec/rpcd" \
	"$P2/data/usr/lib/lua/luci/i18n"

install -m0644 "$APP"/htdocs/luci-static/resources/view/hysteria-realm-server/*.js \
	"$P2/data/www/luci-static/resources/view/hysteria-realm-server/"
install -m0644 "$APP"/root/usr/share/luci/menu.d/*.json \
	"$P2/data/usr/share/luci/menu.d/"
install -m0644 "$APP"/root/usr/share/rpcd/acl.d/*.json \
	"$P2/data/usr/share/rpcd/acl.d/"
install -m0755 "$APP"/root/usr/libexec/rpcd/luci.hysteria-realm-server \
	"$P2/data/usr/libexec/rpcd/luci.hysteria-realm-server"

# Compile the Chinese catalog: <basename>.zh-cn.lmo (zh_Hans alias = zh-cn).
python3 "$ROOT/tools/po2lmo.py" "$APP/po/zh_Hans/hysteria-realm-server.po" \
	"$P2/data/usr/lib/lua/luci/i18n/hysteria-realm-server.zh-cn.lmo"

cat > "$P2/control/control" <<EOF
Package: luci-app-hysteria-realm-server
Version: $VERSION
Depends: luci-base, rpcd, hysteria-realm-server
Source: luci-app-hysteria-realm-server
Section: luci
Architecture: all
Maintainer: yukiinagato
Description: LuCI web UI for the Hysteria 2 Realms rendezvous server: service
 control, configuration, firewall automation, token & TLS cert generation and
 live logs. Bundled Simplified Chinese translation.
EOF

cat > "$P2/control/postinst" <<'EOF'
#!/bin/sh
[ -n "$IPKG_INSTROOT" ] || {
	rm -f /tmp/luci-indexcache* 2>/dev/null
	rm -rf /tmp/luci-modulecache/ 2>/dev/null
	/etc/init.d/rpcd reload 2>/dev/null
}
exit 0
EOF
chmod 0755 "$P2/control/postinst"

make_ipk "$P2" "luci-app-hysteria-realm-server_${VERSION}_all.ipk"

echo "Done. Artifacts in: $OUT"
ls -l "$OUT"
