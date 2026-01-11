# Contributing to Calvin

Thank you for your interest in contributing to Calvin! This document provides guidelines and instructions for contributing.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Create a branch** for your changes
4. **Make your changes** and test them
5. **Submit a pull request**

## Development Setup

See the [Development Setup Guide](setup/QUICKSTART_DEVELOP.md) for detailed instructions on setting up your development environment.

## Code Style

### Backend (Python)

- Use **Python 3.11+**
- Follow **PEP 8** style guidelines
- Use **ruff** for linting and formatting
- Run `uv run ruff check .` and `uv run ruff format .` before committing

### Frontend (Vue 3)

- Use **Vue 3 Composition API**
- Follow Vue style guide
- Use **ESLint** for linting
- Run `npm run lint` before committing

## Testing

- Write tests for new features
- Ensure all tests pass before submitting
- Run `uv run pytest` for backend tests
- Run `npm run test` for frontend tests

## Documentation

- Update documentation when adding features
- Follow the existing documentation structure
- Use clear, concise language
- Include examples where helpful

## Pull Requests

- Provide a clear description of changes
- Reference any related issues
- Ensure all tests pass
- Update documentation as needed

## Questions?

If you have questions, please open an issue on GitHub.

Thank you for contributing to Calvin!
