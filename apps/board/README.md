# Agent Board

A desktop app that runs projects through an orchestrator on the T3 Code engine. It connects to the local T3 background service as a client, like T3's mobile app does.

## The engine stays upstream

This fork tracks `pingdotgg/t3code`. Board code lives only in `apps/board/`, `.github/workflows/agent-board.yml`, and `pnpm-lock.yaml`, so merging upstream never conflicts. The check below enforces that and runs in CI on every pull request.

```sh
git remote add upstream https://github.com/pingdotgg/t3code.git  # once
git fetch upstream main
node apps/board/scripts/check-engine-untouched.mjs
```

It exits 0 when nothing outside those paths changed since the merge base with `upstream/main`, 1 with the offending paths otherwise, and 2 when the `upstream` remote is missing.

## Run

```sh
vp run --filter @agent-board/app dev      # Electron window on the Vite dev server
vp run --filter @agent-board/app dev:web  # the renderer alone, in a browser, at http://127.0.0.1:5190
vp run --filter @agent-board/app build    # renderer to dist/, Electron main to dist-electron/
vp run --filter @agent-board/app start    # production build, loaded from agentboard://app
```

On a Windows machine, run the same commands from WSL with `dev:windows` and `start:windows` (after `build`) to get Windows' own window frame. They download Electron for `win32-x64` once into `%LOCALAPPDATA%\agent-board\` and copy the bundle there, so Electron never runs from a `\\wsl.localhost` path. This needs WSL mirrored networking, so the Windows app can reach the dev server on `127.0.0.1`.

`PORT` moves the dev server. `AGENT_BOARD_CDP_PORT` turns on Electron's remote debugging port. Electron prints `board:first-paint <ms>` once the renderer has painted, measured from the main process start.

## Releases

Releases are on the fork's Releases page as `board-v<version>`.
Download `Agent-Board-Setup-<version>.exe` and run it for a per-user install with Start menu and desktop shortcuts.
It is not code signed, so Windows SmartScreen warns on first run.
`SHA256SUMS` lists the hash of the installer.

The app checks this page for a newer `board-v` release every 4 hours and lists it in Settings → Updates.
Download fetches it, and Restart installs it, but only while no thread has an active run.
Pre-releases are offered only with "Offer test releases" on.
Versions up to 0.2.0 cannot update themselves, so install the first later version by hand.
A release must keep `latest.yml` and the installer's `.blockmap`, which `release.mjs` uploads.

To cut a release, check out a clean `origin/main` and run this.

```sh
node apps/board/scripts/release.mjs 0.1.0
```

It stops if the tag exists, runs the same gates as CI, builds, packages the installer with electron-builder from Linux with no Wine, writes `SHA256SUMS` and the release notes, and runs `gh release create`.
A test release comes from a pushed branch and is marked with `--prerelease`. Give its version a suffix such as `0.0.3-test`, so it never uses up a real version tag.
With `ANTHROPIC_API_KEY` set, the notes open with a Claude summary of the pull requests since the previous `board-v*` tag, over GitHub's generated list. Without it, the notes are GitHub's list alone.

When Actions is available on the repo, `gh workflow run agent-board.yml -f version=0.1.0` runs the same script in a `release` job, using the `ANTHROPIC_API_KEY` repo secret. Add `-f prerelease=true` for a pre-release.

The fork runs no CI on pull requests, so local CI stands in. `scripts/gates.mjs` lists the release gates, and `release.mjs` and `ci-local.mjs` both run that list.

```sh
node apps/board/scripts/ci-local.mjs T-13
```

It needs a clean checkout. It fetches upstream, runs `vp run check:changed` and every release gate, and writes `.omp/artifacts/<ticket key>/ci-local.txt`. Line 1 is the head SHA, and each step ends with a line such as `engine-exit=0`. The file keeps the last 32,000 characters of each step's output.

## omp rules for Claude Code

The `board-rules` plugin in `plugins/` gives every Claude Code session the rules in `~/.omp/agent/rules`, the sticky `~/.omp/agent/RULES.md`, and `vp` on the Bash path. Rules are read at hook time, so editing a rule file takes effect in the next session. `OMP_KIT_RULES_DIR` points the engine at another rules folder, and `RULES.md` is read from that folder's parent. A session whose first prompt starts `Read <board>/roles/<role>.md and act as that role.` for a read-only role skips every rule, so a Stop hook cannot replace the agent's report.

```sh
node apps/board/scripts/install-board-rules.mjs                      # user scope, ~/.claude
node apps/board/scripts/install-board-rules.mjs --config-dir /tmp/x  # an isolated Claude config
```

