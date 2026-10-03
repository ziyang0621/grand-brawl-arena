// Shared by the game and the isolated motion viewer. The scan faces +X;
// gameplay and the other characters face +Z. Keep this calibration in one place.
export const TRIPO_SCALE=3.7;
export const TRIPO_STRIDE={walk:2*.18*TRIPO_SCALE/.6,run:2*.23*TRIPO_SCALE/.48};
export function configureTripo(g){
  g.root.scale.setScalar(TRIPO_SCALE);
  g.root.rotation.y=-Math.PI/2;
  // Center the scan's hips (source X=-.19) over the gameplay origin.
  g.root.position.z=.19*TRIPO_SCALE;
  g.tripo=true;
  g.tripoSwordMaterials=[];
  g.root.getObjectByName('TripoCutlass')?.traverse(o=>{
    if(!o.isMesh||o.userData.ink)return;
    o.material=o.material.clone();
    if(o.material.name==='TripoSteel')g.tripoSwordMaterials.push(o.material);
  });
}
