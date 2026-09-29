#!/usr/bin/env python3
"""挑选音效 → 复制到 src/assets/audio → 生成 src/sound/samples.ts（?inline 导入 + 时长表）。

仅复制本片声音设计用到的 OGG（不复制整库）。名称是“语义名”，cue 里只引用语义名。
"""
import os
import re
import shutil
import sys

SFX = "/opt/agentbench/sfx"
META = sys.argv[1]  # oggmeta 输出文件
OUT_AUDIO = "src/assets/audio"
OUT_TS = "src/sound/samples.ts"

# 语义名 → 相对路径
PICK = {
    # 脚步
    "fs-conc-0": "impact/footstep_concrete_000.ogg",
    "fs-conc-1": "impact/footstep_concrete_001.ogg",
    "fs-conc-2": "impact/footstep_concrete_002.ogg",
    "fs-conc-3": "impact/footstep_concrete_003.ogg",
    "fs-wood-0": "impact/footstep_wood_000.ogg",
    "fs-wood-1": "impact/footstep_wood_001.ogg",
    "fs-wood-2": "impact/footstep_wood_002.ogg",
    "fs-wood-3": "impact/footstep_wood_003.ogg",
    "fs-plate-0": "impact/impactPlate_light_000.ogg",
    "fs-plate-1": "impact/impactPlate_light_002.ogg",
    # 木头：敲门、抽屉、木箱
    "knock-0": "impact/impactWood_heavy_000.ogg",
    "knock-1": "impact/impactWood_heavy_003.ogg",
    "wood-m-1": "impact/impactWood_medium_001.ogg",
    "wood-l-2": "impact/impactWood_light_002.ogg",
    "plank-2": "impact/impactPlank_medium_002.ogg",
    # 门
    "door-open-0": "sci-fi/doorOpen_000.ogg",
    "door-open-2": "sci-fi/doorOpen_002.ogg",
    "door-close-0": "sci-fi/doorClose_000.ogg",
    "door-close-1": "sci-fi/doorClose_001.ogg",
    # 金属 / 陨石
    "metal-h-0": "impact/impactMetal_heavy_000.ogg",
    "metal-h-1": "impact/impactMetal_heavy_001.ogg",
    "metal-h-3": "impact/impactMetal_heavy_003.ogg",
    "metal-m-1": "impact/impactMetal_medium_001.ogg",
    "metal-m-3": "impact/impactMetal_medium_003.ogg",
    "metal-l-1": "impact/impactMetal_light_001.ogg",
    "metal-l-2": "impact/impactMetal_light_002.ogg",
    "metal-l-4": "impact/impactMetal_light_004.ogg",
    "plate-h-1": "impact/impactPlate_heavy_001.ogg",
    "plate-m-2": "impact/impactPlate_medium_002.ogg",
    "sf-metal-2": "sci-fi/impactMetal_002.ogg",
    "mining-1": "impact/impactMining_001.ogg",
    "mining-3": "impact/impactMining_003.ogg",
    # 玻璃 / 瓷 / 锡
    "glass-l-1": "impact/impactGlass_light_001.ogg",
    "glass-l-3": "impact/impactGlass_light_003.ogg",
    "tin-0": "impact/impactTin_medium_000.ogg",
    "tin-2": "impact/impactTin_medium_002.ogg",
    # 布 / 软
    "soft-m-1": "impact/impactSoft_medium_001.ogg",
    "soft-m-3": "impact/impactSoft_medium_003.ogg",
    "soft-h-1": "impact/impactSoft_heavy_001.ogg",
    "soft-h-3": "impact/impactSoft_heavy_003.ogg",
    # 钟 / 通用
    "bell-1": "impact/impactBell_heavy_001.ogg",
    "bell-4": "impact/impactBell_heavy_004.ogg",
    "gen-l-2": "impact/impactGeneric_light_002.ogg",
    # 界面 / 开关（机械继电器、按键）
    "click-1": "ui/click1.ogg",
    "click-3": "ui/click3.ogg",
    "click-5": "ui/click5.ogg",
    "sw-7": "ui/switch7.ogg",
    "sw-13": "ui/switch13.ogg",
    "sw-18": "ui/switch18.ogg",
    "sw-24": "ui/switch24.ogg",
    "sw-33": "ui/switch33.ogg",
    "roll-2": "ui/rollover2.ogg",
    # 科幻：爆裂 / 低频 / 引擎 / 电子噪声
    "crunch-0": "sci-fi/explosionCrunch_000.ogg",
    "crunch-2": "sci-fi/explosionCrunch_002.ogg",
    "lfe-0": "sci-fi/lowFrequency_explosion_000.ogg",
    "lfe-1": "sci-fi/lowFrequency_explosion_001.ogg",
    "slime-0": "sci-fi/slime_000.ogg",
    "eng-low-2": "sci-fi/spaceEngineLow_002.ogg",
    "eng-small-0": "sci-fi/spaceEngineSmall_000.ogg",
    "eng-3": "sci-fi/spaceEngine_003.ogg",
    "comp-0": "sci-fi/computerNoise_000.ogg",
}

dur = {}
for line in open(META, encoding="utf-8"):
    m = re.match(r"^(\S+)\s+([\d.]+)KB\s+([\d.]+)s", line)
    if m:
        dur[m.group(1)] = float(m.group(3))

os.makedirs(OUT_AUDIO, exist_ok=True)
os.makedirs(os.path.dirname(OUT_TS), exist_ok=True)

imports = []
entries = []
total = 0
for name, rel in PICK.items():
    src = os.path.join(SFX, rel)
    fn = os.path.basename(rel)
    dst = os.path.join(OUT_AUDIO, fn)
    shutil.copyfile(src, dst)
    total += os.path.getsize(dst)
    ident = "s_" + re.sub(r"[^A-Za-z0-9]", "_", name)
    imports.append(f'import {ident} from "../assets/audio/{fn}?inline";')
    entries.append(f'  "{name}": {{ url: {ident}, dur: {dur[rel]:.2f} }},')

with open(OUT_TS, "w", encoding="utf-8") as f:
    f.write("// 自动生成（scripts/gen-samples.py）：本片用到的 CC0 音效，全部以 ?inline 内联为 base64 data URL。\n")
    f.write("// 来源：/opt/agentbench/sfx（Kenney CC0 音效库）；只复制了下面列出的文件。\n")
    f.write("\n".join(imports))
    f.write("\n\nexport interface SampleInfo {\n  url: string;\n  /** 原始时长（秒） */\n  dur: number;\n}\n\n")
    f.write("export const SAMPLES: Record<string, SampleInfo> = {\n")
    f.write("\n".join(entries))
    f.write("\n};\n\nexport type SampleName = keyof typeof SAMPLES;\n")
print("files", len(PICK), "bytes", total)
