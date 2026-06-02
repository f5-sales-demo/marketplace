---
description: Start a local Docker dev server to preview docs
allowed_tools:
  - Bash
---

Start the local docs preview server using the shared
Docker build image.

Run this command:

```bash
docker run --rm -it \
  -v "$(pwd)/docs:/content/docs" \
  -p 4321:4321 \
  -e MODE=dev \
  ghcr.io/f5xc-salesdemos/docs-builder:latest
```

Then tell the user to open `http://localhost:4321`.
Note that file changes on the host require restarting
the container.
