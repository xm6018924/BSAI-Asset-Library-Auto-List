"""
BSAI Asset Library Auto List - Auto-extract @图N asset descriptions from a storyboard script.

Parses [角色档案], [道具档案], [场景档案] sections from a BSAI-format storyboard
script and outputs one asset at a time. The frontend auto-increments the index
after each execution so the user can just keep clicking "Queue Prompt" to cycle
through all assets.
"""

import re


def parse_assets_from_script(script_text):
    """
    Parse a BSAI-format storyboard script and extract all @图N asset entries
    from [角色档案], [道具档案], and [场景档案] sections.

    Returns a list of dicts with keys:
        - name: asset name (text before @图N)
        - tag: "@图N" tag
        - description: full description text (after @图N)
        - full_text: complete line including name + @图N + description
        - type: "角色" / "道具" / "场景"
        - index: numeric index from @图N
    """
    if not script_text or not script_text.strip():
        return []

    text = script_text

    # Section order: 角色档案 → 道具档案 → 场景档案
    section_defs = [
        ("角色档案", "角色"),
        ("道具档案", "道具"),
        ("场景档案", "场景"),
    ]

    all_assets = []

    for section_name, asset_type in section_defs:
        # Match the section header: [角色档案] followed by ： or :
        # Capture content until the next [ section header
        pattern = r"\[" + re.escape(section_name) + r"\][：:]\s*\n?(.*?)(?=\n\[|$)"
        match = re.search(pattern, text, re.DOTALL)
        if not match:
            continue

        section_content = match.group(1).strip()
        if not section_content:
            continue

        # Each line is a potential asset entry. Look for lines containing @图N
        for raw_line in section_content.split("\n"):
            line = raw_line.strip()
            if not line:
                continue

            # Match @图N anywhere in the line
            tag_match = re.search(r"@图(\d+)", line)
            if not tag_match:
                continue

            tag = tag_match.group(0)  # "@图N"
            index_num = int(tag_match.group(1))

            # Split at @图N to get name and description
            at_pos = tag_match.start()
            name_part = line[:at_pos].strip().rstrip("，,、；;")
            desc_start = at_pos + len(tag)
            desc_part = line[desc_start:].strip().lstrip("，,、；;")

            all_assets.append({
                "name": name_part,
                "tag": tag,
                "description": desc_part,
                "full_text": line,
                "type": asset_type,
                "index": index_num,
            })

    # Sort by @图N index to ensure correct order
    all_assets.sort(key=lambda a: a["index"])
    return all_assets


def filter_assets_by_mode(assets, mode):
    """
    Filter assets by mode and return the filtered list.

    mode: "auto" | "character" | "prop" | "scene"
    "auto" returns all assets in character → prop → scene order (sorted by @图N index within each type)
    """
    if not assets:
        return []

    if mode == "auto":
        # Preserve character → prop → scene order, sorted by index within each type
        result = []
        for t in ["角色", "道具", "场景"]:
            type_assets = [a for a in assets if a["type"] == t]
            type_assets.sort(key=lambda a: a["index"])
            result.extend(type_assets)
        return result
    elif mode == "character":
        result = [a for a in assets if a["type"] == "角色"]
        result.sort(key=lambda a: a["index"])
        return result
    elif mode == "prop":
        result = [a for a in assets if a["type"] == "道具"]
        result.sort(key=lambda a: a["index"])
        return result
    elif mode == "scene":
        result = [a for a in assets if a["type"] == "场景"]
        result.sort(key=lambda a: a["index"])
        return result
    else:
        return list(assets)


