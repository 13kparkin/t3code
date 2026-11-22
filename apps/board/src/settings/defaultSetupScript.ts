// The engine types these into the user's shell, which may be bash, fish, nushell, or PowerShell, so
// each program sits in one single-quoted `node -e` argument and uses no quote or backslash.
const nodeLine = (program: ReadonlyArray<string>) => `node -e '${program.join("")}'`;

export const DEFAULT_SETUP_SCRIPT = nodeLine([
  "const fs=require(`fs`),path=require(`path`),cp=require(`child_process`);",
  "const root=process.env.T3CODE_PROJECT_ROOT,wt=fs.realpathSync(process.env.T3CODE_WORKTREE_PATH);",
  "const ignored=cp.spawnSync(`git`,[`ls-files`,`-z`,`--others`,`--ignored`,`--exclude-standard`,`--directory`],{cwd:root,encoding:`utf8`}).stdout||``;",
  "for(const rel of ignored.split(String.fromCharCode(0))){",
  "const name=path.basename(rel);",
  "if(rel.endsWith(`/`)||(name!==`.env`&&!name.startsWith(`.env.`)))continue;",
  "const dest=path.join(wt,rel);",
  "if(fs.lstatSync(dest,{throwIfNoEntry:false}))continue;",
  "let dir;try{dir=fs.realpathSync(path.dirname(dest))}catch{continue}",
  "if(dir!==wt&&!dir.startsWith(wt+path.sep))continue;",
  "try{fs.symlinkSync(path.join(root,rel),dest)}catch{fs.copyFileSync(path.join(root,rel),dest,fs.constants.COPYFILE_EXCL)}",
  "console.log(`linked ${rel}`)}",
]);

// Opt-in, because an install runs the repo's lifecycle scripts and package-manager hooks.
export const INSTALL_SETUP_SCRIPT = nodeLine([
  "const fs=require(`fs`),path=require(`path`),cp=require(`child_process`);",
  "const wt=process.env.T3CODE_WORKTREE_PATH;",
  "const install=[[`pnpm-lock.yaml`,`pnpm install --frozen-lockfile`],[`bun.lock`,`bun install --frozen-lockfile`],[`bun.lockb`,`bun install --frozen-lockfile`],[`yarn.lock`,`yarn install --frozen-lockfile`],[`package-lock.json`,`npm ci`]].find(([lock])=>fs.existsSync(path.join(wt,lock)));",
  "if(install){console.log(install[1]);process.exitCode=cp.spawnSync(install[1],{cwd:wt,shell:true,stdio:`inherit`}).status??1}",
]);
