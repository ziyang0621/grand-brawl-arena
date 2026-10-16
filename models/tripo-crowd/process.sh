#!/bin/zsh
# Spectators for the stage crowds: generate, decimate to ~10k faces, rig with the biped skeleton (same pipeline as the roster).
export PATH=$HOME/.nvm/versions/node/v23.6.0/bin:$PATH
cd "$(dirname "$0")/../.."
for n in "$@"; do (
  tripo generate text-to-model "$(cat models/tripo-crowd/$n/prompt.txt)" --yes --quiet --no-open --json --name crowd-$n -o models/tripo-crowd/$n/gen > models/tripo-crowd/$n/gen.log 2>&1
  tripo mesh decimate @crowd-$n --face-limit 10000 --yes --quiet --no-open --name crowd-$n-lo -o models/tripo-crowd/$n/lo > models/tripo-crowd/$n/lo.log 2>&1
  tripo anim rig @crowd-$n-lo --rig-type biped --out-format glb --yes --quiet --no-open --name crowd-$n-rig -o models/tripo-crowd/$n/rig > models/tripo-crowd/$n/rig.log 2>&1
  echo "$n done" >> models/tripo-crowd/process.log ) &
done
wait
echo ALL_DONE >> models/tripo-crowd/process.log
