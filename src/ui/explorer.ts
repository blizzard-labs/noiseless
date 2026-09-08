/** Obsidian runtime API: automatic reveal also runs on deferred explorer sorts. */
export interface ExplorerReveal {
  activeDom?:{file?:{path:string}};
  revealActiveFile?:()=>void;
}
export function suppressNoiselessReveal(view:ExplorerReveal,root:string):()=>void {
  const original=view.revealActiveFile;
  if(typeof original!=='function')return ()=>{};
  const wrapped=function(this:ExplorerReveal){
    const path=this.activeDom?.file?.path;
    if(path===root||path?.startsWith(root+'/'))return;
    return original.call(this);
  };
  view.revealActiveFile=wrapped;
  return ()=>{if(view.revealActiveFile===wrapped)view.revealActiveFile=original;};
}