A rule with `approval: ask` in its frontmatter makes the plugin answer a matching MCP tool call with Claude Code's `ask` decision, so the operator approves in place with the rule's text, on every call. omp ignores the field. MCP calls match by tool name only, never by their arguments, and a scope token may spell the tool the omp way (`tool:mcp__linear_save_issue`) or the Claude way (`tool:mcp__t3-code__set_issue_state`). Other tools, Bash included, keep the draft-first deny.

The plugin loads in place from this checkout, so install from a checkout that stays.

## pstack skills

The private repo `13kparkin/pstack-t3` holds Lauren Tan's pstack skills ported to T3, with an `upstream` branch that tracks cursor/plugins. The board loads it only on its own Claude instances. When it starts an orchestrator, the Electron main process clones the repo into `~/.agent-board/pstack-t3` in WSL, or fetches `main` into the existing clone and keeps the old checkout if the fetch fails. The app then sets `CLAUDE_CODE_PLUGIN_DIRS` to that folder on `board-orchestrator-<instance>` and on `board-agents-<instance>`, the instance every role's `target` names. Nothing is installed at user scope, so Claude Code sessions outside the board stay as they are. The repo is private, so git in WSL needs your credentials (`gh auth setup-git`). `AGENT_BOARD_PSTACK_DIR` points the app at a checkout of your own instead.

Every orchestrator starts with poteto-mode and the `pstack-t3` adapter ahead of its rules in the instance's appended system prompt. `pstack/poteto-mode.md` and `pstack/pstack-t3.md` are copies of those two skills without their front matter. After a change in `pstack-t3`, run `node apps/board/scripts/vendor-pstack.mjs <pstack-t3 checkout>` and `vp fmt apps/board/pstack`, and commit the result. Every other skill the orchestrator reads on demand from the checkout.

## The engine

The app uses T3's own engine, the background service in WSL that `t3 service install` sets up and `t3 update` keeps current. It never runs an engine of its own and never stops one. It finds the engine in this order and shows each step in the sidebar footer.

1. `AGENT_BOARD_ENGINE_URL`, when set. `AGENT_BOARD_TOKEN` supplies its bearer; without it the app issues one.
2. Join a running engine. The app reads `userdata/server-runtime.json` under the T3 home in WSL, and joins when that `pid` is alive and the origin answers.
3. Start the service. When `t3` is current but no engine runs, the app runs `t3 service install`, which also repairs a broken service, then joins.
4. Install T3. When `t3` is missing, the footer asks once, then runs `curl -fsSL https://t3.codes/install.sh | sh` and `t3 service install` in WSL, then joins.
5. Update T3. When `t3` or the running engine is older than this client accepts, by the rule in `@t3tools/client-runtime/connection`, the footer asks once, then runs `t3 update --yes`, then joins. Declining leaves `Offline` with the found version.

While the app is open it holds one idle `wsl.exe` process so WSL does not shut down under the service, and ends it on quit.

On Windows every command runs through `wsl.exe -d <distro> --cd ~ --exec`, on Linux directly. The distro is WSL's default; `AGENT_BOARD_WSL_DISTRO`, or `wslDistro` in the app's `settings.json`, picks another from `wsl.exe --list --verbose`.

The app issues its bearer with `auth session issue --label agent-board --ttl 30d`, keeps it encrypted with Electron `safeStorage`, and checks it on every connection attempt. A rejected token is reissued once, then the footer shows `auth_failed`.

`AGENT_BOARD_T3_HOME` replaces `~/.t3`. `AGENT_BOARD_T3_CLI` replaces the discovered `t3` command. `dev:windows` forwards all of these to the Windows process. `t3 service install` always names the same `t3code.service` user unit, so `--base-dir` does not give it a unit of its own: a lane that installs the service needs its own WSL distro, such as one imported with `wsl.exe --import`.

`dev:web` has no main process. Pass `AGENT_BOARD_ENGINE_URL` and `AGENT_BOARD_TOKEN` to point it at an engine.

## Projects and usage

The `+` in the sidebar's Projects header adds a project. Its folder button opens the system folder dialog at the WSL home (`\\wsl.localhost\<distro>\home\<user>` on Windows), and a typed WSL path works too. The main process converts a Windows path with `wslpath -u` through the same WSL runner as the engine commands, then the renderer creates the project with the engine's `project.create`. A folder that is missing, on a Windows drive, or already a project shows its reason under the field.

The bar along the bottom of the window shows each provider's usage limits as T3 reports them in the server config (`providers[].usageLimits`), so the board never calls Anthropic or OpenAI. A session window reads `8% 5d 22h`, a model window `3% Fable`, and a provider without readable limits shows a dash with the reason on hover.

