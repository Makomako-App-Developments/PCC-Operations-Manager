# Field Ops request timeout diagnostics

Job detail views fan out into these safe, searchable endpoint labels:

- `/api/jobs/:id` — core job data
- `/api/assets/:id` — core asset data
- `/api/jobs/:id/photos` — optional photo metadata
- `/api/jobs/:id/task-skip-reasons` — optional task-skip data
- `/api/schedule/week` — optional route-order check

The mobile app records a `field-ops.request` Sentry breadcrumb for every
attempt. Each breadcrumb has `method`, `endpoint`, `jobId` (the opaque record
identifier only), `durationMs`, `status` when a response exists, `retryCount`,
and `failureCategory`. The generated API client covers job, asset, and
schedule hooks; the detail screen uses the same recorder for photo and
task-skip requests. A network/timeout failure has no HTTP status.

The API records the matching `field-ops.server-request` breadcrumb and emits a
`Field Ops request diagnostic` Sentry event for HTTP failures or requests
taking at least one second. Server event tags are:

- `field_ops_endpoint`
- `field_ops_status`

The event context contains the same safe request fields and server duration.
The API log line begins with `[field-ops-request]` and contains the same JSON
object, which allows correlation when Sentry has only a client-side network
failure. Server duration includes route database and object-storage work,
including photo metadata lookup and upload-serving middleware.

## Sentry query / dashboard

Create a dashboard widget using:

```text
message:"Field Ops request diagnostic"
```

Break down by `field_ops_endpoint`, sort by `p95(durationMs)` or
`p95(field_ops_request.durationMs)`, and add a count widget filtered by
`field_ops_endpoint`. For the affected-view percentage, use the mobile
`field-ops.request` breadcrumb events and compare distinct `jobId` values with
`failureCategory:timeout OR failureCategory:network` against distinct job-view
errors in the same release/time window. A timeout with no matching server
event is a network-level failure; a matching slow server event identifies the
request and endpoint responsible.

No request URL, query string, headers, credentials, body, photo URL, or photo
content is captured.