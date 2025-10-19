# Testing Guide

This document describes how to run tests for the ChillBill application.

## Overview

ChillBill has comprehensive test suites for both backend and frontend:

- **Backend**: pytest with async support
- **Frontend**: Vitest + React Testing Library

## Backend Tests

### Setup

Install test dependencies:

```bash
cd apps/backend
pip install -r requirements-dev.txt
```

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov

# Run specific test file
pytest tests/integration/test_auth.py

# Run specific test class
pytest tests/integration/test_auth.py::TestAuthLogin

# Run specific test
pytest tests/integration/test_auth.py::TestAuthLogin::test_login_success

# Run with verbose output
pytest -v

# Run and stop on first failure
pytest -x
```

### Test Structure

```
apps/backend/tests/
├── conftest.py              # Shared fixtures
├── integration/
│   ├── test_auth.py         # Authentication tests
│   ├── test_groups.py       # Group management tests
│   ├── test_expenses.py     # Expense tests
│   └── test_balances.py     # Balance calculation tests
└── unit/                    # Unit tests (if needed)
```

### Key Fixtures

- `client`: Async HTTP client for API testing
- `db_session`: Test database session
- `test_user`: Pre-created test user
- `test_user2`: Second test user
- `auth_token`: Authentication token for test_user
- `test_group`: Pre-created test group
- `test_group_with_members`: Group with multiple members

### Coverage

Generate HTML coverage report:

```bash
pytest --cov --cov-report=html
open htmlcov/index.html  # View in browser
```

## Frontend Tests

### Setup

Install test dependencies:

```bash
cd apps/web
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Run with UI (interactive)
npm run test:ui

# Run with coverage
npm run test:coverage

# Run in watch mode
npm test -- --watch

# Run specific test file
npm test -- Avatar.test.jsx

# Run tests matching pattern
npm test -- --grep "Modal"
```

### Test Structure

```
apps/web/src/tests/
├── setup.js                 # Test setup and global mocks
├── utils/
│   └── testUtils.jsx        # Custom render and mock utilities
├── components/
│   ├── Avatar.test.jsx      # Component tests
│   ├── Modal.test.jsx
│   └── Spinner.test.jsx
└── pages/
    └── LoginPage.test.jsx   # Page tests
```

### Testing Utilities

```javascript
import { renderWithProviders, mockUser, mockAuthContext } from '../utils/testUtils'

// Render with all providers (Router, Auth, Theme, Toast)
renderWithProviders(<MyComponent />)

// Render with authenticated user
renderWithProviders(<MyComponent />, {
  authValue: mockAuthContext,
})
```

### Coverage

Generate coverage report:

```bash
npm run test:coverage
open coverage/index.html  # View in browser
```

## Test Categories

### Backend Tests

#### 1. Authentication Tests (`test_auth.py`)
- User signup
- User login
- Token refresh
- Get current user
- Invalid credentials
- Duplicate email

#### 2. Groups Tests (`test_groups.py`)
- List groups
- Create group
- Get group details
- Delete group
- Add members (email & ghost)
- Remove members
- Permission checks

#### 3. Expenses Tests (`test_expenses.py`)
- List expenses with participants
- Create expense with splits
- Subset member selection
- Ghost member as payer
- Zero amount validation
- Update expense
- Delete expense

#### 4. Balances Tests (`test_balances.py`)
- Empty group balances
- Simple equal split
- Multiple expenses
- Ghost member payments
- Settlement suggestions

### Frontend Tests

#### 1. Component Tests
- **Avatar**: Initials, colors, ghost indicator
- **Modal**: Open/close, backdrop click, body scroll
- **Spinner**: Sizes, custom classes

#### 2. Page Tests
- **LoginPage**: Form validation, API calls, error handling

## Continuous Integration

### Pre-commit Checks

Create a pre-commit hook to run tests:

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running backend tests..."
cd apps/backend && pytest -x || exit 1

echo "Running frontend tests..."
cd apps/web && npm test -- --run || exit 1

echo "All tests passed! ✅"
```

Make it executable:

```bash
chmod +x .git/hooks/pre-commit
```

### GitHub Actions (Example)

```yaml
name: Tests

on: [push, pull_request]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: cd apps/backend && pip install -r requirements-dev.txt
      - run: cd apps/backend && pytest --cov

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: cd apps/web && npm install
      - run: cd apps/web && npm test -- --run
```

## Writing New Tests

### Backend Test Template

```python
import pytest
from httpx import AsyncClient

class TestMyFeature:
    async def test_feature_success(self, client: AsyncClient, auth_token: str):
        """Test successful feature usage."""
        response = await client.post(
            "/api/v1/my-endpoint",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"data": "value"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["key"] == "expected_value"
    
    async def test_feature_validation_error(self, client: AsyncClient, auth_token: str):
        """Test validation error handling."""
        response = await client.post(
            "/api/v1/my-endpoint",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"invalid": "data"},
        )
        
        assert response.status_code == 400
```

### Frontend Test Template

```javascript
import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../utils/testUtils'
import MyComponent from '../../components/MyComponent'

describe('MyComponent', () => {
  it('renders correctly', () => {
    renderWithProviders(<MyComponent />)
    
    expect(screen.getByText('Expected Text')).toBeInTheDocument()
  })

  it('handles user interaction', async () => {
    const user = userEvent.setup()
    const mockHandler = vi.fn()
    
    renderWithProviders(<MyComponent onAction={mockHandler} />)
    
    await user.click(screen.getByRole('button'))
    
    expect(mockHandler).toHaveBeenCalled()
  })
})
```

## Best Practices

### Backend

1. **Use fixtures**: Leverage conftest.py fixtures for setup
2. **Test edge cases**: Zero amounts, empty strings, invalid IDs
3. **Test permissions**: Verify users can't access others' data
4. **Use async/await**: All DB operations are async
5. **Clean test data**: Tests should be independent

### Frontend

1. **Use semantic queries**: `getByRole`, `getByLabelText` over `getByTestId`
2. **Test user behavior**: Click, type, navigate
3. **Mock API calls**: Use vi.mock for external dependencies
4. **Test accessibility**: Check ARIA labels, keyboard navigation
5. **Avoid implementation details**: Test what users see/do

## Debugging Tests

### Backend

```bash
# Run with pdb debugger
pytest --pdb

# Print output during tests
pytest -s

# Run last failed tests
pytest --lf
```

### Frontend

```bash
# Run with browser UI
npm run test:ui

# Debug specific test
npm test -- --inspect-brk Avatar.test.jsx
```

## Coverage Goals

Target coverage thresholds:

- **Backend**: 80%+ overall, 90%+ for critical paths
- **Frontend**: 70%+ overall, 80%+ for business logic

Critical areas requiring high coverage:
- Authentication & authorization
- Balance calculations
- Payment splitting logic
- Member management
- Data validation

## Resources

- [pytest documentation](https://docs.pytest.org/)
- [Vitest documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Best Practices](https://testingjavascript.com/)

