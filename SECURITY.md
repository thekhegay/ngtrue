# Security policy

## Supported versions

The latest minor of the current major receives fixes. Older lines do not.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | yes       |

## Reporting a vulnerability

Report privately through GitHub's [security advisories](https://github.com/thekhegay/ngtrue/security/advisories/new)
rather than in an issue.

ngtrue runs inside builds and test suites, so the interesting reports are the
ones where a check reads something it should not, or where a crafted manifest or
source file makes it execute code. Include the manifest or fixture that triggers
it and the version you ran.

Expect a first reply within a week.
