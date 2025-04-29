#!/bin/bash

set -e

TMP_DIR=$(mktemp -d)
cd $TMP_DIR

git clone https://github.com/seinmyung25/summary-git.git
cd summary-git
pnpm install
pnpm build
pnpm link

echo "✅ summary-git installed globally"
