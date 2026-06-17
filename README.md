# luci-app-hysteria-realm-server

[![Build OpenWrt binaries](https://github.com/yukiinagato/luci-hysteria-realm-server/actions/workflows/release.yml/badge.svg)](https://github.com/yukiinagato/luci-hysteria-realm-server/actions/workflows/release.yml)

[English](#english) | [中文](#中文)

OpenWrt 上的 LuCI 插件,用来在路由器上部署和管理
[Hysteria Realm Server](https://github.com/apernet/hysteria-realm-server) ——
Hysteria 2 的 P2P(Realms)会合服务器。界面支持中文和英文。

---

## 中文

### 简介

Hysteria Realm Server 是 Hysteria 2 的 P2P(Realms)功能用到的会合服务器,负责协调
UDP 打洞,让 Hysteria 业务服务器可以待在 NAT/防火墙后面,不需要公网 IP 或端口转发。
这个插件把它打包成 OpenWrt 软件包,并配了一个 LuCI 面板。

有一点要先讲清楚:会合服务器本身必须能从公网访问到。Hysteria 的服务端和客户端都要
直接连它,所以跑它的这台路由器需要公网 IP,或者把对应的 TCP 端口转发进来 / 配 DDNS。
它是整套里唯一不能藏在 NAT 后面的角色,CGNAT 环境用不了。能被它「解放」到 NAT 后面的
是 Hysteria 业务服务器,而不是会合点本身。

### 功能

面板分四个标签页:

- 概览:运行状态、PID、监听信息;启停/重启和开机自启开关;一键下载或更新核心;
  以及按本机地址自动填好的对接示例。
- 设置:监听地址和端口、token、realm 限额、可信代理头、名称正则、调试日志等,
  token 旁边有一键生成。
- TLS:填证书/私钥路径,或一键生成自签名 ECDSA 证书。
- 日志:读取服务输出,大约每 5 秒刷新。

另外,服务启动时会按 UCI 配置在 WAN 区域放行监听端口(停止时移除),界面也会跟随
LuCI 的语言在中英文之间切换。

### 安装

两个包都是架构无关的 `.ipk`,从 Releases 下载后直接安装,先装运行时再装面板:

```sh
opkg install ./hysteria-realm-server_*_all.ipk
opkg install ./luci-app-hysteria-realm-server_*_all.ipk
```

核心二进制没有打进 ipk。装好后到面板「概览」点「下载 / 更新核心」,会按 CPU 架构拉取
对应文件(服务首次启动时也会自动拉)。

### 使用

1. 安装后进入 服务 → Hysteria Realm Server。
2. 在概览页点「下载 / 更新核心」。
3. 在设置页生成 token,填监听端口,勾选启用,保存并应用。
4. 需要 TLS 就在 TLS 页生成自签名证书并启用。
5. 回到概览启动服务、打开自启,把对接示例复制到 Hysteria 2 的配置里。

### IPv6 与 MAP-E

默认监听地址是 `::`,即 IPv4 + IPv6 双栈,纯 IPv6 线路也能用;只想要 IPv4 就改成
`0.0.0.0`。地址会自动按 Go 的写法处理,IPv6 字面量会补上方括号。

概览会探测并列出 IPv4 / IPv6 两个接入地址,对接示例优先填 IPv6——它没有 NAT 和端口
限制,作为会合点最省事。两种地址都有时,建议用一个同时配了 A 和 AAAA 记录的域名当
`server`。

日本常见的 MAP-E / DS-Lite(v6プラス、OCN バーチャルコネクト、transix 等)属于
IPv4-over-IPv6:MAP-E 的入站 IPv4 只有运营商按 PSID 分到的一小段端口,DS-Lite 则没有
入站 IPv4。这类线路面板会自动识别并提示,走 IPv6 最简单。

如果是 MAP-E 且由 OpenWrt 的 `map` 协议接管,面板会直接读取它算好的端口集
(`/tmp/map-*.rules` 里的 `RULE_*_PORTSETS`)和共享 IPv4,列出你的端口范围,并检查当前
监听端口在不在范围内,不在就提示一个可用的。如果没读到,面板里还有一个按 RFC 7597
GMA 算法的计算器,填偏移 a、PSID 长度 k 和 PSID 就能算出来(默认 a=4、k=8,对应 JPIX
v6プラス)。要用 IPv4,把监听端口设到这些范围之内即可。

### 从源码编译(可选)

一般直接用 Releases 里的 ipk 就行。想自己编 LuCI 包,把两个目录放进 OpenWrt 源码树或
SDK 的 `package/` 下:

```sh
./scripts/feeds update -a && ./scripts/feeds install -a
make menuconfig    # LuCI -> Applications -> luci-app-hysteria-realm-server
make package/luci-app-hysteria-realm-server/compile V=s
```

也可以不用 SDK,用脚本直接打包(需要 bash、tar、gzip、python3):

```sh
tools/build-ipk.sh 1.1.0-1 ./out
```

`tools/po2lmo.py` 用纯 Python 把中文 `.po` 编成 LuCI 用的 `.lmo`,所以打包不依赖 OpenWrt
工具链。两个包都是 `Architecture: all`、依赖只按名字声明,一份就能用在所有 CPU 和现代
OpenWrt(21.02 及以上,即用 client-side JS 的 LuCI)。

### 持续集成与发布

`.github/workflows/release.yml` 会拉取上游
[apernet/hysteria-realm-server](https://github.com/apernet/hysteria-realm-server)
的 Go 源码(纯 Go,`CGO_ENABLED=0`),交叉编译下面这些架构,连同 `.sha256` 一起发布到
本仓库的 Release,同时用 `tools/build-ipk.sh` 打出两个 ipk。

| 资源名 (asset) | Go 目标 | 对应 OpenWrt `DISTRIB_ARCH` |
| --- | --- | --- |
| `…-amd64` | amd64 | `x86_64*` |
| `…-386` | 386 | `i386*` |
| `…-arm64` | arm64 | `aarch64*` |
| `…-armv7` | arm GOARM=7 | `arm_cortex-a*` / 带 neon、vfp |
| `…-armv5` | arm GOARM=5 | 其他 `arm_*`(兼容 v5/v6) |
| `…-mips_softfloat` | mips softfloat | `mips_*`(大端) |
| `…-mipsle_softfloat` | mipsle softfloat | `mipsel_*`(小端) |
| `…-mips64_softfloat` | mips64 softfloat | `mips64_*` |
| `…-mips64le_softfloat` | mips64le softfloat | `mips64el_*` |
| `…-riscv64` | riscv64 | `riscv64*` |

插件运行时按 `DISTRIB_ARCH` 选对应资源下载,并校验 SHA256。

插件的发布版本(git tag)和上游核心版本是分开的:上游版本固定在工作流的
`UPSTREAM_VERSION`,只有上游出新核心时才需要改;平时发插件新版本直接打 tag 即可。
触发方式是推一个 `v` 开头的 tag(如 `git tag v1.1.0 && git push origin v1.1.0`),或在
Actions 页手动运行并填版本。下载来源仓库由 UCI 的 `release_repo` 决定,默认是
`yukiinagato/luci-hysteria-realm-server`,也能在设置里改。

### 注意事项

- token 是唯一的鉴权凭证,用一个足够随机的值。
- 可信代理头只在确实有可信代理时才开,否则客户端可以伪造 IP 绕过限额。
- 直接暴露到公网建议开 TLS;自签名证书需要客户端设 `insecure: true`。
- 服务状态都在内存里,重启后 realm 需要重新注册(上游本来就是这样设计的)。

---

## English

### What it is

Hysteria Realm Server is the rendezvous server behind Hysteria 2's P2P (Realms)
feature. It coordinates UDP hole punching so the actual Hysteria servers can live
behind NAT or a firewall without a public IP or port forwarding. This plugin
packages it for OpenWrt and adds a LuCI panel.

One thing worth stating up front: the rendezvous server itself has to be
reachable from the internet. Both Hysteria servers and clients connect straight
to it, so the router running it needs a public IP, or the listen port forwarded
in / a DDNS name. It is the only piece that cannot hide behind NAT, and CGNAT
won't work. The part that gets to live behind NAT is the Hysteria application
server, not the rendezvous point.

### Features

The panel has four tabs:

- Overview: running state, PID and listen info; start/stop/restart and autostart
  toggles; download or update the core in one click; and a connection example
  pre-filled from the router's own address.
- Settings: listen address and port, token, realm limits, trusted proxy header,
  name pattern, debug logging, with a one-click token generator next to the token
  field.
- TLS: set cert/key paths, or generate a self-signed ECDSA certificate.
- Logs: the service output, refreshed about every 5 seconds.

The service also opens the listen port on the WAN zone when it starts (and
removes the rule when it stops), and the UI follows LuCI's language between
English and Chinese.

### Install

Both packages are architecture-independent `.ipk` files. Download them from
Releases and install the runtime first, then the panel:

```sh
opkg install ./hysteria-realm-server_*_all.ipk
opkg install ./luci-app-hysteria-realm-server_*_all.ipk
```

The core binary is not bundled. After installing, open the panel (Overview →
Download / Update core) to fetch the build matching your CPU; it is also fetched
automatically the first time the service starts.

### Usage

1. Go to Services → Hysteria Realm Server.
2. Click "Download / Update core" on the Overview tab.
3. On Settings, generate a token, set the listen port, tick Enabled, Save & Apply.
4. If you want TLS, generate a self-signed certificate on the TLS tab and enable it.
5. Back on Overview, start the service and enable autostart, then copy the
   connection example into your Hysteria 2 config.

### IPv6 and MAP-E

`listen_addr` defaults to `::`, i.e. dual-stack IPv4+IPv6, which also covers
IPv6-only lines; set `0.0.0.0` if you only want IPv4. The address is formatted
to Go's syntax automatically (IPv6 literals get bracketed).

The Overview detects and lists both IPv4 and IPv6 endpoints and fills the example
with IPv6 first, since it has no NAT or port limits and is the simplest choice for
a rendezvous point. If you have both, a domain with A and AAAA records makes a
good `server` value.

MAP-E and DS-Lite (common in Japan — v6 plus, OCN Virtual Connect, transix, …)
are IPv4-over-IPv6: with MAP-E only a small ISP-assigned port set (per PSID) is
reachable over IPv4, and DS-Lite has no inbound IPv4 at all. The panel detects
these and points you to IPv6, which is the easy path.

When MAP-E is handled by OpenWrt's `map` proto, the panel reads the port set it
already computed (`RULE_*_PORTSETS` in `/tmp/map-*.rules`) and the shared IPv4,
shows your assigned ranges, and checks whether the current listen port falls in
them (suggesting a valid one if not). If that file isn't there, the panel also
has an RFC 7597 GMA calculator: enter offset a, PSID length k and the PSID
(defaults a=4, k=8 match JPIX v6plus). To use IPv4, set the listen port inside
one of those ranges.

### Building from source (optional)

The Releases ipk is usually all you need. To build the LuCI package yourself,
drop both directories under `package/` in an OpenWrt source tree or SDK:

```sh
./scripts/feeds update -a && ./scripts/feeds install -a
make menuconfig    # LuCI -> Applications -> luci-app-hysteria-realm-server
make package/luci-app-hysteria-realm-server/compile V=s
```

You can also skip the SDK and build the ipk with the script (needs bash, tar,
gzip, python3):

```sh
tools/build-ipk.sh 1.1.0-1 ./out
```

`tools/po2lmo.py` compiles the Chinese `.po` into LuCI's `.lmo` in pure Python,
so packaging needs no OpenWrt toolchain. Both packages are `Architecture: all`
and depend by name only, so one set works on every CPU and every modern OpenWrt
(21.02+, i.e. client-side JS LuCI).

### CI and releases

`.github/workflows/release.yml` checks out the upstream
[apernet/hysteria-realm-server](https://github.com/apernet/hysteria-realm-server)
Go source (pure Go, `CGO_ENABLED=0`), cross-compiles the architectures below,
publishes them with a `.sha256` each to this repo's Release, and builds the two
ipk files with `tools/build-ipk.sh`.

| asset | Go target | OpenWrt `DISTRIB_ARCH` |
| --- | --- | --- |
| `…-amd64` | amd64 | `x86_64*` |
| `…-386` | 386 | `i386*` |
| `…-arm64` | arm64 | `aarch64*` |
| `…-armv7` | arm GOARM=7 | `arm_cortex-a*` / neon, vfp |
| `…-armv5` | arm GOARM=5 | other `arm_*` (runs on v5/v6) |
| `…-mips_softfloat` | mips softfloat | `mips_*` (big-endian) |
| `…-mipsle_softfloat` | mipsle softfloat | `mipsel_*` (little-endian) |
| `…-mips64_softfloat` | mips64 softfloat | `mips64_*` |
| `…-mips64le_softfloat` | mips64le softfloat | `mips64el_*` |
| `…-riscv64` | riscv64 | `riscv64*` |

At runtime the plugin picks the asset by `DISTRIB_ARCH` and verifies the SHA256.

The plugin's release version (the git tag) is separate from the upstream core
version: the upstream version is pinned in the workflow as `UPSTREAM_VERSION` and
only changes when upstream ships a new core, while plugin releases are just new
tags. Trigger a build by pushing a `v*` tag (`git tag v1.1.0 && git push origin
v1.1.0`) or run the workflow manually from the Actions tab. The download source
repo is the UCI option `release_repo` (default
`yukiinagato/luci-hysteria-realm-server`), changeable in Settings.

### Notes

- The token is the only credential — use a strong random value.
- Enable the trusted proxy header only when there really is a trusted proxy in
  front, otherwise clients can spoof their IP and bypass the per-IP limit.
- Prefer TLS for direct public exposure; self-signed certs need `insecure: true`
  on the client.
- All state is in memory, so realms re-register after a restart. That's how
  upstream is designed.

### Credits

Core server: [apernet/hysteria-realm-server](https://github.com/apernet/hysteria-realm-server) (MIT).
