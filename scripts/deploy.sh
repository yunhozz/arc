npm login &&
npm version patch --no-git-tag-version &&
node scripts/update-manifest.mjs &&
npm run check:manifest &&
VERSION=$(node -p "require('./package.json').version") &&
git add package.json package-lock.json MANIFEST.sha256 &&
git commit -m "v$VERSION" &&
git tag "v$VERSION" &&
RELEASE_DIR=$(mktemp -d /tmp/arc-release.XXXXXX) &&
RELEASE_DIR=$(cd "$RELEASE_DIR" && pwd -P) &&
npm run pack:release -- --out-dir "$RELEASE_DIR" &&
node scripts/verify-release.mjs --out-dir "$RELEASE_DIR" --name @yunhozz/arc --version "$VERSION" &&
npm publish "$RELEASE_DIR/arc-release.tgz" --access public --loglevel verbose
