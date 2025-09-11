# Random bag of tricks

## Teach yourself quickly what package manager to use

```zsh
NPM_PATH=$(which npm)
npm () {
  if [ -e PNPM-lock.yaml ]
  then
    echo "Please use PNPM with this project"
  elif [ -e yarn.lock ]
  then
    echo "Please use Yarn with this project"
  else
    $NPM_PATH "$@"
  fi
}

YARN_PATH=$(which yarn)
yarn () {
  if [ -e PNPM-lock.yaml ]
  then
    echo "Please use PNPM with this project"
  elif [ -e package-lock.json ]
  then
    echo "Please use NPM with this project"
  else
    $YARN_PATH "$@"
  fi
}
```

## Git tricks

### Aliases

Aliases to easily update your main branch, e.g after PR was merged.
It updates the branch in the background before switching to it, so that editor/tooling experience the least changes.

- `upc`: update specified branch (defaults to `main`), and switch to it
- `upd`: update specified branch (defaults to `main`)

```
[alias]
	upc = "!git updonly \"${1:-main}\" && git checkout \"${1:-main}\" || git pull #"
	upd = "!git updonly \"${1:-main}\" || git pull #"
	updonly = "!git fetch `git gitremote \"$1\"` \"$1\":\"$1\" #"
	gittrack = "!git for-each-ref --format='%(upstream:short)' $(git rev-parse --symbolic-full-name \"$1\") #"
	gitremote = "!git gittrack \"$1\" | sed 's@/.*@@' #"
```

### Other recommendations

```
[pull]
	rebase = true
[rebase]
	autoStash = true
[init]
	defaultBranch = main
```

## Znap - Oh My Posh and pnpm auto completion support

Install oh-my-posh, install pnpm autocomple zsh, and use:

```zsh
#znap
# Download Znap, if it's not there yet.
[[ -f ~/Git/zsh-snap/znap.zsh ]] ||
    git clone --depth 1 -- \
        https://github.com/marlonrichert/zsh-snap.git ~/Git/zsh-snap

source ~/Git/zsh-snap/znap.zsh  # Start Znap

# `znap prompt` makes your prompt visible in just 15-40ms!
#znap prompt sindresorhus/pure

# `znap source` automatically downloads and starts your plugins.
znap source marlonrichert/zsh-autocomplete
znap source zsh-users/zsh-autosuggestions
znap source zsh-users/zsh-syntax-highlighting

# `znap eval` caches and runs any kind of command output for you.
znap eval iterm2 'curl -fsSL https://iterm2.com/shell_integration/zsh'

# `znap function` lets you lazy-load features you don't always need.
znap function _pyenv pyenv 'eval "$( pyenv init - --no-rehash )"'
compctl -K    _pyenv pyenv

znap eval ohmyposh 'oh-my-posh --init --shell zsh --config ~/jandedobbeleer.omp.json'
znap prompt

source $XDG_CONFIG_HOME/tabtab/zsh/pnpm.zsh
```