## Boards

The `+` on a project's header creates a board under it. A board is the folder `.agentboard/<slug>/` in the project, holding a `board.json` and the eight store files `tickets.json`, `foryou.jsonl`, `decisions.tsv`, `additions.json`, `ticket-details.json`, `preferences.md`, `gates.md`, and `smoke.md`, which start empty (`tickets.json` and `additions.json` hold `[]`, and `ticket-details.json` holds `{}`). `board.json` has `id`, `slug`, `name`, `projectId`, `orchestratorThreadId`, `createdAt`, `archived`, and `builderCap`, and `hiddenAdditions` once the user hides an addition. The folder name comes from the board's name (`Claude connector` becomes `claude-connector`, then `claude-connector-2`). `.agentboard/.gitignore` holds `*`, so the project's git never sees the folder. The sidebar reads the folder with `projects.listEntries` and `projects.readFile`, and writes with `projects.writeFile`, always with paths relative to the project, because `projects.listEntries` rejects an absolute `directoryPath`. A `board.json` that fails to decode shows as a row with an error badge naming the bad fields, and a project folder with no `.agentboard` has no boards.

The hover action on a board row archives it. Archiving sends `thread.stop` with `stopDelegatedTasks` to the board's orchestrator, waits until no thread of its family has a running task, archives the family's threads (children first), then sets `archived` in `board.json`. A board with no orchestrator thread only gets the file change. The **Archived boards** row near the sidebar's settings opens a slide-out of every project's archived boards, each under its project's name. A press on a row opens the board, and its **Unarchive** button restores it under its project: the family's threads are unarchived from `orchestration.getArchivedShellSnapshot`, since `orchestration.getThreadFamily` lists only threads that are not archived, and `archived` goes back to false. Stopped agents stay stopped.

The last opened board lives in `local-state.json` in the app's user data folder, read and written through IPC (`localStorage` in `dev:web`).

## Orchestrators

Creating a board opens a dialog with the name and the **Orchestrator** picker. The picker lists the engine's Claude Code instances from the server config, each with its sign-in state and the models it offers. Type a model the instance does not list and the engine decides, as in T3.

On create, the app does this in order:

1. Writes the 17 role files from `roles/` into `<board folder>/roles/`, and again whenever the project's boards are listed in the installed app, replacing a copy only when it still matches the hash the app recorded in `roles/.app-written.json`. A copy the user edited, or one with no record that differs from the app's file, is kept. A dev build (`vp dev`) never seeds or refreshes when it lists, because its seeded projects point at the developer's live checkout, so its boards get role files only when the orchestrator launches.
2. Starts the orchestrator with `orchestration.launchThread` in the project root, with the rendered `src/orchestrator/brief.md` as its first message. The brief names the board folder by absolute path, the store files and who writes each, the ticket stages, the role registry, the builder cap, and the rule that the user is reached only through `foryou.jsonl` or `request_secret`.
3. Saves the thread id in `board.json`, then waits for the first sign of life. The dialog closes when the orchestrator has produced text. A model the instance does not offer makes the first run fail, which the engine reports only on the run, so the dialog shows that failure, the board goes back to having no orchestrator, and the failed thread is archived. **Try again** retries without a second board folder.

A board with no orchestrator offers the same picker in its panel.

The **Chat** tab of the right sidebar streams the orchestrator thread and sends follow-ups with `startThreadTurn`. **Stop** interrupts the turn. A reload reattaches to the running thread. The first message, the brief, folds into a disclosure. The right sidebar has three tabs: **Chat**, **Ticket**, and **Files**.

Each ticket on the canvas is a two-line card: a status dot, its key, its title, and what its agents are doing, one of Waiting on you, Failed, Working, or Idle. The second line starts with a chip naming the ticket's stage, then the newest agent's role and how long ago it changed, or "No agents". The whole card drags to reorder its lane; a press that does not drag opens the ticket. The canvas has three lanes: **For you**, **To do** (`todo` and `planned`), and **Running** (`building` through `awaiting_approval`, then `merged` and `off_path` dimmed). `STAGE_TAGS` in `src/board/layout.ts` maps each stage to its lane. Agents no ticket claims lead the To do lane as the same two-line rows. Cards draw no lines between dependent tickets; At a glance lists what a ticket waits on and blocks.

