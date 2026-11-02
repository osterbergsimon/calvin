# Contributing to Calvin

The contributing guide lives at the root of the repository, so GitHub, pull
requests, and this site all point at one source of truth instead of two copies
that drift apart.

**→ [CONTRIBUTING.md](https://github.com/osterbergsimon/calvin/blob/develop/CONTRIBUTING.md)**

It covers:

- development setup (Docker dev stack or the native toolchain)
- the branch model — branch from `develop`, pull requests into `develop`,
  releases promoted to `main`
- conventional commit messages
- the quality gates from the `Makefile` (`make lint`, `make format`,
  `make type-check`, `make test`, `make test-scripts`) and the docs build
- where plugin work belongs (the separate
  [calvin-plugins](https://github.com/osterbergsimon/calvin-plugins) repository)
- how pull requests are reviewed, and the house rules review will check

## Related

- [Code of Conduct](https://github.com/osterbergsimon/calvin/blob/develop/CODE_OF_CONDUCT.md)
- [Security policy](https://github.com/osterbergsimon/calvin/blob/develop/SECURITY.md) —
  report vulnerabilities privately, never in a public issue
- [Development quickstart](setup/QUICKSTART_DEVELOP.md)
- [Getting started](setup/GETTING_STARTED.md)
