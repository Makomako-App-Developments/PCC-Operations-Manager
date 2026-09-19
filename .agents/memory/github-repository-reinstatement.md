---
name: Reinstated GitHub repository pushes
description: Git authentication and workflow-scope constraints encountered when repopulating a deleted and recreated repository.
---

For a large first push to a reinstated GitHub repository, use the normal `origin` remote and branch tracking. Replit's Git pane may time out on several hundred megabytes even after authentication is repaired.

**Why:** The Git pane timed out on a roughly 382 MB transfer. Terminal HTTPS did not receive the Git pane or GitHub App credential. A deploy key created through an OAuth connection inherited the OAuth app's missing `workflow` scope and GitHub rejected `.github/workflows/*`. A deploy key added manually in repository settings successfully pushed the full history and workflow files.

**How to apply:** Preserve history unless the user approves rewriting it. If the Git pane times out and terminal HTTPS lacks credentials, use a temporary repository-only SSH deploy key added directly by an administrator with write access. Push over `ssh.github.com:443`, verify the remote SHA, then immediately delete the GitHub deploy key and both local key files.