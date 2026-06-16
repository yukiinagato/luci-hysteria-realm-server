# luci-app-hysteria-realm-server

[English](#english) | [中文](#中文)

An OpenWrt plugin that deploys and manages the
[Hysteria Realm Server](https://github.com/apernet/hysteria-realm-server) —
the rendezvous server for the **P2P (Realms)** feature of Hysteria 2 — with a
full LuCI control panel. Bilingual (English / 简体中文).

---

## 中文

### 这是什么

Hysteria Realm Server 是 Hysteria 2 的 P2P(Realms)功能所需的「会合服务器」。
它通过协调 UDP 打洞,让你无需公网 IP、无需端口转发,就能在 NAT/防火墙后方部署
Hysteria 服务器。本插件把它打包成 OpenWrt 软件包,并提供 LuCI 图形面板。

### 功能

- **服务管理**:启动 / 停止 / 重启、开机自启的启用/禁用,基于 procd 守护与自动重启。
- **完整配置**:监听地址与端口、token、TLS、realm 数量限额、可信代理头、名称正则、调试日志。
- **自动下载核心**:面板一键按 CPU 架构(`DISTRIB_ARCH`)从本仓库 GitHub Releases
  下载匹配的二进制,并校验 SHA256。二进制由本仓库的 GitHub Actions CI 交叉编译,
  覆盖所有常见 OpenWrt 架构(见下「持续集成」)。
- **一键生成 Token**:在面板内生成强随机 token,并给出服务端/客户端对接示例。
- **TLS 证书管理**:填写证书/私钥路径,或一键生成自签名 ECDSA 证书。
- **自动防火墙**:启动时自动在 WAN 区域为监听端口添加 input ACCEPT 规则,停止时移除。
- **实时状态与日志**:运行状态、PID、监听信息,以及每 5 秒刷新的服务日志。
- **中英文**:界面随 LuCI 语言自动切换。

### 软件包结构

```
luci-hysteria-realm-server/
├── hysteria-realm-server/                 # 运行时软件包(二进制 + 服务)
│   ├── Makefile
│   └── files/
│       ├── hysteria-realm-server.config   # /etc/config/hysteria-realm-server (UCI)
│       ├── hysteria-realm-server.init     # procd 启动脚本(含防火墙自动配置)
│       └── hysteria-realm-server.update   # 架构检测 + 下载/更新脚本
└── luci-app-hysteria-realm-server/        # LuCI 前端(现代 JS / client-side)
    ├── Makefile
    ├── htdocs/luci-static/resources/view/hysteria-realm-server/
    │   ├── overview.js                     # 概览:状态、服务控制、下载核心、对接示例
    │   ├── config.js                       # 设置:全部配置 + 一键生成 token
    │   ├── tls.js                          # TLS:路径配置 + 生成自签名证书
    │   └── logs.js                         # 日志:实时查看
    ├── root/
    │   ├── usr/libexec/rpcd/luci.hysteria-realm-server   # 后端(ubus 方法)
    │   ├── usr/share/luci/menu.d/...json                 # 菜单
    │   └── usr/share/rpcd/acl.d/...json                  # 权限
    └── po/                                  # 翻译(模板 + zh_Hans)
```

### 编译

把两个目录放进 OpenWrt 源码树或 SDK 的 `package/` 下(例如
`package/network/hysteria-realm-server` 与 `package/luci/luci-app-hysteria-realm-server`),
然后:

```sh
./scripts/feeds update -a && ./scripts/feeds install -a   # 确保 luci 等依赖可用
make menuconfig
#   LuCI -> Applications -> luci-app-hysteria-realm-server  [*]
make package/luci-app-hysteria-realm-server/compile V=s
```

生成的 `.ipk`(`hysteria-realm-server_*.ipk` 与 `luci-app-hysteria-realm-server_*.ipk`)
用 `opkg install` 安装即可。LuCI 前端不需要交叉编译,二进制在路由器首次启动或
面板「下载/更新核心」时按需获取。

### 持续集成(CI)与发布

仓库内置 `.github/workflows/release.yml`,会拉取上游
[apernet/hysteria-realm-server](https://github.com/apernet/hysteria-realm-server)
的 Go 源码(纯 Go、`CGO_ENABLED=0`),交叉编译以下 OpenWrt 常见架构并发布到本仓库的
Release(每个文件附带 `.sha256` 校验):

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

CI 同时会用 **OpenWrt 官方 SDK** 把插件本身编译成可直接 `opkg install` 的 `.ipk`
(两个包都是架构无关 `all`,因此每个 OpenWrt 分支只构建一次即可用于所有 CPU):

- `luci-app-hysteria-realm-server_*_all_openwrt-23.05.ipk` / `…_openwrt-24.10.ipk`
- `hysteria-realm-server_*_all_openwrt-23.05.ipk` / `…_openwrt-24.10.ipk`

安装(把 luci-app 的依赖一并装上):

```sh
opkg install ./hysteria-realm-server_*_all_openwrt-23.05.ipk
opkg install ./luci-app-hysteria-realm-server_*_all_openwrt-23.05.ipk
```

> 更老的固件(21.02/22.03)请用对应 SDK 自行编译;新版 LuCI(23.05/24.10)直接用上面的 ipk。

**触发方式:**

- **推送 tag**:`git tag v1.0.1 && git push origin v1.0.1` → 自动构建上游 `v1.0.1`
  的二进制 + 插件 ipk,并以 `v1.0.1` 发布。插件默认 `version=1.0.1`,即可自动匹配下载。
- **手动**:在 GitHub 的 Actions 页面运行工作流,填上游版本与发布标签(可用于打
  自定义后缀,如把上游 1.0.1 发布成 `v1.0.1-1`)。

插件从哪个仓库下载由 UCI 的 `release_repo` 决定(默认
`yukiinagato/luci-hysteria-realm-server`),也可在「设置 → 高级」修改。

> 升级上游版本:改插件「设置」里的 `Core version`,并确保该版本已在 Release 中构建好;
> 或推一个新 tag 让 CI 构建。

### 使用

1. 安装后进入 **服务 → Hysteria Realm Server**。
2. 在 **概览** 点击「下载 / 更新核心」获取二进制。
3. 在 **设置** 点击 token 旁的「生成」,填好监听端口,勾选「启用」,保存并应用。
4. (可选)在 **TLS** 一键生成自签名证书并启用。
5. 回到 **概览** 启动服务、启用自启;复制「对接配置示例」到 Hysteria 2 配置中。

### 安全提示

- token 是唯一鉴权凭证,请使用足够强度的随机值并妥善保管。
- 「可信代理头」仅在确实位于可信代理后方时开启,否则客户端可伪造 IP 绕过限额。
- 直接暴露到公网时建议启用 TLS;自签名证书需客户端关闭校验(`insecure: true`)。
- 服务所有状态都在内存中,重启后 realm 需重新注册(这是上游设计)。

---

## English

### What it is

Hysteria Realm Server is the rendezvous server for the **P2P (Realms)** feature
of Hysteria 2. It coordinates UDP hole punching so you can host Hysteria servers
behind NAT/firewalls — no public IP, no port forwarding. This plugin packages it
for OpenWrt with a full LuCI panel.

### Features

- **Service control** — start / stop / restart, enable/disable boot autostart,
  procd-supervised with auto-respawn.
- **Full configuration** — listen address/port, token, TLS, realm limits,
  trusted proxy header, name pattern, debug logging.
- **Auto-download core** — one click fetches the official prebuilt binary
  matching the router CPU from GitHub Releases (`x86_64`/amd64 and
  `aarch64`/arm64; other CPUs can set a custom URL).
- **One-click token** — generate a strong random token and copy the ready-made
  server/client config snippets.
- **TLS management** — set cert/key paths or generate a self-signed ECDSA cert.
- **Automatic firewall** — adds a WAN input ACCEPT rule for the listen port on
  start, removes it on stop.
- **Live status & logs** — running state, PID, listen info, log refreshed every 5s.
- **Bilingual** — follows the LuCI UI language (English / Simplified Chinese).

### Build

Drop both directories into an OpenWrt source tree or SDK under `package/`, then:

```sh
./scripts/feeds update -a && ./scripts/feeds install -a
make menuconfig          # LuCI -> Applications -> luci-app-hysteria-realm-server
make package/luci-app-hysteria-realm-server/compile V=s
```

Install the resulting `.ipk`s with `opkg`. The LuCI front-end needs no
cross-compilation; the Go binary is fetched on first start or via the panel.

### CI & releases

`.github/workflows/release.yml` checks out the upstream Go source
(`CGO_ENABLED=0`), cross-compiles it for all common OpenWrt architectures
(amd64, 386, arm64, armv7, armv5, mips/mipsle/mips64/mips64le softfloat,
riscv64) and publishes them — each with a `.sha256` sidecar — to this repo's
GitHub Release. The plugin maps the router `DISTRIB_ARCH` to the matching asset
and verifies the checksum.

The same workflow also builds the plugin itself into installable `.ipk` files
via the official OpenWrt SDK (both packages are arch-independent `all`, so one
build per OpenWrt branch covers every CPU), for OpenWrt 23.05 and 24.10:

```sh
opkg install ./hysteria-realm-server_*_all_openwrt-23.05.ipk
opkg install ./luci-app-hysteria-realm-server_*_all_openwrt-23.05.ipk
```

Trigger by pushing a tag (`git push origin v1.0.1`) or running the workflow
manually from the Actions tab. The download source repo is the UCI option
`release_repo` (default `yukiinagato/luci-hysteria-realm-server`). For a CPU
not in the matrix, set a **Custom download URL** in Settings; for firmware
older than 23.05, build the ipk from the matching SDK yourself.

### Security notes

- The token is the only credential — use a strong random value.
- Enable the trusted-proxy header only when actually behind a trusted proxy.
- Prefer TLS for direct public exposure; self-signed certs need clients to set
  `insecure: true`.
- All state is in-memory; realms re-register after a restart (upstream design).

### Credits

Core server: [apernet/hysteria-realm-server](https://github.com/apernet/hysteria-realm-server) (MIT).
