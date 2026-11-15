import test from 'node:test';import assert from 'node:assert/strict';
import {selectedTrackRows} from '../lib/trackSelection.ts';
test('bulk deletion review includes only selected existing IDs, not every filtered track',()=>{
 const tracks=[{id:1,title:'Keep'},{id:2,title:'Selected'},{id:3,title:'Keep too'}];
 assert.deepEqual(selectedTrackRows(tracks,[2,2,999,-1,NaN]),[tracks[1]]);
 assert.deepEqual(selectedTrackRows(tracks,[]),[]);
});
