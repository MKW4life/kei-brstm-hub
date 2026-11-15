export function selectedTrackRows<T extends {id:number}>(tracks:readonly T[],ids:readonly number[]):T[]{
  const unique=new Set(ids.filter(id=>Number.isSafeInteger(id)&&id>0));
  return tracks.filter(track=>unique.has(track.id));
}
