#!/bin/zsh
# Decimate each high-poly generation to ~15k faces, then rig it with the default biped skeleton.
export PATH=$HOME/.nvm/versions/node/v23.6.0/bin:$PATH
cd "$(dirname "$0")/../.."
for n in "$@"; do
  tripo mesh decimate @tripo-$n --face-limit 15000 --yes --quiet --no-open --name tripo-$n-lo -o models/tripo-roster/$n/lo > models/tripo-roster/$n/lo.log 2>&1
  tripo anim check @tripo-$n-lo --yes --quiet --no-open --name tripo-$n-lo-check -o models/tripo-roster/$n/check > models/tripo-roster/$n/check.log 2>&1
  tripo anim rig @tripo-$n-lo --rig-type biped --out-format glb --yes --quiet --no-open --name tripo-$n-rig -o models/tripo-roster/$n/rig > models/tripo-roster/$n/rig.log 2>&1
  echo "$n done" >> models/tripo-roster/process.log
done
echo ALL_DONE >> models/tripo-roster/process.log
