"""Per-character settings for tools/blender/animate_tripo_char.py.

source   rigged Tripo GLB (the default biped skeleton, ~15k faces)
style    which attack choreography to bake: fist | swordshield | gun | kick | staff
weapon   what is bound to the right wrist (None = bare hands): sword | pistol | staff
off_hand extra prop bound to the left forearm: buckler | None
eyes     optional hand-measured eye centres in armature space, only for faces the texture search cannot read
         (for example hair that covers one eye); otherwise they are found from the texture
"""
SPECS = {
    'brawler': {
        'source': 'models/tripo-roster/brawler/rig/tripo-out/tripo-brawler-rig-16415211/model.glb',
        'style': 'fist', 'weapon': None, 'off_hand': None,
        'pelvis_bone': None,
    },
    'guardian': {
        'source': 'models/tripo-roster/guardian/rig-mixamo/tripo-out/*/model.glb',
        'style': 'swordshield', 'weapon': 'sword', 'off_hand': 'buckler',
    },
    'gunner': {
        'source': 'models/tripo-roster/gunner/rig/tripo-out/*/model.glb',
        'style': 'gun', 'weapon': 'pistol', 'off_hand': None,
    },
    'cook': {
        'source': 'models/tripo-roster/cook/rig/tripo-out/*/model.glb',
        'style': 'kick', 'weapon': None, 'off_hand': None,
        'elbow_pole': (-.9, .35),
    },
    'stormcaller': {
        'source': 'models/tripo-roster/stormcaller/rig/tripo-out/*/model.glb',
        'style': 'staff', 'weapon': 'staff', 'off_hand': None,
    },
}
