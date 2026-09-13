import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import StormPatrol from "./index";

const historicalData = {
  event: { id: "event-closed", name: "Cyclone Cam", status: "closed", hourlyRateCents: 10000 },
  jobs: [],
  observations: [],
  followUps: [],
  alerts: [],
  summary: {},
};

vi.mock("@workspace/api-client-react", () => ({
  useGetCurrentStormPatrol: () => ({ data: { data: null }, isLoading: false }),
  useListStormPatrolEvents: () => ({
    data: { data: [{ id: "event-closed", name: "Cyclone Cam", status: "closed", hourlyRateCents: 10000, activatedAt: "2026-09-10T00:00:00.000Z" }] },
    isLoading: false,
  }),
  useGetStormPatrolEvent: (id: string) => ({
    data: id ? { data: historicalData } : undefined,
    isLoading: false,
  }),
  useCreateStormPatrolEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  getGetCurrentStormPatrolQueryKey: () => ["/api/storm-patrol/current"],
  getGetStormPatrolEventQueryKey: (id: string) => ["/api/storm-patrol/events", id],
  getListStormPatrolEventsQueryKey: () => ["/api/storm-patrol/events"],
  getGetStormPatrolReportUrl: (id: string) => `/api/storm-patrol/events/${id}/report`,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("./components/StormwaterAssetImport", () => ({
  default: () => null,
}));

vi.mock("./components/CommandCenter", () => ({
  default: ({ data, readOnly, onBack }: any) => (
    <div>
      <h1>{data.event.name}</h1>
      <p>{readOnly ? "Read-only historical event" : "Active event"}</p>
      <button type="button" onClick={onBack}>Previous Events</button>
    </div>
  ),
}));

afterEach(cleanup);

describe("Storm Patrol previous events", () => {
  it("opens a previous event in a read-only detail view and returns to the list", async () => {
    const user = userEvent.setup();
    render(<StormPatrol />);

    await user.click(screen.getByRole("button", { name: "View archived event Cyclone Cam" }));

    expect(screen.getByRole("heading", { name: "Cyclone Cam" })).toBeVisible();
    expect(screen.getByText("Read-only historical event")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Previous Events" }));
    expect(screen.getByRole("heading", { name: "Previous Events" })).toBeVisible();
  });
});