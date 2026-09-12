import { createRoot, type Root } from "react-dom/client";
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  clearStormQueueItems: vi.fn(),
  flushStormQueue: vi.fn(),
  loadStormQueue: vi.fn(),
  claimMutate: vi.fn(),
  deletePhotoMutate: vi.fn(),
  enqueueStormItems: vi.fn(),
  persistAttachment: vi.fn(),
  removeManagedAttachment: vi.fn(),
  requestLocation: vi.fn(),
  getLocation: vi.fn(),
  refetch: vi.fn(),
  currentResult: {
    data: {
      data: {
        event: { id: "event-one", name: "Storm Alpha" },
        jobs: [],
        summary: { checkedCount: 0, selectedCount: 0 },
      },
    },
    isLoading: false,
    isRefetching: false,
    refetch: vi.fn(),
  },
}));

const failedQueue = [
  {
    id: "photo-before",
    kind: "photo",
    idempotencyKey: "photo-before",
    createdAt: "2026-09-10T08:00:00.000Z",
    attempts: 3,
    lastError: "HTTP 400: Photo is required",
    payload: { jobId: "job-one", uri: "file:///before.jpg", purpose: "before" },
  },
  {
    id: "photo-after",
    kind: "photo",
    idempotencyKey: "photo-after",
    createdAt: "2026-09-10T08:01:00.000Z",
    attempts: 3,
    lastError: "HTTP 400: Photo is required",
    payload: { jobId: "job-one", uri: "file:///after.jpg", purpose: "after" },
  },
  {
    id: "observation-one",
    kind: "observation",
    idempotencyKey: "observation-one",
    createdAt: "2026-09-10T08:02:00.000Z",
    attempts: 1,
    lastError: "Network unavailable",
    payload: { data: { description: "Blocked drain" } },
  },
] as const;

const remainingQueue = [failedQueue[2]];

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetCurrentStormPatrolQueryKey: () => ["storm-patrol"],
  useClaimStormPatrolJob: () => ({ mutate: mocks.claimMutate }),
  useDeleteStormPatrolJobPhoto: () => ({ mutate: mocks.deletePhotoMutate }),
  useGetCurrentStormPatrol: () => mocks.currentResult,
}));

vi.mock("../attachmentUpload", () => ({
  persistAttachment: mocks.persistAttachment,
  removeManagedAttachment: mocks.removeManagedAttachment,
}));

vi.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => React.useEffect(callback, []),
}));

vi.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

vi.mock("expo-image-picker", () => ({
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}));

vi.mock("expo-location", () => ({
  Accuracy: { High: "high" },
  requestForegroundPermissionsAsync: mocks.requestLocation,
  getCurrentPositionAsync: mocks.getLocation,
}));

