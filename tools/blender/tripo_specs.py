"""Per-character settings for tools/blender/animate_tripo_char.py.

source   rigged Tripo GLB (the default biped skeleton, ~15k faces)
style    which attack choreography to bake: fist | swordshield | gun | kick | staff
weapon   what is bound to the right wrist (None = bare hands): sword | pistol | staff
off_hand extra prop bound to the left forearm: buckler | None
merge_weights  {bone: (side, 'thigh'|...)} fold a helper bone's weights into a leg bone
eyes     optional hand-measured eye centres in armature space, only for faces the texture search cannot read
         (for example hair that covers one eye); otherwise they are found from the texture
"""
SPECS = {
    'brawler': {
        'source': 'models/tripo-roster/brawler/rig/tripo-out/tripo-brawler-rig-16415211/model.glb',
        'style': 'fist', 'weapon': None, 'off_hand': None,
        'pelvis_bone': None,
        'face': {'centre': (.002, .2663), 'look': (400, 450), 'skin': [(330, 520), (470, 520)],
                 'eyes': {1: (488, 440, 130, 118), -1: (318, 440, 130, 118)}, 'brows': {1: (497, 348, 190, 64), -1: (292, 348, 190, 64)}, 'mouth': (400, 552, 260, 100)},
    },
    'guardian': {
        'source': 'models/tripo-roster/guardian/rig-mixamo/tripo-out/*/model.glb',
        'style': 'swordshield', 'weapon': 'sword', 'off_hand': 'buckler',
        'face': {'centre': (.002, .4323), 'look': (400, 520), 'skin': [(345, 555), (455, 555)],
                 'eyes': {1: (443, 508, 60, 50), -1: (352, 508, 60, 50)}, 'brows': {1: (452, 487, 85, 34), -1: (348, 487, 85, 34)}, 'mouth': (398, 580, 80, 30)},
    },
    'gunner': {
        'source': 'models/tripo-roster/gunner/rig/tripo-out/*/model.glb',
        'style': 'gun', 'weapon': 'pistol', 'off_hand': None,
        'merge_weights': {'bone_49': ('Left', 'thigh')},      # the holster hangs on the thigh: skinned to the hip bone it tears away whenever the leg swings
        'face': {'centre': (.001, .2956), 'look': (400, 420), 'skin': [(330, 440), (470, 440)],
                 'eyes': {1: (453, 392, 60, 50), -1: (330, 392, 60, 50)}, 'brows': {1: (465, 333, 105, 40), -1: (328, 333, 105, 40)}, 'mouth': (400, 502, 170, 70)},
    },
    'cook': {
        'source': 'models/tripo-roster/cook/rig/tripo-out/*/model.glb',
        'style': 'kick', 'weapon': None, 'off_hand': None,
        'elbow_pole': (-.9, .35),
        'face': {'centre': (.002, .3093), 'look': (410, 240), 'skin': [(370, 255), (445, 262)],
                 'eyes': {1: (445, 222, 55, 45)}, 'brows': {1: (440, 188, 70, 28)}, 'mouth': (395, 292, 70, 25)},
    },
    'stormcaller': {
        'source': 'models/tripo-roster/stormcaller/rig/tripo-out/*/model.glb',
        'style': 'staff', 'weapon': 'staff', 'off_hand': None,
        'face': {'centre': (-.0444, .391), 'look': (495, 520), 'skin': [(450, 560), (560, 555)],
                 'eyes': {1: (550, 497, 70, 80), -1: (437, 498, 70, 80)}, 'brows': {1: (565, 445, 110, 45)}, 'mouth': (497, 585, 95, 35)},
    },
}
