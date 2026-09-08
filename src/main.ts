import { suppressNoiselessReveal, ExplorerReveal } from './ui/explorer';
import { App, MarkdownRenderChild, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, SecretComponent, Setting, TFile, normalizePath } from 'obsidian';
import { configSchema, localDate } from './core/model';
import { ModelRouter } from './models/router';
import { transport } from './models/http';
import { Service, MarkdownLedger } from './service';
import { paths, ROOT, Store, VaultIO } from './storage/store';
import { Dashboard, Page } from './ui/view';
import { DraftReview } from './ui/draft';

class ObsidianIO implements VaultIO {
  constructor(private app:App){}
  async list(){return this.app.vault.getMarkdownFiles().map(f=>f.path);}
  async exists(path:string){return !!this.app.vault.getAbstractFileByPath(path);}
  private file(path:string){const f=this.app.vault.getAbstractFileByPath(path);if(!(f instanceof TFile))throw new Error(`Missing note: ${path}`);return f;}
  async read(path:string){return this.app.vault.read(this.file(path));}
  async create(path:string,text:string){
    const parts=normalizePath(path).split('/');parts.pop();let parent='';
    for(const part of parts){parent=parent?`${parent}/${part}`:part;if(!await this.exists(parent))await this.app.vault.createFolder(parent);}
    await this.app.vault.create(normalizePath(path),text);
  }
  async process(path:string,fn:(text:string)=>string){const file=this.file(path);await this.app.vault.process(file,fn);}
}
class CaptureModal extends Modal {
  constructor(app:App,private service:Service){super(app);}
  onOpen(){this.titleEl.setText('Let it all out.');const input=this.contentEl.createEl('textarea',{attr:{placeholder:'One task per line…','aria-label':'Capture tasks'}});input.style.width='100%';input.rows=5;
    const save=async()=>{try{await this.service.capture(input.value);this.close();}catch(e){new Notice((e as Error).message);}};
    new Setting(this.contentEl).addButton(b=>b.setButtonText('Capture').setCta().onClick(save));input.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();void save();}});input.focus();
  }
  onClose(){this.contentEl.empty();}
}
class SecretsSettings extends PluginSettingTab {
  constructor(app:App,private plugin:NoiselessPlugin){super(app,plugin);}
  display(){this.containerEl.empty();this.containerEl.createEl('h2',{text:'Noiseless connections'});this.containerEl.createEl('p',{text:'Keys live in Obsidian’s OS-encrypted secret storage. Capacity, model IDs, pricing, and weights live in Noiseless/Setup.md.'});
    for(const provider of ['lmstudio','openai','anthropic'] as const){new Setting(this.containerEl).setName(provider==='lmstudio'?'LM Studio token (optional)':`${provider} API key`).addComponent(el=>new SecretComponent(this.app,el).setValue(this.plugin.service.config.providers[provider].credential).onChange(async id=>{
      try{await this.plugin.service.store.mutate(paths.config,configSchema,c=>({...c,providers:{...c.providers,[provider]:{...c.providers[provider],credential:id}}}));await this.plugin.service.refresh();}catch(e){new Notice((e as Error).message);}
    }));}
    new Setting(this.containerEl).setName('Setup note').addButton(b=>b.setButtonText('Open').onClick(()=>this.plugin.open(paths.config)));
  }
}
export default class NoiselessPlugin extends Plugin {
  service!:Service;private timer:ReturnType<typeof setTimeout>|undefined;private ready=false;private day=localDate();private watched=new Map<string,string>();
  async onload(){
    const store=new Store(new ObsidianIO(this.app));const ledger=new MarkdownLedger(store);
    const router=new ModelRouter(()=>store.config(),id=>this.app.secretStorage.getSecret(id),transport,ledger);
    this.service=new Service(store,router);
    const action=(fn:()=>Promise<unknown>)=>async()=>{try{await fn();}catch(e){new Notice(`Noiseless: ${(e as Error).message}`);}};
    this.addCommand({id:'open-today',name:'Open Today',callback:()=>this.open(paths.today)});
    this.addCommand({id:'capture',name:'Capture tasks',callback:()=>new CaptureModal(this.app,this.service).open()});
    this.addCommand({id:'refresh',name:'Refresh estimates and priorities',callback:action(async()=>{await this.service.refresh(true);await this.service.enrich(true);})});
    this.addCommand({id:'draft-goals',name:'Draft goals from brief',callback:action(async()=>{await this.service.draft();this.open(paths.draft);})});
    this.addCommand({id:'approve-goals',name:'Approve goal draft',callback:action(async()=>{await this.service.approve();new Notice('Goal graph activated.');this.open(paths.goals);})});
    this.addCommand({id:'open-setup',name:'Open setup',callback:()=>this.open(paths.config)});
    this.addRibbonIcon('circle-dashed','Noiseless: Today',()=>this.open(paths.today));this.addSettingTab(new SecretsSettings(this.app,this));
    this.registerMarkdownCodeBlockProcessor('noiseless',(source,el,ctx)=>{
      if(source.trim()==='draft'){
        const child=new MarkdownRenderChild(el);ctx.addChild(child);const view=new DraftReview(el,this.service,{open:path=>this.open(path),notify:message=>new Notice(message)});
        child.register(()=>view.destroy());child.registerEvent(this.app.vault.on('modify',file=>{if(file.path===paths.draft)void view.reload();}));return;
      }
      const page=source.trim() as Page;if(!['today','everything','progress','goals','setup'].includes(page)){el.setText('Noiseless: use today, everything, progress, goals, or setup.');return;}
      const child=new MarkdownRenderChild(el);ctx.addChild(child);const view=new Dashboard(el,page,this.service,{open:path=>this.open(path),notify:message=>new Notice(message)});child.register(()=>view.destroy());
    });
    this.registerMarkdownPostProcessor((el,ctx)=>{
      if(ctx.sourcePath===paths.config)el.classList.add('nl-setup-prose');
    });
    this.registerEvent(this.app.workspace.on('layout-change',()=>this.guardExplorerReveal()));
    this.app.workspace.onLayoutReady(()=>void action(async()=>{
      this.guardExplorerReveal();
      this.app.workspace.iterateAllLeaves(leaf=>{if(leaf.view instanceof MarkdownView)void action(()=>this.preview(leaf.view as MarkdownView))();});
      await store.init();await this.service.refresh(true);this.ready=true;await this.remember();void this.service.enrich();
    })());
    this.registerEvent(this.app.workspace.on('file-open',file=>{
      const view=this.app.workspace.getActiveViewOfType(MarkdownView);
      if(file&&view?.file===file)void action(()=>this.preview(view))();
    }));
    const event=(file:TFile)=>{if(this.ready&&file.path.startsWith(ROOT+'/'))this.schedule();};
    this.registerEvent(this.app.vault.on('modify',f=>{if(f instanceof TFile)event(f);}));
    this.registerEvent(this.app.vault.on('create',f=>{if(f instanceof TFile)event(f);}));
    this.registerEvent(this.app.vault.on('delete',f=>{if(f instanceof TFile)event(f);}));
    this.registerEvent(this.app.vault.on('rename',f=>{if(f instanceof TFile)event(f);}));
    this.registerInterval(window.setInterval(()=>{if(this.ready&&this.day!==localDate()){this.day=localDate();void this.service.refresh();}},30000));
    this.registerInterval(window.setInterval(()=>{if(this.ready)void this.service.retryPending();},600000));
  }
  private guardedExplorers=new WeakSet<object>();
  private guardExplorerReveal(){
    for(const leaf of this.app.workspace.getLeavesOfType('file-explorer')){
      const view=leaf.view as unknown as ExplorerReveal;
      if(this.guardedExplorers.has(view)||typeof view.revealActiveFile!=='function')continue;
      this.guardedExplorers.add(view);this.register(suppressNoiselessReveal(view,ROOT));
    }
  }
  private navigation:Promise<void>=Promise.resolve();
  private async openQuietly(path:string){
    this.guardExplorerReveal();
    try{await this.app.workspace.openLinkText(path,'',false,{active:true,state:{mode:'preview'}});}
    catch(e){new Notice(`Noiseless: ${(e as Error).message}`);}
  }
  open(path:string){this.navigation=this.navigation.then(()=>this.openQuietly(path));}
  private async preview(view:MarkdownView){
    if(!view.file?.path.startsWith(ROOT+'/')||view.getMode()==='preview')return;
    await view.setState({...view.getState(),mode:'preview'},{history:false});
  }
  private async remember(){for(const path of [paths.everything,paths.config,paths.goals,...(await this.service.store.taskFiles()).map(f=>f.path)])if(await this.service.store.io.exists(path))this.watched.set(path,await this.service.store.io.read(path));}
  private schedule(){if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>void this.changed(),700);}
  private async changed(){
    try{
      const candidates=[paths.everything,paths.config,paths.goals,...(await this.service.store.taskFiles()).map(f=>f.path)];let changed=false,ingest=false;
      for(const path of candidates){const text=await this.service.store.io.read(path);if(this.watched.get(path)!==text){changed=true;if(path===paths.everything)ingest=true;this.watched.set(path,text);}}
      if([...this.watched.keys()].some(p=>!candidates.includes(p as typeof paths.everything)))changed=true;
      if(changed){await this.service.refresh(ingest);this.watched.clear();await this.remember();void this.service.enrich();}
    }catch(e){this.service.error=(e as Error).message;this.service.emit();}
  }
  onunload(){this.service.stopped=true;if(this.timer)clearTimeout(this.timer);}
}