vi.mock("react-native", async () => {
  const React = await import("react");
  const element = (tag: string) =>
    ({
      children,
      style,
      onPress,
      testID,
      refreshControl: _refreshControl,
      contentContainerStyle: _contentContainerStyle,
      ...props
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => React.createElement(tag, { ...props, "data-testid": testID, "data-style": JSON.stringify(style), onClick: onPress }, children);

  return {
    ActivityIndicator: element("span"),
    Alert: { alert: mocks.alert },
    Image: element("img"),
    Linking: { openURL: vi.fn() },
    Modal: element("div"),
    Platform: { OS: "web" },
    Pressable: element("button"),
    RefreshControl: () => null,
    ScrollView: element("div"),
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
    Text: element("span"),
    TextInput: element("input"),
    TouchableOpacity: element("button"),
    View: element("div"),
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("@/components/PinMap", () => ({ PinMap: () => null }));
vi.mock("@/hooks/usePhotoLibraryPermission", () => ({
  requestCameraPermission: vi.fn(),
  requestMediaLibraryPermission: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#fff",
    border: "#ddd",
    foreground: "#111",
    mutedForeground: "#666",
    primary: "#007c91",
    secondary: "#eef8fa",
    destructive: "#b42318",
    success: "#16803a",
  }),
}));
vi.mock("@/context/auth", () => ({
  useAuth: () => ({ user: { id: "user-one" }, isLoading: false }),
}));
vi.mock("@/lib/stormPatrolQueue", () => ({
  clearStormQueueItems: mocks.clearStormQueueItems,
  createStormQueueItem: (item: any) => ({
    ...item,
    id: `${item.kind}-${item.idempotencyKey}`,
    createdAt: "2026-09-12T00:00:00.000Z",
    attempts: 0,
  }),
  enqueueStormItems: mocks.enqueueStormItems,
  flushStormQueue: mocks.flushStormQueue,
  getStormPatrolCompletionRequirements: vi.fn(() => []),
  isUnrecoverableQueuedStormPhoto: (item: { kind: string; lastError?: string }) =>
    item.kind === "photo" && Boolean(item.lastError?.includes("Photo is required")),
  loadStormQueue: mocks.loadStormQueue,
  stormQueueId: vi.fn(() => "queue-id"),
}));

import StormPatrolScreen from "../../app/(tabs)/storm-patrol";
import * as ImagePicker from "expo-image-picker";

let root: Root | undefined;

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  mocks.currentResult.data.data.jobs = [];
  mocks.alert.mockReset();
  mocks.claimMutate.mockReset();
  mocks.deletePhotoMutate.mockReset();
  mocks.enqueueStormItems.mockReset().mockImplementation(async items => items);
  mocks.persistAttachment.mockReset().mockImplementation(async (source: any) => ({
    uri: source.uri,
    uploadId: source.uploadId ?? source.uri,
    fileName: source.fileName ?? "photo.jpg",
    mimeType: source.mimeType ?? "image/jpeg",
    size: source.fileSize ?? source.size ?? 100,
    managed: true,
  }));
  mocks.removeManagedAttachment.mockReset().mockResolvedValue(undefined);
  mocks.requestLocation.mockReset().mockResolvedValue({ status: "granted" });
  mocks.getLocation.mockReset().mockResolvedValue({ coords: { latitude: -41.1, longitude: 174.8 } });
  mocks.refetch.mockReset().mockResolvedValue(undefined);
  mocks.currentResult.refetch = mocks.refetch;
  mocks.loadStormQueue.mockReset().mockResolvedValue(failedQueue);
  mocks.flushStormQueue
    .mockReset()
    .mockResolvedValueOnce(failedQueue)
    .mockResolvedValueOnce(remainingQueue);
  mocks.clearStormQueueItems.mockReset().mockResolvedValue(remainingQueue);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("Storm Patrol blocked photo recovery", () => {
  it("discards failed photos while leaving non-photo queue records waiting", async () => {
    await act(async () => {
      root = createRoot(document.getElementById("root")!);
      root.render(<StormPatrolScreen />);
    });
    await settle();

    expect(document.body.textContent).toContain("3 items waiting to sync");
    const discard = document.querySelector('[data-testid="storm-sync-clear-photos"]') as HTMLButtonElement;
    expect(discard).not.toBeNull();
    expect(discard.textContent).toContain("Discard 2 unavailable photos and reselect");

    act(() => discard.click());
    expect(document.body.textContent).toContain("Discard queued photos?");
    expect(mocks.clearStormQueueItems).not.toHaveBeenCalled();

    await act(async () => {
      (document.querySelector('[data-testid="storm-discard-confirm"]') as HTMLButtonElement).click();
    });
    await settle();

    expect(mocks.clearStormQueueItems).toHaveBeenCalledWith(["photo-before", "photo-after"]);
    expect(mocks.flushStormQueue).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("1 item waiting to sync");
    expect(document.body.textContent).not.toContain("unavailable photo");
    expect(document.querySelector('[data-testid="storm-sync-clear-photos"]')).toBeNull();
  });

  it("leaves the queue unchanged when the in-app confirmation is cancelled", async () => {
    await act(async () => {
      root = createRoot(document.getElementById("root")!);
      root.render(<StormPatrolScreen />);
    });
    await settle();

    act(() => (document.querySelector('[data-testid="storm-sync-clear-photos"]') as HTMLButtonElement).click());
    expect(document.body.textContent).toContain("Discard queued photos?");

    act(() => (document.querySelector('[data-testid="storm-discard-cancel"]') as HTMLButtonElement).click());

    expect(mocks.clearStormQueueItems).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Discard queued photos?");
    expect(document.body.textContent).toContain("3 items waiting to sync");
  });

  it("shows a useful error and restores the queue when durable cleanup fails", async () => {
    mocks.clearStormQueueItems.mockRejectedValueOnce(new Error("Safari storage is unavailable"));

    await act(async () => {
      root = createRoot(document.getElementById("root")!);
      root.render(<StormPatrolScreen />);
    });
    await settle();

    act(() => (document.querySelector('[data-testid="storm-sync-clear-photos"]') as HTMLButtonElement).click());
    await act(async () => {
      (document.querySelector('[data-testid="storm-discard-confirm"]') as HTMLButtonElement).click();
    });
    await settle();

    expect(document.querySelector('[data-testid="storm-discard-error"]')?.textContent)
      .toContain("Safari storage is unavailable");
    expect(document.body.textContent).toContain("3 items waiting to sync");
    expect(document.body.textContent).toContain("Discard queued photos?");
  });
});

describe("Storm Patrol photo picker", () => {
  it("opens the native picker directly without showing an app source menu", async () => {
    mocks.currentResult.data.data.jobs = [{
      id: "job-one",
      eventId: "event-one",
      assetId: "asset-one",
      assetName: "Thompson Grove Reserve",
      phase: "mid",
      status: "in_progress",
      routeOrder: 3,
      lat: null,
      lng: null,
    }] as any;
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: true,
      assets: null,
    });

    await act(async () => {
      root = createRoot(document.getElementById("root")!);
      root.render(<StormPatrolScreen />);
    });
    await settle();

    const job = Array.from(document.querySelectorAll("button")).find(
      button => button.textContent?.includes("Thompson Grove Reserve"),
    );
    expect(job).toBeDefined();
    act(() => job!.click());

    const beforePhoto = Array.from(document.querySelectorAll("button")).find(
      button => button.textContent?.startsWith("Before photo"),
    );
    expect(beforePhoto).toBeDefined();

    await act(async () => {
      beforePhoto!.click();
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledOnce();
    expect(document.body.textContent).not.toContain("Choose where to get the photo");
    expect(document.body.textContent).not.toContain("Add before photo");
  });

  it("allows three before photos while keeping the after-photo limit independent", async () => {
    mocks.currentResult.data.data.jobs = [{
      id: "job-one",
      eventId: "event-one",
      assetId: "asset-one",
      assetName: "Thompson Grove Reserve",
      phase: "mid",
      status: "in_progress",
      routeOrder: 3,
      photos: [],
      workTypes: [],
      lat: null,
      lng: null,
    }] as any;
    let photoNumber = 0;
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockImplementation(async () => ({
      canceled: false,
      assets: [{ uri: `file:///photo-${++photoNumber}.jpg` }],
    }) as any);

    await act(async () => {
      root = createRoot(document.getElementById("root")!);
      root.render(<StormPatrolScreen />);
    });
    await settle();
    act(() => Array.from(document.querySelectorAll("button")).find(button => button.textContent?.includes("Thompson Grove Reserve"))!.click());

    const before = Array.from(document.querySelectorAll("button")).find(button => button.textContent?.startsWith("Before photo"))!;
    for (let index = 0; index < 3; index++) {
      await act(async () => before.click());
    }
    expect(before.textContent).toBe("Before photo (3/3)");

    act(() => (document.querySelector('[data-testid="remove-before-photo-1"]') as HTMLButtonElement).click());
    expect(before.textContent).toBe("Before photo (2/3)");

    await act(async () => before.click());
    expect(before.textContent).toBe("Before photo (3/3)");
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(4);

    await act(async () => before.click());
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(4);
    expect(mocks.alert).toHaveBeenCalledWith("Photo limit reached", "You can add up to 3 before photos.");

    const after = Array.from(document.querySelectorAll("button")).find(button => button.textContent?.startsWith("After photo"))!;
    await act(async () => after.click());
    expect(after.textContent).toBe("After photo (1/3)");
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(5);
  });

  it("allows three photos on one general observation and blocks a fourth", async () => {
    let photoNumber = 0;
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockImplementation(async () => ({
      canceled: false,
      assets: [{ uri: `file:///observation-${++photoNumber}.jpg` }],
    }) as any);

    await act(async () => {
      root = createRoot(document.getElementById("root")!);
      root.render(<StormPatrolScreen />);
    });
    await settle();

    const observationPhoto = Array.from(document.querySelectorAll("button")).find(button => button.textContent?.startsWith("Observation photo"))!;
    for (let index = 0; index < 3; index++) {
      await act(async () => observationPhoto.click());
    }
    expect(observationPhoto.textContent).toBe("Observation photo (3/3)");
    expect(document.querySelectorAll("img")).toHaveLength(3);

    act(() => (document.querySelector('[data-testid="remove-observation-photo-0"]') as HTMLButtonElement).click());
    expect(observationPhoto.textContent).toBe("Observation photo (2/3)");
    expect(document.querySelectorAll("img")).toHaveLength(2);

    await act(async () => observationPhoto.click());
    expect(observationPhoto.textContent).toBe("Observation photo (3/3)");
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(4);

    await act(async () => observationPhoto.click());
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(4);
    expect(mocks.alert).toHaveBeenCalledWith("Photo limit reached", "You can add up to 3 general observation photos.");
  });
});

describe("Storm Patrol completed jobs", () => {
  it("greys a completed row, removes Open, and opens saved details for editing", async () => {
    mocks.currentResult.data.data.jobs = [{
      id: "completed-job",
      eventId: "event-one",
      workPackageId: "package-one",
      assetId: "asset-one",
      teamId: "team-one",
      assetName: "Rangituhi Crescent",
      phase: "pre",
      status: "completed",
      routeOrder: 1,
      actualTimeMins: 12,
      comments: "Cleared leaves from the inlet",
      workTypes: ["debris_clearance"],
      photos: [
        { id: "before-photo", purpose: "before", blobUrl: "/before.jpg", createdAt: "2026-09-12T00:00:00.000Z" },
        { id: "after-photo", purpose: "after", blobUrl: "/after.jpg", createdAt: "2026-09-12T00:10:00.000Z" },
      ],
      lat: null,
      lng: null,
    }] as any;

    await act(async () => {
      root = createRoot(document.getElementById("root")!);
      root.render(<StormPatrolScreen />);
    });
    await settle();

    const row = document.querySelector('[data-testid="storm-job-completed-job"]') as HTMLButtonElement;
    const number = document.querySelector('[data-testid="storm-job-number-completed-job"]');
    const title = document.querySelector('[data-testid="storm-job-title-completed-job"]');
    expect(row).not.toBeNull();
    expect(row.textContent).not.toContain("Open");
    expect(number?.getAttribute("data-style")).toContain("#9ca3af");
    expect(title?.getAttribute("data-style")).toContain("#9ca3af");

    act(() => row.click());

    expect(document.body.textContent).toContain("Save changes");
    const comments = document.querySelector('input[value="Cleared leaves from the inlet"]');
    expect(comments).not.toBeNull();
    expect(document.body.textContent).toContain("Debris clearance");

    mocks.deletePhotoMutate.mockImplementation((_variables, options) => options.onSuccess());
    act(() => (document.querySelector('[data-testid="remove-saved-photo-before-photo"]') as HTMLButtonElement).click());
    const deleteAction = mocks.alert.mock.calls.at(-1)?.[2]?.find((action: { text?: string }) => action.text === "Delete");
    expect(deleteAction).toBeDefined();
    act(() => deleteAction.onPress());

    expect(mocks.deletePhotoMutate).toHaveBeenCalledWith(
      { id: "completed-job", photoId: "before-photo" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(document.body.textContent).toContain("Before photo (0/3)");
    expect(document.querySelector('[data-testid="remove-saved-photo-before-photo"]')).toBeNull();
  });

  it("queues replacement photos for a completed job without a second completion", async () => {
    mocks.currentResult.data.data.jobs = [{
      id: "completed-job",
      eventId: "event-one",
      assetId: "asset-one",
      assetName: "Thompson Grove Reserve",
      phase: "mid",
      status: "completed",
      routeOrder: 1,
      actualTimeMins: 12,
      comments: "",
      workTypes: [],
      photos: [
        { id: "before-saved", purpose: "before", blobUrl: "/before.jpg", createdAt: "2026-09-12T00:00:00.000Z" },
        { id: "after-saved", purpose: "after", blobUrl: "/after.jpg", createdAt: "2026-09-12T00:10:00.000Z" },
      ],
      lat: null,
      lng: null,
    }] as any;
    mocks.loadStormQueue.mockResolvedValue([]);
    mocks.flushStormQueue.mockReset().mockResolvedValue([]);
    mocks.requestLocation.mockResolvedValue({ status: "denied" });
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "blob:replacement", fileName: "replacement.jpg", mimeType: "image/jpeg", fileSize: 100 }],
    } as any);

    await act(async () => {
      root = createRoot(document.getElementById("root")!);
      root.render(<StormPatrolScreen />);
    });
    await settle();
    act(() => (document.querySelector('[data-testid="storm-job-completed-job"]') as HTMLButtonElement).click());
    const before = Array.from(document.querySelectorAll("button")).find(button => button.textContent?.startsWith("Before photo"))!;
    await act(async () => before.click());
    const save = Array.from(document.querySelectorAll("button")).find(button => button.textContent?.includes("Save changes"))!;
    await act(async () => save.click());
    await settle();

    expect(mocks.enqueueStormItems).toHaveBeenCalledOnce();
    expect(mocks.requestLocation).not.toHaveBeenCalled();
    expect(mocks.getLocation).not.toHaveBeenCalled();
    const queuedItems = mocks.enqueueStormItems.mock.calls[0][0];
    expect(queuedItems).not.toContainEqual(expect.objectContaining({ kind: "completion" }));
    expect(queuedItems).toContainEqual(expect.objectContaining({
      kind: "photo",
      payload: expect.objectContaining({
        jobId: "completed-job",
        attachment: expect.objectContaining({ uri: "blob:replacement" }),
        purpose: "before",
      }),
    }));
  });

  it("does not claim a patrol was queued when browser byte staging fails", async () => {
    mocks.currentResult.data.data.jobs = [{
      id: "completed-job",
      eventId: "event-one",
      assetId: "asset-one",
      assetName: "Thompson Grove Reserve",
      phase: "mid",
      status: "completed",
      routeOrder: 1,
      actualTimeMins: 12,
      comments: "Initial check",
      workTypes: ["visual_check_only"],
      photos: [
        { id: "before-saved", purpose: "before", blobUrl: "/before.jpg", createdAt: "2026-09-12T00:00:00.000Z" },
        { id: "after-saved", purpose: "after", blobUrl: "/after.jpg", createdAt: "2026-09-12T00:10:00.000Z" },
      ],
      lat: null,
      lng: null,
    }] as any;
    mocks.loadStormQueue.mockResolvedValue([]);
    mocks.flushStormQueue.mockReset().mockResolvedValue([]);
    mocks.persistAttachment.mockRejectedValueOnce(new Error("This browser does not have enough storage to safely queue the photo."));
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "blob:quota-photo", fileName: "quota.jpg", mimeType: "image/jpeg", fileSize: 100 }],
    } as any);

    await act(async () => {
      root = createRoot(document.getElementById("root")!);
      root.render(<StormPatrolScreen />);
    });
    await settle();
    act(() => (document.querySelector('[data-testid="storm-job-completed-job"]') as HTMLButtonElement).click());
    await act(async () => Array.from(document.querySelectorAll("button")).find(button => button.textContent?.startsWith("Before photo"))!.click());
    await act(async () => Array.from(document.querySelectorAll("button")).find(button => button.textContent?.includes("Save changes"))!.click());

    expect(mocks.enqueueStormItems).not.toHaveBeenCalled();
    expect(mocks.alert).toHaveBeenCalledWith("Photos not saved", expect.stringContaining("not have enough storage"));
  });

  it("automatically collapses a completed earlier phase and lets the user reopen it", async () => {
    mocks.currentResult.data.data.jobs = [
      {
        id: "pre-completed",
        eventId: "event-one",
        workPackageId: "package-pre",
        assetId: "asset-pre",
        teamId: "team-one",
        assetName: "Completed before-storm site",
        phase: "pre",
        status: "completed",
        routeOrder: 1,
        workTypes: [],
        photos: [],
      },
      {
        id: "mid-pending",
        eventId: "event-one",
        workPackageId: "package-mid",
        assetId: "asset-mid",
        teamId: "team-one",
        assetName: "Current during-storm site",
        phase: "mid",
        status: "pending",
        routeOrder: 1,
        workTypes: [],
        photos: [],
      },
    ] as any;

    await act(async () => {
      root = createRoot(document.getElementById("root")!);
      root.render(<StormPatrolScreen />);
    });
    await settle();

    expect(document.body.textContent).not.toContain("Completed before-storm site");
    expect(document.body.textContent).toContain("Current during-storm site");

    const preHeader = document.querySelector('[data-testid="storm-phase-pre"]') as HTMLButtonElement;
    act(() => preHeader.click());

    expect(document.body.textContent).toContain("Completed before-storm site");
  });
});