The **Ticket** tab shows the chosen ticket as sections from one registry, `src/board/ticketSections.ts`: Summary, Why, At a glance, Steps, Readiness, Agents, Source control, Checks, Files, and Activity. Files holds the worktree's files and the ticket's evidence, and Activity is the chosen agent's log. At a glance explains the ticket in labeled one-liners, which `src/domain/glance.ts` derives. It shows the root cause and who notices (the ticket's `cause` and `impact`), the pull request's size, and the first decision that names the ticket. It also shows the `verify` verdict with its step's note, the review lanes and fix rounds, the smoke items not fully checked, what the ticket waits on and blocks, and its flags. A line with no data is left out. Steps, Agents, and Activity are left out when the ticket has nothing for them. The others always show, and say "No summary yet", "No worktree yet", or "No pull request yet" when empty. Each section collapses to a bar at the bottom of the tab, and the collapsed set is remembered on this machine for every ticket. The maximize button opens the same details as a tab over the canvas, beside **Board**; closing it shows the canvas again. A press on an agent card in the Agents section opens that agent's messages and work log as its own tab, which closes the same way. An agent that no ticket claims shows as **Unassigned** with its log. With nothing chosen the tab reads "Select a ticket or agent card". Switching tabs keeps the choice, and opening another board clears it.

The ticket's details are editable on the board. The app keeps what the user changes, and the copy it pulled from a linked tracker issue, in `ticket-details.json`, which the orchestrator never writes, so an edit survives the orchestrator rewriting `tickets.json`. The Ticket tab's **Prerequisites** section adds and removes a ticket's `dependsOn`, and refuses an edge that makes a cycle. A ticket linked to a Linear or GitHub issue shows that issue's title and description, read again every two minutes while the board is visible and locked to edits, with **Unlink** to take a copy back; a plain URL link locks nothing. The orchestrator reads a ticket as its `tickets.json` row, then the user's edits, then the pulled copy.

The orchestrator card on the canvas reads `tickets.json`, `foryou.jsonl`, and `decisions.tsv` from the board folder every few seconds and shows a row of tags, builders against the cap, and the latest decision. Each stage is a tag with its count, followed by **For you** with its open items and each addition lane. A tag reads white while its cards or lane show and grey while hidden, and a press toggles it. Merged and Off path start hidden. The choice is remembered per board on this machine. The For you lane's eye button also hides it. When the user asks the orchestrator to show something, it writes typed blocks (`text`, `stat`, `list`, `table`, `link`) to `additions.json`, and the board draws them with its own components: a lane of its own after the stage lanes, a card at the top of the lane that holds a stage, a section in a ticket's details, a line in At a glance, or a line on the orchestrator card. A `stages` list or count and a `ticket` row read the current tickets. A bad item shows as a red line on the orchestrator card, and the others still draw. Each card's × hides it, and the card's **Additions** menu shows and hides each item, with **Reset to default** and **Show all**. The hidden ids live in `board.json`. The top bar's left button hides the left sidebar, and the right button hides the right one. When the engine connection drops, the board keeps retrying, asks for a fresh try after 30 s of waiting, and writes each connection change to `logs/board-connection.log` in the app's data folder. A message sent while disconnected stays in the box with a note. The sidebar's **For you** row opens a slide-out listing every open item with its project and board; choosing one opens that board with the card as a **For you** tab beside **Board**, and shows the For you lane if it was hidden. Each open card on the canvas has the same open-as-tab button. Closing the tab shows the canvas again.

### Roles

Every agent the orchestrator starts is a role from `src/orchestrator/roles.ts`, started with `delegate_task`: `role` is the role's `t3Role`, `isolation` is its isolation, `target` is its model, `title` is `[<ticket key>] <role name>`, and `task` starts with `Read <board folder>/roles/<role>.md and act as that role.` T3 cannot limit a child's tools, so a read-only role stays read-only only because its file says so.

The role files port omp's `task`, `scout`, `reviewer`, `security-reviewer`, and `sonic`, the app-written `verifier`, the `comment-sicko` and `poteto-agent` roles from pstack-omp, and the nine `egm-*` roles. The omp-only front matter (`tools`, `model`, `spawns`, `thinking-level`) is dropped, and an `output` schema became a `Return` section. The models follow Anthropic's model guide, not omp's settings: `reviewer`, `scout`, and `task` run `claude-sonnet-5-5` at `medium`, `security-reviewer` runs `claude-opus-5-5` at `high`, `sonic` runs `claude-haiku-5-5` at `low`, and every other role runs `claude-opus-5-5` at `medium`. No role uses `claude-fable-5-1` or `xhigh`. `sonic` stays off source code. A role whose Claude model the orchestrator's instance does not offer uses the orchestrator's model, and the brief says so under the registry table.

### Reviews and usage

