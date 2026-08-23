/**
 * Khoá phân đoạn (fractional indexing) để sắp xếp issue trong cột.
 *
 * Vì sao dùng chuỗi thay vì số nguyên: kéo một issue vào giữa hai issue khác
 * chỉ được phép sửa ĐÚNG MỘT hàng. Với số nguyên thì sớm muộn cũng hết chỗ
 * giữa hai giá trị liền kề và phải đánh số lại cả cột. Giữa hai chuỗi thì
 * luôn chèn được thêm một chuỗi nữa, vô hạn.
 *
 * Bảng chữ: [0-9a-z]. Khoá KHÔNG BAO GIỜ kết thúc bằng ký tự nhỏ nhất ('0'),
 * để lúc nào cũng còn chỗ chèn vào ngay trước nó.
 *
 * Client và server phải dùng CHUNG hàm này — nếu tính khác nhau thì kéo thả
 * lạc quan trên UI sẽ nhảy chỗ khi server trả kết quả.
 */

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const FIRST = ALPHABET[0]!;
const LAST = ALPHABET[ALPHABET.length - 1]!;
const MID = ALPHABET[Math.floor(ALPHABET.length / 2)]!;

export class SortKeyError extends Error {}

function assertValid(key: string, label: string): void {
  if (!/^[0-9a-z]+$/.test(key)) throw new SortKeyError(`${label} chứa ký tự ngoài bảng chữ: ${JSON.stringify(key)}`);
  if (key.endsWith(FIRST)) throw new SortKeyError(`${label} không được kết thúc bằng '${FIRST}': ${key}`);
}

/**
 * Sinh khoá nằm giữa `a` và `b` theo thứ tự chuỗi.
 * `a = null` nghĩa là đầu danh sách, `b = null` nghĩa là cuối danh sách.
 */
export function between(a: string | null, b: string | null): string {
  if (a !== null) assertValid(a, "a");
  if (b !== null) assertValid(b, "b");
  if (a !== null && b !== null && a >= b) {
    throw new SortKeyError(`a phải nhỏ hơn b, nhận được a=${a} b=${b}`);
  }

  if (a === null && b === null) return MID;
  if (a === null) return before(b!);
  if (b === null) return after(a);
  return middle(a, b);
}

/** Khoá đứng trước `b`. */
function before(b: string): string {
  const head = b.slice(0, -1);
  const tail = b[b.length - 1]!;
  const i = ALPHABET.indexOf(tail);
  // Ký tự cuối đã sát đáy (chỉ số 1, vì 0 bị cấm làm ký tự kết thúc)
  // → không hạ thêm được, phải mượn một bậc: giữ nguyên rồi nối thêm.
  if (i <= 1) return `${head}${FIRST}${MID}`;
  return head + ALPHABET[Math.floor(i / 2)]!;
}

/** Khoá đứng sau `a`. */
function after(a: string): string {
  const head = a.slice(0, -1);
  const tail = a[a.length - 1]!;
  const i = ALPHABET.indexOf(tail);
  if (tail === LAST) return `${a}${MID}`;
  return head + ALPHABET[Math.floor((i + ALPHABET.length) / 2)]!;
}

/** Khoá nằm giữa hai khoá đã cho. */
function middle(a: string, b: string): string {
  let prefix = "";
  let i = 0;
  // Bỏ qua phần đầu giống nhau — chỉ phần lệch nhau mới cần chia đôi.
  while (true) {
    const ca = a[i] ?? FIRST;
    const cb = b[i];
    if (cb !== undefined && ca === cb) {
      prefix += ca;
      i++;
      continue;
    }
    break;
  }

  const restA = a.slice(i);
  const restB = b.slice(i);

  if (restA === "") return prefix + before(restB);
  if (restB === "") return prefix + after(restA);

  const ia = ALPHABET.indexOf(restA[0]!);
  const ib = ALPHABET.indexOf(restB[0]!);
  if (ib - ia > 1) return prefix + ALPHABET[Math.floor((ia + ib) / 2)]!;

  // Hai ký tự liền kề → giữ ký tự của a rồi đi sâu thêm một bậc.
  return prefix + restA[0]! + after(restA.slice(1) || FIRST);
}

/** Sinh n khoá tăng dần, dùng khi seed. */
export function sequence(n: number): string[] {
  const out: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    prev = between(prev, null);
    out.push(prev);
  }
  return out;
}
