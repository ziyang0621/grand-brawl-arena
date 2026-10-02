#!/bin/sh
# usage: poses.sh <id> -> out/<id>_poses.png : contact sheet of key frames
PY=/home/user/blender-work/venv/bin/python
c=$1; shift
files=""
for spec in "$@"; do set -- $(echo $spec | tr ':' ' '); $PY render.py -- out/${c}_anim.blend out/p_${c}_$1_$2 40 $2 $1 >/dev/null 2>&1; files="$files out/p_${c}_$1_$2_40.png"; done
node ../../../blender-work/sheet.mjs out/${c}_poses.png $files