class BSAI_AssetLibraryAutoList:
    """
    Auto-extract @图N asset descriptions from a BSAI storyboard script.

    Input a full storyboard script with [角色档案]/[道具档案]/[场景档案] sections.
    The node parses all @图N asset entries and outputs them one by one.
    Click "Queue Prompt" repeatedly to cycle through all assets.
    """

    CATEGORY = "BSAI/Asset Library"
    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "INT", "INT")
    RETURN_NAMES = ("text", "description", "asset_type", "asset_tag", "index", "total")
    FUNCTION = "extract_asset"
    DESCRIPTION = "Auto-extract @图N asset descriptions from a BSAI storyboard script. Click run to cycle through all assets. / 从BSAI分镜脚本中自动提取@图N资产资料，点击运行依次输出。"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "script_text": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": "BSAI format storyboard script with [角色档案]/[道具档案]/[场景档案] sections\nBSAI格式分镜脚本，包含角色档案/道具档案/场景档案章节",
                }),
                "index": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": 9999,
                    "step": 1,
                    "tooltip": "Current asset index (1-based). Auto-increments after each run.\n当前资产索引，每次运行后自动递增。",
                }),
            },
        }

    def extract_asset(self, script_text="", index=1):
        assets = parse_assets_from_script(script_text)
        total = len(assets)

        if total == 0:
            return ("", "", "", "", 0, 0)

        # Clamp index to valid range (1-based)
        idx = max(1, min(int(index), total))
        asset = assets[idx - 1]

        return (
            asset["full_text"],          # text
            asset["description"],        # description
            asset["type"],               # asset_type
            asset["tag"],                # asset_tag
            idx,                         # index
            total,                       # total
        )


class BSAI_AssetLibraryAutoListByType:
    """
    Auto-extract @图N asset descriptions by type (character/prop/scene) from a BSAI storyboard script.

    3 modes: Auto Sequence, Characters Only, Props Only, Scenes Only.
    In Auto mode, outputs all characters first, then all props, then all scenes.
    The frontend auto-increments the index after each execution.
    """

    CATEGORY = "BSAI/Asset Library"
    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "INT", "INT", "STRING")
    RETURN_NAMES = ("text", "description", "asset_type", "asset_tag", "index", "total", "mode")
    FUNCTION = "extract_asset"
    DESCRIPTION = "Extract @图N assets by type: Auto sequence / Characters / Props / Scenes. / 按类型提取@图N资产：自动顺序/角色/道具/场景。"

    MODE_OPTIONS = [
        "自动顺序 / Auto Sequence",
        "仅角色 / Characters Only",
        "仅道具 / Props Only",
        "仅场景 / Scenes Only",
    ]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "script_text": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": "BSAI format storyboard script with [角色档案]/[道具档案]/[场景档案] sections\nBSAI格式分镜脚本，包含角色档案/道具档案/场景档案章节",
                }),
                "mode": (cls.MODE_OPTIONS, {
                    "default": "自动顺序 / Auto Sequence",
                    "tooltip": "Output mode: Auto sequence (character→prop→scene), or filter by type.\n输出模式：自动顺序（角色→道具→场景），或按类型筛选。",
                }),
                "index": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": 9999,
                    "step": 1,
                    "tooltip": "Current asset index within the filtered set (1-based). Auto-increments after each run.\n当前过滤集合内的资产索引，每次运行后自动递增。",
                }),
            },
        }

    def extract_asset(self, script_text="", mode="自动顺序 / Auto Sequence", index=1):
        assets = parse_assets_from_script(script_text)

        # Map display mode to internal mode key
        mode_key = "auto"
        if mode == "仅角色 / Characters Only":
            mode_key = "character"
        elif mode == "仅道具 / Props Only":
            mode_key = "prop"
        elif mode == "仅场景 / Scenes Only":
            mode_key = "scene"

        filtered = filter_assets_by_mode(assets, mode_key)
        total = len(filtered)

        if total == 0:
            return ("", "", "", "", 0, 0, mode)

        # Clamp index to valid range (1-based)
        idx = max(1, min(int(index), total))
        asset = filtered[idx - 1]

        return (
            asset["full_text"],          # text
            asset["description"],        # description
            asset["type"],               # asset_type
            asset["tag"],                # asset_tag
            idx,                         # index
            total,                       # total
            mode,                        # mode (echo back)
        )


NODE_CLASS_MAPPINGS = {
    "BSAI_AssetLibraryAutoList": BSAI_AssetLibraryAutoList,
    "BSAI_AssetLibraryAutoListByType": BSAI_AssetLibraryAutoListByType,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BSAI_AssetLibraryAutoList": "BSAI Asset Library Auto List | 资产库自动列表",
    "BSAI_AssetLibraryAutoListByType": "BSAI Asset Library By Type | 按类型提取资产",
}
