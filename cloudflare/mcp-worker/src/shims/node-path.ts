function resolve(...parts: string[]): string {
  return parts.join("/");
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

function dirname(path: string): string {
  const parts = path.split(/[/\\]/);
  parts.pop();
  return parts.join("/") || ".";
}

export { basename, dirname, resolve };
export default { basename, dirname, resolve };