Every ticket runs the board's review template with the `review-loop` skill's mechanics. A template names the author checks the builder runs before it reports code-ready and the reviewer lanes the orchestrator starts after, each as its own `delegate_task` child. The system template, **Review loop**, is the `review-loop` skill as written, and every board starts on it. **Settings, Reviews** lists the templates and builds custom ones from the skills the Claude instances report, saved in `local-state.json` under `reviewTemplates`. The **Review** menu on the orchestrator card picks the board's template, which `board.json` stores as `reviewTemplate`, and a pick during a run sends the orchestrator one message.

The launch facts carry one line per usage window of the orchestrator's provider, such as `Claude weekly 82%, resets in 5d 22h`. While the card is on screen, a window that passes 50, 80, or 95 percent sends the orchestrator one `Usage notice:` message with that line. For you card bodies render as markdown, with images shown as their alt text.

### Sign-in

T3 can sign in only the instances whose `setup.canAuthenticate` is true. **Sign in** runs `provider.auth.start` and shows the step the engine waits on: the browser page, the device code, the terminal, or the credential fields. Claude Code signs in on the machine that runs T3, so for it the picker shows the engine's own instructions and a **Refresh** button.

### Timing tokens

With `localStorage["board:token-marks"] = "1"`, the panel marks `board:token-received` when a streamed token reaches the thread state and `board:token-painted` two frames after its text commits, each with the reply's length in `detail.length`.

## Artifacts

Agents leave evidence files, and the board shows each as a card. A ticket's cards are in its **Files** section, and the orchestrator card's artifact count opens a menu of the board's own files. `src/domain/artifact.ts` classifies a path under the board folder with a lookup table on the folder and the extension. `artifacts/<KEY>/` holds a ticket's evidence, and its extension says which: images are screenshots, `.sh` and `.mts` are scripts, `.patch` is a diff, `.md` and `README.txt` are reports, and everything else is a proof. `review/<KEY>/` is a review, `inbox/` is a brief, and the board root's `design.md`, `plan.md`, `brief.md`, and `decisions.tsv` are a design, a plan, a brief, and the decisions. Files for a key no ticket carries, and the board-level files, attach to the orchestrator card.

`store/artifacts.ts` lists the board folder one directory at a time with `projects.listEntries`, always with a path relative to its `cwd`, and again every second while the board is open, so a file an agent writes shows within a few seconds. It also lists `.omp/artifacts/` in each ticket's `worktreePath`, with the worktree as the `cwd`, because the engine refuses an absolute `directoryPath`.

Opening a card, or a file link in the orchestrator's chat, shows the file in the main view's preview, which the next section describes.

Each listing marks `board:artifacts-listed` with the file count and the milliseconds it took in `detail`.

## Files

The right sidebar's **Files** tab, the third tab of the sidebar the top bar's button toggles, lists the open board's project and each ticket's worktree as roots, taken from `tickets.json`, and draws the chosen root's tree. Choosing a file, a file link in the orchestrator's chat, or an artifact card opens the file as a tab beside **Board** in a strip over the canvas, the way Orca opens a file in its main area. The active file covers the canvas, which stays mounted and sized, so it keeps its pan and zoom. Closing the tab, or choosing **Board**, shows the canvas again. `src/state/filesView.ts` holds the explorer's root, the open tabs, and the active one. The board never edits a file.

`src/files/FileTree.tsx` draws the root with `@pierre/trees`, as T3's file browser does, and lists a folder with `projects.listEntries` only when it opens. Every listing is relative to the root's `cwd`, because the engine lists only inside the `cwd` it is given, so a worktree is listed with the worktree as the `cwd`. Open folders are remembered per root in `localStorage["board.files.expanded"]`.

`FilePreview.tsx` shows a text file as C2's colored code, markdown rendered, `.tsv` and `.csv` as a table through `@t3tools/shared/delimitedPreview`, an image from a signed `assets.createUrl` `media-file` URL, a PDF as pages through `pdfjs-dist`, and any other binary as a placeholder. Text comes from `projects.readFile`, which the engine reads up to 1 MB of, and past that the preview says how much it shows. Each file has **Copy** and **Download**. For a file with no text, **Copy** puts its path on the clipboard, and **Download** fetches the engine's attachment URL. A ticket's `README.txt` shows as its files, each beside what it proves.

The three-dot button in the preview's header opens a menu shaped like Orca's, with one **Open in <editor>** item per editor in the server config's `availableEditors`. Choosing one calls T3's `shell.openInEditor` with the file's absolute path as `cwd`, an empty `position`, and the root as `projectRoot`, so the editor opens on the engine's host. `src/files/editorChoice.ts` lists the editor opened last first, which `localState` keeps in `lastEditor`, and keeps the server's order for an editor the server no longer offers. The button is hidden when the list is empty, and a launch T3 refuses shows T3's reason in the header.

