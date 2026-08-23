# BSAI Asset Library Auto List | BSAI 资产库自动列表

> Auto-extract `@图N` asset descriptions from a BSAI-format storyboard script, one by one.
> 从 BSAI 格式分镜脚本中自动提取 `@图N` 资产文字资料，依次逐个输出。

---

## Features | 功能特性

- **Auto Parse | 自动解析** — Automatically extracts assets from `[角色档案]` / `[道具档案]` / `[场景档案]` sections
  自动识别分镜脚本中的角色档案、道具档案、场景档案章节
- **Sequential Output | 依次输出** — Click "Queue Prompt" repeatedly to output each `@图N` asset one by one
  每次点击运行自动输出下一个 `@图N` 资产的文字资料
- **Auto Increment | 自动递增** — Index auto-increments after each execution, wraps around at the end
  运行完成后索引自动+1，到达末尾循环回到第一个
- **6 Output Ports | 6个输出端口** — Full text, description, asset type, `@图N` tag, current index, total count
  完整文本、描述、资产类型、@图N标签、当前索引、资产总数
- **Manual Controls | 手动控制** — Prev / Reset / Next buttons at the bottom of the node
  节点底部提供「上一个 / 重置 / 下一个」按钮手动跳转
- **Zero Dependencies | 零依赖** — No external node packages required, works out of the box
  无需安装任何额外节点包，开箱即用

---

## Installation | 安装方法

### Method 1: Manual Install | 方法一：手动安装

1. Download or clone this repository
   下载或克隆本仓库
2. Place the folder inside your ComfyUI `custom_nodes` directory
   将文件夹放入 ComfyUI 的 `custom_nodes` 目录中
3. Restart ComfyUI
   重启 ComfyUI

### Method 2: ComfyUI Manager | 方法二：ComfyUI 管理器

Search for "BSAI Asset Library Auto List" in ComfyUI Manager and install it.
在 ComfyUI 管理器中搜索 "BSAI Asset Library Auto List" 并安装。

---

## Node Reference | 节点说明

### BSAI Asset Library Auto List | 资产库自动列表

**Category | 分类:** `BSAI / Asset Library`

#### Inputs | 输入

| Name | 名称 | Type | Description | 说明 |
|------|------|------|-------------|------|
| `script_text` | 分镜脚本 | STRING (multiline) | BSAI-format storyboard script with `[角色档案]` / `[道具档案]` / `[场景档案]` sections | BSAI 格式分镜脚本，包含角色档案/道具档案/场景档案章节 |
| `index` | 索引 | INT | Current asset index (1-based). Auto-increments after each run. | 当前资产索引（从1开始），每次运行后自动递增 |

#### Outputs | 输出

| Name | 名称 | Type | Description | 说明 |
|------|------|------|-------------|------|
| `text` | 完整文本 | STRING | Complete asset text (name + @图N + description) | 完整资产文本（名称 + @图N标签 + 描述） |
| `description` | 描述 | STRING | Asset description text (without @图N tag) | 资产描述文本（不含 @图N 标签） |
| `asset_type` | 类型 | STRING | Asset type: `角色` (Character) / `道具` (Prop) / `场景` (Scene) | 资产类型：角色 / 道具 / 场景 |
| `asset_tag` | 标签 | STRING | The `@图N` tag (e.g., `@图1`) | `@图N` 标签（如 `@图1`） |
| `index` | 索引 | INT | Current asset index (1-based) | 当前资产索引（从1开始） |
| `total` | 总数 | INT | Total number of assets found | 解析到的资产总数 |

---

## Supported Script Format | 支持的脚本格式

```
[角色档案]：
苏浅@图1，波浪长发机车女郎，蜜茶色大波浪长发...
林曼@图2，马尾辫职业女性，冷冽黑直发高束马尾...

[道具档案]：
"赤焰"重机车@图3，哑光黑车身...
"冰锋"电动超跑@图4，流线型银灰车身...

[场景档案]：
城市地下车库@图6(深夜)，冷色调工业顶灯...
城市街道@图7(深夜)，冷色调霓虹灯光...
```

