# Packaging (Homebrew + Scoop)

Assets for distributing the `social0` CLI beyond npm.

## Homebrew

Create a tap (one-time):

```bash
gh repo create Abhishek-B-R/homebrew-tap --public --description "Homebrew tap for Social0 CLI"
git clone https://github.com/Abhishek-B-R/homebrew-tap.git
cd homebrew-tap
mkdir -p Formula
cp /path/to/social0-cli/packaging/homebrew/social0.rb Formula/social0.rb
git add Formula/social0.rb
git commit -m "feat: add social0 formula"
git push -u origin HEAD
```

Users install with:

```bash
brew tap Abhishek-B-R/tap
brew install social0
social0 version
```

When you publish a new npm version, update `url`, `sha256`, and the formula `version` (Homebrew uses the tarball filename / url):

```bash
curl -fsSL "https://registry.npmjs.org/social0/-/social0-X.Y.Z.tgz" | shasum -a 256
```

## Scoop (Windows)

Create a bucket (one-time):

```powershell
gh repo create Abhishek-B-R/scoop-bucket --public --description "Scoop bucket for Social0 CLI"
git clone https://github.com/Abhishek-B-R/scoop-bucket.git
cd scoop-bucket
copy \path\to\social0-cli\packaging\scoop\social0.json social0.json
git add social0.json
git commit -m "feat: add social0 manifest"
git push -u origin HEAD
```

Users install with:

```powershell
scoop bucket add social0 https://github.com/Abhishek-B-R/scoop-bucket
scoop install social0
social0 version
```

## install.sh

```bash
curl -fsSL https://social0.app/install.sh | sh
```

Source of truth: [`install.sh`](../install.sh) in this repo (also served from the Social0 website `public/install.sh`).