Expanding a folder marks `board:tree-expand` and, two frames after its rows are given to the tree, `board:tree-painted`. Choosing a file marks `board:preview-open`, and its preview marks `board:preview-painted` after its first paint.

## Source control

A ticket's **Source control** section works on its worktree and is laid out like Orca's source control view: the pull request with search and more, the branch, the base with its ahead and behind counts, a commit message box with a **Commit** button and a menu, the changed files, and a collapsible **Commits** section. **Changes** reads T3's `review.getDiffPreview` with `sourceKind: "working-tree"`, and **Branch vs <base>** reads it with `branch-range` against the ticket's `base` from `tickets.json`, or the default branch. Commits come from `review.getBranchCommits`, and a commit opens to its files. The box commits through T3's `git.runStackedAction` as `commit`, `commit_push`, or `commit_push_pr`, with T3's own message when the box is empty, and after a commit it offers **Tell the orchestrator**. A file, a commit, or **View all** opens as a diff tab beside **Board**, the way Orca opens a diff in its main area. `src/changes/DiffView.tsx` shows unified or split, ignores whitespace on request, and expands the unchanged lines from `review.getDiffFileContents`. T3 caps a whole diff's patch at 120 KB, so `useFilePatches.ts` reads each file's patch on its own. A file's name or a line number in a diff opens F1's file view at that line, marked. The ticket header's branch line and each agent card have a button that opens the ticket's branch diff and its Source control section. `src/changes/changeSet.ts` turns a preview into the file tree and the totals.

## Pull requests and merge readiness

A ticket's header shows its pull request beside the branch: `PR #12 Open ✓ Passing Mergeable`, with the checks reading Passing, Failing, Running, Stuck, or No checks. The ticket's `pr` in `tickets.json` names the pull request, as a number read against the project's own repository or as a link T3's own parser reads. A ticket with no `pr` takes the link its agents' threads carry for the ticket's branch.

The state comes from three reads that the board merges, newest first. The engine pushes a snapshot of each linked pull request through the shell stream, but keeps it current only while a thread watches the pull request. `pullRequests.summary` and `pullRequests.checks` read the host, and every read carries the time the engine made it, so a saved answer the client paints first never beats a newer snapshot. The check list is read again every 45 seconds, and at once when a new snapshot arrives. A pull request that merged or closed stays so.

The host reports no start time for a check, so the board records when it first saw each check running, in local storage, and flags a check that has run longer than 20 minutes as **Stuck**. A check already running when the board first opened looks shorter than it is.

The Ticket tab's Readiness section lists the six merge-ready conditions the XEO workflow sets, computed live by `domain/readiness.ts`:

| Condition                                      | Holds when                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI green on the head                           | the ticket has a pull request, it is not closed, every check passed or was skipped, none is stuck, and the checks ran on the ticket's `headSha` when the engine reports it. With no checks reported, the ticket's `ci-local.txt` names the pull request's head on line 1 and every exit line is 0 |
| Independent reviews, introduced findings fixed | at least one role gave a verdict, and each role's latest verdict has no P0 or P1                                                                                                                                                                                                                  |
| Fix-round delta re-reviewed                    | the ticket has no fix rounds, or a review role's thread has a `round` at or past `fixRounds`                                                                                                                                                                                                      |
| Touched READMEs pass                           | the ticket's evidence folder holds a file whose name has `readme-check`, `readme-pass`, or `readme-lint`                                                                                                                                                                                          |
| Parent merged or ready                         | every `dependsOn` ticket is `merged`, or is `awaiting_approval` and the orchestrator's merge approval carries a note on the merge order                                                                                                                                                           |
| Smoke evidence named                           | the ticket's `smoke.txt` has a `Surface:` line that is not `none`. The card lists its PARTIAL, PROXY and NOT RUN items                                                                                                                                                                            |

A merge approval card shows the same six, each with the orchestrator's claim from `foryou.jsonl` beside the live result. When they differ, the row says so. The card finds its ticket by the `ticket` key of the item, or by a ticket key that stands alone in its title or id.

**Remove worktree** appears on a merged ticket whose `worktreePath` is still a worktree of the project. It runs T3's `vcs.removeWorktree`, the delete the Cleanup page uses, behind the same confirm.

