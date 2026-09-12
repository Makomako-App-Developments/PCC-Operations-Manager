import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  refetch: vi.fn(),
  appStateListener: undefined as ((state: string) => void) | undefined,
  queryOptions: undefined as any,
  currentResult: {
    data: undefined as any,
    isSuccess: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: mocks.getItem,
    setItem: mocks.setItem,
    removeItem: mocks.removeItem,
  },
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetCurrentStormPatrolQueryKey: () => ["storm-patrol", "current"],
  useGetCurrentStormPatrol: (options: any) => {
    mocks.queryOptions = options.query;
    return mocks.currentResult;
  },
}));

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mocks.appStateListener = listener;
      return { remove: vi.fn() };
    },
  },
}));

import { useStormPatrolBadge } from "../stormPatrolBadge";
import { stormPatrolBadgeStorageKey } from "../stormPatrolBadgeState";

function Probe(props: { userId: string | null; active?: boolean }) {
  const badge = useStormPatrolBadge({
    userId: props.userId,
    enabled: Boolean(props.userId),
    stormTabActive: Boolean(props.active),
  });
  return <span data-testid="badge">{badge.hasUnseenJobs ? "unseen" : "seen"}</span>;
}

let root: Root | undefined;

async function render(props: { userId: string | null; active?: boolean }) {
  await act(async () => {
    if (!root) root = createRoot(document.getElementById("root")!);
    root.render(<Probe {...props} />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function badgeText() {
  return document.querySelector('[data-testid="badge"]')?.textContent;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  mocks.storage.clear();
  mocks.getItem.mockReset().mockImplementation(async key => mocks.storage.get(key) ?? null);
  mocks.setItem.mockReset().mockImplementation(async (key, value) => { mocks.storage.set(key, value); });
  mocks.removeItem.mockReset().mockImplementation(async key => { mocks.storage.delete(key); });
  mocks.refetch.mockReset().mockResolvedValue(undefined);
  mocks.currentResult = { data: undefined, isSuccess: false, refetch: mocks.refetch };
  mocks.appStateListener = undefined;
  mocks.queryOptions = undefined;
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

describe("useStormPatrolBadge", () => {
  it("restores an unread badge from user-scoped storage while offline", async () => {
    mocks.storage.set(stormPatrolBadgeStorageKey("worker-one"), JSON.stringify({
      eventId: "event-one",
      knownPendingJobIds: ["job-one"],
      seenPendingJobIds: [],
    }));

    await render({ userId: "worker-one" });

    expect(badgeText()).toBe("unseen");
    expect(mocks.queryOptions.queryKey).toEqual(["storm-patrol", "current", "worker-one"]);
    expect(mocks.removeItem).not.toHaveBeenCalled();
  });

  it("persists new work, clears it on the Storm tab, and detects later work", async () => {
    mocks.currentResult.data = {
      data: {
        event: { id: "event-one", name: "Storm" },
        jobs: [{ id: "job-one", status: "pending" }],
        summary: { checkedCount: 0, selectedCount: 1 },
      },
    };
    mocks.currentResult.isSuccess = true;

    await render({ userId: "worker-one" });
    expect(badgeText()).toBe("unseen");

    await render({ userId: "worker-one", active: true });
    expect(badgeText()).toBe("seen");
    expect(JSON.parse(mocks.storage.get(stormPatrolBadgeStorageKey("worker-one"))!).seenPendingJobIds)
      .toEqual(["job-one"]);

    mocks.currentResult.data = {
      data: {
        event: { id: "event-one", name: "Storm" },
        jobs: [
          { id: "job-one", status: "pending" },
          { id: "job-two", status: "pending" },
        ],
        summary: { checkedCount: 0, selectedCount: 2 },
      },
    };
    await render({ userId: "worker-one" });
    expect(badgeText()).toBe("unseen");
  });

  it("refetches on foreground and preserves unread state after a failed request", async () => {
    mocks.storage.set(stormPatrolBadgeStorageKey("worker-one"), JSON.stringify({
      eventId: "event-one",
      knownPendingJobIds: ["job-one"],
      seenPendingJobIds: [],
    }));
    await render({ userId: "worker-one" });

    act(() => mocks.appStateListener?.("active"));

    expect(mocks.refetch).toHaveBeenCalledOnce();
    expect(badgeText()).toBe("unseen");
    expect(mocks.removeItem).not.toHaveBeenCalled();
  });

  it("clears persisted work only after a successful no-active-storm response", async () => {
    mocks.storage.set(stormPatrolBadgeStorageKey("worker-one"), JSON.stringify({
      eventId: "event-one",
      knownPendingJobIds: ["job-one"],
      seenPendingJobIds: [],
    }));
    await render({ userId: "worker-one" });
    expect(badgeText()).toBe("unseen");

    mocks.currentResult.data = { data: null };
    mocks.currentResult.isSuccess = true;
    await render({ userId: "worker-one" });

    expect(badgeText()).toBe("seen");
    expect(mocks.removeItem).toHaveBeenCalledWith(stormPatrolBadgeStorageKey("worker-one"));
  });

  it("reloads persisted state and query data when the signed-in worker changes", async () => {
    mocks.storage.set(stormPatrolBadgeStorageKey("worker-one"), JSON.stringify({
      eventId: "event-one",
      knownPendingJobIds: ["job-one"],
      seenPendingJobIds: [],
    }));
    mocks.storage.set(stormPatrolBadgeStorageKey("worker-two"), JSON.stringify({
      eventId: "event-one",
      knownPendingJobIds: ["job-two"],
      seenPendingJobIds: ["job-two"],
    }));

    await render({ userId: "worker-one" });
    expect(badgeText()).toBe("unseen");
    await render({ userId: "worker-two" });

    expect(badgeText()).toBe("seen");
    expect(mocks.queryOptions.queryKey).toEqual(["storm-patrol", "current", "worker-two"]);
  });
});