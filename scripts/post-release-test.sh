#!/bin/bash
set -e

VERSION="${1:-0.1.0}"

echo "========================================"
echo "  Post-Release Verification for v${VERSION}"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

step() {
  echo ""
  echo -e "${GREEN}→ $1${NC}"
}

error() {
  echo -e "${RED}✗ $1${NC}"
  exit 1
}

success() {
  echo -e "${GREEN}✓ $1${NC}"
}

warn() {
  echo -e "${YELLOW}! $1${NC}"
}

# Create temporary test directory
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

cd "$TEST_DIR"

# Step 1: Verify package on npm
step "Step 1: Verifying package on npm..."
npm view openclaw-modguard@${VERSION} || error "Package not found on npm"
success "Package found on npm"

# Step 2: Install package
step "Step 2: Installing package..."
npm init -y > /dev/null 2>&1
npm install openclaw-modguard@${VERSION} || error "Failed to install package"
success "Package installed"

# Step 3: Check package contents
step "Step 3: Checking package contents..."
if [ -d "node_modules/openclaw-modguard/dist" ]; then
  success "dist/ directory present"
else
  error "dist/ directory missing"
fi

if [ -f "node_modules/openclaw-modguard/README.md" ]; then
  success "README.md present"
else
  warn "README.md missing"
fi

if [ -f "node_modules/openclaw-modguard/CHANGELOG.md" ]; then
  success "CHANGELOG.md present"
else
  warn "CHANGELOG.md missing"
fi

# Step 4: Test CLI (if available)
step "Step 4: Testing CLI..."
if [ -f "node_modules/.bin/openclaw-modguard" ]; then
  node_modules/.bin/openclaw-modguard --help > /dev/null 2>&1 && success "CLI works" || warn "CLI help failed"
else
  warn "CLI binary not found"
fi

# Step 5: Test module import
step "Step 5: Testing module import..."
cat > test-import.mjs << 'EOF'
import { Detector } from 'openclaw-modguard';

const detector = new Detector();
const results = detector.detect('test@example.com');

if (results.length > 0 && results[0].pattern === 'email') {
  console.log('Module import and detection works!');
  process.exit(0);
} else {
  console.error('Detection failed');
  process.exit(1);
}
EOF

node test-import.mjs || error "Module import test failed"
success "Module import works"

echo ""
echo "========================================"
echo -e "${GREEN}  All post-release verifications passed!${NC}"
echo "========================================"
echo ""
echo "Package v${VERSION} is verified and ready for use."
echo ""
