# Field Ops photo device regression

This is the release check for native photo transport. It must be run on one
physical iOS phone and one physical Android phone. A web preview, simulator,
or emulator does not verify picker URI lifetime, native multipart behavior, or
OS process storage.

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

The device pass is complete only when every matrix row passes on both
platforms, all five paths leave no stuck queue item, and each submitted
photo has exactly one corresponding server record. If a physical device is
not available, leave this check pending rather than marking the regression as
passed; the automated queue and diagnostic tests are supporting evidence, not
a replacement for this run.