The board also deletes a merged ticket's worktrees on its own. When an open board first reads `tickets.json`, and each time its text changes, `src/store/mergeCleanup.ts` plans every worktree of a `merged` ticket: its `worktreePath` and the worktrees of its own threads. It deletes a worktree only when git lists that exact path as a worktree, the ticket's threads are idle, no other open ticket or thread uses it, `git status` shows no changes, a named branch is pushed or in the default branch, and the board's `artifacts/` holds every file under the worktree's `.omp/artifacts/`, for every ticket key there, with no `<KEY>.partial/` left. The delete runs without force, so git refuses a dirty tree too. A detached HEAD is kept as `unlisted`, because the list names only worktrees on a branch, and a detached HEAD is the one case where a delete loses commits. A kept worktree shows `Kept: <reason>` in the ticket header. It is tried again on the next change to `tickets.json`, or the operator can use **Remove worktree**. Once every worktree is gone, the ticket's own threads are archived, never stopped, and never the orchestrator. The orchestrator copies the evidence before it writes `merged`, as its brief says.

The chip marks `board:pr-event` when a pull request's live state changes and `board:pr-painted` after the commit that shows a new reading.

A ticket's **Checks** section shows its pull request, laid out like Orca's checks view.

The header holds the number, which opens the pull request, the state badge, the title, the update time, **Refresh**, and a menu with **Open pull request** and **Copy link**. Under it a split button runs `pullRequests.runAction`. The button is **Mark ready for review** or **Update branch**, whichever T3 allows first. **Convert to draft** is in the dropdown. Each action shows the reason when it is off, such as `Checking mergeability` or `Base comparison unknown`. A merge is not offered, because it goes through the For-you approval.

The checks group is headed by a count per kind, such as `3 failing`, `1 running`, `8 passing`, and it folds. Each row has the status icon, the name, a **Required** badge, GitHub's description, and a link that opens the run in the browser tab. A pending check also shows `Running for` the time the board has watched it. T3 reports no start time, duration, or steps, so opening a row shows only the description and the link. The merge approval card draws its checks with the same rows.

The comments section reads `pullRequests.activity` and lists comments and review threads as cards, with a bot badge, reactions, and **All**, **Humans**, and **Bots** filters. Comment bodies are other people's text, so their images show only their alt text.

The pull request is read only while the Checks section is open.

## Browser

The sidebar's **Browser** row shows the browser as a tab of the main view, beside **Board** and the file tabs, the way Orca opens its browser in its main area. Each page is a tab with a globe, a close button, and the page's title, and the plus at the end of the strip opens a blank one. The tab strip is `src/files/MainTabStrip.tsx`, and `MainTabs.tsx` covers the canvas with the active tab. Which tab shows is `filesViewAtom`'s `active` file or its `surface`, never both. The right sidebar, `src/browser/PanelHost.tsx`, is the app's one right-side host, which the top bar's button shows and hides. Its tab strip, `PanelTabs.tsx`, draws icon tabs with an underline under the active one, the way Orca's right sidebar does. It holds **Chat** first, which opens when a board does, then **Ticket**, then **Files**. Every tab stays mounted behind the others, so the chat keeps its scroll, draft, and stream while another tab shows. `BoardScreen` draws the chat into the sidebar's slot with a portal, because the chat needs the board's artifacts and pull request context. A drag handle or the arrow keys on the sidebar's left edge set its width.

Inside Electron a page is a native tab. `electron/browserView.ts` gives each tab its own `WebContentsView` in a persistent `persist:agent-board-browser` session, shows only the active one, and places it over the rectangle the renderer reports with `board:browser-bounds`, which is the main view's page area while a page tab shows and nothing otherwise. The pages and their sessions stay alive while a file or the board shows. Every message is decoded with a schema before it is used, a page can only navigate to http(s) URLs, and the session denies every permission request. `src/browser/tabs.ts` keeps the tab list in a reducer, and `openInBrowser(url)` in `src/browser/browserTabs.ts` is the one entry point that opens a link: it shows the tab that already holds the URL, and opens a new tab otherwise. A ticket's pull request chip, the links an orchestrator names as evidence on a merge approval card, and a link in a markdown document, such as an artifact or a local preview URL, all go through it. Without Electron, as in `dev:web`, it opens the system browser instead.

The **Agents** button in the address bar opens an **Agent tabs** tab, which lists the browser tabs the open board's orchestrator and agents hold in the engine. It reads `preview.list` for each thread of the board's family, reads it again when `subscribePreviewEvents` reports a change, and shows the tab you pick through the engine's `/api/preview-stream/ws` stream, authorized by a media ticket from `resolveDeviceHubAccess`. The view is watch-only. The engine keeps an agent's tabs whether or not the board is open. Without Electron, **Browser** opens only this tab, with a form that sends a typed address to the system browser.

Pressing **Browser** marks `board:browser-click`, and the browser tab marks `board:browser-painted` after its first paint.

## Engine probe

