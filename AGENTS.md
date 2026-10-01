# Development workflow

- User preference: after completing changes on `dev` and the relevant checks, commit and push those changes to `origin/dev` without asking again.
- This authorization covers `dev`; it does not authorize merging into `main` or deploying Production.
- Keep secrets and local environment files out of commits. Preserve unrelated work.
- Work moves between two machines. Before starting, pull `dev` and read `markdown/WORKLOG.md`; when done, add an entry there.
