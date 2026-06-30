import { selectByPriority } from "./priority-selection.util";

interface MockCard { id: string; priority: string; }

const card = (id: string, priority: string): MockCard => ({ id, priority });

describe("selectByPriority", () => {
  it("returns all cards when n >= total", () => {
    const cards = [card("1", "A"), card("2", "B"), card("3", "C")];
    expect(selectByPriority(cards, 10)).toEqual(cards);
  });

  it("returns empty array when n is 0", () => {
    const cards = [card("1", "A"), card("2", "B")];
    expect(selectByPriority(cards, 0)).toEqual([]);
  });

  it("returns only A cards when n <= A count", () => {
    const cards = [card("a1", "A"), card("a2", "A"), card("b1", "B"), card("c1", "C")];
    const result = selectByPriority(cards, 1);
    expect(result).toHaveLength(1);
    expect(result[0].priority).toBe("A");
  });

  it("returns all A + some B when n is between A count and A+B count", () => {
    const cards = [card("a1", "A"), card("b1", "B"), card("b2", "B"), card("c1", "C")];
    const result = selectByPriority(cards, 2);
    expect(result).toHaveLength(2);
    expect(result.filter((c) => c.priority === "A")).toHaveLength(1);
    expect(result.filter((c) => c.priority === "B")).toHaveLength(1);
  });

  it("returns all A + all B + some C when n exceeds A+B", () => {
    const cards = [
      card("a1", "A"),
      card("b1", "B"), card("b2", "B"),
      card("c1", "C"), card("c2", "C"), card("c3", "C")
    ];
    const result = selectByPriority(cards, 4);
    expect(result).toHaveLength(4);
    expect(result.filter((c) => c.priority === "A")).toHaveLength(1);
    expect(result.filter((c) => c.priority === "B")).toHaveLength(2);
    expect(result.filter((c) => c.priority === "C")).toHaveLength(1);
  });

  it("preserves the order of cards within each tier", () => {
    const cards = [card("a2", "A"), card("a1", "A"), card("b1", "B")];
    const result = selectByPriority(cards, 2);
    expect(result[0].id).toBe("a2");
    expect(result[1].id).toBe("a1");
  });

  it("handles cards with no priority field by treating them as C", () => {
    const cards = [
      card("a1", "A"),
      { id: "x1", priority: undefined as unknown as string }
    ];
    const result = selectByPriority(cards, 1);
    expect(result[0].id).toBe("a1");
  });
});
