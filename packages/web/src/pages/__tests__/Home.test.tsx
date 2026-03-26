import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import Home from "../Home";
import { useGetGroups } from "@/hooks/api/useGetGroups";
import type { UseQueryResult } from "@tanstack/react-query";

vi.mock("@/hooks/api/useGetGroups");

const mockUseGetGroups = vi.mocked(useGetGroups);

describe("Home", () => {
  it("renders the My Groups heading", () => {
    mockUseGetGroups.mockReturnValue({
      isLoading: false,
      data: [],
      error: null,
    } as unknown as UseQueryResult<[]>);
    render(<Home />);
    expect(screen.getByText("My Groups")).toBeDefined();
  });

  it("renders a group card when groups are returned", () => {
    mockUseGetGroups.mockReturnValue({
      isLoading: false,
      data: [{ id: "1", name: "Weekend Trip", createdAt: "", members: [] }],
      error: null,
    } as unknown as UseQueryResult<
      { id: string; name: string; createdAt: string; members: [] }[]
    >);
    render(<Home />);
    expect(screen.getByText("Weekend Trip")).toBeDefined();
  });
});