`scripts/engine-probe.ts` checks ten engine behaviors the board depends on, each against a real Claude Code session, and writes the results to [docs/engine-findings.md](docs/engine-findings.md). It starts its own T3 engine in `/tmp/engine-probe/run-<id>/t3`, never touches `~/.t3`, and stops that engine and its provider sessions when it ends. It reads `~/.claude/settings.json` without changing it, and deletes the Claude Code project folders its scratch projects created. Build the engine once with `vp run --filter t3 build`, then run it from a checkout.

```sh
node apps/board/scripts/engine-probe.ts                  # all ten checks, rewrites docs/engine-findings.md
node apps/board/scripts/engine-probe.ts --checks B,C     # some checks; leaves the findings file alone
node apps/board/scripts/engine-probe.ts --findings out.md --run-dir /tmp/probe
```

Each check prints `PASS` or `FAIL` with its evidence lines and wall time. The exit code is 1 when any check fails. The probe uses the operator's Claude Code login and costs usage, so run it once per change.

## Settings

The gear in the sidebar footer opens a settings screen laid out like Orca's, with a category list on the left and the selected page on the right. The selector at the top picks All projects, which edits the engine's own defaults, or one project, which stores an override and marks each field Inherited or Overridden. Every field saves on blur through `server.updateSettings`, so T3 itself runs the result. **Settings, Text models** picks the model for generated text and the model for commit messages, pull requests, and branch names, over every provider instance the engine runs. A branch-name model left unset follows the first, and a saved instance that is off, not installed, or signed out shows a warning.

**Worktrees** edits the setup script that T3's `ProjectSetupScriptRunner` runs in a new worktree (the `runOnWorktreeCreate` action in `defaultProjectScripts`, stored per project in `projectSettingsOverrides`), the worktree location (`worktreesDirectory`, per machine), and branch naming (`branchNamingMode`, `branchNamePrefix`, `branchNameInstructions`).
When a board starts its orchestrator on a project with no setup script and no script list of its own, the board saves a default there. The default links the main checkout's ignored `.env` files into the worktree. **Add dependency install** on the Worktrees page adds a frozen install picked by the lockfile (`pnpm`, `bun`, `yarn`, or `npm ci`), which runs the repo's install scripts. Replace the script there, or empty the field to run nothing. Reset brings the default back at the next orchestrator start.

**Cleanup** edits the automatic worktree cleanup rules (`storageCleanup` for All projects, `projectSettingsOverrides.<id>.worktreeCleanup` for a project, which is Inherit, Off, or Custom). **Delete now** runs `server.runStorageCleanup` and lists the latest `StorageCleanupReport`, which `server.getStorageCleanupReport` also pushes. A cleanup waits 60 seconds after a thread settles before it removes the worktree, even with settled retention at 0 days. **Delete a worktree** removes one worktree with `vcs.removeWorktree` after a confirm. The list comes from the thread shells, checked against `vcs.listRefs`, so a folder that is already gone is not offered.

**Integrations** lists the source-control hosts the engine found and the task trackers, with a Connect Linear dialog that sends the key through `issueTrackers.connect` and a per-project team binding (`issueTrackers.bindProject`). **Add from tracker** on an orchestrator card searches GitHub or Linear issues (`issues.list`) and sends the orchestrator a ticket request that carries the issue's description and comments (`issues.detail`, `issues.comments`). A ticket whose `issue` field names a tracker issue shows its state and assignee as a chip. The orchestrator asks to change a tracker by posting a `tracker_write` For you item. Approve makes the change through the engine's issue tools, and Hold changes nothing.

## Tests

```sh
vp run --filter @agent-board/app typecheck
cd apps/board && vp test run
node --test apps/board/scripts/*.test.mjs
node --test apps/board/plugins/board-rules/engine/
```

## Plan

The build plan is [docs/plan.md](docs/plan.md).

## Chat formatting

The orchestrator chat renders replies the way T3's web chat does. Fenced code is colored with the `pierre-dark` theme through `@pierre/diffs`, with a language label, wrap toggle, and copy button. A streaming reply is cut into blocks at blank lines (`src/chat/markdownBlocks.ts`), so only its last block renders again as text arrives. Markdown also draws `$skill` chips, GitHub alerts, `<details>`, tables with copy, KaTeX math, and Mermaid diagrams (`pele`). A file link or inline path that names an artifact opens the artifact viewer, and a GitHub or Linear link opens a browser tab. The work log lists each tool call with its icon, and on open its command, output, changed file, and error. Each message has a copy button and the time the thread recorded it, and a running turn shows its elapsed time. The Content Security Policy allows `wasm-unsafe-eval` for the code highlighter.
