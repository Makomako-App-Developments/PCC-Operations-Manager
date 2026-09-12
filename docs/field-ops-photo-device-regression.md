# Field Ops photo device regression

This is the release check for native and mobile-web photo transport. The native
matrix must be run on one physical iOS phone and one physical Android phone. A
web preview, simulator, or emulator does not verify picker URI lifetime, native
multipart behavior, or OS process storage. The mobile-web matrix must be run in
Safari on a physical iPhone against the published Field Ops URL because Safari
IndexedDB behavior is part of the transport.

## Before the run

1. Use the current Field Ops build and a test account that can create:
   - one scheduled job photo;
   - one reactive report photo;
   - one Storm Patrol job photo;
   - one Storm Patrol observation photo;
   - one audit fail photo.
2. Take a fresh photo for every case so the expected file can be identified
   without recording a person's face or other private information.
3. Open the server log/Sentry view for `Field Ops request diagnostic` and
   `[field-ops-request]`. Diagnostics are intentionally limited to method,
   normalized endpoint, opaque record ID, duration, status, retry count, and
   failure category. Do not paste tokens, URLs, captions, filenames, or image
   data into a bug report.
4. Record the app version, OS version, device model, network condition, and
   result in the matrix below. Do not record an account email or device
   identifier.

## Test matrix

Run each row on both iOS and Android.

| Flow | Online upload | Token expiry during upload | Offline queue → force-close → reconnect | Server result |
| --- | --- | --- | --- | --- |
| Scheduled job | ☐ | ☐ | ☐ | ☐ |
| Reactive report | ☐ | ☐ | ☐ | ☐ |
| Storm Patrol job (before and after) | ☐ | ☐ | ☐ | ☐ |
| Storm Patrol observation | ☐ | ☐ | ☐ | ☐ |
| Audit fail evidence | ☐ | ☐ | ☐ | ☐ |

### Mobile Safari matrix

Run these rows in Safari on a physical iPhone. Use a normal browsing tab, then
repeat the storage-failure case in Private Browsing.

| Storm Patrol web flow | Online upload | Offline queue → close tab → reconnect | Server result | Local cleanup |
| --- | --- | --- | --- | --- |
| Job before and after photos | ☐ | ☐ | ☐ | ☐ |
| General observation photo | ☐ | ☐ | ☐ | ☐ |
| Add photos to an already completed job | ☐ | ☐ | ☐ | ☐ |
| Legacy unavailable-photo discard | N/A | N/A | ☐ | ☐ |
| Storage unavailable/quota failure | N/A | ☐ | N/A | ☐ |

## Procedure for each flow

### 1. Online upload

Take or select one photo, submit the record, and wait for the success state.
Reload the detail/report view and confirm the photo is present. Confirm the
local queue has no item for the upload.

### 2. Token expiry during upload

Start an upload and invalidate/expire the test session immediately before the
multipart request reaches the server. The app must refresh the bearer token,
rebuild the multipart body, and retry without asking the user to select the
photo again. Confirm one server photo record and an empty local queue.

The matching diagnostic should show the normalized photo endpoint and a
successful retry count. It must not contain the bearer token or multipart
body.

### 3. Offline queue, restart, and reconnection

1. Disable network access before submitting the photo.
2. Confirm the app says the photo is safe on the device, not sent.
3. Background the app, force-close it, and launch it again.
4. Confirm the queued photo still appears or is represented by the pending
   sync state.
5. Restore network access and bring the app to the foreground.
6. Wait for sync, then reload the server record.

The queue must become empty only after the server accepts the upload. If the
same request is retried after the app is killed during the response, the
server must still contain exactly one attachment.

### 4. Storm Patrol ordering

For a Storm Patrol job, verify that completion/observation metadata syncs
before its dependent photo. For an observation, verify the observation is
created before its photo. For a post-storm flooding/slip photo, verify the
matching observation is created before its photo. A failed photo must not
block an unrelated queued record.

### 5. Mobile Safari durable-byte checks

1. Open the published Field Ops URL in Safari and select distinct before and
   after photos. Confirm each thumbnail appears only in its labelled section.
2. Disable network access, submit the patrol, close the Safari tab, reopen the
   published URL, and sign in if Safari requires it.
3. Confirm the pending photo state remains. Restore network access and confirm
   exactly one server photo row per selected image and no remaining local queue
   record.
4. Repeat with a general observation photo.
5. Open an already completed patrol, select replacement before/after photos,
   and submit. Confirm the app uploads the photos without creating or retrying a
   second completion record.
6. For a legacy metadata-only queued photo, confirm the recovery banner offers
   to discard only unavailable photos. Completed patrols, observations, alerts,
   and retryable photos must remain. Reselect the photos from the completed job
   and confirm they upload.
7. In a Safari context where IndexedDB is unavailable or its quota is exhausted,
   select a photo and submit. The app must report that it could not safely store
   the photo before claiming the patrol/photo is queued. The parent submission
   must not claim that missing photo is safe.

Do not clear all Safari website data as part of the legacy recovery test. That
would remove unrelated Field Ops state and would not verify selective cleanup.

## Recording a device-specific failure

For any failure, capture only:

- platform, OS version, device model, app version;
- flow name and normalized endpoint;
- network condition and lifecycle step;
- queue state (`queued`, `retrying`, `sent`, or `stuck`);
- server diagnostic timestamp, status, retry count, and failure category;
- whether the server has zero, one, or more than one attachment record.

Use the server event/log fields to correlate the failure. Never attach the
photo, a picker URI, a full request URL, an authorization header, or user
entered text. A failure is release-blocking when a photo is lost, the queue
claims success while retaining a record, or the server contains duplicates.

## Exit criteria

The device pass is complete only when every native matrix row passes on both
platforms, every mobile Safari row passes on an iPhone, all paths leave no stuck
queue item, and each submitted photo has exactly one corresponding server
record. If a physical device is not available, leave this check pending rather
than marking the regression as passed; the automated queue and diagnostic tests
are supporting evidence, not a replacement for this run.