// Small, transport-independent rules used by the PeerJS host and regression tests.
export function neutralInput(){return {x:0,z:0,guard:false};}
// Invalidates late loader/connection callbacks after cancellation or a retry.
export class ConnectionAttempt{
  constructor(){this.version=0;this.pending=false;}
  begin(){if(this.pending)return null;this.pending=true;return ++this.version;}
  current(token){return token===this.version;}
  finish(token){if(this.current(token))this.pending=false;}
  cancel(){this.version++;this.pending=false;}
}
export function cleanInput(input={}){
  const axis=value=>typeof value==='number'&&Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
  return {x:axis(input?.x),z:axis(input?.z),guard:input?.guard===true};
}
export class InputLease{
  constructor(timeout=500){this.timeout=timeout;this.clear();}
  clear(){this.input=neutralInput();this.lastReceived=-Infinity;}
  receive(input,now){this.input=cleanInput(input);this.lastReceived=now;}
  read(now){return now-this.lastReceived<this.timeout?{...this.input}:neutralInput();}
}
export function sameRound(world,message){return Number.isInteger(message.round)&&message.round===(world.round||0);}
export function voteRematch(world,playerId,round){
  if(!world.ended||round!==(world.round||0)||![0,1].includes(playerId))return false;
  world.rematchVotes??=[false,false];world.rematchVotes[playerId]=true;
  return world.rematchVotes.every(Boolean);
}
