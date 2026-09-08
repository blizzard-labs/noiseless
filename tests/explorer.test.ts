import {it,expect,vi} from 'vitest';
import {suppressNoiselessReveal} from '../src/ui/explorer';
it('suppresses automatic reveals after navigation and during later refreshes, and restores on unload',()=>{
  const reveal=vi.fn();const view={activeDom:{file:{path:'Noiseless/Today.md'}},revealActiveFile:reveal};
  const restore=suppressNoiselessReveal(view,'Noiseless');
  view.revealActiveFile();view.activeDom.file.path='Noiseless/Progress.md';
  view.revealActiveFile();view.revealActiveFile();expect(reveal).not.toHaveBeenCalled();
  view.activeDom.file.path='Notes/Reading.md';view.revealActiveFile();expect(reveal).toHaveBeenCalledTimes(1);
  view.activeDom.file.path='Noiseless-other.md';view.revealActiveFile();expect(reveal).toHaveBeenCalledTimes(2);
  restore();expect(view.revealActiveFile).toBe(reveal);
});
