<div align="center">

<img src="../../assets/logo-mark.svg" width="120" alt="SteamEdge">

# SteamEdge

**不必开启 Steam 客户端，也能收集集换式卡牌、累积游玩时数并管理成就。**

[![授权：AGPL v3](https://img.shields.io/badge/%E6%8E%88%E6%9D%83-AGPL_v3-A78BFA?style=for-the-badge&logo=gnu&logoColor=white)](../../LICENSE)
[![版本](https://img.shields.io/github/v/release/Miabeyefendi/SteamEdge?style=for-the-badge&color=F59E0B&label=%E7%89%88%E6%9C%AC)](https://github.com/Miabeyefendi/SteamEdge/releases/latest)
[![平台](https://img.shields.io/badge/Windows-1E293B?style=for-the-badge&logo=windows&logoColor=white)](#-安装)
[![状态](https://img.shields.io/badge/%E7%8A%B6%E6%80%81-%E7%BB%B4%E6%8A%A4%E4%B8%AD-22C55E?style=for-the-badge)](#)
[![作者](https://img.shields.io/badge/%E4%BD%9C%E8%80%85-Miabeyefendi-0EA5E9?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Miabeyefendi)

[English](../../README.md) · [Türkçe](./README_TR.md) · [Español](./README_ES.md) · **简体中文** · [Русский](./README_RU.md)

[安装](#-安装) · [功能](./FEATURES_ZH.md) · [使用](#-快速开始) · [教程](./TUTORIAL_ZH.md) · [更新记录](../../CHANGELOG.md)

<a href="https://github.com/Miabeyefendi/SteamEdge/releases/latest">
  <img src="../../assets/btn-download.svg" height="52" alt="下载最新版本">
</a>
<a href="./TUTORIAL_ZH.md">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../assets/btn-tutorial-dark.svg">
    <img src="../../assets/btn-tutorial.svg" height="52" alt="阅读教程">
  </picture>
</a>

<img src="../../design/screenshots/Overview.png" width="92%" alt="SteamEdge 在不使用 Steam 客户端的情况下收集卡牌、提升时数并管理成就">

</div>

---

<div align="center">

<img src="../../assets/security-banner.svg" width="100%" alt="安全：请先阅读">

</div>

## 🔐 安全与你的 Steam 登录

> [!WARNING]
> **SteamEdge 可以代你操作 Steam 账号：集卡、挂时长、解锁成就、在市场上架物品。下面如实说明它如何处理你的登录、把登录信息存在哪里、会向网络发送什么，方便你判断自己是否放心使用。**

**简而言之：**密码从不写入磁盘，应用只与 Steam、其图片服务器和 GitHub 的公开版本列表通信，没有遥测、没有分析，也没有我的服务器。它保存什么、存在哪里，以及如何自行验证，见[隐私与安全](./PRIVACY_ZH.md)。

---

## ✨ 功能重点

- **卡牌收集** - 让游戏显示为「游玩中」以掉落集换式卡牌。
- **时数提升** - 同时最多开启 32 款游戏，并可选择时数同步，把选定的游戏拉到相同的总时数。
- **成就管理** - 直接从 Steam 协议读取真实的锁定与解锁状态，然后批量解锁或重新锁定。
- **拟真模式** - 保持单一游戏开启，并将成就由最常见到最稀有依次分散在整个时段解锁，让个人资料看起来像真的玩过。
- **库存与市集** - 真实成交记录、挂单簿、批量平均价与出售，全部以你的钱包货币显示。
- **产品序号** - 粘贴一串序号，它们会在后台逐个兑换。
- **多账号** - 多个账号同时连接，各自在后台运行，切换时不会丢失进度。
- **不需要 Steam 客户端** - 直接使用 Steam 自己的网络协议。
- **免安装** - 解压缩即可运行。

**[查看全部功能 →](./FEATURES_ZH.md)**

---

## 📸 截图

<div align="center">

| | |
|:-:|:-:|
| <img src="../../design/screenshots/CardFarming.png" alt="卡牌收集"><br><sub>卡牌收集</sub> | <img src="../../design/screenshots/HourBoostr.png" alt="时长提升"><br><sub>时长提升</sub> |
| <img src="../../design/screenshots/Achievements.png" alt="成就"><br><sub>成就</sub> | <img src="../../design/screenshots/RealisticMode.png" alt="拟真模式"><br><sub>拟真模式</sub> |
| <img src="../../design/screenshots/RealisticModeAdvanced.png" alt="拟真模式，高级"><br><sub>拟真模式，高级</sub> | <img src="../../design/screenshots/Market.png" alt="库存与市集"><br><sub>库存与市场</sub> |
| <img src="../../design/screenshots/Market2.png" alt="市场，订单簿"><br><sub>市场，订单簿</sub> | <img src="../../design/screenshots/Chat.png" alt="Steam 聊天"><br><sub>Steam 聊天</sub> |
| <img src="../../design/screenshots/SettingsGeneral.png" alt="设置"><br><sub>设置</sub> |  |

</div>

---

## 📦 安装

### 系统需求

| | |
|---|---|
| 操作系统 | Windows 10 以上，64 位 |
| Steam 账号 | 已设置 Steam 两步验证，手机或电子邮件皆可 |
| 磁盘空间 | 解压缩后约 330 MB |
| Steam 客户端 | 不需要，也不会使用 |

### 安装

1. 从[发行页面](https://github.com/Miabeyefendi/SteamEdge/releases/latest)下载最新的 `.rar`。
2. 解压缩到任意位置。请选择你有权限的文件夹，不要放在 `Program Files`。
3. 运行 `SteamEdge.exe`。没有任何安装步骤，也不会在该文件夹之外写入任何东西。
4. 更新时请把新版本解压到一个全新的空文件夹，再把旧文件夹中的 `settings/` 复制过去。在程序开启时直接覆盖旧文件夹会让两个版本的文件混在一起。

---

## 🚀 快速开始

首次启动会出现登录画面。用 Steam 手机应用程序扫描 QR 码，或切换到密码标签页输入账号密码与 Steam 两步验证码。除了可执行文件旁 `settings/` 内的一组会话令牌之外，不会保存任何东西。

登录之后，「总览」会显示正在运行的工作与可用的功能。开启**卡牌收集**，刷新列表，选择模式并按下开始。其余的可以等你读完[教程](./TUTORIAL_ZH.md)再说。

---

## 📖 文档

- [**功能**](./FEATURES_ZH.md) - 应用程序的全部功能
- [**教程**](./TUTORIAL_ZH.md) - 每项功能与每个设置的完整说明
- [**设置**](./SETTINGS_ZH.md) - 设置存放位置与值得了解的键
- [**隐私与安全**](./PRIVACY_ZH.md) - 它如何处理你的登录、网络上会发送什么
- [**常见问题**](./FAQ_ZH.md) - 封号、价格、无法解锁的成就、更新
- [**开发计画**](./ROADMAP_ZH.md) - 已完成与接下来的事项
- [**更新日志**](../../CHANGELOG.md) - 各版本的变更
- [**开发者**](../DEVELOPERS.md) - 代码结构、测试、习惯（英文）
- [**参与贡献**](../../CONTRIBUTING.md) - 如何提交变更
- [**安全通报**](../../SECURITY.md) - 如何私下通报漏洞

---

## 🤝 参与贡献

欢迎贡献。请先阅读 [CONTRIBUTING.md](../../CONTRIBUTING.md) 与
[CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md)。提交贡献即表示你同意以 AGPL-3.0
授权你的作品。

<div align="center">
<a href="https://github.com/Miabeyefendi/SteamEdge/issues/new?template=bug_report.yml">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../assets/btn-report-bug-dark.svg">
    <img src="../../assets/btn-report-bug.svg" height="52" alt="报告问题">
  </picture>
</a>
<a href="https://github.com/Miabeyefendi/SteamEdge/stargazers">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../assets/btn-star-dark.svg">
    <img src="../../assets/btn-star.svg" height="52" alt="为这个仓库加星">
  </picture>
</a>
</div>

---

## 📜 授权

本项目采用 **GNU Affero 通用公共授权条款第 3 版（AGPL-3.0）**，并搭配
[NOTICE](../../NOTICE) 文件中的补充条款。摘要如下：

- 你可以免费使用、研究、修改、再散布本软件，甚至用它获利，**前提是**你必须
  依 AGPL-3.0 持续提供完整原始码，包含任何托管、SaaS 或网络场景的使用
  （AGPL 第 13 条），并保留下方的作者标示。
- 若要将本作品用于闭源或专有产品，或作为封闭的 SaaS 营运，你需要**另行取得
  书面商业授权**，该授权可能包含权利金或收入分成。详见 [NOTICE](../../NOTICE)
  第 8 节，并与我联系。

### 作者标示（必要）

依 AGPL-3.0 第 7(b) 条，下列标示必须在本项目的任何副本、分支或部署中，
以可见且未经修改的形式保留：

> **Miabeyefendi (Mustafa Ihsan Albayrak)** - https://github.com/Miabeyefendi

### 免责声明

本软件以「现状」提供，不附任何形式的保证。你完全自行承担运行风险，并须自行
负责一切使用行为，包括遵守本软件所互动之任何第三方平台的服务条款。Valve 与
Steam 与作者并无隶属关系，亦未为本项目背书；其名称与商标属于各自所有人。
在适用法律允许的最大范围内，作者对账号封锁、数据丢失或任何其他损害概不负责。
完整条款请见 [LICENSE](../../LICENSE) 与 [NOTICE](../../NOTICE) 文件。

---

## 📬 联系方式

- GitHub：[@miabeyefendi](https://github.com/Miabeyefendi)
- 商业授权或收入分成事宜，请通过我的 GitHub 个人文件与我联系。
