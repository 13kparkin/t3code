// The engine types this into the user's shell, which may be bash, fish, nushell, or PowerShell, so
// the program sits in one single-quoted `node -e` argument and uses no quote or backslash.
const PROGRAM = [
  "const fs=require(`fs`),path=require(`path`),cp=require(`child_process`);",
  "const root=process.env.T3CODE_PROJECT_ROOT,wt=process.cwd();",
  "const ignored=cp.spawnSync(`git`,[`ls-files`,`-z`,`--others`,`--ignored`,`--exclude-standard`,`--directory`],{cwd:root,encoding:`utf8`}).stdout||``;",
  "for(const rel of ignored.split(String.fromCharCode(0))){",
  "const name=path.basename(rel);",
  "if(name!==`.env`&&!name.startsWith(`.env.`))continue;",
  "const dest=path.join(wt,rel);",
  "if(fs.lstatSync(dest,{throwIfNoEntry:false}))continue;",
  "fs.mkdirSync(path.dirname(dest),{recursive:true});",
  "try{fs.symlinkSync(path.join(root,rel),dest)}catch{fs.copyFileSync(path.join(root,rel),dest)}",
  "console.log(`linked ${rel}`)}",
  "const install=[[`pnpm-lock.yaml`,`pnpm install --frozen-lockfile`],[`bun.lock`,`bun install --frozen-lockfile`],[`bun.lockb`,`bun install --frozen-lockfile`],[`yarn.lock`,`yarn install --frozen-lockfile`],[`package-lock.json`,`npm ci`]].find(([lock])=>fs.existsSync(path.join(wt,lock)));",
  "if(install){console.log(install[1]);process.exitCode=cp.spawnSync(install[1],{cwd:wt,shell:true,stdio:`inherit`}).status??1}",
].join("");

export const DEFAULT_SETUP_SCRIPT = `node -e '${PROGRAM}'`;
