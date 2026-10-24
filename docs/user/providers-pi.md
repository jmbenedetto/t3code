# Pi

T3 Code can use your existing Pi coding agent installation while keeping Pi's models, auth,
extensions, skills, context files, and native session history.

## Set Up Pi

1. Install [Pi](https://pi.dev) on the machine running the T3 Code server. Pi requires Node.js
   22.19 or newer; its platform installers can install Node if needed. T3 Code supports Pi
   0.80.5 or newer.
2. Run `pi` in a terminal, then `/login` to connect your model provider or configure its API key.
3. Open T3 Code Settings, enable Pi, and refresh the provider.

For an npm installation, use:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

If `pi` is not on the server's `PATH`, set Pi's binary path to the executable. Provider environment
variables and launch arguments are also available for installations that need a custom agent
directory, endpoint, or model configuration. `--provider` must be paired with `--model`. T3 Code
rejects launch arguments that change Pi's execution mode or select a session because T3 owns those
parts of the process lifecycle.

On a remote or headless server, connect to that machine over SSH and run `pi`, then `/login`.
Open the authorization URL on your own computer. If the callback cannot reach the server,
paste the final redirect URL or authorization code back into Pi when prompted. You can also
set your model provider's API-key environment variable in the Pi instance's settings; mark
secret values as sensitive.

Update installer-managed Pi with `pi update`. If another package manager owns the installation,
update it through that manager instead. For example, a Nix profile installation uses
`nix profile upgrade pi`.

## What Carries Over

T3 Code discovers the models reported by Pi and exposes their supported thinking levels. The
thinking picker marks the discovered active model's configured level as its default without
overriding it. Other models keep their Pi defaults when no level is selected. Threads
use Pi's native session files for resume, rollback, and forks within the same Pi instance. Forks
preserve the native conversation through the selected turn in the destination workspace.
Switching providers uses portable conversation context. Extension
dialogs appear in the T3 Code composer, and the composer context meter follows Pi's own usage
reporting while a response streams and after it settles.

Pi loads its normal user and project extensions. Blocking `select`, `confirm`, `input`, and `editor`
dialogs work in T3 Code. Notifications appear in the work log during a turn and in the composer
while idle. Titles, keyed status lines, and string-array widgets appear in the web and mobile
composer; widgets keep their above/below-editor placement. Display state is bounded to keep
extension updates responsive. Editor-text updates appear as proposals with **Apply** and
**Dismiss**. Apply replaces the current draft, including an explicitly empty draft; updates never
overwrite typing automatically. These decorations are tied to the live native session.

## Use Pi Skills

Pi skills appear in the composer's `$` menu for the thread's workspace. Type `$` to select one or
more skills, or start a message with `/skill:name` followed by your request. Pi also advertises
skills to the model for automatic discovery. A skill with `disable-model-invocation: true` stays
available for explicit use without being advertised to the model.

Put each skill in a directory containing `SKILL.md` with `name` and `description` frontmatter.
Pi discovers:

- User skills in `~/.pi/agent/skills` and `~/.agents/skills` on the server.
- Project skills in `.pi/skills` in the session's working directory.
- Project `.agents/skills` in the working directory and its ancestors, stopping at the repository
  root when one exists.
- Additional skills configured through Pi settings, packages, or `--skill` launch arguments.

`PI_CODING_AGENT_DIR` changes Pi's user configuration directory. Project discovery uses the
thread's working directory, including its worktree, so a skill present only in another checkout
will not appear. Skill contents and supporting files stay on the server; no copy into T3 Code's
source or a GitHub fork is needed. Pi preserves skill name collisions and resolves references
relative to each skill's directory. See [Pi's skill documentation](https://pi.dev/docs/latest/skills).

Project skills and extensions follow [Pi's project trust rules](https://pi.dev/docs/latest/security#project-trust).
RPC mode skips unapproved project resources when Pi has no saved trust decision. Review the
project in Pi's terminal UI and use `/trust` if you want to save that decision. Alternatively,
`--approve` in Pi's T3 launch arguments grants trust for each launched process without saving a
decision; it enables all protected project resources, including extensions. T3 Code does not add
this flag or change your trust store automatically.

The running session supplies its own command and skill catalog, taking precedence over separate
workspace discovery. T3 refreshes that catalog when the native session is registered or resumed,
before a turn, and after it settles (including extension commands that consume input without a
model reply). An empty session catalog stays empty instead of falling back to another session's
skills. Before a session starts, menus use the provider's workspace discovery snapshot.

After editing or adding skills, use **Restart agent session**. The native conversation is resumed
and resources are loaded again; the menu refreshes from that process. Pi's terminal `/reload`
command is not an RPC builtin. Extensions that expose a reload command through Pi's command API
can reload resources in place; their updated menu is discovered when the command completes.
Pi does not emit a general command-catalog-changed RPC event; arbitrary asynchronous changes are
picked up at the next turn or session registration.

Pi's RPC interface cannot render custom terminal components, themes, keyboard shortcuts, or
editor component replacements. Text editor updates are supported as proposals, rather than
replacing the browser or native editor component. Extension commands, prompt templates, tool hooks, and the supported dialogs remain available.
Background title and content helpers run with extensions and tools disabled; models supplied only
by an extension cannot be used for those helpers.

## Permission Modes

T3 Code applies the composer permission mode through Pi's blocking tool hook:

- **Supervised** asks before commands, file changes, and extension tools. Read-only tools continue.
- **Auto-accept edits** allows Pi's edit and write tools, but asks before commands and extension
  tools.
- **Full access** allows tools without T3 Code approval prompts.

The **Auto** option is not shown for Pi because Pi does not expose an AI approval reviewer.
Threads that already stored Auto before Pi support was added behave and display as Supervised.

Changing the mode restarts the Pi provider session and resumes the same native conversation. The
policy covers Pi tool calls; it is not an operating-system sandbox, and code that a trusted Pi
extension runs outside a tool call remains governed by Pi's own extension trust model.
An extension that replaces a built-in read or edit tool requires confirmation under Supervised
or Auto-accept edits, even if it keeps the built-in tool's name. On older Pi versions that do not
report tool provenance, these tools conservatively require confirmation too.

T3 Code's `delegate_task` tool creates durable child threads in the shared subagent UI. If the user
installs Pi's example `subagent` extension, T3 Code also shows its task progress and results in that
UI. Pi runs those children without a session, so they cannot be opened or resumed as T3 Code
threads.

## Troubleshooting

- If Pi is unavailable, confirm that the configured binary runs on the server machine, then refresh
  the provider in Settings.
- If no models appear, open Pi directly and confirm its authentication and model configuration.
- If discovery cannot complete, T3 Code keeps Pi available with the `Pi default` model. Start a
  thread to let the interactive Pi session handle any startup prompt.
- If a project extension is missing, approve the project in Pi, then start a fresh provider session.
- If a project skill is missing from the `$` menu, approve the project in Pi and restart the agent
  session. Refresh the provider for menus that have no running session yet.
- The context meter appears once Pi reports usage for the thread. Some model providers only
  report usage when a response completes, so the meter can wait for the first reply.
