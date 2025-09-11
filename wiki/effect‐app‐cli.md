# Effect-App CLI (`pnpm effa`)

A modern, type-safe CLI for managing Effect-App projects, built with **Effect-TS** for maximum reliability and composability .

## Installation

```bash
# Install dependencies
pnpm add @effect-app/cli

# Use the CLI via one of the three available aliases
pnpm effa <command>
pnpm effect-app <command>
pnpm effect-app-cli <command>
# or directly
node packages/cli/dist/index.js effa <command>
```

## Command Overview

| Command | Description |
|---------|-------------|
| `effa ue` | Update Effect/Effect-App packages with interactive selection |
| `effa up` | Update all packages except Effect/Effect-App ecosystem |
| `effa link` | Link local effect-app packages using file resolutions |
| `effa unlink` | Remove local links and restore packages from registry |
| `effa index-multi` | Monitor controller and index files for auto-eslint fixes |
| `effa packagejson` | Generate and monitor export mappings for root package.json |
| `effa packagejson-packages` | Generate and monitor export mappings for all packages |
| `effa wiki` | Interactive wiki submodule management (sync/update) |
| `effa init-wiki` | **[Maintainer Only]** One-time wiki submodule setup |
| `effa nuke` | Nuclear cleanup - remove all generated files and directories |

## Available Commands

### `effa ue` - Update Effect/Effect-App

Updates Effect and Effect-App packages using npm-check-updates.

```bash
pnpm effa ue
```

You'll get an interactive menu to choose what to update:
- **effect-app**: Only `effect-app` and `@effect-app/*` packages
- **effect**: Only `effect`, `@effect/*`, `@effect-atom/*` packages
- **both**: Both groups

The command automatically runs `pnpm i` after updating.

### `effa up` - Update All Packages (Except Effect/Effect-App)

Updates all packages to their latest versions, excluding Effect and Effect-App ecosystem packages.

```bash
pnpm effa up
```

**What it excludes:**
- `effect` - Core Effect package
- `@effect/*` - All Effect ecosystem packages
- `@effect-atom/*` - Effect Atom packages
- `effect-app` - Core Effect-App package
- `@effect-app/*` - All Effect-App packages
- Plus any packages listed in `.ncurc.json` reject configuration

**What it does:**
1. Reads existing `.ncurc.json` to preserve configured reject patterns
2. Combines them with Effect/Effect-App package exclusions
3. Runs `ncu -u` with all reject patterns at workspace root
4. Runs `ncu -u` recursively in all workspace packages
5. Automatically runs `pnpm i` after updating

This command is perfect when you want to keep your Effect and Effect-App packages at specific versions while updating everything else (dependencies like lodash, axios, testing libraries, etc.).

### `effa link` - Link Local Packages

Links local effect-app packages using file resolutions.

```bash
pnpm effa link [path-to-effect-app-libs]
```

**Parameters:**
- `path-to-effect-app-libs`: Path to effect-app-libs directory (default: `../../effect-app/libs`)

**What it does:**
1. Modifies `package.json` adding resolutions with `file:` protocol
2. Runs `pnpm i` to apply changes
3. Links all specified effect-app packages

### `effa unlink` - Unlink Local Packages

Removes local links and restores packages from registry.

```bash
pnpm effa unlink
```

**What it does:**
1. Removes all `file:` resolutions for effect-app packages
2. Runs `pnpm i` to restore packages from registry

### `effa index-multi` - Index Files Monitoring

Monitors controller files and index files for auto-fix with eslint.

```bash
pnpm effa index-multi
```

**What it monitors:**
- Directory: `./api/src`
- Files with `.controllers.` pattern
- Files `controllers.ts` and `routes.ts`

**What it does:**
1. **Controller monitoring**: when a `.controllers.` file changes, searches for `controllers.ts` or `routes.ts` in parent directories and fixes them with eslint
2. **Root monitoring**: when any file changes, fixes `index.ts` in the root directory

### `effa packagejson` - Export Mappings Root

Generates and monitors export mappings for root package.json.

```bash
pnpm effa packagejson
```

**What it does:**
1. Generates export mappings from TypeScript files in `./src`
2. Monitors `./src` directory for changes
3. Automatically regenerates exports when files change

### `effa packagejson-packages` - Export Mappings Packages

Generates and monitors export mappings for all packages in monorepo.

```bash
pnpm effa packagejson-packages
```

**What it does:**
1. Scans `packages/` directory
2. Finds all packages with `package.json` and `src/`
3. Excludes: `*eslint-codegen-model`, `*vue-components`
4. Generates exports for all found packages
5. Monitors each package for changes

### `effa wiki` - Documentation Wiki Management

Manages the documentation wiki git submodule with interactive action selection for updating and synchronizing documentation.

```bash
pnpm effa wiki
```

**⚠️ ACHTUNG - Important Git Submodule Behavior:**
> **Submodule operations will change the commit reference in the main project repository!**
> When you run `effa wiki`, the git submodule reference in your main project may be updated to point to the latest commit in the submodule.
> **The CLI will automatically detect these changes and offer to commit the new submodule reference** in the main project repository.

**Interactive Selection:**
When you run the command, you'll get a menu to choose the action:
- **sync**: Initialize and update the documentation submodule from remote  
- **update**: Pull latest changes, commit and push changes within the submodule

**Available Actions:**

#### `sync`
Updates or initializes the documentation submodule from remote:

💡 **Run this periodically to keep your local documentation up-to-date**

**What it does:**
- Runs `git submodule update --init --recursive --remote doc`
- Pulls the latest changes from the remote submodule repository
- Automatically detects if submodule reference changed in main repo
- Offers to commit the submodule reference changes

#### `update`
Interactive workflow to update and commit changes within the submodule:

**What it does:**
1. Pulls latest changes from remote submodule (same as sync)
2. Prompts for a commit message (default: "update doc")  
3. Stages all changes in the submodule
4. Commits and pushes changes to the remote submodule repository
5. Automatically detects if submodule reference changed in main repo
6. Offers to commit the submodule reference changes

### `effa init-wiki` - Wiki Submodule Setup

**⚠️ PROJECT MAINTAINER ONLY - ONE-TIME SETUP COMMAND**

Sets up the wiki submodule for the project. This is a standalone command that should only be run once in the project's entire history by a project maintainer.

```bash
pnpm effa init-wiki
```

**What it does:**
1. **Safety checks**: Verifies no existing `doc` directory exists in git index
2. **Confirmation prompt**: Requires explicit confirmation with detailed warnings
3. **Project detection**: Extracts project name from git remote URL (supports SSH and HTTPS)
4. **Manual override**: Allows manual project name input or modification
5. **Submodule setup**: Creates `.gitmodules` configuration file
6. **Repository integration**: Adds the wiki submodule (`../{project-name}.wiki.git`) 
7. **Automatic commit**: Commits the submodule configuration to the main repository

**⚠️ CRITICAL WARNINGS:**
- **NOT for local development**: This is NOT the command for local submodule initialization!
- **ONE-TIME ONLY**: Should only be run ONCE by a project maintainer during initial project setup
- **Repository modification**: Modifies the main repository by adding submodule configuration  
- **Use `effa wiki sync` instead** for normal local development submodule initialization

**Safety Features:**
- Checks for existing `doc` directory conflicts before proceeding
- Requires explicit user confirmation with detailed warnings
- Provides clear guidance for different scenarios
- Auto-detects project name but allows manual override

**Example workflow:**
```bash
# Project maintainer runs this ONCE during project setup:
pnpm effa init-wiki
# ⚠️  IMPORTANT: This is a one-time project setup command!
# This command will initialize the wiki submodule for this project...
# Detected project name from git remote: my-awesome-project
# Please confirm or modify the project name: my-awesome-project
# ✅ Wiki submodule initialized successfully

# Later, other developers use:
pnpm effa wiki
# Choose: sync
```

### `effa nuke` - Nuclear Cleanup

Performs deep cleanup by removing all generated files and directories from the workspace.

```bash
pnpm effa nuke [options]
```

**Options:**
- `--dry-run`: Show what would be deleted without actually deleting anything
- `--store-prune`: Also prune the pnpm store after cleanup

**What it removes:**
- **Directories**: `node_modules`, `.nuxt`, `dist`, `.output`, `.nitro`, `.cache`, `test-results`, `test-out`, `coverage`
- **Files**: `*.log`, `*.tsbuildinfo`

**Examples:**
```bash
# Preview what would be deleted
pnpm effa nuke --dry-run

# Standard cleanup
pnpm effa nuke

# Deep cleanup including pnpm store
pnpm effa nuke --store-prune
```

**⚠️ Warning:** This command permanently deletes files and directories. Use `--dry-run` first to preview the cleanup.

## Wrap Functionality

All monitoring commands support **wrap** functionality to execute child processes alongside the main command. This allows you to execute any long-running process where you want monitoring to continue as long as the wrapped process is active. There are two ways to specify the wrap command:

### Option-based Wrapping
```bash
# Using the --wrap/-w option
pnpm effa packagejson-packages --wrap "npm run dev"
pnpm effa index-multi -w "echo 'monitoring started'"
```

### Argument-based Wrapping (Recommended)
```bash
# Everything after the command name becomes a child process
pnpm effa watch tsc --build ./tsconfig.all.json --watch
pnpm effa packagejson-packages npm run dev
pnpm effa index-multi echo "monitoring started"
```

**Why argument-based is better:**
Consider this package.json setup:
```json
{
  "scripts": {
    "build:tsc": "effect-app-cli packagejson-packages tsc --build ./tsconfig.all.json",
    "watch": "pnpm build:tsc --watch"
  }
}
```

When you run `pnpm watch`, the `--watch` flag gets passed as an argument to the CLI command. With argument-based wrapping, `tsc --build ./tsconfig.all.json --watch` becomes the complete child process command.

If you tried to use `--wrap "tsc --build ./tsconfig.all.json"` instead, the `--watch` flag from the npm script would be lost, breaking the intended behavior.


**How it works:**
1. The CLI command starts and performs its main functionality (monitoring, etc.)
2. **After** the main command is running, it spawns the wrap command as a child process
3. The child process lifecycle is tied to the CLI command - when you stop the CLI (Ctrl+C), the child process is also terminated
4. **Argument-based wrapping takes priority** - if you provide both arguments and the `--wrap` option, the arguments are used

**Key design principle:** The monitoring lifetime is scoped to the child command's lifetime:
- If the wrapped command is one-shot (exits immediately), the monitoring runs once and stops
- If the wrapped command runs continuously (like a watch mode or server), the monitoring continues until the wrapped command is terminated