**Parsing Rules | 解析规则:**
- Sections are parsed in order: 角色档案 → 道具档案 → 场景档案
  按角色档案 → 道具档案 → 场景档案的顺序解析
- Each line containing `@图N` within a section is treated as one asset entry
  每个章节中包含 `@图N` 的行视为一个资产条目
- Assets are sorted by `@图N` index number in the final output
  最终输出按 `@图N` 编号排序
- Assets from `[分镜N]` sections are NOT included — only the three archive sections
  分镜章节中的 @图N 引用不纳入资产列表，仅提取三个档案章节

---

## Usage | 使用方法

### Basic Workflow | 基本流程

1. **Paste Script | 粘贴脚本** — Paste your BSAI-format storyboard script into the `script_text` widget
   将 BSAI 格式分镜脚本文本粘贴到 `script_text` 输入框
2. **Auto Parse | 自动解析** — The node automatically detects all `@图N` assets and shows the count
   节点自动解析所有 `@图N` 资产并显示数量
3. **Run | 点击运行** — Click "Queue Prompt" to output the current asset's data
   点击 ComfyUI 的「运行 / Queue Prompt」按钮，输出当前索引的资产资料
4. **Auto Advance | 自动递增** — After execution, the index auto-increments by 1
   运行完成后索引自动+1，下次运行输出下一个资产
5. **Wrap Around | 循环往复** — When reaching the last asset, the next run wraps back to #1
   到达最后一个资产后，下一次运行自动回到第一个

### Manual Controls | 手动控制

Three buttons at the bottom of the node:
节点底部有三个按钮：

| Button | 按钮 | Function | 功能 |
|--------|------|----------|------|
| ◀ 上一个 / Prev | Go to previous asset | 切换到上一个资产 |
| 重置 / Reset | Reset index to 1 | 重置索引为 1 |
| 下一个 / Next ▶ | Go to next asset | 切换到下一个资产 |

---

## Example Workflow | 示例工作流

An example workflow is included in `example_workflows/BSAI_Asset_Library_Auto_List_v1.0.json`
示例工作流位于 `example_workflows/BSAI_Asset_Library_Auto_List_v1.0.json`

The example includes a complete storyboard script with 8 assets (2 characters + 3 props + 3 scenes) that you can test immediately.
内置完整分镜脚本示例，包含 8 个资产（2 角色 + 3 道具 + 3 场景），可直接运行测试。

---

## Use Cases | 应用场景

- **Batch Asset Upload | 批量资产上传** — Feed each asset description to an image upload node to populate your asset library one by one
  将每个资产描述输出到图片上传节点，逐个填充资产库
- **Character Reference Sheets | 角色参考图生成** — Output character descriptions to an image generator to create consistent character reference images
  输出角色描述到图像生成节点，创建统一风格的角色参考图
- **Scene Background Generation | 场景背景生成** — Output scene descriptions to generate background plates for each location
  输出场景描述生成每个场景的背景底图
- **Asset Library Management | 资产库管理** — Use with BSAI Asset Library Input node to systematically build your asset library from a storyboard script
  配合 BSAI Asset Library Input 节点，从分镜脚本系统化构建资产库

---

## Changelog | 更新日志

### v1.0.0 (2026-08-24)
- Initial release | 首次发布
- Auto-parse @图N assets from character/prop/scene sections | 自动解析角色/道具/场景章节中的 @图N 资产
- 6 output ports: text, description, asset_type, asset_tag, index, total | 6个输出端口：完整文本、描述、类型、标签、索引、总数
- Auto-increment index after each execution | 每次运行后索引自动递增
- Prev / Reset / Next manual control buttons | 上一个 / 重置 / 下一个手动控制按钮
- Example workflow with 8 sample assets | 包含 8 个示例资产的示例工作流

---

## License | 许可证

MIT License

---

## Related BSAI Plugins | 相关 BSAI 插件

- **BSAI H3 Film Factory** — AI video generation with storyboard-driven workflow
  分镜驱动的 AI 视频生成工作流
- **BSAI Asset Library** — Unified asset library for images, videos, and audio
  统一的图片/视频/音频资产库
- **BSAI Contextual Series** — Context-aware image generation series
  上下文感知的图像生成系列
