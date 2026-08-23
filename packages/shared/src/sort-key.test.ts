import { describe, expect, it } from "vitest";
import { between, sequence, SortKeyError } from "./sort-key.js";

const ordered = (keys: string[]) => keys.every((k, i) => i === 0 || keys[i - 1]! < k);

describe("between", () => {
  it("danh sách rỗng thì sinh được khoá đầu tiên", () => {
    expect(between(null, null)).toBeTruthy();
  });

  it("nối vào cuối luôn lớn hơn khoá trước", () => {
    let prev = between(null, null);
    for (let i = 0; i < 200; i++) {
      const next = between(prev, null);
      expect(next > prev, `${next} phải > ${prev}`).toBe(true);
      prev = next;
    }
  });

  it("chèn vào đầu luôn nhỏ hơn khoá sau", () => {
    let next = between(null, null);
    for (let i = 0; i < 200; i++) {
      const prev = between(null, next);
      expect(prev < next, `${prev} phải < ${next}`).toBe(true);
      next = prev;
    }
  });

  it("chèn vào giữa nằm đúng giữa hai khoá", () => {
    const a = between(null, null);
    const b = between(a, null);
    const m = between(a, b);
    expect(a < m).toBe(true);
    expect(m < b).toBe(true);
  });

  it("chèn 1000 lần liên tiếp vào CÙNG một khe vẫn không hết chỗ", () => {
    // Đây là lý do tồn tại của khoá chuỗi. Số nguyên sẽ chết ở lần thứ ~30.
    const a = between(null, null);
    let b = between(a, null);
    for (let i = 0; i < 1000; i++) {
      const m = between(a, b);
      expect(a < m, `lần ${i}: ${a} < ${m}`).toBe(true);
      expect(m < b, `lần ${i}: ${m} < ${b}`).toBe(true);
      b = m;
    }
  });

  it("giữ đúng thứ tự sau một loạt thao tác chèn xen kẽ", () => {
    let keys = sequence(5);
    for (let i = 0; i < 100; i++) {
      const at = i % (keys.length - 1);
      const m = between(keys[at]!, keys[at + 1]!);
      keys = [...keys.slice(0, at + 1), m, ...keys.slice(at + 1)];
    }
    expect(ordered(keys)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("không bao giờ sinh khoá kết thúc bằng '0'", () => {
    // Kết thúc bằng ký tự nhỏ nhất là hết chỗ chèn vào trước.
    const keys = sequence(300);
    for (const k of keys) expect(k.endsWith("0"), k).toBe(false);
    let a = keys[0]!;
    for (let i = 0; i < 300; i++) {
      a = between(null, a);
      expect(a.endsWith("0"), a).toBe(false);
    }
  });

  it("từ chối thứ tự ngược và ký tự lạ", () => {
    const a = between(null, null);
    const b = between(a, null);
    expect(() => between(b, a)).toThrow(SortKeyError);
    expect(() => between(a, a)).toThrow(SortKeyError);
    expect(() => between("A!", null)).toThrow(SortKeyError);
  });
});

describe("sequence", () => {
  it("sinh n khoá tăng dần, không trùng", () => {
    const keys = sequence(500);
    expect(keys).toHaveLength(500);
    expect(ordered(keys)).toBe(true);
    expect(new Set(keys).size).toBe(500);
  });
});
