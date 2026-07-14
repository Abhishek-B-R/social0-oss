class Social0 < Formula
  desc "Official CLI for Social0 — manage social media from your terminal"
  homepage "https://github.com/Abhishek-B-R/social0-cli"
  url "https://registry.npmjs.org/social0/-/social0-0.1.2.tgz"
  sha256 "f71fe51fa100fd09f47c5c2a9eecc1eb06bdb378a61db5b5a87c5ca87584b464"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "social0", shell_output("#{bin}/social0 version")
  end
end
