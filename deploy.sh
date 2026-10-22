npm version patch --no-git-tag-version &&
node scripts/update-manifest.mjs &&
npm run check:manifest &&
VERSION=$(node -p "require('./package.json').version") &&
git add package.json package-lock.json MANIFEST.sha256 &&
git commit -m "v$VERSION" &&
git tag "v$VERSION" &&
npm pack --dry-run &&
npm publish --access public --browser=false --loglevel verbose