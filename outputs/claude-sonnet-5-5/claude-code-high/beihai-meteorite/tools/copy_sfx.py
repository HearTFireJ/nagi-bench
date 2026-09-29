import shutil, os
S = "/opt/agentbench/sfx"
files = """impact/footstep_concrete_000 impact/footstep_concrete_001 impact/footstep_concrete_002 impact/footstep_concrete_003 impact/footstep_concrete_004
impact/footstep_wood_000 impact/footstep_wood_001 impact/footstep_wood_002 impact/footstep_wood_003 impact/footstep_wood_004
impact/impactWood_medium_000 impact/impactWood_heavy_000 impact/impactWood_light_001
impact/impactGlass_light_000 impact/impactGlass_light_002 impact/impactGlass_medium_000
impact/impactMetal_light_000 impact/impactMetal_light_001 impact/impactMetal_light_002 impact/impactMetal_light_004
impact/impactMetal_medium_000 impact/impactMetal_medium_003 impact/impactMetal_heavy_001 impact/impactMetal_heavy_002
impact/impactPlate_light_000 impact/impactPlate_heavy_000
impact/impactSoft_medium_000 impact/impactSoft_medium_001 impact/impactSoft_heavy_000
impact/impactTin_medium_000 impact/impactMining_001 impact/impactPunch_heavy_000 impact/impactBell_heavy_001
sci-fi/doorOpen_000 sci-fi/doorOpen_001 sci-fi/doorOpen_002 sci-fi/doorClose_001
sci-fi/engineCircular_001 sci-fi/spaceEngineSmall_001 sci-fi/slime_000 sci-fi/forceField_000 sci-fi/computerNoise_000
sci-fi/explosionCrunch_001 sci-fi/lowFrequency_explosion_001 sci-fi/thrusterFire_002
ui/click2 ui/click3 ui/click5 ui/switch1 ui/switch10 ui/switch12 ui/switch13 ui/rollover4 ui/rollover6""".split()
dst = "/workspace/src/assets/audio"
os.makedirs(dst, exist_ok=True)
total = 0
for f in files:
    src = f"{S}/{f}.ogg"
    shutil.copy(src, dst)
    total += os.path.getsize(src)
print(len(files), "files", total // 1024, "KB")
