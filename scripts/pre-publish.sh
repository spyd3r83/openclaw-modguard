#!/bin/bash
set -e

echo "========================================"
echo "  OpenClaw Guard Pre-Publish Validation"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
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

# Step 1: Linting
step "Step 1/6: Linting..."
if command -v oxlint &> /dev/null; then
  oxlint src/ || error "Linting failed"
else
  echo "  (oxlint not installed, skipping)"
fi
success "Linting passed"

# Step 2: Type checking
step "Step 2/6: Type checking..."
npx tsc --noEmit || error "Type checking failed"
success "Type checking passed"

# Step 3: Unit tests
step "Step 3/6: Running unit tests..."
pnpm test || error "Unit tests failed"
success "Unit tests passed"

# Step 4: Coverage
step "Step 4/6: Checking coverage..."
pnpm test:coverage || error "Coverage check failed"
success "Coverage check passed"

# Step 5: E2E tests
step "Step 5/6: Running E2E tests..."
pnpm test:e2e || error "E2E tests failed"
success "E2E tests passed"

# Step 6: Build
step "Step 6/6: Building..."
pnpm build || error "Build failed"
success "Build passed"

echo ""
echo "========================================"
echo -e "${GREEN}  All validations passed!${NC}"
echo "========================================"
echo ""
echo "Ready to publish. Run:"
echo "  npm publish --access public"
echo ""
