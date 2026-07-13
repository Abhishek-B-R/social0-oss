export function generateCompletion(shell: string): string {
  switch (shell) {
    case "bash":
      return bashCompletion();
    case "zsh":
      return zshCompletion();
    case "fish":
      return fishCompletion();
    case "powershell":
      return powershellCompletion();
    default:
      console.error(`Unsupported shell: ${shell}`);
      console.error("Supported: bash, zsh, fish, powershell");
      process.exit(1);
  }
}

function bashCompletion(): string {
  return `# Social0 CLI bash completion
_social0_completions() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  opts="login logout whoami passphrase accounts post publish schedule upload status drafts config doctor version update completion link watch logs export import suggest improve hashtags examples help"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
    return 0
  fi

  case "\${COMP_WORDS[1]}" in
    accounts)
      COMPREPLY=( $(compgen -W "list connect disconnect" -- \${cur}) )
      ;;
    post)
      COMPREPLY=( $(compgen -W "create edit delete list show init" -- \${cur}) )
      ;;
    drafts)
      COMPREPLY=( $(compgen -W "list delete publish schedule" -- \${cur}) )
      ;;
    config)
      COMPREPLY=( $(compgen -W "get set" -- \${cur}) )
      ;;
    passphrase)
      COMPREPLY=( $(compgen -W "status set remove" -- \${cur}) )
      ;;
    completion)
      COMPREPLY=( $(compgen -W "bash zsh fish powershell" -- \${cur}) )
      ;;
  esac
}
complete -F _social0_completions social0
`;
}

function zshCompletion(): string {
  return `#compdef social0

_social0() {
  local -a commands
  commands=(
    'login:Authenticate with API key'
    'logout:Remove stored credentials'
    'whoami:Show current user info'
    'passphrase:Manage local credential passphrase'
    'accounts:Manage connected accounts'
    'post:Create and manage posts'
    'publish:Publish posts'
    'schedule:Schedule posts'
    'upload:Upload media files'
    'status:Check publish job status'
    'drafts:Manage drafts'
    'config:CLI configuration'
    'doctor:Run diagnostics'
    'version:Show version'
    'update:Check for updates'
    'completion:Generate shell completions'
  )
  _describe 'command' commands
}

compdef _social0 social0
`;
}

function fishCompletion(): string {
  return `# Social0 CLI fish completion
complete -c social0 -f
complete -c social0 -n "__fish_use_subcommand" -a "login" -d "Authenticate"
complete -c social0 -n "__fish_use_subcommand" -a "logout" -d "Remove credentials"
complete -c social0 -n "__fish_use_subcommand" -a "whoami" -d "Show user info"
complete -c social0 -n "__fish_use_subcommand" -a "passphrase" -d "Manage credential passphrase"
complete -c social0 -n "__fish_use_subcommand" -a "accounts" -d "Manage accounts"
complete -c social0 -n "__fish_use_subcommand" -a "post" -d "Manage posts"
complete -c social0 -n "__fish_use_subcommand" -a "publish" -d "Publish posts"
complete -c social0 -n "__fish_use_subcommand" -a "schedule" -d "Schedule posts"
complete -c social0 -n "__fish_use_subcommand" -a "upload" -d "Upload media"
complete -c social0 -n "__fish_use_subcommand" -a "status" -d "Job status"
complete -c social0 -n "__fish_use_subcommand" -a "drafts" -d "Manage drafts"
complete -c social0 -n "__fish_use_subcommand" -a "config" -d "Configuration"
complete -c social0 -n "__fish_use_subcommand" -a "doctor" -d "Diagnostics"
complete -c social0 -n "__fish_use_subcommand" -a "version" -d "Show version"
complete -c social0 -n "__fish_use_subcommand" -a "completion" -d "Shell completions"
complete -c social0 -n "__fish_use_subcommand" -a "link" -d "Link project"
complete -c social0 -n "__fish_use_subcommand" -a "watch" -d "Watch queue"
complete -c social0 -n "__fish_use_subcommand" -a "logs" -d "Live logs"
`;
}

function powershellCompletion(): string {
  return `Register-ArgumentCompleter -Native -CommandName social0 -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  @('login','logout','whoami','accounts','post','publish','schedule','upload','status','drafts','config','doctor','version','update','completion','link','watch','logs','export','import','suggest','improve','hashtags','examples') | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
  }
}
`;
}
