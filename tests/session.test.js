import test from 'node:test';
import assert from 'node:assert/strict';
import {ConnectionAttempt,InputLease,cleanInput,neutralInput,sameRound,voteRematch} from '../arena-session.js';
import {createWorld} from '../arena-core.js';

test('double clicking connect starts only one attempt',()=>{
  const gate=new ConnectionAttempt(),first=gate.begin();
  assert.equal(gate.begin(),null);assert.equal(gate.current(first),true);
  gate.finish(first);assert.equal(gate.pending,false);
});
test('cancelled connection callbacks cannot revive a room or finish a newer attempt',()=>{
  const gate=new ConnectionAttempt(),first=gate.begin();gate.cancel();
  const second=gate.begin();assert.equal(gate.current(first),false);
  gate.finish(first);assert.equal(gate.pending,true);assert.equal(gate.current(second),true);
  gate.finish(second);assert.equal(gate.pending,false);
});
test('failure permits retry and invalidates callbacks from the failed connection',()=>{
  const gate=new ConnectionAttempt(),first=gate.begin();gate.cancel();
  assert.equal(gate.pending,false);assert.notEqual(gate.begin(),null);
  assert.equal(gate.current(first),false);
});

test('lost or backgrounded guest input expires instead of walking forever',()=>{
  const lease=new InputLease();lease.receive({x:1,z:-1,guard:true},100);
  assert.equal(lease.read(599).x,1);assert.deepEqual(lease.read(600),neutralInput());
  lease.receive({x:-1},700);assert.equal(lease.read(701).x,-1);
});
test('releasing keys and changing rounds immediately clear stale movement and guard',()=>{
  const lease=new InputLease();lease.receive({x:1,guard:true},10);lease.receive(neutralInput(),20);
  assert.deepEqual(lease.read(21),neutralInput());lease.receive({z:1},30);lease.clear();assert.deepEqual(lease.read(31),neutralInput());
});
test('network movement rejects non-finite data and clamps oversized axes',()=>{
  assert.deepEqual(cleanInput({x:Infinity,z:NaN,guard:'yes'}),neutralInput());
  assert.deepEqual(cleanInput({x:99,z:-4,guard:true}),{x:1,z:-1,guard:true});
  assert.deepEqual(cleanInput(null),neutralInput());
});
test('stale actions from the previous match cannot affect the new match',()=>{
  const w=createWorld();w.round=4;assert.equal(sameRound(w,{round:3}),false);
  assert.equal(sameRound(w,{round:4}),true);assert.equal(sameRound(w,{}),false);
});
test('either player can request a rematch but both must agree',()=>{
  for(const first of [0,1]){const w=createWorld();w.round=2;w.ended=true;
    assert.equal(voteRematch(w,first,2),false);assert.equal(voteRematch(w,first,2),false);
    assert.equal(voteRematch(w,1-first,2),true);assert.deepEqual(w.rematchVotes,[true,true]);}
});
test('rematch votes cannot interrupt combat or carry over to the next round',()=>{
  const w=createWorld();w.round=2;assert.equal(voteRematch(w,0,2),false);assert.equal(w.rematchVotes,undefined);
  w.ended=true;assert.equal(voteRematch(w,0,1),false);assert.equal(voteRematch(w,5,2),false);assert.equal(w.rematchVotes,undefined);
});
