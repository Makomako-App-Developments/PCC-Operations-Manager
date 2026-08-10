import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SystemStatusBanner } from "./SystemStatusBanner";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderBanner(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <SystemStatusBanner />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // shouldAdvanceTime lets wall-clock time flow so waitFor polling works,
  // while still giving us manual control via advanceTimersByTime.
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("SystemStatusBanner — recovery clears outage duration", () => {
  it("shows outage duration while the circuit is OPEN", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          status: "not_ready",
          cbState: "OPEN",
          openedAt: new Date(Date.now() - 90_000).toISOString(),
          timeSinceOpenMs: 90_000,
        }),
      }),
    );

    renderBanner(makeClient());

    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeInTheDocument(),
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Outage duration: 1m 30s");
  });

  it("clears the outage duration and shows a plain recovery message when the circuit closes", async () => {
    const fetchMock = vi
      .fn()
      // First call: circuit OPEN with duration
      .mockResolvedValueOnce({
        json: async () => ({
          status: "not_ready",
          cbState: "OPEN",
          openedAt: new Date(Date.now() - 60_000).toISOString(),
          timeSinceOpenMs: 60_000,
        }),
      })
      // Second call: circuit CLOSED — no duration fields
      .mockResolvedValueOnce({
        json: async () => ({
          status: "ready",
          cbState: "CLOSED",
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const client = makeClient();
    renderBanner(client);

    // Wait for the outage banner to appear with the duration label.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Outage duration:"),
    );

    // Advance past the 15 s poll interval so the second fetch fires.
    await act(async () => {
      vi.advanceTimersByTime(16_000);
    });

    // The banner should switch to the plain "restored" message with no duration.
    await waitFor(() =>
      expect(screen.queryByRole("status")).toBeInTheDocument(),
    );

    const recoveredBanner = screen.getByRole("status");
    expect(recoveredBanner).toHaveTextContent("Database connection restored");
    // The recovery banner must NOT contain any duration text — stale values
    // from the prior OPEN response must not leak through.
    expect(recoveredBanner).not.toHaveTextContent("after");
    expect(recoveredBanner).not.toHaveTextContent("Outage duration");
    expect(recoveredBanner).not.toHaveTextContent(/\d+m/);
    expect(recoveredBanner).not.toHaveTextContent(/\d+s/);
  });

  it("renders nothing at all when the circuit has always been CLOSED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          status: "ready",
          cbState: "CLOSED",
        }),
      }),
    );

    renderBanner(makeClient());

    // Allow the first poll to complete.
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // No alert or status banner should exist.
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
