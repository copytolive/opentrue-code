import {realpath} from "node:fs/promises";
import {dirname,resolve,sep} from "node:path";
import {fileURLToPath} from "node:url";

const CLI=resolve(dirname(fileURLToPath(import.meta.url)),"../../agent-runtime/bin/opentrue.mjs");
const NODE=process.execPath;

export const TASKS={
  test:["npm",["test"]],
  build:["npm",["run","build"]],
  lint:["npm",["run","lint"]],
  git_status:["git",["status","--short"]],
  git_diff:["git",["diff","--stat","HEAD"]],
  docker_ps:["docker",["compose","ps"]],
  python_version:["python3",["--version"]],
  ask:[NODE,[CLI,"ask"]],
  plan:[NODE,[CLI,"plan"]],
  agent:[NODE,[CLI,"agent","--yes"]],
  debug:[NODE,[CLI,"debug","--yes"]],
  bugbot:[NODE,[CLI,"bugbot"]],
  checkpoint:[NODE,[CLI,"checkpoint"]],
  git_branch:[NODE,[CLI,"branch"]],
  git_commit:[NODE,[CLI,"commit"]],
  git_push:[NODE,[CLI,"push","--yes"]],
  git_pr:[NODE,[CLI,"pr","--yes"]],
  git_checks:[NODE,[CLI,"checks"]],
  git_merge:[NODE,[CLI,"merge","--yes"]],
  worktree:[NODE,[CLI,"worktree"]]
};

export async function approvedRoot(requested,roots){
  const path=await realpath(resolve(requested));
  for(const root of roots){const base=await realpath(resolve(root));if(path===base||path.startsWith(base+sep))return path}
  throw Error("workspace is outside approved roots");
}

export function commandFor(task,args=[]){
  const spec=TASKS[task];
  if(!spec)throw Error("task is not allowlisted");
  if(args.some(x=>String(x).includes("\0")))throw Error("invalid argument");
  return [spec[0],[...spec[1],...args.map(String)]];
}
