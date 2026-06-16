#
# Copyright (C) 2026
#
# This is free software, licensed under the GNU General Public License v2.
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for Hysteria Realm Server
LUCI_DESCRIPTION:=Web UI to deploy and manage the Hysteria 2 Realms rendezvous server: \
service control, configuration, firewall automation, token & TLS certificate \
generation, and live logs.
LUCI_DEPENDS:=+hysteria-realm-server +rpcd +luci-base
LUCI_PKGARCH:=all

PKG_LICENSE:=MIT
PKG_MAINTAINER:=luci-app-hysteria-realm-server

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
