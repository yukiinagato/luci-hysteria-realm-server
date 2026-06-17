#
# Copyright (C) 2026
#
# This is free software, licensed under the GNU General Public License v2.
#
# OpenWrt package: hysteria-realm-server
# A rendezvous server for Hysteria 2 Realms (P2P UDP hole punching).
# The official project ships pure-Go static binaries (CGO disabled) for
# linux/amd64 and linux/arm64. Instead of cross-compiling Go on the build
# host, this package installs a thin runtime wrapper that downloads the
# matching prebuilt binary on first start (or via the LuCI panel).
#

include $(TOPDIR)/rules.mk

PKG_NAME:=hysteria-realm-server
PKG_VERSION:=1.0.3
PKG_RELEASE:=1

PKG_LICENSE:=MIT
PKG_MAINTAINER:=luci-app-hysteria-realm-server

include $(INCLUDE_DIR)/package.mk

define Package/hysteria-realm-server
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=Hysteria Realm rendezvous server
  URL:=https://github.com/apernet/hysteria-realm-server
  # ca-bundle: CA certs for the HTTPS binary download.
  # openssl-util: used by the LuCI panel to generate a self-signed TLS cert.
  # NOTE: do NOT depend on a specific libustream-ssl variant (mbedtls/openssl/
  # wolfssl) — they mutually conflict (all install /lib/libustream-ssl.so), so
  # pinning one breaks systems that already ship another. Any installed variant
  # works for HTTPS; uclient-fetch also falls back to wget/curl in the updater.
  DEPENDS:=+ca-bundle +openssl-util
  PKGARCH:=all
endef

define Package/hysteria-realm-server/description
  Hysteria Realm Server is the rendezvous server for the P2P (Realms)
  feature of Hysteria 2. It coordinates UDP hole punching so users can
  host Hysteria servers from behind NAT/firewalls without a public IP.

  This package ships an init script, UCI config and an updater that
  fetches the official prebuilt binary that matches the router CPU.
endef

define Package/hysteria-realm-server/conffiles
/etc/config/hysteria-realm-server
endef

# Nothing to compile: the Go binary is fetched at runtime.
define Build/Compile
endef

define Package/hysteria-realm-server/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/hysteria-realm-server.config $(1)/etc/config/hysteria-realm-server

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/hysteria-realm-server.init $(1)/etc/init.d/hysteria-realm-server

	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) ./files/hysteria-realm-server.update $(1)/usr/libexec/hysteria-realm-server-update
endef

$(eval $(call BuildPackage,hysteria-realm-server))
